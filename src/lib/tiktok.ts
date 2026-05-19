// Thin wrappers around the TikTok pixel. The ttq object is loaded from the
// inline script in index.html. Ad blockers may prevent it from loading, so
// every call is safely optional-chained — these helpers are no-ops if the
// pixel never arrived.

type TtqParams = Record<string, unknown>

declare global {
  interface Window {
    ttq?: {
      page: () => void
      track: (event: string, params?: TtqParams) => void
      identify: (params: TtqParams) => void
    }
  }
}

/** Call on every SPA route change. */
export function trackPage(): void {
  window.ttq?.page()
}

/** Generic TikTok event — prefer the specific helpers below. */
export function trackEvent(event: string, params?: TtqParams): void {
  window.ttq?.track(event, params)
}

/**
 * Fired when a user returns from Stripe with a completed subscription.
 * Reports revenue so TikTok Ads Manager can calculate ROAS.
 */
export function trackSubscribe(plan: 'monthly' | 'yearly'): void {
  trackEvent('Subscribe', {
    value: plan === 'monthly' ? 10 : 100,
    currency: 'USD',
    content_type: 'product',
    content_id: `walkie-talkie-${plan}`,
    content_name: plan === 'monthly' ? 'Monthly Subscription' : 'Yearly Subscription',
  })
}

/**
 * Fired the FIRST time a user is authenticated as a real (non-anonymous)
 * account on this device. Tells TikTok's algorithm which ad clicks turn
 * into actual accounts, not just bounces.
 *
 * Persisted in localStorage so the event fires exactly once per device
 * per lifetime — every subsequent login / tab open is a no-op. Without
 * this, the onAuthStateChange listener would re-fire on every page
 * reload and pollute attribution.
 */
export function trackCompleteRegistration(): void {
  if (typeof window === 'undefined') return
  const key = 'walkie.tracked.completeRegistration'
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    // Private mode / quota — fall through; one bonus event is acceptable.
  }
  trackEvent('CompleteRegistration')
}

/**
 * Fired the first time a user starts a conversation session in this
 * browser (any mode — free conversation, lesson, etc.). This is the
 * "activated trial" signal that matters most after the install — it
 * tells TikTok which clicks turn into actual product use.
 *
 * Persisted in localStorage (not sessionStorage) so the event fires
 * exactly once per device per lifetime — repeat sessions don't pollute.
 */
export function trackStartTrial(): void {
  if (typeof window === 'undefined') return
  const key = 'walkie.tracked.startTrial'
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    // Private mode / quota — fall through; one bonus event is acceptable.
  }
  trackEvent('StartTrial')
}

/**
 * Fired whenever the paywall opens. Both the "blocked" path (trial-aware
 * user tapped a paywalled action) and the "exhausted" path (trial minutes
 * ran out mid-session) count — both are equally strong intent signals.
 *
 * Not deduped — repeat opens of the paywall by the same user reflect
 * real reconsideration and TikTok's algorithm benefits from the volume.
 */
export function trackInitiateCheckout(reason: 'exhausted' | 'blocked'): void {
  trackEvent('InitiateCheckout', {
    content_type: 'product',
    content_id: 'walkie-talkie-pro',
    content_name: 'Walkie Talkie Pro',
    description: reason,
  })
}
