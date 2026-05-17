// Variant B lesson cards: per-unit accent color on the icon background
// plus a 3pt left edge stripe. Mirrors iOS TodaysLessonCard + LessonRow.

import type { Lesson, LessonState } from '../lib/lessons/types'
import { unitAccentCSS } from '../lib/lessons/unitAccent'

export function TodaysLessonCard(props: {
  lesson: Lesson
  locked: boolean
  onClick: () => void
}) {
  const { lesson, locked, onClick } = props
  const accent = unitAccentCSS(lesson, 1)
  const accentMid = unitAccentCSS(lesson, 0.55)
  const accentSoft = unitAccentCSS(lesson, 0.2)
  return (
    <button
      type="button"
      className="todays-lesson-card"
      onClick={onClick}
      style={{
        // The 3pt left stripe; main background stays the dark card color
        // so the unit color is a hint, not a takeover.
        borderLeft: `4px solid ${accent}`,
        boxShadow: locked ? undefined : `inset 0 0 0 1.5px ${unitAccentCSS(lesson, 0.45)}`,
      }}
    >
      <div
        className="todays-lesson-icon"
        style={{
          background: `linear-gradient(135deg, ${accentMid}, ${accentSoft})`,
        }}
      >
        <span aria-hidden>{lesson.emoji}</span>
      </div>
      <div className="todays-lesson-text">
        <div className="todays-lesson-title">{lesson.title}</div>
        <div className="todays-lesson-summary">{lesson.summary}</div>
      </div>
      <div className="todays-lesson-trail">
        {locked ? (
          <span aria-hidden>🔒</span>
        ) : (
          <span
            className="todays-lesson-play"
            style={{ background: accent }}
            aria-hidden
          >
            ▶
          </span>
        )}
      </div>
    </button>
  )
}

export function LessonRow(props: {
  lesson: Lesson
  state: LessonState
  onClick: () => void
}) {
  const { lesson, state, onClick } = props
  const accent = unitAccentCSS(lesson, 1)
  const accentMid = unitAccentCSS(lesson, 0.55)
  const accentSoft = unitAccentCSS(lesson, 0.2)
  const isLocked = state === 'locked'
  return (
    <button
      type="button"
      className={`lesson-row state-${state}`}
      onClick={onClick}
      disabled={isLocked}
      style={{
        borderLeft: `3px solid ${isLocked ? 'rgba(255,255,255,0.1)' : accent}`,
      }}
    >
      <div
        className="lesson-row-icon"
        style={{
          background: isLocked
            ? 'rgba(255,255,255,0.04)'
            : `linear-gradient(135deg, ${accentMid}, ${accentSoft})`,
          opacity: isLocked ? 0.5 : 1,
        }}
      >
        <span aria-hidden>{lesson.emoji}</span>
      </div>
      <div className="lesson-row-text">
        <div className="lesson-row-title">{lesson.title}</div>
        <div className="lesson-row-summary">{lesson.summary}</div>
      </div>
      <div className="lesson-row-trail">{stateGlyph(state)}</div>
    </button>
  )
}

function stateGlyph(state: LessonState): string {
  switch (state) {
    case 'completed': return '✓'
    case 'in_progress': return '▶'
    case 'not_started': return '›'
    case 'locked': return '🔒'
  }
}
