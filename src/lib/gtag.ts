// Thin wrapper around Google Analytics (gtag.js), in the spirit of
// src/lib/tiktok.ts. The gtag function is defined by the inline script in
// index.html. Ad blockers may prevent gtag.js from loading, but the inline
// stub always exists and safely queues into dataLayer — calls here are
// optional-chained anyway so they're no-ops if the snippet is ever removed.

type GtagParams = Record<string, unknown>

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void
  }
}

/**
 * Call on every SPA route change (including the initial load — index.html
 * configures gtag with send_page_view: false, so this is the only source
 * of page_view events).
 */
export function trackPageView(path: string): void {
  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

/** Generic GA event. */
export function trackGaEvent(event: string, params?: GtagParams): void {
  window.gtag?.('event', event, params)
}
