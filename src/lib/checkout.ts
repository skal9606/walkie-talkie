import type { Plan } from './subscription'

/**
 * Creates a Stripe Checkout session and redirects to Stripe's hosted page.
 * Throws if the server can't mint the session (e.g. Stripe env vars missing).
 */
export async function startCheckout(plan: Plan): Promise<void> {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan,
      successUrl: `${window.location.origin}/chat?subscribed=${plan}`,
      cancelUrl: `${window.location.origin}/chat`,
    }),
  })
  const data = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? 'Could not start checkout')
  }
  window.location.href = data.url
}
