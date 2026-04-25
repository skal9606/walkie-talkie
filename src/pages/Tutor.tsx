import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RealtimeTutor, type RealtimeEvent } from '../lib/realtime'
import { TUTOR_INSTRUCTIONS } from '../lib/tutor-prompt'
import {
  ALL_SCENARIOS,
  FREE_CONVERSATIONS,
  PRACTICE_MODES,
  ROLEPLAY_SCENARIOS,
  buildModePromptAddon,
  scenarioForLevel,
  vadForMode,
  type ModeId,
  type Scenario,
} from '../lib/scenarios'
import { FREE_TIER_SECONDS, type Plan } from '../lib/subscription'
import { Paywall } from '../components/Paywall'
import { SignIn } from '../components/SignIn'
import { Onboarding } from '../components/Onboarding'
import { clearProfile, loadProfile, saveProfile, type LearnerProfile } from '../lib/profile'
import { addMemoryItems, loadMemory } from '../lib/memory'
import { signOut, useAuth } from '../lib/auth'
import { startCheckout } from '../lib/checkout'
import { supabase } from '../lib/supabase'
import { trackSubscribe } from '../lib/tiktok'

type Turn = {
  id: string
  role: 'user' | 'tutor'
  text: string
  done: boolean
}

type Status = 'idle' | 'connecting' | 'live' | 'error' | 'reviewing' | 'review'

type ReviewData = {
  summary?: string
  corrections?: Array<{ original: string; corrected: string; explanation: string }>
  newVocabulary?: Array<{ word: string; translation: string; example: string }>
  practiceNextTime?: string[]
  memory?: string[]
}

type TranslationState = Record<string, string | 'loading'>

// How often to ping /api/heartbeat while a free-tier session is live.
const HEARTBEAT_INTERVAL_MS = 10000

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.ceil(total))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export default function Tutor() {
  const { user, accessToken, loading: authLoading } = useAuth()

  // Learner profile comes from localStorage. New visitors go through Onboarding
  // which writes it; returning visitors skip straight to the tutor.
  const [profile, setProfile] = useState<LearnerProfile | null>(() => loadProfile())
  const [signingInAnon, setSigningInAnon] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  // Set to true when onboarding just completed so we know to auto-start a
  // session as soon as auth + status are ready (instead of parking on the
  // scenario picker).
  const [autoStartAfterAuth, setAutoStartAfterAuth] = useState(false)

  const [status, setStatus] = useState<Status>('idle')
  const [scenarioId, setScenarioId] = useState<string>(() => {
    const p = loadProfile()
    return p ? `free-${p.level}` : 'free-complete-beginner'
  })
  const [turns, setTurns] = useState<Turn[]>([])
  const [translations, setTranslations] = useState<TranslationState>({})
  const [review, setReview] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Server-authoritative state. Loaded on auth + updated from API responses.
  const [subscribed, setSubscribed] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(FREE_TIER_SECONDS)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState<null | 'exhausted' | 'blocked'>(null)

  const tutorRef = useRef<RealtimeTutor | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const scenario = useMemo(
    () => ALL_SCENARIOS.find((s) => s.id === scenarioId) ?? ALL_SCENARIOS[0],
    [scenarioId],
  )
  const showScenarioHeader = status !== 'idle'

  // --- Load subscription + usage from Supabase whenever the user changes ---

  const refreshStatus = useCallback(async () => {
    if (!user) return
    const [{ data: sub }, { data: usage }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('usage').select('seconds_used').eq('user_id', user.id).maybeSingle(),
    ])
    const active = sub?.status === 'active' || sub?.status === 'trialing'
    setSubscribed(active)
    setSecondsRemaining(
      active
        ? FREE_TIER_SECONDS
        : Math.max(0, FREE_TIER_SECONDS - (usage?.seconds_used ?? 0)),
    )
    setStatusLoaded(true)
  }, [user])

  useEffect(() => {
    if (!user) return
    setStatusLoaded(false)
    refreshStatus()
  }, [user, refreshStatus])

  // --- Handle the return-from-Stripe redirect ---

  useEffect(() => {
    const plan = searchParams.get('subscribed')
    if (plan === 'monthly' || plan === 'yearly') {
      // Fire TikTok conversion event first (before the URL param is cleared).
      trackSubscribe(plan)
      // Webhook updates the DB asynchronously — give it a beat, then refresh.
      refreshStatus()
      const t = setTimeout(refreshStatus, 2500)
      const next = new URLSearchParams(searchParams)
      next.delete('subscribed')
      setSearchParams(next, { replace: true })
      return () => clearTimeout(t)
    }
  }, [searchParams, setSearchParams, refreshStatus])

  // --- Auto-start checkout when arriving from a Landing pricing card ---
  // (Landing navigates to /chat?checkout=monthly; if the user isn't signed in
  //  yet, they land on SignIn, then come back signed in with the param still
  //  present, at which point we kick off checkout automatically.)

  useEffect(() => {
    const plan = searchParams.get('checkout')
    if (!accessToken) return
    if (plan !== 'monthly' && plan !== 'yearly') return
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
    startCheckout(plan as Plan, accessToken).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [accessToken, searchParams, setSearchParams])

  // --- One-shot /chat?reset=1 handler (for testing the onboarding flow) ---
  // Clears profile + signs out, then reloads without the param.
  useEffect(() => {
    if (searchParams.get('reset') !== '1') return
    clearProfile()
    setProfile(null)
    supabase.auth.signOut().finally(() => {
      window.location.replace('/chat')
    })
  }, [searchParams])

  // --- Onboarding → anon sign-in → auto-start trial ---

  const handleOnboardingComplete = useCallback((p: LearnerProfile) => {
    saveProfile(p)
    setProfile(p)
    setScenarioId(`free-${p.level}`)
    setAutoStartAfterAuth(true)
    // Anon sign-in is kicked off by the effect below, which also covers
    // returning users whose anon session expired.
  }, [])

  // If a profile is on file but there's no active session (fresh onboarding,
  // cleared cookies, expired anon session), sign the user in anonymously.
  // Ref-guarded so we attempt once per mount and don't get into a retry loop
  // if anon sign-in is disabled in Supabase.
  const anonSignInAttempted = useRef(false)
  useEffect(() => {
    if (!profile) return
    if (authLoading) return
    if (user) return
    if (showSignIn) return
    if (anonSignInAttempted.current) return
    anonSignInAttempted.current = true
    setSigningInAnon(true)
    supabase.auth.signInAnonymously().then(({ error: signInErr }) => {
      setSigningInAnon(false)
      if (signInErr) {
        setError(
          `Anonymous sign-in failed: ${signInErr.message}. Check that Anonymous Sign-ins are enabled in Supabase → Authentication → Providers.`,
        )
        setAutoStartAfterAuth(false)
      }
    })
  }, [profile, authLoading, user, showSignIn])

  useEffect(() => {
    if (!autoStartAfterAuth) return
    if (!user || !accessToken) return
    if (!statusLoaded) return
    if (status !== 'idle') return
    if (!profile) return
    setAutoStartAfterAuth(false)
    const baseScenario = scenarioForLevel(profile.level)
    // Inject memory so a returning learner gets the memory-aware opener.
    const memory = loadMemory()
    const withMemory: Scenario = {
      ...baseScenario,
      buildPromptAddon: () =>
        baseScenario.buildPromptAddon({ name: profile.name, memory }),
    }
    start(withMemory)
    // start() reads from refs/state and is defined below; intentionally not
    // in deps to avoid re-firing every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAfterAuth, user, accessToken, statusLoaded, status, profile])

  // --- Mode launcher: /chat?mode=free|grammar|scenario|repeat|translations ---
  // Set by the /practice portal. We auto-start the right kind of session,
  // strip the param so a session-end doesn't re-trigger, and for `scenario`
  // we just land the user on the picker.
  useEffect(() => {
    const mode = searchParams.get('mode') as ModeId | null
    if (!mode) return
    if (!user || !accessToken) return
    if (!profile) return
    if (!statusLoaded) return
    if (status !== 'idle') return

    const next = new URLSearchParams(searchParams)
    next.delete('mode')
    setSearchParams(next, { replace: true })

    if (mode === 'scenario') {
      // Default the picker selection to the first roleplay so they have
      // somewhere to start.
      setScenarioId(ROLEPLAY_SCENARIOS[0].id)
      return
    }

    const meta = PRACTICE_MODES.find((m) => m.id === mode)
    if (!meta) return
    // Only Free Conversation reads memory; other modes are level-only.
    const memory = mode === 'free' ? loadMemory() : undefined
    const synthetic: Scenario = {
      id: `mode-${mode}-${profile.level}`,
      title: meta.title,
      description: meta.blurb,
      buildPromptAddon: () =>
        buildModePromptAddon(mode, {
          name: profile.name,
          level: profile.level,
          memory,
        }),
      vadEagerness: vadForMode(mode, profile.level),
    }
    start(synthetic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, accessToken, profile, statusLoaded, status, setSearchParams])

  // --- Tear down the WebRTC session if the user navigates away ---
  // Without this, /chat → / leaves Natalia talking in the background.
  useEffect(() => {
    return () => {
      tutorRef.current?.disconnect()
      tutorRef.current = null
    }
  }, [])

  // --- Auto-scroll transcript ---

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, translations])

  // --- Heartbeat loop: while live + not subscribed, POST /api/heartbeat ---

  useEffect(() => {
    if (status !== 'live' || subscribed || !accessToken) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ seconds: HEARTBEAT_INTERVAL_MS / 1000 }),
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          subscribed?: boolean
          secondsRemaining?: number
        }
        setSubscribed(data.subscribed ?? false)
        setSecondsRemaining(data.secondsRemaining ?? 0)
        if ((data.secondsRemaining ?? 0) <= 0 && !data.subscribed) {
          // Free minutes burned through — cut the session and show the paywall.
          await stopRef.current?.({ reason: 'exhausted' })
        }
      } catch {
        // Ignore transient network errors; next tick will retry.
      }
    }, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [status, subscribed, accessToken])

  // --- Session lifecycle ---

  const stop = useCallback(
    async (options: { reason?: 'exhausted' } = {}) => {
      tutorRef.current?.disconnect()
      tutorRef.current = null

      if (options.reason === 'exhausted') {
        setPaywallOpen('exhausted')
      }

      const finalTurns = turns.filter((t) => t.text.trim())
      if (finalTurns.length < 2) {
        setStatus('idle')
        refreshStatus()
        return
      }

      setStatus('reviewing')
      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            scenario: scenario.title,
            transcript: finalTurns.map((t) => ({ role: t.role, text: t.text })),
          }),
        })
        const data = (await res.json()) as ReviewData & { error?: string }
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `Review failed (${res.status})`)
        }
        setReview(data)
        // Persist memory bullets so the next Free Conversation can reference them.
        if (Array.isArray(data.memory) && data.memory.length > 0) {
          addMemoryItems(data.memory)
        }
        setStatus('review')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('review')
      }
      refreshStatus()
    },
    [accessToken, refreshStatus, scenario.title, turns],
  )

  // Ref indirection so the heartbeat useEffect can call stop() without
  // depending on it (which would re-trigger the interval every render).
  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  async function start(overrideScenario?: Scenario) {
    if (!accessToken) return
    if (!subscribed && secondsRemaining <= 0) {
      setPaywallOpen('blocked')
      return
    }
    setStatus('connecting')
    setError(null)
    setTurns([])
    setTranslations({})
    setReview(null)

    const activeScenario = overrideScenario ?? scenario
    const addon = activeScenario.buildPromptAddon({
      name: profile?.name,
      memory: loadMemory(),
    })
    const instructions = addon ? `${TUTOR_INSTRUCTIONS}\n\n${addon}` : TUTOR_INSTRUCTIONS

    const tutor = new RealtimeTutor()
    tutorRef.current = tutor

    tutor.onEvent((event: RealtimeEvent) => {
      switch (event.type) {
        case 'conversation.item.created': {
          const item = event.item as
            | { id?: string; role?: string; type?: string }
            | undefined
          if (item?.role === 'user' && item.type === 'message' && item.id) {
            const id = item.id
            setTurns((prev) =>
              prev.some((t) => t.id === id)
                ? prev
                : [...prev, { id, role: 'user', text: '', done: false }],
            )
          }
          break
        }
        case 'conversation.item.input_audio_transcription.completed': {
          const id = (event.item_id as string) ?? crypto.randomUUID()
          const transcript = (event.transcript as string) ?? ''
          setTurns((prev) => {
            const idx = prev.findIndex((t) => t.id === id && t.role === 'user')
            if (idx >= 0) {
              const next = prev.slice()
              next[idx] = { ...next[idx], text: transcript, done: true }
              return next
            }
            if (!transcript.trim()) return prev
            return [...prev, { id, role: 'user', text: transcript, done: true }]
          })
          break
        }
        case 'response.audio_transcript.delta': {
          const id = (event.response_id as string) ?? 'tutor'
          const delta = (event.delta as string) ?? ''
          setTurns((prev) => {
            const idx = prev.findIndex(
              (t) => t.id === id && t.role === 'tutor' && !t.done,
            )
            if (idx >= 0) {
              const next = prev.slice()
              next[idx] = { ...next[idx], text: next[idx].text + delta }
              return next
            }
            return [...prev, { id, role: 'tutor', text: delta, done: false }]
          })
          break
        }
        case 'response.audio_transcript.done': {
          const id = (event.response_id as string) ?? 'tutor'
          setTurns((prev) =>
            prev.map((t) =>
              t.id === id && t.role === 'tutor' ? { ...t, done: true } : t,
            ),
          )
          break
        }
        case 'error': {
          const err = event.error as { message?: string } | undefined
          setError(err?.message ?? 'Unknown error from Realtime API')
          break
        }
      }
    })

    try {
      const info = await tutor.connect(instructions, {
        vadEagerness: activeScenario.vadEagerness,
        accessToken,
      })
      setSubscribed(info.subscribed)
      setSecondsRemaining(info.secondsRemaining)
      setStatus('live')
    } catch (err) {
      tutor.disconnect()
      tutorRef.current = null
      const typed = err as Error & { status?: number; secondsRemaining?: number }
      if (typed.status === 402) {
        setSecondsRemaining(typed.secondsRemaining ?? 0)
        setPaywallOpen('blocked')
        setStatus('idle')
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  async function toggleTranslation(turn: Turn) {
    if (turn.role !== 'tutor' || !turn.text.trim() || !turn.done) return
    const existing = translations[turn.id]
    if (existing && existing !== 'loading') {
      setTranslations((prev) => {
        const next = { ...prev }
        delete next[turn.id]
        return next
      })
      return
    }
    if (existing === 'loading') return

    setTranslations((prev) => ({ ...prev, [turn.id]: 'loading' }))
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ text: turn.text }),
      })
      const data = (await res.json()) as { translation?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Translate failed')
      setTranslations((prev) => ({
        ...prev,
        [turn.id]: data.translation ?? '(no translation)',
      }))
    } catch {
      setTranslations((prev) => {
        const next = { ...prev }
        delete next[turn.id]
        return next
      })
    }
  }

  function newSession() {
    setStatus('idle')
    setReview(null)
    setTurns([])
    setTranslations({})
    setError(null)
  }

  const freeExhausted = !subscribed && secondsRemaining <= 0

  if (authLoading) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>
          Loading…
        </div>
      </div>
    )
  }

  // Returning subscriber asked to sign in with email — surface the magic-link
  // form instead of onboarding.
  if (showSignIn && (!user || !accessToken)) {
    return (
      <div className="app">
        <nav className="tutor-nav">
          <Link to="/" className="tutor-nav-back">
            ← Back
          </Link>
        </nav>
        <SignIn />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="onboarding-link-btn"
            onClick={() => setShowSignIn(false)}
          >
            ← Back to sign-up
          </button>
        </div>
      </div>
    )
  }

  // First visit — no profile yet. Collect name + level, then anon sign-in +
  // auto-start trial. If they came from a pricing card (?checkout=…), skip
  // onboarding and go straight to magic-link sign-in: they already know they
  // want to subscribe.
  const hasCheckoutIntent =
    searchParams.get('checkout') === 'monthly' ||
    searchParams.get('checkout') === 'yearly'
  if (!profile) {
    if (hasCheckoutIntent && (!user || !accessToken)) {
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
    return (
      <div className="app">
        <nav className="tutor-nav">
          <Link to="/" className="tutor-nav-back">
            ← Back
          </Link>
        </nav>
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSignInInstead={() => setShowSignIn(true)}
        />
        {error && (
          <div className="error" style={{ textAlign: 'center', marginTop: 16 }}>
            {error}
          </div>
        )}
      </div>
    )
  }

  // Profile is set but we're still waiting on anon sign-in to complete.
  if (!user || !accessToken) {
    return (
      <div className="app">
        <nav className="tutor-nav">
          <Link to="/" className="tutor-nav-back">
            ← Back
          </Link>
        </nav>
        <div className="empty" style={{ marginTop: 80 }}>
          {signingInAnon ? 'Getting ready…' : error ? '' : 'Loading…'}
        </div>
        {error && !signingInAnon && (
          <div className="auth-card" style={{ marginTop: 24 }}>
            <h2 className="auth-title">Something went wrong</h2>
            <p className="auth-body">{error}</p>
            <button
              type="button"
              className="mic-btn start"
              onClick={() => {
                setError(null)
                anonSignInAttempted.current = false
                // Force the effect to re-evaluate by nudging a dep.
                setProfile((p) => (p ? { ...p } : p))
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="tutor-nav">
        <Link
          to={subscribed ? '/practice' : '/'}
          className="tutor-nav-back"
        >
          {subscribed ? '← Back to practice' : '← Back'}
        </Link>
        <div className="tutor-nav-right">
          {!statusLoaded ? (
            <div className="tutor-nav-badge free">Loading…</div>
          ) : subscribed ? (
            <div className="tutor-nav-badge">Subscribed</div>
          ) : (
            <div className="tutor-nav-badge free">
              Free trial · {formatSeconds(secondsRemaining)} left
            </div>
          )}
          <button className="tutor-nav-signout" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </nav>

      <header className="header">
        <h1>{showScenarioHeader ? scenario.title : 'Walkie Talkie'}</h1>
        <p className="subtitle">
          {showScenarioHeader
            ? scenario.description
            : 'Voice conversation · Brazilian Portuguese'}
        </p>
      </header>

      {status === 'idle' && !paywallOpen && (
        <ScenarioPicker
          selectedId={scenarioId}
          onSelect={setScenarioId}
          freeConversations={FREE_CONVERSATIONS}
          roleplayScenarios={ROLEPLAY_SCENARIOS}
        />
      )}

      {(status === 'connecting' || status === 'live') && (
        <div className="transcript" ref={scrollRef}>
          {turns.length === 0 && status === 'connecting' && (
            <div className="empty">Connecting to tutor…</div>
          )}
          {turns.map((turn) => {
            const translation = translations[turn.id]
            const isTutor = turn.role === 'tutor'
            return (
              <div
                key={turn.id + '-' + turn.role}
                className={`turn ${turn.role} ${isTutor && turn.done ? 'clickable' : ''}`}
                onClick={isTutor ? () => toggleTranslation(turn) : undefined}
                title={isTutor && turn.done ? 'Click for English translation' : undefined}
              >
                <div className="turn-role">{isTutor ? 'Tutor' : 'You'}</div>
                <div className="turn-text">{turn.text || '…'}</div>
                {translation === 'loading' && (
                  <div className="translation loading">Translating…</div>
                )}
                {translation && translation !== 'loading' && (
                  <div className="translation">{translation}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {status === 'reviewing' && (
        <div className="transcript">
          <div className="empty">Generating session review…</div>
        </div>
      )}

      {status === 'review' && <ReviewView review={review} error={error} />}

      <div className="controls">
        {status === 'live' && (
          <div className="live-indicator">
            ● Live{' '}
            {!subscribed && secondsRemaining <= 30 && (
              <span className="live-warning">
                · {formatSeconds(secondsRemaining)} left
              </span>
            )}
          </div>
        )}
        {status === 'idle' && !paywallOpen && (
          <button
            className="mic-btn start"
            onClick={() => start()}
            disabled={freeExhausted || !statusLoaded}
            title={
              freeExhausted
                ? 'Your free trial is up — subscribe to continue'
                : undefined
            }
          >
            {!statusLoaded
              ? 'Loading…'
              : freeExhausted
                ? 'Free trial used — subscribe'
                : 'Start session'}
          </button>
        )}
        {status === 'connecting' && (
          <button className="mic-btn" disabled>
            Connecting…
          </button>
        )}
        {status === 'live' && (
          <button className="mic-btn stop" onClick={() => stop()}>
            End session
          </button>
        )}
        {status === 'reviewing' && (
          <button className="mic-btn" disabled>
            Reviewing…
          </button>
        )}
        {status === 'review' && !paywallOpen && (
          <button className="mic-btn start" onClick={newSession}>
            Start another session
          </button>
        )}
        {status === 'error' && (
          <>
            <div className="error">{error}</div>
            <button className="mic-btn start" onClick={() => start()}>
              Retry
            </button>
          </>
        )}
      </div>

      {paywallOpen && accessToken && (
        <Paywall
          reason={paywallOpen}
          accessToken={accessToken}
          isAnonymous={user?.is_anonymous ?? false}
        />
      )}
    </div>
  )
}

function ScenarioPicker({
  freeConversations,
  roleplayScenarios,
  selectedId,
  onSelect,
}: {
  freeConversations: Scenario[]
  roleplayScenarios: Scenario[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="scenarios">
      <section className="picker-section">
        <h3 className="picker-section-label">Free conversation</h3>
        <div className="scenario-grid cols-3">
          {freeConversations.map((s) => (
            <ScenarioTile
              key={s.id}
              scenario={s}
              selected={s.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>

      <section className="picker-section">
        <h3 className="picker-section-label">Scenarios</h3>
        <div className="scenario-grid cols-2">
          {roleplayScenarios.map((s) => (
            <ScenarioTile
              key={s.id}
              scenario={s}
              selected={s.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function ScenarioTile({
  scenario,
  selected,
  onSelect,
}: {
  scenario: Scenario
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      className={`scenario-tile ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(scenario.id)}
    >
      <div className="scenario-title">{scenario.title}</div>
      <div className="scenario-desc">{scenario.description}</div>
    </button>
  )
}

function ReviewView({ review, error }: { review: ReviewData | null; error: string | null }) {
  if (error && !review) {
    return (
      <div className="review">
        <div className="error">{error}</div>
      </div>
    )
  }
  if (!review) return null

  const hasCorrections = (review.corrections ?? []).length > 0
  const hasVocab = (review.newVocabulary ?? []).length > 0
  const hasNextTime = (review.practiceNextTime ?? []).length > 0

  return (
    <div className="review">
      {review.summary && (
        <section className="review-section">
          <h2>Session summary</h2>
          <p>{review.summary}</p>
        </section>
      )}

      {hasCorrections && (
        <section className="review-section">
          <h2>Corrections</h2>
          <ul className="corrections">
            {review.corrections!.map((c, i) => (
              <li key={i}>
                <div className="correction-row">
                  <span className="correction-wrong">{c.original}</span>
                  <span className="correction-arrow">→</span>
                  <span className="correction-right">{c.corrected}</span>
                </div>
                <div className="correction-explain">{c.explanation}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasVocab && (
        <section className="review-section">
          <h2>New vocabulary</h2>
          <ul className="vocab">
            {review.newVocabulary!.map((v, i) => (
              <li key={i}>
                <div>
                  <span className="vocab-word">{v.word}</span>
                  <span className="vocab-translation"> — {v.translation}</span>
                </div>
                {v.example && <div className="vocab-example">{v.example}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasNextTime && (
        <section className="review-section">
          <h2>Next time, practice</h2>
          <ul className="next-time">
            {review.practiceNextTime!.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
