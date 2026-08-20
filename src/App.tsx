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
import Blog from './pages/Blog'
import HowToPracticeSpeakingAlone from '../blogposts/HowToPracticeSpeakingAlone'
import IntermediatePlateau from '../blogposts/IntermediatePlateau'
import IntermediateSpanishPractice from '../blogposts/IntermediateSpanishPractice'
import { trackPage } from './lib/tiktok'
import { trackPageView } from './lib/gtag'

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
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/how-to-practice-speaking-a-language-alone" element={<HowToPracticeSpeakingAlone />} />
        <Route path="/blog/why-youre-stuck-at-the-intermediate-language-plateau" element={<IntermediatePlateau />} />
        <Route path="/blog/intermediate-spanish-practice-b1-to-fluency" element={<IntermediateSpanishPractice />} />
      </Routes>
    </BrowserRouter>
  )
}

// Fires ttq.page() on every client-side navigation. index.html already fires
// it once on initial load; this keeps the pixel in sync as users move between
// the landing page, chat, and the ad page without a full reload.
// Also fires GA page_view here — GA's auto pageview is disabled in index.html
// (send_page_view: false), so this effect is the sole source, covering both
// the initial load and every route change exactly once.
function PageTracker() {
  const { pathname } = useLocation()
  useEffect(() => {
    trackPage()
    trackPageView(pathname)
  }, [pathname])
  return null
}
