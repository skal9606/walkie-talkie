import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  hasFullProfile,
  loadProfile,
  mergeProfileBlanks,
  type LearnerProfile,
} from '../lib/profile'
import { PRACTICE_MODES, type ModeId } from '../lib/scenarios'
import { currentStreak } from '../lib/streak'
import { trackSubscribe } from '../lib/tiktok'
import { Onboarding } from '../components/Onboarding'

// The "home" for any signed-in learner. After a successful subscription
// the learner is bounced here, and we run a one-time questionnaire to
// gather the richer profile (name, native language, level, goals) before
// showing the five mode cards.
//
// Gating:
//   - No user/session → /login
//   - User but no questionnaire complete → render the questionnaire
//   - Otherwise: render the portal

export default function Practice() {
  const { user, accessToken, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [profile, setProfile] = useState<LearnerProfile | null>(() => loadProfile())
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
    }
  }, [authLoading, user, accessToken, navigate])

  function handleQuestionnaireSubmit(p: LearnerProfile) {
    const merged = mergeProfileBlanks(p)
    setProfile(merged)
  }

  if (authLoading || !user) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>Loading…</div>
      </div>
    )
  }

  // Show the post-subscribe questionnaire until it's been completed,
  // prefilled with anything we inferred during the trial.
  if (!hasFullProfile(profile)) {
    return (
      <div className="app">
        <nav className="tutor-nav">
          <Link to="/" className="tutor-nav-back">
            ← Home
          </Link>
          <div className="tutor-nav-right">
            {subscribed === null ? null : subscribed ? (
              <div className="tutor-nav-badge">Subscribed</div>
            ) : (
              <div className="tutor-nav-badge free">Free trial</div>
            )}
          </div>
        </nav>
        <Onboarding
          initialProfile={profile}
          onComplete={handleQuestionnaireSubmit}
        />
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
          {user?.is_anonymous ? (
            <Link to="/login" className="tutor-nav-signout">
              Sign in
            </Link>
          ) : (
            <button className="tutor-nav-signout" onClick={() => signOut()}>
              Sign out
            </button>
          )}
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
