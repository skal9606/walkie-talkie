import {
  SignedDataVerifier,
  Environment,
  NotificationTypeV2,
  Subtype,
} from '@apple/app-store-server-library'
import type {
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HandlerResult } from './api-handlers.js'
import { supabaseAdmin } from './supabase-admin.js'

// ---------------------------------------------------------------------------
// Verifier construction (cached per process)
// ---------------------------------------------------------------------------

let _verifiers: {
  sandbox: SignedDataVerifier
  production: SignedDataVerifier
} | null = null

/**
 * App Store Server library verifies JWS-signed payloads (transactions and
 * webhook notifications) against Apple's certificate chain. We need separate
 * verifier instances for Sandbox vs Production because the leaf cert chains
 * differ. We try sandbox first when verifying client-supplied transactions,
 * then fall back to production — the standard "single endpoint, both envs"
 * pattern Apple recommends.
 */
function getVerifiers() {
  if (_verifiers) return _verifiers
  const bundleId = process.env.APPLE_BUNDLE_ID
  if (!bundleId) throw new Error('APPLE_BUNDLE_ID env var missing.')
  const appAppleIdRaw = process.env.APPLE_APP_ID
  const appAppleId = appAppleIdRaw ? Number(appAppleIdRaw) : undefined

  const certDir = join(process.cwd(), 'certs/apple')
  const certs = [
    readFileSync(join(certDir, 'AppleIncRootCertificate.cer')),
    readFileSync(join(certDir, 'AppleRootCA-G2.cer')),
    readFileSync(join(certDir, 'AppleRootCA-G3.cer')),
  ]
  // enableOnlineChecks is set to false. With it true, the library does an
  // OCSP round-trip to Apple to confirm the leaf cert isn't revoked — that
  // call has been flaky from Vercel's serverless runtime (network egress
  // to Apple's OCSP responder) and the library surfaces the OCSP timeout
  // as INVALID_CERTIFICATE (status=3), which is exactly what we hit in
  // sandbox. Offline cert-chain verification still validates the JWS
  // signature against Apple's Root CAs, which is the core integrity check.
  // We accept the small revocation-staleness risk in exchange for
  // reliability — Apple revocations of StoreKit signing certs are
  // extremely rare and the App Store Server Notifications webhook would
  // catch any anomalous state separately.
  _verifiers = {
    sandbox: new SignedDataVerifier(
      certs,
      false,
      Environment.SANDBOX,
      bundleId,
      appAppleId,
    ),
    production: new SignedDataVerifier(
      certs,
      false,
      Environment.PRODUCTION,
      bundleId,
      appAppleId,
    ),
  }
  return _verifiers
}

/// `@apple/app-store-server-library` throws a `VerificationException` whose
/// `toString()` is just "Error" — useless in production. Pull message,
/// status code, and any nested cause so the API surface returns something
/// we can actually act on.
function formatVerificationError(e: unknown): string {
  if (e === null || e === undefined) return 'unknown'
  if (typeof e !== 'object') return String(e)
  const anyE = e as { message?: string; status?: number; cause?: unknown; name?: string }
  const parts: string[] = []
  if (anyE.name) parts.push(anyE.name)
  if (typeof anyE.status === 'number') parts.push(`status=${anyE.status}`)
  if (anyE.message) parts.push(anyE.message)
  if (anyE.cause) parts.push(`cause=${formatVerificationError(anyE.cause)}`)
  return parts.length > 0 ? parts.join(' ') : (e instanceof Error ? e.stack ?? 'Error' : 'unknown')
}

async function tryVerifyTransaction(
  signed: string,
): Promise<JWSTransactionDecodedPayload> {
  const v = getVerifiers()
  let sandboxErr: unknown
  try {
    return await v.sandbox.verifyAndDecodeTransaction(signed)
  } catch (e) {
    sandboxErr = e
  }
  try {
    return await v.production.verifyAndDecodeTransaction(signed)
  } catch (prodErr) {
    const sb = formatVerificationError(sandboxErr)
    const pr = formatVerificationError(prodErr)
    console.error('[apple-iap] verifyTransaction failed sandbox=', sb)
    console.error('[apple-iap] verifyTransaction failed production=', pr)
    throw new Error(`sandbox=[${sb}] production=[${pr}]`)
  }
}

export async function tryVerifyNotification(
  signed: string,
): Promise<ResponseBodyV2DecodedPayload> {
  const v = getVerifiers()
  let sandboxErr: unknown
  try {
    return await v.sandbox.verifyAndDecodeNotification(signed)
  } catch (e) {
    sandboxErr = e
  }
  try {
    return await v.production.verifyAndDecodeNotification(signed)
  } catch (prodErr) {
    throw new Error(
      `sandbox=[${formatVerificationError(sandboxErr)}] production=[${formatVerificationError(prodErr)}]`,
    )
  }
}

async function tryVerifyRenewalInfo(
  signed: string,
): Promise<JWSRenewalInfoDecodedPayload> {
  const v = getVerifiers()
  let sandboxErr: unknown
  try {
    return await v.sandbox.verifyAndDecodeRenewalInfo(signed)
  } catch (e) {
    sandboxErr = e
  }
  try {
    return await v.production.verifyAndDecodeRenewalInfo(signed)
  } catch (prodErr) {
    throw new Error(
      `sandbox=[${formatVerificationError(sandboxErr)}] production=[${formatVerificationError(prodErr)}]`,
    )
  }
}

// ---------------------------------------------------------------------------
// Product / status mapping
// ---------------------------------------------------------------------------

type ProductId = 'monthly' | 'yearly'
type SubStatus =
  | 'active'
  | 'trialing'
  | 'in_grace_period'
  | 'on_hold'
  | 'canceled'
  | 'expired'
  | 'past_due'

function productIdFromApple(productId: string | undefined): ProductId | null {
  if (!productId) return null
  // Apple product IDs are configured in App Store Connect with the convention
  // walkietalkie.pro.monthly and walkietalkie.pro.yearly. We match by suffix
  // so the bundle prefix can change without breaking this map.
  if (productId.endsWith('.monthly')) return 'monthly'
  if (productId.endsWith('.yearly')) return 'yearly'
  return null
}

/**
 * Compute our unified status from Apple's subscription state. Apple doesn't
 * give a single "status" field — we derive it from expiry + revoke + grace.
 */
function statusFromTransaction(
  txn: JWSTransactionDecodedPayload,
): SubStatus {
  const now = Date.now()
  if (txn.revocationDate) return 'canceled'
  const expires = txn.expiresDate ?? 0
  if (expires > now) return 'active'
  return 'expired'
}

// ---------------------------------------------------------------------------
// Subscription / profile upsert
// ---------------------------------------------------------------------------

export async function upsertAppleSubscription(opts: {
  userId: string
  txn: JWSTransactionDecodedPayload
  appleUserId?: string | null
}): Promise<{ status: SubStatus; productId: ProductId; externalId: string }> {
  const productId = productIdFromApple(opts.txn.productId)
  if (!productId) {
    throw new Error(`Unrecognized Apple productId: ${opts.txn.productId}`)
  }
  const externalId = opts.txn.originalTransactionId
  if (!externalId) {
    throw new Error('Missing originalTransactionId in transaction.')
  }
  const status = statusFromTransaction(opts.txn)
  const expiresMs = opts.txn.expiresDate ?? 0
  const periodEnd = expiresMs > 0 ? new Date(expiresMs).toISOString() : null

  const db = supabaseAdmin()

  // Profile: ensure a row exists so future webhooks can resolve user_id from
  // apple_user_id. We always upsert (insert on first call, no-op otherwise).
  const profilePayload: Record<string, unknown> = { user_id: opts.userId }
  if (opts.appleUserId) profilePayload.apple_user_id = opts.appleUserId
  const { error: profErr } = await db
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'user_id' })
  if (profErr) throw profErr

  const { error: subErr } = await db.from('subscriptions').upsert(
    {
      user_id: opts.userId,
      source: 'apple',
      external_id: externalId,
      product_id: productId,
      status,
      current_period_end: periodEnd,
      // Apple manages cancel_at_period_end via the autoRenewStatus on
      // RenewalInfo. We update it from the webhook (DID_CHANGE_RENEWAL_STATUS)
      // not from the transaction itself.
      cancel_at_period_end: false,
    },
    { onConflict: 'source,external_id' },
  )
  if (subErr) throw subErr

  return { status, productId, externalId }
}

// ---------------------------------------------------------------------------
// HTTP handler — POST /api/apple-iap/verify
// ---------------------------------------------------------------------------

/**
 * Called by the iOS app immediately after a successful StoreKit 2 purchase.
 * Body shape:
 *   {
 *     signedTransaction: string,   // JWS from Transaction.jsonRepresentation
 *     appleUserId?: string         // Sign In with Apple `sub` claim
 *   }
 */
export async function handleVerifyAppleTransaction(opts: {
  userId: string
  signedTransaction?: string
  appleUserId?: string
}): Promise<HandlerResult> {
  if (!opts.signedTransaction) {
    return { status: 400, body: { error: 'Missing signedTransaction.' } }
  }
  let txn: JWSTransactionDecodedPayload
  try {
    txn = await tryVerifyTransaction(opts.signedTransaction)
  } catch (err) {
    return {
      status: 400,
      body: { error: `Invalid signed transaction: ${String(err)}` },
    }
  }
  try {
    const result = await upsertAppleSubscription({
      userId: opts.userId,
      txn,
      appleUserId: opts.appleUserId ?? null,
    })
    return {
      status: 200,
      body: {
        ok: true,
        productId: result.productId,
        status: result.status,
        externalId: result.externalId,
        currentPeriodEnd: txn.expiresDate
          ? new Date(txn.expiresDate).toISOString()
          : null,
      },
    }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// ---------------------------------------------------------------------------
// HTTP handler — POST /api/apple-iap/webhook (Apple Server Notifications V2)
// ---------------------------------------------------------------------------

/**
 * Maps Apple notification types to our unified subscription status. Some
 * types depend on the subtype (DID_FAIL_TO_RENEW is grace-period vs past-due
 * depending on whether Apple's still in the grace window).
 */
function statusFromNotification(
  type: NotificationTypeV2,
  subtype: Subtype | undefined,
  txn: JWSTransactionDecodedPayload,
): SubStatus {
  switch (type) {
    case NotificationTypeV2.SUBSCRIBED:
    case NotificationTypeV2.DID_RENEW:
    case NotificationTypeV2.OFFER_REDEEMED:
    case NotificationTypeV2.RENEWAL_EXTENDED:
    case NotificationTypeV2.RENEWAL_EXTENSION:
      return 'active'
    case NotificationTypeV2.DID_FAIL_TO_RENEW:
      return subtype === Subtype.GRACE_PERIOD ? 'in_grace_period' : 'past_due'
    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
    case NotificationTypeV2.EXPIRED:
      return 'expired'
    case NotificationTypeV2.REFUND:
    case NotificationTypeV2.REVOKE:
      return 'canceled'
    default:
      // For DID_CHANGE_RENEWAL_STATUS, PRICE_CHANGE, etc. — keep current
      // entitlement state as-is (derived from expiresDate / revocationDate).
      return statusFromTransaction(txn)
  }
}

export async function handleAppleWebhook(
  signedPayload: string | undefined,
): Promise<HandlerResult> {
  if (!signedPayload) {
    return { status: 400, body: { error: 'Missing signedPayload.' } }
  }
  let notification: ResponseBodyV2DecodedPayload
  try {
    notification = await tryVerifyNotification(signedPayload)
  } catch (err) {
    return {
      status: 400,
      body: { error: `Invalid signed notification: ${String(err)}` },
    }
  }

  // Test pings from App Store Connect have no transaction data — just ack.
  if (notification.notificationType === NotificationTypeV2.TEST) {
    return { status: 200, body: { ok: true, type: 'TEST' } }
  }

  const data = notification.data
  if (!data?.signedTransactionInfo) {
    // Some notification types (METADATA_UPDATE, EXTERNAL_PURCHASE_TOKEN,
    // CONSUMPTION_REQUEST) don't carry transaction info we act on. Ack.
    return {
      status: 200,
      body: { ok: true, type: notification.notificationType, skipped: true },
    }
  }

  let txn: JWSTransactionDecodedPayload
  try {
    txn = await tryVerifyTransaction(data.signedTransactionInfo)
  } catch (err) {
    return {
      status: 400,
      body: {
        error: `Invalid transaction in notification: ${String(err)}`,
      },
    }
  }

  const externalId = txn.originalTransactionId
  if (!externalId) {
    return {
      status: 400,
      body: { error: 'Missing originalTransactionId in transaction.' },
    }
  }

  const db = supabaseAdmin()

  // Resolve user_id: prefer appAccountToken (we set this to the Supabase
  // user_id at purchase time so renewal webhooks always know who they're
  // for, even before the iOS client posts to /verify). Fall back to looking
  // up an existing subscription row.
  let userId: string | null = null
  if (txn.appAccountToken && /^[0-9a-f-]{36}$/i.test(txn.appAccountToken)) {
    userId = txn.appAccountToken
  }
  if (!userId) {
    const { data: row } = await db
      .from('subscriptions')
      .select('user_id')
      .eq('source', 'apple')
      .eq('external_id', externalId)
      .maybeSingle()
    userId = row?.user_id ?? null
  }
  if (!userId) {
    // Race: webhook arrived before iOS /verify call. Ack — /verify will
    // create the row when it lands. We don't lose state because Apple
    // re-sends notifications on failure, and iOS retries verify on app open.
    return {
      status: 200,
      body: { ok: true, deferred: true, reason: 'no user_id resolvable' },
    }
  }

  const productId = productIdFromApple(txn.productId)
  if (!productId) {
    return {
      status: 400,
      body: { error: `Unrecognized product: ${txn.productId}` },
    }
  }

  const status = statusFromNotification(
    notification.notificationType,
    notification.subtype,
    txn,
  )

  // Auto-renew toggle comes from the renewal info, not the transaction.
  // autoRenewStatus: 0 = will not renew (canceled but still active until period
  // ends), 1 = will renew.
  let cancelAtPeriodEnd = false
  if (data.signedRenewalInfo) {
    try {
      const renewal = await tryVerifyRenewalInfo(data.signedRenewalInfo)
      cancelAtPeriodEnd = renewal.autoRenewStatus === 0
    } catch {
      // Best-effort.
    }
  }

  const expiresMs = txn.expiresDate ?? 0
  const periodEnd = expiresMs > 0 ? new Date(expiresMs).toISOString() : null

  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: userId,
      source: 'apple',
      external_id: externalId,
      product_id: productId,
      status,
      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    },
    { onConflict: 'source,external_id' },
  )
  if (error) {
    return { status: 500, body: { error: error.message } }
  }

  return {
    status: 200,
    body: {
      ok: true,
      type: notification.notificationType,
      status,
      cancelAtPeriodEnd,
    },
  }
}
