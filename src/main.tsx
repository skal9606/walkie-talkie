import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, loadPreferences } from './lib/preferences'

// Apply the saved theme before first paint to avoid a dark→light flash
// on light-mode users.
applyTheme(loadPreferences().theme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
