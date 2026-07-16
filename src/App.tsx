import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Tutor from './pages/Tutor'
import Login from './pages/Login'
import Practice from './pages/Practice'
import Lessons from './pages/Lessons'
import Review from './pages/Review'
import Stats from './pages/Stats'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import AdNeymarDM from './pages/Ad'
import Admin from './pages/Admin'
import HowToPracticeSpeakingAlone from '../blogposts/HowToPracticeSpeakingAlone'
import { trackPage } from './lib/tiktok'

export default function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/lessons" element={<Lessons />} />
        <Route path="/review" element={<Review />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/chat" element={<Tutor />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/ad/neymar-dm" element={<AdNeymarDM />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/blog/how-to-practice-speaking-a-language-alone" element={<HowToPracticeSpeakingAlone />} />
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
