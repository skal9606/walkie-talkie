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
      tutorLanguageLabel={tutorLanguageLabel}
      tutorFlag={tutorFlag}
      streak={streak}
      subscribed={subscribed}
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

type LessonsHomeProps = {
  profile: LearnerProfile
  languageCode: string
  tutorName: string
  tutorLanguageLabel: string
  tutorFlag: string
  streak: number
  subscribed: boolean | null
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
              Keep going with {tutorName}. {tutorFlag} {tutorLanguageLabel}
            </p>
          </div>
        </header>

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
          onStart={() => {
            onCloseDetail()
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
