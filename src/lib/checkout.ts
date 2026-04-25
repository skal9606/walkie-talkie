import type { Plan } from './subscription'

/**
 * Creates a Stripe Checkout session and redirects to Stripe's hosted page.
 * Requires a Supabase access token so the server can attach the user id as
 * client_reference_id / metadata (the webhook uses this to link the
 * subscription back to the user).
 */
export async function startCheckout(plan: Plan, accessToken: string): Promise<void> {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      plan,
      successUrl: `${window.location.origin}/practice?subscribed=${plan}`,
      cancelUrl: `${window.location.origin}/chat`,
    }),
  })
  const data = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? 'Could not start checkout')
  }
  window.location.href = data.url
}
