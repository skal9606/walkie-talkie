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
