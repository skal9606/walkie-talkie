// PostHog product analytics. Thin wrapper in the spirit of src/lib/tiktok.ts:
// every export is a safe no-op until VITE_POSTHOG_KEY is configured, so call
// sites never need to guard and local dev / unconfigured builds send nothing.
//
// PRIVACY — this is a voice tutor. Session replay is configured to mask every
// form input AND the on-screen conversation transcript + review feedback (see
// `maskTextSelector`), so recordings never capture what a learner said, the
// tutor's replies, or personal learning data. Event properties below are
// deliberately limited to non-sensitive metadata (language, level, plan,
// durations, counts) — never transcript text.
import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  'https://us.i.posthog.com'

let started = false

/** Initialize PostHog once, at app startup. No-ops when the key is unset. */
export function initAnalytics(): void {
  if (started || !KEY) return
  posthog.init(KEY, {
    api_host: HOST,
    // Only mint person profiles for signed-in (identified) users — cheaper
    // and cleaner. Anonymous landing visits are still captured for the funnel
    // and get stitched to the person on identify().
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      // Mask all inputs (email, name, goals text)...
      maskAllInputs: true,
      // ...and the conversation transcript + review feedback, so a replay
      // never records what the learner said or the tutor's corrections.
      // Add `data-ph-mask` to any future element that shows private content.
      maskTextSelector: '.transcript, .turn-text, .review, [data-ph-mask]',
    },
  })
  started = true
}

function ph(): typeof posthog | null {
  return KEY ? posthog : null
}

/** Tie subsequent events to a signed-in user. Do NOT call for anonymous users. */
export function identifyUser(id: string, props?: Record<string, unknown>): void {
  ph()?.identify(id, props)
}

/** Set/merge person properties (e.g. target language, level). */
export function setUserProps(props: Record<string, unknown>): void {
  ph()?.setPersonProperties(props)
}

/** Clear identity on sign-out so the next user starts fresh. */
export function resetUser(): void {
  ph()?.reset()
}

/** Generic capture — prefer the named helpers in `track` below. */
export function capture(event: string, props?: Record<string, unknown>): void {
  ph()?.capture(event, props)
}

type Props = Record<string, unknown>

// Named helpers keep event names + property shapes consistent across the app.
// Props are intentionally non-sensitive metadata only (see the privacy note).
export const track = {
  landingViewed: () => capture('landing_viewed'),
  onboardingCompleted: (p: Props) => capture('onboarding_completed', p),
  conversationStarted: (p: Props) => capture('conversation_started', p),
  conversationCompleted: (p: Props) => capture('conversation_completed', p),
  paywallViewed: (p: Props) => capture('paywall_viewed', p),
  checkoutStarted: (p: Props) => capture('checkout_started', p),
  subscribed: (p: Props) => capture('subscribed', p),
  hintRequested: (p: Props) => capture('hint_requested', p),
  reviewTabOpened: (p: Props) => capture('review_tab_opened', p),
  languageSwitched: (p: Props) => capture('language_switched', p),
}
