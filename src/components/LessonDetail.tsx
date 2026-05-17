// Pre-session preview modal. Mirrors iOS LessonDetailView one-for-one:
// themed hero, tutor chip, scene as quote, numbered phrase cards,
// inline Start Lesson at end of scroll.

import { useEffect } from 'react'
import type { Lesson } from '../lib/lessons/types'
import { lessonPhrases } from '../lib/lessons/catalog'
import { unitAccentCSS } from '../lib/lessons/unitAccent'

export function LessonDetail(props: {
  lesson: Lesson
  languageCode: string
  tutorName: string
  tutorLanguageLabel: string
  tutorFlag: string
  onStart: () => void
  onClose: () => void
}) {
  const { lesson, languageCode, tutorName, tutorLanguageLabel, tutorFlag, onStart, onClose } = props
  const phrases = lessonPhrases(lesson, languageCode)
  const accent = unitAccentCSS(lesson, 0.65)
  const accentSoft = unitAccentCSS(lesson, 0.25)
  const contentMissing = phrases.length === 0

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="lesson-detail-backdrop" onClick={onClose}>
      <div className="lesson-detail" onClick={(e) => e.stopPropagation()}>
        <button className="lesson-detail-close" onClick={onClose} aria-label="Close">×</button>

        <div
          className="lesson-detail-hero"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accentSoft})` }}
        >
          <div className="lesson-detail-hero-icon" aria-hidden>{lesson.emoji}</div>
          <div className="lesson-detail-hero-text">
            <div className="lesson-detail-hero-tag">
              LESSON · ~{estimatedMinutes(lesson)} MIN
            </div>
            <div className="lesson-detail-hero-title">{lesson.title}</div>
          </div>
        </div>

        {contentMissing && (
          <div className="lesson-detail-placeholder">
            {tutorLanguageLabel} content for this lesson is on the way — try it in Portuguese in the meantime.
          </div>
        )}

        <div className="lesson-detail-tutor-chip">
          <div className="lesson-detail-tutor-avatar">
            {tutorName.slice(0, 1)}
          </div>
          <div>
            <div className="lesson-detail-tutor-title">
              {tutorName} will lead this scene
            </div>
            <div className="lesson-detail-tutor-meta">
              {tutorFlag} {tutorLanguageLabel} · voice only
            </div>
          </div>
        </div>

        <div className="lesson-detail-scene">
          <span className="lesson-detail-scene-quote" aria-hidden>"</span>
          <span>{lesson.scene}</span>
        </div>

        <div className="lesson-detail-phrases-label">
          PHRASES YOU'LL PRACTICE
        </div>
        <div className="lesson-detail-phrases">
          {phrases.map((phrase, idx) => (
            <div key={phrase.target} className="lesson-detail-phrase">
              <div className="lesson-detail-phrase-num">{idx + 1}</div>
              <div className="lesson-detail-phrase-body">
                <div className="lesson-detail-phrase-target">{phrase.target}</div>
                <div className="lesson-detail-phrase-native">{phrase.native}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="lesson-detail-actions">
          <button
            type="button"
            className="lesson-detail-start"
            onClick={onStart}
            disabled={contentMissing}
          >
            📞 Start lesson
          </button>
          <button
            type="button"
            className="lesson-detail-maybe-later"
            onClick={onClose}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

function estimatedMinutes(lesson: Lesson): number {
  const m = lesson.summary.match(/(\d+)\s*min/)
  return m ? parseInt(m[1], 10) : 8
}

