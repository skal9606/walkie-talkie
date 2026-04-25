import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Tutor from './pages/Tutor'
import Login from './pages/Login'
import Practice from './pages/Practice'
import AdNeymarDM from './pages/Ad'
import { trackPage } from './lib/tiktok'

export default function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/chat" element={<Tutor />} />
        <Route path="/ad/neymar-dm" element={<AdNeymarDM />} />
      </Routes>
    </BrowserRouter>
  )
}

// Fires ttq.page() on every client-side navigation. index.html already fires
// it once on initial load; this keeps the pixel in sync as users move between
// the landing page, chat, and the ad page without a full reload.
function PageTracker() {
  const { pathname } = useLocation()
  useEffect(() => {
    trackPage()
  }, [pathname])
  return null
}
