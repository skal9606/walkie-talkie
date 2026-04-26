import { useState, type FormEvent } from 'react'
import type { Level } from '../lib/scenarios'
import type { LearnerProfile } from '../lib/profile'

// Post-subscribe questionnaire. The trial flow no longer asks anything
// upfront — Natalia infers name + level during the first session. This
// form runs once after a learner subscribes, gathering the richer profile
// (native language, goals) that helps tune the rest of the experience.
//
// Prefilled where possible from values inferred during the trial.

type LevelOption = {
  id: Level
  title: string
  blurb: string
}

const LEVELS: LevelOption[] = [
  {
    id: 'complete-beginner',
    title: 'First timer',
    blurb: `I don't know any Portuguese yet.`,
  },
  {
    id: 'novice',
    title: 'Basic',
    blurb: 'I know a little — greetings, a few words.',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    blurb: 'I can hold a basic conversation.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    blurb: `I'm fluent-ish. I want to refine and practice.`,
  },
]

const NATIVE_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Mandarin',
  'Hindi',
  'Arabic',
  'Italian',
  'Other',
]

export function Onboarding({
  initialProfile,
  onComplete,
}: {
  initialProfile?: LearnerProfile | null
  onComplete: (profile: LearnerProfile) => void
}) {
  const [name, setName] = useState(initialProfile?.name ?? '')
  const [nativeLanguage, setNativeLanguage] = useState(
    initialProfile?.nativeLanguage ?? 'English',
  )
  const [level, setLevel] = useState<Level | null>(initialProfile?.level ?? null)
  const [goals, setGoals] = useState(initialProfile?.goals ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !level) return
    onComplete({
      name: name.trim(),
      nativeLanguage: nativeLanguage.trim(),
      level,
      goals: goals.trim() || undefined,
      questionnaireCompleted: true,
    })
  }

  const canSubmit = !!name.trim() && !!level

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h2 className="onboarding-title">Welcome aboard! Tell us a bit about you</h2>
        <p className="onboarding-body">
          Quick four-question setup so Natalia can tune the rest of your sessions.
        </p>

        <form onSubmit={handleSubmit} className="onboarding-form">
          <label className="onboarding-label">
            <span className="onboarding-label-text">What should Natalia call you?</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              className="onboarding-input"
              autoComplete="given-name"
              maxLength={40}
              required
            />
          </label>

          <label className="onboarding-label">
            <span className="onboarding-label-text">What's your native language?</span>
            <select
              value={nativeLanguage}
              onChange={(e) => setNativeLanguage(e.target.value)}
              className="onboarding-input"
            >
              {NATIVE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>

          <div className="onboarding-label">
            <span className="onboarding-label-text">What's your Portuguese level?</span>
            <div className="onboarding-levels">
              {LEVELS.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  className={`onboarding-level ${level === opt.id ? 'selected' : ''}`}
                  onClick={() => setLevel(opt.id)}
                >
                  <div className="onboarding-level-title">{opt.title}</div>
                  <div className="onboarding-level-blurb">{opt.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="onboarding-label">
            <span className="onboarding-label-text">
              What's your goal? (optional)
            </span>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="Talk to my Brazilian in-laws · travel · work · just curious…"
              className="onboarding-input onboarding-textarea"
              rows={3}
              maxLength={300}
            />
          </label>

          <button
            type="submit"
            className="mic-btn start"
            disabled={!canSubmit}
          >
            Save and continue
          </button>
        </form>
      </div>
    </div>
  )
}
