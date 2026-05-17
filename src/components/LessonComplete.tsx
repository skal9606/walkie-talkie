// Post-lesson celebration. Shown when the completion gate promotes
// a lesson row to .completed. Mirror of iOS LessonCompleteView.

import type { Lesson } from '../lib/lessons/types'
import { lessonPhrases } from '../lib/lessons/catalog'

export function LessonComplete(props: {
  lesson: Lesson
  languageCode: string
  elapsedSeconds: number
  onDone: () => void
}) {
  const { lesson, languageCode, elapsedSeconds, onDone } = props
  const minutes = Math.max(1, Math.round(elapsedSeconds / 60))
  const phraseCount = lessonPhrases(lesson, languageCode).length

  return (
    <div className="lesson-complete">
      <div className="lesson-complete-badge">
        <div className="lesson-complete-halo" aria-hidden />
        <div className="lesson-complete-check" aria-hidden>✓</div>
      </div>
      <div className="lesson-complete-title">Lesson complete</div>
      <div className="lesson-complete-subtitle">
        <span aria-hidden>{lesson.emoji}</span> {lesson.title}
      </div>
      <div className="lesson-complete-stats">
        <div className="lesson-complete-stat">
          <div className="lesson-complete-stat-value">{minutes}</div>
          <div className="lesson-complete-stat-label">min spoken</div>
        </div>
        <div className="lesson-complete-stat">
          <div className="lesson-complete-stat-value">{phraseCount}</div>
          <div className="lesson-complete-stat-label">phrases</div>
        </div>
      </div>
      <button
        type="button"
        className="lesson-complete-cta"
        onClick={onDone}
      >
        Back to lessons
      </button>
    </div>
  )
}
