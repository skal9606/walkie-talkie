import { Resend } from 'resend'
import { supabaseAdmin } from './supabase-admin.js'

// "From" address surfaces in inboxes as: Samit from Walkie Talkie
// <support@walkietalkie.so>. Replies route to the same address (Namecheap
// forwarder → Gmail). If you change this domain or email, update the
// Resend dashboard's verified-from list too.
const FROM_ADDRESS = 'Samit from Walkie Talkie <support@walkietalkie.so>'

type Plan = 'monthly' | 'yearly'

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

/**
 * Send the new-subscriber welcome email if we haven't already sent one to
 * this user. Idempotent — safe to call from every webhook event.
 *
 * Deduplication uses `profiles.welcome_email_sent_at`. The flag is set in
 * the SAME row we upsert during subscription sync, so the next time a
 * Stripe / Apple webhook fires for the same user we skip cleanly.
 *
 * Quietly no-ops (returns false) if:
 *   - RESEND_API_KEY isn't configured
 *   - we can't resolve an email address for the user
 *   - the user has already received the welcome email
 *   - Resend returns an error
 *
 * Never throws — callers don't need to wrap. Subscription sync must not
 * fail because an email send failed.
 */
export async function maybeSendWelcomeEmail(opts: {
  userId: string
  plan: Plan
  /**
   * Optional email override. Stripe webhooks have it on the customer
   * object; Apple webhooks don't, so we look it up from auth.users.
   */
  emailHint?: string | null
}): Promise<boolean> {
  const client = resendClient()
  if (!client) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] RESEND_API_KEY missing — skipping welcome send')
    }
    return false
  }

  const db = supabaseAdmin()

  // Dedupe: has this user already received the welcome email?
  const { data: profile, error: profErr } = await db
    .from('profiles')
    .select('welcome_email_sent_at, name, email')
    .eq('user_id', opts.userId)
    .maybeSingle()
  if (profErr) {
    console.error('[email] profile lookup failed', profErr)
    return false
  }
  if (profile?.welcome_email_sent_at) return false

  // Resolve recipient address. Prefer the hint (Stripe gives us a verified
  // customer email); fall back to the profile row; finally check auth.users.
  let to: string | null = opts.emailHint ?? profile?.email ?? null
  if (!to) {
    try {
      const { data: authUser } = await db.auth.admin.getUserById(opts.userId)
      to = authUser?.user?.email ?? null
    } catch (e) {
      console.error('[email] auth.users lookup failed', e)
    }
  }
  if (!to) {
    console.warn('[email] no email for user — skipping welcome', opts.userId)
    return false
  }

  const name = profile?.name?.trim() || null
  const subject = `Welcome to Walkie Talkie${name ? `, ${name}` : ''}`

  const { html, text } = renderWelcomeEmail({
    name,
    plan: opts.plan,
  })

  const { error: sendErr } = await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text,
    // Set a list-unsubscribe header so legitimate inboxes (Gmail,
    // Apple Mail) place us in Primary instead of Promotions when
    // possible. Cheap to add and Apple Mail specifically rewards it.
    headers: {
      'List-Unsubscribe': '<mailto:support@walkietalkie.so?subject=unsubscribe>',
    },
  })
  if (sendErr) {
    console.error('[email] resend send failed', sendErr)
    return false
  }

  // Mark sent. Best-effort — if this fails the user might get a duplicate
  // welcome next webhook, which is annoying but not catastrophic.
  const { error: markErr } = await db
    .from('profiles')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
  if (markErr) {
    console.error('[email] marking welcome_email_sent_at failed', markErr)
  }

  return true
}

function renderWelcomeEmail(opts: {
  name: string | null
  plan: Plan
}): { html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name},` : 'Hi,'
  const planLabel = opts.plan === 'yearly' ? 'yearly' : 'monthly'

  const text = `${greeting}

Thanks for subscribing to Walkie Talkie — that's a real vote of confidence and I appreciate it.

You're on the ${planLabel} plan and your tutor is ready whenever you are. A few things that'll get you the most out of the next month:

1. Open the app and just start talking. The tutor adapts to your level after the first minute.
2. Speak in your target language as much as you can — even if it's rough. The tutor catches mistakes you don't notice.
3. Come back the next day. Memory across sessions is what makes this feel different from any other AI chat.

If you have a minute, I'd love to hear what you're learning and why. Just hit reply to this email — it comes to me directly.

— Samit
Founder, Walkie Talkie

P.S. If anything goes wrong, support@walkietalkie.so reaches me first.`

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.55; color: #1f1410; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p>${greeting}</p>
    <p>Thanks for subscribing to Walkie Talkie — that's a real vote of confidence and I appreciate it.</p>
    <p>You're on the <strong>${planLabel}</strong> plan and your tutor is ready whenever you are. A few things that'll get you the most out of the next month:</p>
    <ol style="padding-left: 20px;">
      <li style="margin-bottom: 8px;"><strong>Open the app and just start talking.</strong> The tutor adapts to your level after the first minute.</li>
      <li style="margin-bottom: 8px;"><strong>Speak in your target language as much as you can</strong> — even if it's rough. The tutor catches mistakes you don't notice.</li>
      <li style="margin-bottom: 8px;"><strong>Come back the next day.</strong> Memory across sessions is what makes this feel different from any other AI chat.</li>
    </ol>
    <p>If you have a minute, I'd love to hear what you're learning and why. Just hit reply to this email — it comes to me directly.</p>
    <p>— Samit<br/>Founder, Walkie Talkie</p>
    <p style="color: #6b4f3a; font-size: 14px; margin-top: 32px;">P.S. If anything goes wrong, <a href="mailto:support@walkietalkie.so" style="color: #d8612a;">support@walkietalkie.so</a> reaches me first.</p>
  </body>
</html>`

  return { html, text }
}
