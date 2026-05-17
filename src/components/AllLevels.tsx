// All Levels browse modal — sectioned scroll across all 3 levels.
// Mirror of iOS AllLevelsView. Higher levels than the user's current
// are visible but locked; lower levels stay open for review.

import { useEffect } from 'react'
import {
  LESSON_LEVELS,
  lessonLevelDisplayName,
  lessonLevelOrder,
  type Lesson,
  type LessonLevel,
  type LessonState,
} from '../lib/lessons/types'
import { unitsForLevel } from '../lib/lessons/catalog'
import { stateLookup as readStateLookup } from '../lib/lessons/progress'
import { LessonRow } from './LessonCards'

export function AllLevels(props: {
  currentLevel: LessonLevel
  languageCode: string
  isSubscribed: boolean
  onTapLesson: (l: Lesson) => void
  onClose: () => void
}) {
  const { currentLevel, languageCode, isSubscribed, onTapLesson, onClose } = props
  const lookup = readStateLookup(languageCode)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function rowState(level: LessonLevel, lessonId: string): LessonState {
    if (!isSubscribed) return 'locked'
    if (lessonLevelOrder(level) > lessonLevelOrder(currentLevel)) return 'locked'
    return (lookup[lessonId] ?? 'not_started') as LessonState
  }

  return (
    <div className="all-levels-backdrop" onClick={onClose}>
      <div className="all-levels" onClick={(e) => e.stopPropagation()}>
        <header className="all-levels-header">
          <button className="all-levels-done" onClick={onClose}>Done</button>
          <h2>All levels</h2>
          <span /> {/* spacer for symmetry */}
        </header>
        <div className="all-levels-body">
          {LESSON_LEVELS.map((level) => {
            const above = lessonLevelOrder(level) > lessonLevelOrder(currentLevel)
            return (
              <section key={level} className="all-levels-section">
                <div className="all-levels-section-label">
                  <span>{lessonLevelDisplayName(level).toUpperCase()}</span>
                  {level === currentLevel && (
                    <span className="all-levels-your-level">YOUR LEVEL</span>
                  )}
                  {above && <span className="all-levels-locked-icon" aria-hidden>🔒</span>}
                </div>
                {unitsForLevel(level).map((unit) => (
                  <div key={unit.id} className="all-levels-unit">
                    <div className="all-levels-unit-title">{unit.title}</div>
                    <div className="lessons-rows">
                      {unit.lessons.map((lesson) => (
                        <LessonRow
                          key={lesson.id}
                          lesson={lesson}
                          state={rowState(level, lesson.id)}
                          onClick={() => onTapLesson(lesson)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
