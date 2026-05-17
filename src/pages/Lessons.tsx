import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  hasFullProfile,
  loadProfile,
  mergeProfileBlanks,
  type LearnerProfile,
} from '../lib/profile'
import { currentStreak } from '../lib/streak'
import { trackSubscribe } from '../lib/tiktok'
import { Onboarding } from '../components/Onboarding'
import { Settings } from '../components/Settings'
import { LessonDetail } from '../components/LessonDetail'
import { AllLevels } from '../components/AllLevels'
import { LessonRow, TodaysLessonCard } from '../components/LessonCards'
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
  const [profile, setProfile] = useState<LearnerProfile | null>(() => loadProfile())
  const [streak] = useState(() => currentStreak())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lessonForDetail, setLessonForDetail] = useState<Lesson | null>(null)
  const [showAllLevels, setShowAllLevels] = useState(false)
  /// Progress lookup is re-derived from localStorage on focus. localStorage
  /// is synchronous so we don't need to memoize across renders — but we
  /// want to refresh when the user comes back from a lesson session.
  const [progressTick, setProgressTick] = useState(0)

  const tutor = getTutor(profile?.tutorId ?? DEFAULT_TUTOR_ID)
  const languageCode = tutor.id

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

  if (authLoading || !user) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>Loading…</div>
      </div>
    )
  }

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
      streak={streak}
      subscribed={subscribed}
      progressTick={progressTick}
      onPickLesson={setLessonForDetail}
      onBrowseAll={() => setShowAllLevels(true)}
      onSettings={() => setSettingsOpen(true)}
      onFreeTalk={() => navigate('/chat?mode=free')}
      lessonForDetail={lessonForDetail}
      onCloseDetail={() => setLessonForDetail(null)}
      showAllLevels={showAllLevels}
      onCloseAllLevels={() => setShowAllLevels(false)}
      settingsOpen={settingsOpen}
      accessToken={accessToken}
      onCloseSettings={() => setSettingsOpen(false)}
      onProfileChange={(p) => setProfile(p)}
      user={user}
      onSignOut={() => signOut()}
    />
  )
}

type LessonsHomeProps = {
  profile: LearnerProfile
  languageCode: string
  tutorName: string
  streak: number
  subscribed: boolean | null
  progressTick: number
  onPickLesson: (l: Lesson) => void
  onBrowseAll: () => void
  onSettings: () => void
  onFreeTalk: () => void
  lessonForDetail: Lesson | null
  onCloseDetail: () => void
  showAllLevels: boolean
  onCloseAllLevels: () => void
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
    streak,
    subscribed,
    progressTick,
    onPickLesson,
    onBrowseAll,
    onSettings,
    onFreeTalk,
    lessonForDetail,
    onCloseDetail,
    showAllLevels,
    onCloseAllLevels,
    settingsOpen,
    accessToken,
    onCloseSettings,
    onProfileChange,
    user,
    onSignOut,
  } = props

  const navigate = useNavigate()
  const currentLevel = useMemo<LessonLevel>(() => proficiencyToLevel(profile.level), [profile.level])
  const nextLevel = useMemo<LessonLevel | null>(() => nextLevelOf(currentLevel), [currentLevel])
  const units = useMemo(() => unitsForLevel(currentLevel), [currentLevel])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stateLookup = useMemo(() => readStateLookup(languageCode), [languageCode, progressTick])

  const recommendedLesson = useMemo<Lesson | null>(() => {
    const all = units.flatMap((u) => u.lessons)
    const inProg = all.find((l) => (stateLookup[l.id] ?? 'not_started') === 'in_progress')
    if (inProg) return inProg
    return all.find((l) => (stateLookup[l.id] ?? 'not_started') === 'not_started') ?? null
  }, [units, stateLookup])

  const currentUnit = useMemo(() => {
    if (!recommendedLesson) return units[0]
    return units.find((u) => u.lessons.some((l) => l.id === recommendedLesson.id)) ?? units[0]
  }, [recommendedLesson, units])

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
              Keep going with {tutorName}. {languageLabel(languageCode)}
            </p>
          </div>
        </header>

        {recommendedLesson && (
          <section className="lessons-section">
            <div className="lessons-section-label">TODAY'S LESSON</div>
            <TodaysLessonCard
              lesson={recommendedLesson}
              locked={!isSubscribed}
              onClick={() => onPickLesson(recommendedLesson)}
            />
          </section>
        )}

        {currentUnit && (
          <section className="lessons-section">
            <div className="lessons-section-label">
              CONTINUE: {currentUnit.title.toUpperCase()}
            </div>
            <div className="lessons-rows">
              {currentUnit.lessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  state={displayState(lesson.id, stateLookup, isSubscribed)}
                  onClick={() => onPickLesson(lesson)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="lessons-section">
          <div className="lessons-section-label">ALL UNITS</div>
          <div className="lessons-rows">
            {units.map((unit) => (
              <div key={unit.id} className="lessons-unit-summary">
                <div className="lessons-unit-summary-title">{unit.title}</div>
                <div className="lessons-unit-summary-pips">
                  {unit.lessons.map((l) => (
                    <span
                      key={l.id}
                      className={`lessons-pip pip-${stateLookup[l.id] ?? 'not_started'}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {nextLevel && (
          <section className="lessons-section">
            <div className="lessons-section-label">
              COMING NEXT · {labelForLevel(nextLevel).toUpperCase()}
            </div>
            <div className="lessons-rows">
              {unitsForLevel(nextLevel)[0]?.lessons.slice(0, 2).map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  state="locked"
                  onClick={() => undefined}
                />
              ))}
            </div>
          </section>
        )}

        <button
          type="button"
          className="lessons-browse-all"
          onClick={onBrowseAll}
        >
          ▦ Browse all levels
        </button>

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
          onStart={() => {
            onCloseDetail()
            navigate(`/chat?lesson=${lessonForDetail.id}`)
          }}
          onClose={onCloseDetail}
        />
      )}

      {showAllLevels && (
        <AllLevels
          currentLevel={currentLevel}
          languageCode={languageCode}
          isSubscribed={isSubscribed}
          onTapLesson={(l) => {
            onCloseAllLevels()
            // Defer so the All Levels modal finishes dismissing.
            setTimeout(() => onPickLesson(l), 200)
          }}
          onClose={onCloseAllLevels}
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
    case 'advanced':
      return 'intermediate'
    case 'complete-beginner':
    case 'first_timer':
    default:
      return 'first_timer'
  }
}

function nextLevelOf(level: LessonLevel): LessonLevel | null {
  switch (level) {
    case 'first_timer':
      return 'basic'
    case 'basic':
      return 'intermediate'
    case 'intermediate':
      return null
  }
}

function labelForLevel(level: LessonLevel): string {
  switch (level) {
    case 'first_timer': return 'First Timer'
    case 'basic': return 'Basic'
    case 'intermediate': return 'Intermediate'
  }
}

function displayState(
  lessonId: string,
  lookup: Record<string, LessonProgressState>,
  isSubscribed: boolean,
) {
  if (!isSubscribed) return 'locked' as const
  return (lookup[lessonId] ?? 'not_started') as 'completed' | 'in_progress' | 'not_started'
}

function languageLabel(code: string): string {
  const flag = {
    'pt-BR': '🇧🇷',
    es: '🇲🇽',
    'it-IT': '🇮🇹',
    'fr-FR': '🇫🇷',
    'de-DE': '🇩🇪',
  }[code] ?? '🌐'
  const name = {
    'pt-BR': 'Portuguese',
    es: 'Spanish',
    'it-IT': 'Italian',
    'fr-FR': 'French',
    'de-DE': 'German',
  }[code] ?? code
  return `${flag} ${name}`
}

// Suppress unused-import for lessonLevelOrder until the All Levels view
// uses it (it's imported here for re-export convenience).
void lessonLevelOrder
