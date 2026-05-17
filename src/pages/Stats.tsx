import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { currentStreak } from '../lib/streak'
import { lessonsCompleted } from '../lib/lessons/progress'
import { TUTORS } from '../lib/tutors'

/**
 * Stats page. Web equivalent of the iOS Stats tab — pulls from
 * localStorage so the page hydrates instantly.
 *
 * Sections:
 *   - Hero tiles: streak + total lessons completed (across all langs)
 *   - By Language: per-tutor lessons completed, filtered to > 0
 *
 * (No "Recent sessions" list: the web app doesn't persist a session
 * log the way iOS does via SwiftData. That'd require schema work in
 * Supabase. Worth doing post-launch.)
 */
export default function Stats() {
  const { user, loading: authLoading } = useAuth()
  const [streak] = useState(() => currentStreak())
  const [totals, setTotals] = useState<Record<string, number>>({})

  useEffect(() => {
    const fresh: Record<string, number> = {}
    for (const t of TUTORS) {
      // Key by tutor.id so per-row lookups still work, but count by
      // tutor.language since that's how LessonProgress is scoped.
      fresh[t.id] = lessonsCompleted(t.language)
    }
    setTotals(fresh)
  }, [])

  const totalCompleted = Object.values(totals).reduce((a, b) => a + b, 0)
  const languagesWithProgress = TUTORS.filter((t) => (totals[t.id] ?? 0) > 0)

  if (authLoading || !user) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="tutor-nav">
        <Link to="/lessons" className="tutor-nav-back">← Lessons</Link>
        <div className="tutor-nav-right" />
      </nav>

      <div className="stats-page">
        <header className="stats-header">
          <h1>Stats</h1>
          <p className="stats-subtitle">Your progress across every language</p>
        </header>

        <div className="stats-heroes">
          <StatTile emoji="🔥" value={String(streak)} label="day streak" />
          <StatTile emoji="✓" value={String(totalCompleted)} label="lessons done" />
        </div>

        {languagesWithProgress.length > 0 && (
          <section className="stats-section">
            <div className="stats-section-label">
              {languagesWithProgress.length > 1 ? 'BY LANGUAGE' : 'LANGUAGE'}
            </div>
            <div className="stats-langs">
              {languagesWithProgress.map((t) => (
                <div key={t.id} className="stats-lang-row">
                  <span className="stats-lang-flag" aria-hidden>{t.flag}</span>
                  <div className="stats-lang-body">
                    <div className="stats-lang-name">{t.languageLabel}</div>
                    <div className="stats-lang-meta">
                      {totals[t.id]} {totals[t.id] === 1 ? 'lesson' : 'lessons'} complete
                    </div>
                  </div>
                  <div className="stats-lang-count">{totals[t.id]}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {totalCompleted === 0 && (
          <div className="stats-empty">
            No lessons completed yet — tap <Link to="/lessons">Lessons</Link> to start your first one.
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile(props: { emoji: string; value: string; label: string }) {
  return (
    <div className="stats-hero-tile">
      <div className="stats-hero-emoji" aria-hidden>{props.emoji}</div>
      <div className="stats-hero-value">{props.value}</div>
      <div className="stats-hero-label">{props.label}</div>
    </div>
  )
}
