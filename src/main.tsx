import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, loadPreferences } from './lib/preferences'
import { initAnalytics } from './lib/analytics'

// Apply the saved theme before first paint to avoid a dark→light flash
// on light-mode users.
applyTheme(loadPreferences().theme)

// Product analytics (PostHog). No-ops until VITE_POSTHOG_KEY is set.
initAnalytics()

// PWA cache-bust: vite-plugin-pwa registerType:'autoUpdate' installs a
// new Service Worker silently when one is available, but doesn't force a
// reload — so users keep running the old JS bundle (the cached one the
// old SW is still serving) until they manually close every tab and
// reopen. Today this stranded iPhone Safari users on the pre-GA-migration
// code, which then hit OpenAI's beta_api_shape_disabled error. Reload
// once the new SW activates and takes control of the page.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Only attach if there's already a controller — meaning the page is
  // already being served by an SW. Future controllerchange events on
  // this load can then only mean an UPDATE took control. Without this
  // guard we'd also reload on fresh first-install (the initial claim
  // also fires controllerchange), wasting one refresh per new visitor.
  if (navigator.serviceWorker.controller) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Without the flag, Safari can fire controllerchange twice in
      // quick succession (install + claim), producing two reloads.
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
