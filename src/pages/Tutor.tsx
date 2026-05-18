import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RealtimeTutor, type RealtimeEvent } from '../lib/realtime'

/// Mirrors the backend shape in lib/api-handlers.ts. Inlined here rather
/// than imported from the backend module to keep the frontend bundle
/// independent of the api/ folder. If the backend shape grows, update
/// both places — keeps the cross-runtime boundary explicit.
type CefrAssessment = {
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'INSUFFICIENT_DATA'
  note: string
  language: string
  assessedAt: string
}
import {
  PRACTICE_MODES,
  type ModeId,
  type Scenario,
} from '../lib/scenarios'
import { FREE_TIER_SECONDS, type Plan } from '../lib/subscription'
import { Paywall } from '../components/Paywall'
import { SignIn } from '../components/SignIn'
import { OnboardingFlow } from '../components/OnboardingFlow'
import {
  buildLearnerContextBlock,
  clearProfile,
  hasLanguageSelection,
  loadProfile,
  mergeProfileBlanks,
  type LearnerProfile,
} from '../lib/profile'
import { buildPreferencesPromptBlock, loadPreferences } from '../lib/preferences'
import { addMemoryItems, clearMemory, loadMemory } from '../lib/memory'
import { addVocabItems, buildVocabBlock, clearVocab, loadVocab } from '../lib/vocab'
import { buildFocusBlock, clearFocus, loadFocus, saveFocus } from '../lib/focus'
import { buildMistakesBlock } from '../lib/mistakes'
import { PRACTICE_THRESHOLD_MS, recordPractice } from '../lib/streak'
import { getFreshAccessToken, signOut, useAuth } from '../lib/auth'
import { startCheckout } from '../lib/checkout'
import { supabase } from '../lib/supabase'
import { trackSubscribe } from '../lib/tiktok'
import { DEFAULT_TUTOR_ID, TUTORS, getTutor } from '../lib/tutors'
import { findBeginnerCardInText } from '../lib/tutors/beginner-cards'
import type { BeginnerCard } from '../lib/tutors/types'
import { BeginnerCardView } from '../components/BeginnerCardView'
import { lessonById } from '../lib/lessons/catalog'
import {
  buildLessonInstructions,
  LESSON_SCENARIO_OVERRIDE,
} from '../lib/lessons/instructions'
import { markLessonAttempt } from '../lib/lessons/progress'
import { seedDeckForCompletedLesson } from '../lib/review'

type Turn = {
  id: string
  role: 'user' | 'tutor'
  text: string
  done: boolean
}

type Status = 'idle' | 'connecting' | 'live' | 'error' | 'reviewing' | 'review'

type InferredLevel =
  | 'complete-beginner'
  | 'novice'
  | 'intermediate'
  | 'advanced'

type ReviewData = {
  summary?: string
  corrections?: Array<{ original: string; corrected: string; explanation: string }>
  newVocabulary?: Array<{ word: string; translation: string; example: string }>
  practiceNextTime?: string[]
  memory?: string[]
  name?: string | null
  inferredLevel?: InferredLevel | null
  nextFocus?: string | null
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

  // Learner profile comes from localStorage. Empty on first visit; populated
  // by /api/review extraction after each session and finalized by the
  // post-subscribe questionnaire.
  const [profile, setProfile] = useState<LearnerProfile | null>(() => loadProfile())
  const [signingInAnon, setSigningInAnon] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  // Set to true when we want to auto-start a session as soon as auth + status
  // are ready (e.g. fresh first-time visitor, returning anon user, etc).
  const [autoStartAfterAuth, setAutoStartAfterAuth] = useState(true)

  const [status, setStatus] = useState<Status>('idle')
  const [scenarioId, setScenarioId] = useState<string>(() => {
    const p = loadProfile()
    return p?.level ? `free-${p.level}` : 'free-novice'
  })
  const [turns, setTurns] = useState<Turn[]>([])
  const [translations, setTranslations] = useState<TranslationState>({})
  const [review, setReview] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  /// Hint button state. `null` = no hint panel showing. Non-null array =
  /// the 2-3 phrases returned by the most recent requestHint call.
  const [hintLines, setHintLines] = useState<string[] | null>(null)
  const [hintLoading, setHintLoading] = useState(false)
  // Accumulator for response.text.delta chunks belonging to the active
  // out-of-band hint response. Cleared on response.text.done.
  const hintBufferRef = useRef<string>('')

  // Local dev bypass — when VITE_DEV_BYPASS_GATING=true, skip all trial /
  // subscription checks and act as if the user is fully subscribed. Never
  // set in production.
  const devBypass = import.meta.env.VITE_DEV_BYPASS_GATING === 'true'

  // Server-authoritative state. Loaded on auth + updated from API responses.
  const [subscribed, setSubscribed] = useState(devBypass)
  const [secondsRemaining, setSecondsRemaining] = useState(
    devBypass ? Number.MAX_SAFE_INTEGER : FREE_TIER_SECONDS,
  )
  const [statusLoaded, setStatusLoaded] = useState(devBypass)
  const [paywallOpen, setPaywallOpen] = useState<null | 'exhausted' | 'blocked'>(null)
  // CEFR assessment from the trial-exhaust conversation. Null until it
  // resolves (~3-5s after stop), then passed into Paywall so the learner
  // sees their level prominently alongside the subscribe CTA.
  const [cefr, setCefr] = useState<CefrAssessment | null>(null)

  const tutorRef = useRef<RealtimeTutor | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Timestamp of when the current session went live; used to decide whether
  // the session was long enough to count toward the daily-practice streak.
  const sessionStartedAtRef = useRef<number | null>(null)
  /// Lesson ID for the currently active session, if any. Lets stop() mark
  /// completion without re-reading the query param (which may have been
  /// stripped by the routing useEffect by then).
  const activeLessonIdRef = useRef<string | null>(null)
  /// Most recent lesson-state transition. Used by the post-session UI
  /// to decide whether to show the LessonCompleteView celebration.
  /// (Consumer wired in a follow-up commit alongside the celebration
  /// component — recorded now so the data isn't lost between commits.)
  const [, setLastLessonOutcome] = useState<{
    lessonId: string
    state: 'completed' | 'in_progress'
  } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // --- Complete-beginner visual cards ---
  // The card pinned in the lower-right while live. Cleared on session start,
  // session end, and explicit dismiss.
  const [activeCard, setActiveCard] = useState<BeginnerCard | null>(null)
  // Words that have already triggered a card this session. Prevents the same
  // card from re-popping when the tutor re-says a word — they should feel
  // like surprises, not interruptions.
  const triggeredCardWordsRef = useRef<Set<string>>(new Set())
  // Cumulative tutor turn text per response_id. Lets findBeginnerCardInText
  // see the full word once it's been streamed (deltas can split mid-word).
  const tutorTurnTextRef = useRef<Map<string, string>>(new Map())

  // The active tutor (language + region + persona). Defaults to Natalia for
  // existing users; new users pick before the first session via OnboardingFlow.
  const tutor = useMemo(
    () => getTutor(profile?.tutorId ?? DEFAULT_TUTOR_ID),
    [profile?.tutorId],
  )

  /// Active scenario for the live session. Set in start() when an
  /// override is passed (lesson sessions, mode launches) so the header
  /// can show the scene title. Cleared in stop().
  const [liveScenario, setLiveScenario] = useState<Scenario | null>(null)

  const scenario = useMemo(
    () =>
      liveScenario ??
      tutor.scenarios.all.find((s) => s.id === scenarioId) ??
      tutor.scenarios.all[0],
    [liveScenario, scenarioId, tutor],
  )
  // Only show the scenario name in the header for character-driven
  // roleplays (Café, in-laws, etc.) and for lesson sessions (the title
  // becomes "Order a coffee" / "Buy a souvenir" etc., so the learner
  // sees the scene name at a glance). For Free Conversation, Discover,
  // and the other practice modes, the level/mode label is uninformative
  // mid-session — we keep the generic "Walkie Talkie" header.
  const isRoleplayScenario = tutor.scenarios.roleplays.some(
    (s) => s.id === scenario.id,
  )
  const isLessonScenario = scenario.id.startsWith('lesson-')
  const showScenarioHeader =
    status !== 'idle' && (isRoleplayScenario || isLessonScenario)

  // --- Load subscription + usage from Supabase whenever the user changes ---

  const refreshStatus = useCallback(async () => {
    if (devBypass) {
      setSubscribed(true)
      setSecondsRemaining(Number.MAX_SAFE_INTEGER)
      setStatusLoaded(true)
      return
    }
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
  }, [user, devBypass])

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
    ;(async () => {
      try {
        const fresh = await getFreshAccessToken()
        if (!fresh) throw new Error('Not signed in.')
        await startCheckout(plan as Plan, fresh)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [accessToken, searchParams, setSearchParams])

  // --- One-shot /chat?reset=1 handler (for testing the onboarding flow) ---
  // Clears profile + per-tutor memory/vocab/focus + signs out, then reloads
  // without the param. Use this to land on the OnboardingFlow as a true
  // first-time visitor.
  useEffect(() => {
    if (searchParams.get('reset') !== '1') return
    clearProfile()
    for (const t of TUTORS) {
      clearMemory(t.id)
      clearVocab(t.id)
      clearFocus(t.id)
    }
    setProfile(null)
    supabase.auth.signOut().finally(() => {
      window.location.replace('/chat')
    })
  }, [searchParams])

  // --- Anon sign-in for first-time / signed-out visitors ---
  // Triggered any time we land on /chat without a Supabase session and
  // we're not deliberately showing the SignIn form.
  const anonSignInAttempted = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (user) return
    if (showSignIn) return
    // If the user clicked a pricing card, route them to magic-link sign-in
    // instead — pricing intent means "I want to subscribe now."
    if (
      searchParams.get('checkout') === 'monthly' ||
      searchParams.get('checkout') === 'yearly'
    ) {
      return
    }
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
  }, [authLoading, user, showSignIn, searchParams])

  // --- Auto-start a session once auth + status are ready ---
  // First-time visitors get the level-discovery scenario. Returning learners
  // who don't arrive via ?mode= also auto-launch into Free Conversation at
  // their inferred level (with memory). The mode launcher below overrides
  // this when ?mode=... is present.
  useEffect(() => {
    if (!autoStartAfterAuth) return
    if (!user || !accessToken) return
    if (!statusLoaded) return
    if (status !== 'idle') return
    // ?mode=..., ?lesson=..., and ?checkout=... have their own effects;
    // let those run first. (Without the ?lesson guard, the lesson route
    // races with auto-start free-conversation and the learner hears
    // Natalia open twice — once in lesson scene, once as small-talk.)
    if (searchParams.get('mode')) return
    if (searchParams.get('lesson')) return
    if (searchParams.get('checkout')) return
    // Don't request mic / start a session until the user has actually
    // chosen a tutor. The render path shows OnboardingFlow in this state;
    // without this guard, getUserMedia fires under the picker and the
    // default tutor (Natalia) starts speaking before they pick.
    if (!hasLanguageSelection(profile)) return

    const memory = loadMemory(tutor.id)
    const isFirstSession = !profile?.level
    const synthetic: Scenario = isFirstSession
      ? {
          id: 'discover',
          title: 'Welcome',
          description: `Meet ${tutor.name}`,
          buildPromptAddon: () =>
            tutor.scenarios.buildModePromptAddon('discover', {
              name: profile?.name,
              nativeLanguage: profile?.nativeLanguage,
            }),
          vadEagerness: tutor.scenarios.vadForMode('discover', undefined),
        }
      : (() => {
          const baseScenario = tutor.scenarios.forLevel(profile.level!)
          return {
            ...baseScenario,
            buildPromptAddon: () =>
              baseScenario.buildPromptAddon({
                name: profile?.name,
                memory,
                nativeLanguage: profile?.nativeLanguage,
              }),
          }
        })()
    setAutoStartAfterAuth(false)
    start(synthetic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAfterAuth, user, accessToken, statusLoaded, status, profile, searchParams])

  // --- Mode launcher: /chat?mode=free|grammar|scenario|repeat|translations ---
  // Set by the /practice portal. We auto-start the right kind of session,
  // strip the param so a session-end doesn't re-trigger, and for `scenario`
  // we just land the user on the picker.
  useEffect(() => {
    const mode = searchParams.get('mode') as ModeId | null
    const lessonId = searchParams.get('lesson')

    // Lesson route takes precedence over generic mode — they're orthogonal
    // routing surfaces (mode came from PRACTICE_MODES, lesson comes from
    // the Lessons home).
    if (lessonId) {
      if (!user || !accessToken) return
      if (!profile) return
      if (!statusLoaded) return
      if (status !== 'idle') return
      if (!hasLanguageSelection(profile)) return
      const lesson = lessonById(lessonId)
      if (!lesson) return

      // Trial users can run any lesson freely — the 10-minute trial
      // budget (enforced server-side via /api/heartbeat) is the only
      // gate. When seconds hit zero mid-session the server returns
      // trial-exhausted and the paywall fires on the next start.

      const next = new URLSearchParams(searchParams)
      next.delete('lesson')
      setSearchParams(next, { replace: true })

      activeLessonIdRef.current = lesson.id
      const languageCode = tutor.language
      const synthetic: Scenario = {
        id: `lesson-${lesson.id}`,
        title: lesson.title,
        description: lesson.scene,
        buildPromptAddon: () => {
          const sceneBlock = buildLessonInstructions(lesson, languageCode, profile.level)
          // SCENARIO override on top, full LESSON SCENE block at bottom —
          // model attention favors both ends.
          return [LESSON_SCENARIO_OVERRIDE, sceneBlock].filter(Boolean).join('\n\n')
        },
        // Lessons need responsive turn-taking — the learner is producing
        // single short phrases, not free monologues. Medium eagerness
        // matches the in-character role-play rhythm.
        vadEagerness: 'medium',
      }
      start(synthetic)
      return
    }

    if (!mode) return
    if (!user || !accessToken) return
    if (!profile) return
    if (!statusLoaded) return
    if (status !== 'idle') return
    if (!hasLanguageSelection(profile)) return

    const next = new URLSearchParams(searchParams)
    next.delete('mode')
    setSearchParams(next, { replace: true })

    if (mode === 'scenario') {
      // Default the picker selection to the first roleplay so they have
      // somewhere to start.
      setScenarioId(tutor.scenarios.roleplays[0].id)
      return
    }

    const meta = PRACTICE_MODES.find((m) => m.id === mode)
    if (!meta) return
    // Only Free Conversation reads memory; other modes are level-only.
    const memory = mode === 'free' ? loadMemory(tutor.id) : undefined
    const synthetic: Scenario = {
      id: `mode-${mode}-${profile.level}`,
      title: meta.title,
      description: meta.blurb,
      buildPromptAddon: () =>
        tutor.scenarios.buildModePromptAddon(mode, {
          name: profile.name,
          level: profile.level,
          memory,
          nativeLanguage: profile.nativeLanguage,
        }),
      vadEagerness: tutor.scenarios.vadForMode(mode, profile.level),
    }
    start(synthetic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, accessToken, profile, statusLoaded, status, setSearchParams])

  // Keep the local scenarioId in sync with profile.level. After /api/review
  // fills in inferredLevel post-session, the next "Start free conversation"
  // should use the updated level rather than whatever was set on mount.
  useEffect(() => {
    if (profile?.level) setScenarioId(`free-${profile.level}`)
  }, [profile?.level])

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
        const fresh = await getFreshAccessToken()
        if (!fresh) return
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${fresh}`,
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

      // If the session was long enough, count it toward the daily streak.
      const startedAt = sessionStartedAtRef.current
      sessionStartedAtRef.current = null
      if (startedAt && Date.now() - startedAt >= PRACTICE_THRESHOLD_MS) {
        recordPractice()
      }

      setActiveCard(null)
      setLiveScenario(null)

      const finalTurns = turns.filter((t) => t.text.trim())

      // Lesson completion gate. Mirrors iOS exactly: >= 60s + >= 3 user
      // turns marks .completed; >= 15s OR >= 1 user turn marks .in_progress.
      const lessonId = activeLessonIdRef.current
      activeLessonIdRef.current = null
      if (lessonId) {
        const elapsedSeconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
        const userTurnCount = finalTurns.filter((t) => t.role === 'user').length
        const outcome = markLessonAttempt(tutor.language, lessonId, { elapsedSeconds, userTurnCount })
        if (outcome === 'completed' || outcome === 'in_progress') {
          setLastLessonOutcome({ lessonId, state: outcome })
        }
        // On completion, seed the SRS review deck with this lesson's
        // phrases. Idempotent — re-completing the same lesson doesn't
        // reset cards already advanced up the ladder.
        if (outcome === 'completed' && user) {
          void seedDeckForCompletedLesson(user.id, tutor.language, lessonId)
        }
      }

      // Short/empty exhaust — no meaningful conversation, so no review or
      // CEFR to run. Drop straight to the paywall.
      if (finalTurns.length < 2) {
        if (options.reason === 'exhausted') {
          setPaywallOpen('exhausted')
        }
        setStatus('idle')
        refreshStatus()
        return
      }

      // Trial exhaust path waits for /api/review (which also runs CEFR)
      // before opening the paywall — otherwise the user sees the paywall
      // pop open empty, then the CEFR card fades in 5s later. The
      // 'reviewing' status shows "Generating session review…" while we
      // wait, so the user has feedback the whole time and the paywall
      // appears fully populated on one screen.
      setStatus('reviewing')
      try {
        const fresh = await getFreshAccessToken()
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(fresh ? { Authorization: `Bearer ${fresh}` } : {}),
          },
          body: JSON.stringify({
            scenario: scenario.title,
            language: tutor.language,
            transcript: finalTurns.map((t) => ({ role: t.role, text: t.text })),
            // Trial-exhaust sessions also get a CEFR assessment in the
            // same round-trip so the paywall can render the level
            // alongside the subscribe CTA. Skipped on user-ended
            // sessions where the paywall isn't shown.
            assessCefr: options.reason === 'exhausted',
          }),
        })
        const data = (await res.json()) as ReviewData & {
          error?: string
          cefr?: CefrAssessment | null
        }
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `Review failed (${res.status})`)
        }
        if (data.cefr) {
          setCefr(data.cefr)
        }
        setReview(data)
        // Persist memory bullets so the next Free Conversation can reference them.
        if (Array.isArray(data.memory) && data.memory.length > 0) {
          addMemoryItems(tutor.id, data.memory)
        }
        // Persist vocabulary for spaced retrieval — the tutor weaves these
        // back into the next free conversation in fresh contexts.
        if (Array.isArray(data.newVocabulary) && data.newVocabulary.length > 0) {
          addVocabItems(
            tutor.id,
            data.newVocabulary.map((v) => ({
              word: v.word,
              translation: v.translation,
            })),
          )
        }
        // Per-session silent focus for the next free conversation. Steers
        // topic + form choices without being announced to the learner.
        if (typeof data.nextFocus === 'string' && data.nextFocus.trim()) {
          saveFocus(tutor.id, data.nextFocus)
        }
        // Fill in any blanks the model could infer (name, level). Never
        // overwrites a value the user has confirmed in the questionnaire.
        const inferred: Partial<LearnerProfile> = {}
        if (data.name && typeof data.name === 'string') inferred.name = data.name
        if (
          data.inferredLevel === 'complete-beginner' ||
          data.inferredLevel === 'novice' ||
          data.inferredLevel === 'intermediate' ||
          data.inferredLevel === 'advanced'
        ) {
          inferred.level = data.inferredLevel
        }
        if (Object.keys(inferred).length > 0) {
          const merged = mergeProfileBlanks(inferred)
          setProfile(merged)
        }
        setStatus('review')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('review')
      } finally {
        // Open the paywall whether the review succeeded or not — a
        // network/grader failure shouldn't lock the user out of
        // subscribing. CEFR is best-effort; if it didn't land, paywall
        // just renders without that block.
        if (options.reason === 'exhausted') {
          setPaywallOpen('exhausted')
        }
      }
      refreshStatus()
    },
    [accessToken, refreshStatus, scenario.title, turns, tutor],
  )

  // Ref indirection so the heartbeat useEffect can call stop() without
  // depending on it (which would re-trigger the interval every render).
  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  /// Triggered by the hint button. Fires an out-of-band text response on
  /// the active realtime connection — the model returns 2-3 contextual
  /// phrases the learner could say next. Tailored by proficiency level.
  const requestHint = useCallback(() => {
    if (!tutorRef.current || !profile?.level) return
    setHintLoading(true)
    setHintLines(null)
    hintBufferRef.current = ''
    tutorRef.current.requestHint({
      proficiency: profile.level,
      languageLabel: tutor.languageLabel,
      nativeLanguage: profile.nativeLanguage ?? 'English',
    })
  }, [profile?.level, profile?.nativeLanguage, tutor.languageLabel])

  const dismissHint = useCallback(() => {
    setHintLines(null)
    setHintLoading(false)
  }, [])

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
    setActiveCard(null)
    triggeredCardWordsRef.current = new Set()
    tutorTurnTextRef.current = new Map()

    const activeScenario = overrideScenario ?? scenario
    setLiveScenario(activeScenario)
    const nativeLanguage = profile?.nativeLanguage ?? 'English'

    // Mint the session token FIRST so we can read server-side learner
    // state (recentMistakes / recentMemory / nextFocus per language) and
    // weave it into the system prompt BEFORE the opener fires. Without
    // this pre-fetch, the opener would run with no mistakes context and
    // a session.update after-the-fact would land too late.
    const realtime = new RealtimeTutor()
    tutorRef.current = realtime

    let minted:
      | Awaited<ReturnType<RealtimeTutor['mintSession']>>
      | null = null
    try {
      const freshToken = await getFreshAccessToken()
      minted = await realtime.mintSession({
        accessToken: freshToken ?? undefined,
        language: tutor.language,
      })
    } catch (err) {
      const e = err as Error & { status?: number; secondsRemaining?: number }
      // 402 = trial exhausted. Mirror the previous behavior — paywall,
      // surface the seconds-remaining the server reported.
      if (e.status === 402) {
        if (typeof e.secondsRemaining === 'number') setSecondsRemaining(e.secondsRemaining)
        setPaywallOpen(e.secondsRemaining === 0 ? 'exhausted' : 'blocked')
      } else {
        setError(e.message || 'Could not start a session.')
      }
      setStatus('idle')
      return
    }

    // Prefer server memory (cross-device source of truth) and fall back
    // to localStorage when it's empty (e.g. first session ever, or a
    // user who hasn't roundtripped through /api/review yet on the
    // server-side path).
    const serverMemory = minted.recentMemory.filter((m) => m.trim().length > 0)
    const localMemory = loadMemory(tutor.id)
    const promptMemory = serverMemory.length > 0 ? serverMemory : localMemory

    const addon = activeScenario.buildPromptAddon({
      name: profile?.name,
      memory: promptMemory,
      nativeLanguage,
    })
    const learnerContext = buildLearnerContextBlock(profile)
    const preferencesBlock = buildPreferencesPromptBlock(loadPreferences())
    // Vocab + focus blocks only make sense for free conversation. In a
    // roleplay (barista, in-laws) the tutor is in character and asking
    // them to weave in unrelated vocab from prior sessions would be jarring.
    const isFreeConversation = activeScenario.id.startsWith('free-')
    const vocabBlock = isFreeConversation ? buildVocabBlock(loadVocab(tutor.id)) : ''
    const focusBlock = isFreeConversation ? buildFocusBlock(loadFocus(tutor.id)) : ''
    // Mistakes block — was previously stored server-side but never
    // injected into the prompt. Closes the cross-session memory gap
    // on web (iOS already had this via TutorPrompt.swift).
    const mistakesBlock = isFreeConversation
      ? buildMistakesBlock(minted.recentMistakes)
      : ''
    const instructions = [
      tutor.buildSystemInstructions({ nativeLanguage }),
      addon,
      learnerContext,
      vocabBlock,
      focusBlock,
      mistakesBlock,
      preferencesBlock,
    ]
      .filter(Boolean)
      .join('\n\n')

    realtime.onEvent((event: RealtimeEvent) => {
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
          // gpt-4o-transcribe occasionally returns punctuation-only or
          // tiny filler transcriptions ("." / "..." / "Mm." / ",") when
          // VAD commits a buffer that's actually background noise. Drop
          // these so the YOU bubble doesn't fill with ghost dots.
          const stripped = transcript.replace(/[\s.,!?…·]+/gu, '')
          const isJunk = stripped.length === 0
          setTurns((prev) => {
            const idx = prev.findIndex((t) => t.id === id && t.role === 'user')
            if (idx >= 0) {
              if (isJunk) {
                return prev.filter((_, i) => i !== idx)
              }
              const next = prev.slice()
              next[idx] = { ...next[idx], text: transcript, done: true }
              return next
            }
            if (isJunk) return prev
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
          // Beginner-card detection. Track cumulative tutor text per turn so
          // a word split across deltas ("ma" + "çã") is matched once whole.
          if (
            profile?.level === 'complete-beginner' &&
            tutor.beginnerCards.length > 0
          ) {
            const prevText = tutorTurnTextRef.current.get(id) ?? ''
            const newText = prevText + delta
            tutorTurnTextRef.current.set(id, newText)
            const card = findBeginnerCardInText(
              newText,
              tutor.beginnerCards,
              triggeredCardWordsRef.current,
            )
            if (card) {
              triggeredCardWordsRef.current.add(card.word)
              setActiveCard(card)
            }
          }
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
        // Hint button output channel. Out-of-band text responses
        // (modalities: ["text"]) fire these events; audio responses use
        // response.audio_transcript.delta handled above.
        case 'response.text.delta': {
          const delta = (event.delta as string) ?? ''
          hintBufferRef.current += delta
          break
        }
        case 'response.text.done': {
          const final = (event.text as string) ?? hintBufferRef.current
          hintBufferRef.current = ''
          // Clean up: strip bullets/numbering, drop preamble headers,
          // cap at 3 lines so the panel never balloons.
          const cleaned = final
            .split('\n')
            .map((line) => {
              let s = line.trim()
              while (s.startsWith('-') || s.startsWith('•') || s.startsWith('*')) {
                s = s.slice(1).trim()
              }
              const numbered = s.match(/^(\d{1,2})\.\s*(.*)$/)
              if (numbered) s = numbered[2]
              return s
            })
            .filter((line) => {
              if (line.length === 0) return false
              // Header-like preamble: short line ending with a colon
              if (line.length < 80 && line.endsWith(':')) return false
              return true
            })
            .slice(0, 2)
          setHintLines(cleaned)
          setHintLoading(false)
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
      const info = await realtime.connect(instructions, {
        vadEagerness: activeScenario.vadEagerness,
        mintedToken: minted.ephemeralKey,
        transcriptionLanguage: tutor.transcriptionLanguage(profile?.level),
      })
      setSubscribed(minted.subscribed || info.subscribed)
      setSecondsRemaining(minted.secondsRemaining || info.secondsRemaining)
      sessionStartedAtRef.current = Date.now()
      setStatus('live')
    } catch (err) {
      realtime.disconnect()
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
      const fresh = await getFreshAccessToken()
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fresh ? { Authorization: `Bearer ${fresh}` } : {}),
        },
        body: JSON.stringify({ text: turn.text, language: tutor.language }),
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

  // Pricing-card path: ?checkout=… means the user clicked a Subscribe
  // button, so route them to magic-link sign-in instead of letting them
  // fall into the anon trial flow.
  const hasCheckoutIntent =
    searchParams.get('checkout') === 'monthly' ||
    searchParams.get('checkout') === 'yearly'
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

  // Anon sign-in is in flight — connection screen. The effect above kicked
  // it off automatically; if it fails the error card lets the user retry.
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
                // Nudge the effect by clearing + re-setting a dep.
                setShowSignIn((s) => s)
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    )
  }

  // Brand-new visitor: ask for their native + target language before the
  // first session. Existing users have these backfilled by profile load,
  // so they skip this screen.
  if (!hasLanguageSelection(profile)) {
    return (
      <div className="app">
        <nav className="tutor-nav">
          <Link to="/" className="tutor-nav-back">
            ← Back
          </Link>
        </nav>
        <OnboardingFlow
          onComplete={(picked) => {
            const merged = mergeProfileBlanks({
              name: picked.name,
              nativeLanguage: picked.nativeLanguage,
              targetLanguage: picked.targetLanguage,
              tutorId: picked.tutorId,
              level: picked.level,
              goals: picked.goals,
            })
            setProfile(merged)
            // After onboarding, route to /lessons so cold users see the
            // structured curriculum (catalog of 4 levels of lessons)
            // before paying — competitor signal (ISSEN reviews) shows
            // trials that surface the curriculum convert better than
            // trials that drop the user straight into free conversation.
            // Honor explicit intent params (?mode=, ?lesson=, ?checkout=)
            // by staying on /chat; those mean the user wanted to talk.
            const hasIntent =
              searchParams.get('mode') ||
              searchParams.get('lesson') ||
              searchParams.get('checkout')
            if (!hasIntent) {
              navigate('/lessons', { replace: true })
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="tutor-nav">
        <Link
          to={subscribed ? '/lessons' : '/'}
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
        <h1>{showScenarioHeader ? scenario.title : 'Walkie Talkie'}</h1>
        <p className="subtitle">
          {showScenarioHeader
            ? scenario.description
            : `Voice conversation · ${tutor.languageLabel}`}
        </p>
      </header>

      {status === 'idle' && !paywallOpen && (
        <div className="empty" style={{ marginTop: 60 }}>
          {subscribed
            ? 'Pick a mode from the practice portal, or tap below to keep this conversation going.'
            : 'Tap below to start a free conversation with Natalia.'}
        </div>
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

      {status === 'live' &&
        activeCard &&
        profile?.level === 'complete-beginner' && (
          <BeginnerCardView
            card={activeCard}
            language={tutor.language}
            onDismiss={() => setActiveCard(null)}
          />
        )}

      {hintLines && hintLines.length > 0 && (
        <div className="hint-panel" role="region" aria-label="Suggested phrases">
          <div className="hint-panel-header">
            <span className="hint-panel-title">Try saying…</span>
            <button
              className="hint-panel-close"
              onClick={dismissHint}
              aria-label="Dismiss hints"
            >
              ✕
            </button>
          </div>
          <ul className="hint-panel-list">
            {hintLines.map((line, i) => (
              <li key={i} className="hint-panel-item">
                💬 {line}
              </li>
            ))}
          </ul>
        </div>
      )}

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
                : 'Start free conversation'}
          </button>
        )}
        {status === 'connecting' && (
          <button className="mic-btn" disabled>
            Connecting…
          </button>
        )}
        {status === 'live' && (
          <>
            <button
              className="mic-btn hint"
              onClick={requestHint}
              disabled={hintLoading}
              title="What can I say?"
            >
              💡 {hintLoading ? 'Loading…' : 'Hint'}
            </button>
            <button className="mic-btn stop" onClick={() => stop()}>
              End session
            </button>
          </>
        )}
        {status === 'reviewing' && (
          <button className="mic-btn" disabled>
            Reviewing…
          </button>
        )}
        {status === 'review' && !paywallOpen && (
          <button className="mic-btn start" onClick={() => start()}>
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
          cefr={cefr}
          // Only the 'blocked' variant is dismissible — that's the
          // "trial user tapped a lesson" path, where they can back out
          // and keep using free chat. The 'exhausted' variant (trial
          // burned through) stays modal: they have to subscribe to
          // continue.
          onClose={
            paywallOpen === 'blocked'
              ? () => setPaywallOpen(null)
              : undefined
          }
        />
      )}
    </div>
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
