import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { loadProfile } from '../lib/profile'
import { PRACTICE_MODES, type ModeId } from '../lib/scenarios'
import { currentStreak } from '../lib/streak'
import { trackSubscribe } from '../lib/tiktok'

// The "home" for any signed-in learner with a saved profile. Five mode
// cards (inspired by Issen) — each kicks off a /chat session pre-configured
// for that practice style.
//
// Gating:
//   - No user/session → /login
//   - User but no profile → /chat (onboarding lives there)
//   - Otherwise: show the portal
//
// Subscription is NOT gated here — the paywall lives in /chat and only
// fires when the learner actually tries to start a session and is out of
// trial seconds.

export default function Practice() {
  const { user, accessToken, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const profile = loadProfile()
  // Computed once on mount — fresh number every time the user lands here,
  // including after a session via /chat that just bumped the streak.
  const [streak] = useState(() => currentStreak())

  const refreshStatus = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle()
    setSubscribed(data?.status === 'active' || data?.status === 'trialing')
  }, [user])

  useEffect(() => {
    if (!user) return
    refreshStatus()
  }, [user, refreshStatus])

  // Post-Stripe return: ?subscribed=monthly|yearly. Fire TikTok conversion
  // event + give the webhook a beat, then re-check.
  useEffect(() => {
    const plan = searchParams.get('subscribed')
    if (plan !== 'monthly' && plan !== 'yearly') return
    trackSubscribe(plan)
    refreshStatus()
    const t = setTimeout(refreshStatus, 2500)
    const next = new URLSearchParams(searchParams)
    next.delete('subscribed')
    setSearchParams(next, { replace: true })
    return () => clearTimeout(t)
  }, [searchParams, setSearchParams, refreshStatus])

  // Routing decisions, applied once auth is known.
  useEffect(() => {
    if (authLoading) return
    if (!user || !accessToken) {
      navigate('/login', { replace: true })
      return
    }
    if (!profile) {
      // No local profile (cleared cache, new device) — onboarding lives at /chat.
      navigate('/chat', { replace: true })
    }
  }, [authLoading, user, accessToken, profile, navigate])

  if (authLoading || !user || !profile) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>Loading…</div>
      </div>
    )
  }

  function pickMode(mode: ModeId) {
    navigate(`/chat?mode=${mode}`)
  }

  return (
    <div className="app">
      <nav className="tutor-nav">
        <Link to="/" className="tutor-nav-back">
          ← Home
        </Link>
        <div className="tutor-nav-right">
          {streak > 0 && (
            <div
              className="streak-pill"
              title={`${streak}-day practice streak — keep it going!`}
            >
              <span aria-hidden>🔥</span> {streak}
            </div>
          )}
          {subscribed === null ? null : subscribed ? (
            <div className="tutor-nav-badge">Subscribed</div>
          ) : (
            <div className="tutor-nav-badge free">Free trial</div>
          )}
          <button className="tutor-nav-signout" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </nav>

      <header className="header">
        <h1>Choose any way to practice</h1>
        <p className="subtitle">
          {profile?.name ? `Welcome back, ${profile.name}.` : 'Welcome back.'} Pick a mode and Natalia will take it from there.
        </p>
      </header>

      <div className="practice-modes">
        {PRACTICE_MODES.map((m) => (
          <button
            key={m.id}
            className="practice-mode"
            onClick={() => pickMode(m.id)}
          >
            <div className="practice-mode-text">
              <div className="practice-mode-title">{m.title}</div>
              <div className="practice-mode-blurb">{m.blurb}</div>
            </div>
            <div className="practice-mode-arrow">›</div>
          </button>
        ))}
      </div>
    </div>
  )
}
