import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Tutor from './pages/Tutor'
import AdNeymarDM from './pages/Ad'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/chat" element={<Tutor />} />
        <Route path="/ad/neymar-dm" element={<AdNeymarDM />} />
      </Routes>
    </BrowserRouter>
  )
}
