import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import {
  hasFullProfile,
  hasLanguageSelection,
  loadProfile,
  mergeProfileBlanks,
  saveProfile,
  type LearnerProfile,
} from '../lib/profile'
import { currentStreak } from '../lib/streak'
import { trackSubscribe } from '../lib/tiktok'
import { Onboarding } from '../components/Onboarding'
import { OnboardingFlow, type OnboardingResult } from '../components/OnboardingFlow'
import { Settings } from '../components/Settings'
import { LessonDetail } from '../components/LessonDetail'
import { LessonRow, TodaysLessonCard } from '../components/LessonCards'
import { recommendForGoals } from '../lib/lessons/curriculum'
import {
  lessonLevelOrder,
  type Lesson,
  type LessonLevel,
  type LessonProgressState,
} from '../lib/lessons/types'
import { unitsForLevel } from '../lib/lessons/catalog'
import { stateLookup as readStateLookup } from '../lib/lessons/progress'
import { DEFAULT_TUTOR_ID, getTutor } from '../lib/tutors'

/**
 * Lessons home — the post-login default surface. Replaces the old
 * Practice page's mode picker with a guided-lesson catalogue. Mirrors
 * the iOS Lessons tab one-for-one: Today's Lesson card, Continue Unit,
 * All Units summary, Coming Next teaser, Browse all levels modal.
 *
 * Tapping a lesson opens the LessonDetail modal; tapping Start there
 * navigates to /chat?lesson=<id>, which Tutor.tsx picks up and threads
 * into the system prompt.
 *
 * Free conversation stays available via the floating phone CTA — same
 * pattern as the Free Talk center button on iOS.
 */
export default function Lessons() {
  const { user, accessToken, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  /// Per-language map of "mistakes the tutor is tracking for you" —
  /// shown on the Lessons home as a "What you're working on" card.
  /// Loaded from /api/subscription-status (piggybacked there to avoid
  /// adding a new serverless function — we're at the Vercel Hobby 12-
  /// function limit).
  const [mistakesByLanguage, setMistakesByLanguage] = useState<
    Record<string, Array<{ original: string; corrected: string; explanation: string }>>
  >({})
  const [profile, setProfile] = useState<LearnerProfile | null>(() => loadProfile())
  const [streak] = useState(() => currentStreak())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lessonForDetail, setLessonForDetail] = useState<Lesson | null>(null)
  /// Progress lookup is re-derived from localStorage on focus. localStorage
  /// is synchronous so we don't need to memoize across renders — but we
  /// want to refresh when the user comes back from a lesson session.
  const [progressTick, setProgressTick] = useState(0)

  const tutor = getTutor(profile?.tutorId ?? DEFAULT_TUTOR_ID)
  // Use tutor.language (LanguageCode like 'pt-BR') for content + progress
  // lookups — tutor.id is the persona identifier ('pt-br-natalia') and
  // doesn't match LessonCatalog's content keys.
  const languageCode = tutor.language
  const tutorLanguageLabel = tutor.languageLabel
  const tutorFlag = tutor.flag

  const refreshStatus = useCallback(async () => {
    if (!user || !accessToken) return
    // /api/subscription-status returns both the subscription row and the
    // per-language recent-mistakes map (piggybacked). One call covers
    // both the paywall gate and the mistakes card.
    try {
      const r = await fetch('/api/subscription-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) {
        setSubscribed(false)
        return
      }
      const body = (await r.json()) as {
        status?: string
        recentMistakes?: Record<
          string,
          Array<{ original: string; corrected: string; explanation: string }>
        >
      }
      setSubscribed(body.status === 'active' || body.status === 'trialing')
      setMistakesByLanguage(body.recentMistakes ?? {})
    } catch {
      setSubscribed(false)
    }
  }, [user, accessToken])

  useEffect(() => {
    if (!user) return
    refreshStatus()
  }, [user, refreshStatus])

  // Post-Stripe return.
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

  // Auth gate.
  useEffect(() => {
    if (authLoading) return
    if (!user || !accessToken) {
      navigate('/login', { replace: true })
    }
  }, [authLoading, user, accessToken, navigate])

  // Refresh progress whenever the tab regains focus (e.g., user came back
  // from a completed lesson session).
  useEffect(() => {
    const onFocus = () => setProgressTick((n) => n + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function handleQuestionnaireSubmit(p: LearnerProfile) {
    setProfile(mergeProfileBlanks(p))
  }

  /// Brand-new sign-in: the user has authed but has no profile yet.
  /// OnboardingFlow gives us name + native language + tutor + level —
  /// everything we actually need to start. We mark questionnaireCompleted
  /// here so we don't drag the user through a second screen asking for
  /// the same fields. Goals is captured in the OnboardingFlow now,
  /// so any text the user typed lands directly on the profile and the
  /// home view's "For your goal" recommendations are populated from
  /// session #1.
  function handleInitialOnboarding(result: OnboardingResult) {
    const merged = mergeProfileBlanks({
      name: result.name,
      nativeLanguage: result.nativeLanguage,
      targetLanguage: result.targetLanguage,
      tutorId: result.tutorId,
      level: result.level,
      goals: result.goals,
      questionnaireCompleted: true,
    })
    saveProfile(merged)
    setProfile(merged)
  }

  if (authLoading || !user) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>Loading…</div>
      </div>
    )
  }

  // First gate: brand-new sign-in with no language/tutor picked yet.
  // Show the full OnboardingFlow (name → native language → tutor →
  // proficiency level). Mirrors the Tutor.tsx flow so any landing
  // surface a new user hits gets them through the same first-run
  // questionnaire before showing the app.
  if (!hasLanguageSelection(profile)) {
    return (
      <div className="app">
        <OnboardingFlow onComplete={handleInitialOnboarding} />
      </div>
    )
  }

  // Second gate: language is picked but the post-sign-up questionnaire
  // (goals etc.) hasn't been filled in yet. Show the lighter Onboarding
  // component on top of the lessons nav so they can pick up where they
  // left off.
  if (!hasFullProfile(profile)) {
    return (
      <div className="app">
        <NavBar
          streak={streak}
          subscribed={subscribed}
          onSettings={() => setSettingsOpen(true)}
          user={user}
        />
        <Onboarding
          initialProfile={profile}
          onComplete={handleQuestionnaireSubmit}
        />
      </div>
    )
  }

  // hasFullProfile narrowed profile above, but TS doesn't carry that type
  // narrowing through helper functions — assert non-null here.
  const fullProfile = profile as LearnerProfile

  return (
    <LessonsHome
      profile={fullProfile}
      languageCode={languageCode}
      tutorName={tutor.name}
      tutorLanguageLabel={tutorLanguageLabel}
      tutorFlag={tutorFlag}
      streak={streak}
      subscribed={subscribed}
      mistakes={mistakesByLanguage[languageCode] ?? []}
      progressTick={progressTick}
      onPickLesson={setLessonForDetail}
      onSettings={() => setSettingsOpen(true)}
      onFreeTalk={() => navigate('/chat?mode=free')}
      lessonForDetail={lessonForDetail}
      onCloseDetail={() => setLessonForDetail(null)}
      settingsOpen={settingsOpen}
      accessToken={accessToken}
      onCloseSettings={() => setSettingsOpen(false)}
      onProfileChange={(p) => setProfile(p)}
      user={user}
      onSignOut={() => signOut()}
    />
  )
}

type Mistake = { original: string; corrected: string; explanation: string }

type LessonsHomeProps = {
  profile: LearnerProfile
  languageCode: string
  tutorName: string
  tutorLanguageLabel: string
  tutorFlag: string
  streak: number
  subscribed: boolean | null
  mistakes: Mistake[]
  progressTick: number
  onPickLesson: (l: Lesson) => void
  onSettings: () => void
  onFreeTalk: () => void
  lessonForDetail: Lesson | null
  onCloseDetail: () => void
  settingsOpen: boolean
  accessToken: string | null
  onCloseSettings: () => void
  onProfileChange: (p: LearnerProfile) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  onSignOut: () => void
}

function LessonsHome(props: LessonsHomeProps) {
  const {
    profile,
    languageCode,
    tutorName,
    tutorLanguageLabel,
    tutorFlag,
    streak,
    subscribed,
    mistakes,
    progressTick,
    onPickLesson,
    onSettings,
    onFreeTalk,
    lessonForDetail,
    onCloseDetail,
    settingsOpen,
    accessToken,
    onCloseSettings,
    onProfileChange,
    user,
    onSignOut,
  } = props

  const navigate = useNavigate()
  const currentLevel = useMemo<LessonLevel>(() => proficiencyToLevel(profile.level), [profile.level])
  const units = useMemo(() => unitsForLevel(currentLevel), [currentLevel])

  /// Which unit accordions are expanded. Default = the unit containing
  /// the recommended lesson (so the user sees their current focus on
  /// first paint). Tapping any unit toggles its row open/closed.
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stateLookup = useMemo(() => readStateLookup(languageCode), [languageCode, progressTick])

  const recommendedLesson = useMemo<Lesson | null>(() => {
    const all = units.flatMap((u) => u.lessons)
    const inProg = all.find((l) => (stateLookup[l.id] ?? 'not_started') === 'in_progress')
    if (inProg) return inProg
    return all.find((l) => (stateLookup[l.id] ?? 'not_started') === 'not_started') ?? null
  }, [units, stateLookup])

  /// Goal-driven recommendations — lessons whose tags overlap with
  /// keywords in the learner's stated goals (e.g. "traveling to Brazil"
  /// surfaces taxi / directions / souvenirs). Empty when goals is
  /// blank or no tags match; the section hides entirely in that case.
  const goalRecommendations = useMemo<Lesson[]>(() => {
    const completed = new Set(
      Object.entries(stateLookup)
        .filter(([, state]) => state === 'completed')
        .map(([id]) => id),
    )
    return recommendForGoals({
      goals: profile.goals,
      level: currentLevel,
      completedLessonIds: completed,
    })
  }, [profile.goals, currentLevel, stateLookup])

  const currentUnit = useMemo(() => {
    if (!recommendedLesson) return units[0]
    return units.find((u) => u.lessons.some((l) => l.id === recommendedLesson.id)) ?? units[0]
  }, [recommendedLesson, units])

  // Seed the accordion: open the current unit on mount so the user
  // lands with their next lesson visible without an extra tap.
  useEffect(() => {
    if (currentUnit) setExpandedUnits(new Set([currentUnit.id]))
  }, [currentUnit])

  const toggleUnit = useCallback((unitId: string) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }, [])

  // Trial users see lock badges everywhere; tapping cycles to paywall.
  const isSubscribed = subscribed === true

  return (
    <div className="app">
      <NavBar
        streak={streak}
        subscribed={subscribed}
        onSettings={onSettings}
        user={user}
        onSignOut={onSignOut}
      />
      {settingsOpen && accessToken && (
        <Settings
          accessToken={accessToken}
          onClose={onCloseSettings}
          onProfileChange={onProfileChange}
        />
      )}

      <div className="lessons-home">
        <header className="lessons-header">
          <div>
            <h1>Hi, {profile.name || 'there'} 👋</h1>
            <p className="lessons-subtitle">
              Keep going with {tutorName}. {tutorFlag} {tutorLanguageLabel}
            </p>
          </div>
        </header>

        {mistakes.length > 0 && (
          <section className="lessons-section">
            <div className="lessons-section-label">WHAT YOU'RE WORKING ON</div>
            <MistakesStrip mistakes={mistakes} />
          </section>
        )}

        {goalRecommendations.length > 0 && (
          <section className="lessons-section">
            <div className="lessons-section-label">RECOMMENDED FOR YOU</div>
            <div className="recommended-strip">
              {goalRecommendations.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  className="recommended-card"
                  onClick={() => onPickLesson(lesson)}
                >
                  <div className="recommended-card-icon">{lesson.emoji}</div>
                  <div className="recommended-card-title">{lesson.title}</div>
                  <div className="recommended-card-summary">{lesson.summary}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {recommendedLesson && (
          <section className="lessons-section">
            <div className="lessons-section-label">TODAY'S LESSON</div>
            <TodaysLessonCard
              lesson={recommendedLesson}
              locked={false}
              onClick={() => onPickLesson(recommendedLesson)}
            />
          </section>
        )}

        <section className="lessons-section">
          <div className="lessons-rows">
            {units.map((unit) => {
              const expanded = expandedUnits.has(unit.id)
              const isCurrent = currentUnit?.id === unit.id
              return (
                <div key={unit.id} className="lessons-unit-accordion">
                  <button
                    type="button"
                    className="lessons-unit-accordion-head"
                    aria-expanded={expanded}
                    onClick={() => toggleUnit(unit.id)}
                  >
                    <div className="lessons-unit-accordion-title">
                      {unit.title}
                      {isCurrent && (
                        <span className="lessons-unit-accordion-tag">your unit</span>
                      )}
                    </div>
                    <div className="lessons-unit-accordion-right">
                      <div className="lessons-unit-summary-pips">
                        {unit.lessons.map((l) => (
                          <span
                            key={l.id}
                            className={`lessons-pip pip-${stateLookup[l.id] ?? 'not_started'}`}
                          />
                        ))}
                      </div>
                      <span
                        className="lessons-unit-accordion-chevron"
                        aria-hidden
                      >
                        {expanded ? '▾' : '▸'}
                      </span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="lessons-unit-accordion-body">
                      {unit.lessons
                        // Skip the recommended lesson — already shown
                        // prominently in the Today's Lesson card above.
                        // Showing it twice on the same screen is noisy.
                        .filter((lesson) => lesson.id !== recommendedLesson?.id)
                        .map((lesson) => (
                          <LessonRow
                            key={lesson.id}
                            lesson={lesson}
                            state={displayState(lesson.id, stateLookup, isSubscribed)}
                            onClick={() => onPickLesson(lesson)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <Link to="/stats" className="lessons-stats-link">
          View stats →
        </Link>
      </div>

      <button
        type="button"
        className="practice-free-cta"
        onClick={onFreeTalk}
        title="Free conversation"
      >
        <span className="practice-free-cta-emoji" aria-hidden>📞</span>
        <span className="practice-free-cta-label">Free conversation</span>
      </button>

      {lessonForDetail && (
        <LessonDetail
          lesson={lessonForDetail}
          languageCode={languageCode}
          tutorName={tutorName}
          tutorLanguageLabel={tutorLanguageLabel}
          tutorFlag={tutorFlag}
          isSubscribed={isSubscribed}
          onStart={() => {
            onCloseDetail()
            // For trial users we still route to /chat so they hit the
            // unified Paywall component — keeps the subscribe flow in
            // one place. The lesson-route guard in Tutor.tsx detects
            // the non-subscribed state and opens the paywall instead
            // of starting a session.
            navigate(`/chat?lesson=${lessonForDetail.id}`)
          }}
          onClose={onCloseDetail}
        />
      )}

    </div>
  )
}

// MARK: - Helpers

function NavBar(props: {
  streak: number
  subscribed: boolean | null
  onSettings: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user?: any
  onSignOut?: () => void
}) {
  const { streak, subscribed, onSettings, user, onSignOut } = props
  return (
    <nav className="tutor-nav">
      <Link to="/" className="tutor-nav-back">
        ← Home
      </Link>
      <div className="tutor-nav-right">
        {streak > 0 && (
          <div className="streak-pill" title={`${streak}-day streak`}>
            <span aria-hidden>🔥</span> {streak}
          </div>
        )}
        {subscribed === null ? null : subscribed ? (
          <div className="tutor-nav-badge">Subscribed</div>
        ) : (
          <div className="tutor-nav-badge free">Free trial</div>
        )}
        <Link to="/review" className="tutor-nav-signout" title="Review deck">
          Review
        </Link>
        <button
          type="button"
          className="tutor-nav-signout"
          onClick={onSettings}
          aria-label="Settings"
        >
          ⚙ Settings
        </button>
        {user?.is_anonymous ? (
          <Link to="/login" className="tutor-nav-signout">
            Sign in
          </Link>
        ) : onSignOut ? (
          <button className="tutor-nav-signout" onClick={onSignOut}>
            Sign out
          </button>
        ) : null}
      </div>
    </nav>
  )
}

function proficiencyToLevel(level: string | undefined): LessonLevel {
  switch (level) {
    case 'novice':
    case 'basic':
      return 'basic'
    case 'intermediate':
      return 'intermediate'
    case 'advanced':
      return 'advanced'
    case 'complete-beginner':
    case 'first_timer':
    default:
      return 'first_timer'
  }
}

function displayState(
  lessonId: string,
  lookup: Record<string, LessonProgressState>,
  _isSubscribed: boolean,
) {
  // We don't lock rows on the home anymore — the paywall hits at
  // session start (/chat?lesson=<id> → checkout). Visible locks were
  // noisy, especially during the brief moment between page load and
  // the subscriptions fetch.
  return (lookup[lessonId] ?? 'not_started') as 'completed' | 'in_progress' | 'not_started'
}


// Suppress unused-import for lessonLevelOrder until the All Levels view
// uses it (it's imported here for re-export convenience).
void lessonLevelOrder

/// Horizontal-scroll strip of recent mistakes the tutor has flagged.
/// Source: the same recent_mistakes data the tutor reads from when
/// seeding "MISTAKES TO REVISIT" in the next session prompt — surfaced
/// here so the learner can SEE what the tutor is tracking. Top praise
/// for ISSEN was "the app remembers what I struggle with"; making that
/// memory visible is the lift.
function MistakesStrip({ mistakes }: { mistakes: Mistake[] }) {
  // Cap at 8 so the strip stays scannable; freshest entries are last
  // in the array (the API caps + dedupes server-side already), so
  // slice from the start to show them most-recent-last.
  const visible = mistakes.slice(0, 8)
  return (
    <div className="mistakes-strip">
      {visible.map((m, i) => (
        <div key={`${m.original}-${i}`} className="mistake-card">
          <div className="mistake-original">{m.original}</div>
          <div className="mistake-arrow" aria-hidden>
            →
          </div>
          <div className="mistake-corrected">{m.corrected}</div>
          {m.explanation && (
            <div className="mistake-explanation">{m.explanation}</div>
          )}
        </div>
      ))}
    </div>
  )
}
