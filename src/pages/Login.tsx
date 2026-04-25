import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SignIn } from '../components/SignIn'
import { useAuth } from '../lib/auth'

// Dedicated /login page for returning subscribers — same magic-link flow as
// the inline SignIn, but lives at a real URL we can link to from the landing
// nav. After sign-in, the user is bounced to /practice.

export default function Login() {
  const navigate = useNavigate()
  const { user, accessToken, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    // Anonymous trial users are technically "signed in" but they're the ones
    // most likely to click Login (to convert to a real account). Only bounce
    // genuinely-authenticated users away from this form.
    if (user && !user.is_anonymous && accessToken) {
      navigate('/practice', { replace: true })
    }
  }, [user, accessToken, loading, navigate])

  return (
    <div className="app">
      <nav className="tutor-nav">
        <Link to="/" className="tutor-nav-back">
          ← Back
        </Link>
      </nav>
      <SignIn />
    </div>
  )
}
