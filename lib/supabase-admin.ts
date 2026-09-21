import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Server-side Supabase client using the service_role key. Bypasses RLS — only
 * call from serverless functions or trusted server code. Never bundle this in
 * the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('VITE_SUPABASE_URL (or SUPABASE_URL) env var missing.')
  }
  if (!serviceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var missing.')
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Extracts the Bearer token from an Authorization header and asks Supabase who
 * owns it. Returns the authenticated user id or null if unauthenticated.
 */
export async function getUserIdFromAuthHeader(
  authHeader: string | string[] | null | undefined,
): Promise<string | null> {
  const user = await getUserFromAuthHeader(authHeader)
  return user?.id ?? null
}

/**
 * Like getUserIdFromAuthHeader but returns id + email. Used by the admin
 * dashboard gate (which compares email against ADMIN_EMAIL env var).
 */
export async function getUserFromAuthHeader(
  authHeader: string | string[] | null | undefined,
): Promise<{ id: string; email: string | null } | null> {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return null
  const jwt = match[1]
  // Fast path: verify the signature locally against Supabase's published
  // JWKS (ES256). Saves the 150–600ms auth round-trip on every API call
  // (start-latency work, 2026-09-20). Trade-off: a session revoked by
  // sign-out stays valid here until the token expires (≤1h) — acceptable
  // for gating a voice session; Stripe/account mutations still go
  // through Supabase itself.
  //
  // MUST NEVER THROW: the first version took every /api/* route down
  // with 500s in production on 2026-09-20. Anything unexpected here is
  // logged and falls through to the Supabase check, exactly as before.
  try {
    const local = await verifySupabaseJwt(jwt, remoteJwks())
    if (local) {
      lastAuthVia = 'local'
      return local
    }
  } catch (err) {
    console.error('[auth] local JWT verify threw; falling back to Supabase:', err)
  }
  lastAuthVia = 'supabase'
  const { data, error } = await supabaseAdmin().auth.getUser(jwt)
  if (error || !data?.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

let lastAuthVia: 'local' | 'supabase' | 'none' = 'none'
/// Which path verified the most recent token in this invocation. Surfaced
/// as the `x-walkie-auth` response header on /api/session so the fast
/// path can be confirmed from outside (Vercel logs aren't at hand).
/// Diagnostic only; safe to remove once confirmed.
export function authVia(): 'local' | 'supabase' | 'none' {
  return lastAuthVia
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
/// Module-cached so warm serverless invocations reuse the fetched keys;
/// jose refetches on an unknown `kid` (key rotation) automatically.
function remoteJwks() {
  if (!jwks) {
    const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`), {
      // Don't let a slow JWKS fetch cost more than the round-trip it replaces.
      timeoutDuration: 1500,
      cooldownDuration: 30_000,
    })
  }
  return jwks
}

/// Verifies a Supabase access token and returns its user, or null when the
/// token is invalid/expired/not for this project. `getKey` is injectable
/// so tests can sign with a local key; production passes the remote JWKS.
export async function verifySupabaseJwt(
  jwt: string,
  getKey: Parameters<typeof jwtVerify>[1],
): Promise<{ id: string; email: string | null } | null> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  try {
    const { payload } = await jwtVerify(jwt, getKey, {
      issuer: `${url}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    })
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    const email = typeof payload.email === 'string' ? payload.email : null
    return { id: payload.sub, email }
  } catch {
    return null
  }
}
