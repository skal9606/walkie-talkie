import { useState, type FormEvent } from 'react'
import type { Level } from '../lib/scenarios'
import type { LearnerProfile } from '../lib/profile'

// Two-step onboarding before a learner's first session. Collects just enough
// to personalize Natalia's opener — name + level — and hands the profile up
// to <Tutor> which signs them in anonymously and kicks off the trial.

type Step = 'name' | 'level'

type LevelOption = {
  id: Level
  title: string
  blurb: string
}

const LEVELS: LevelOption[] = [
  {
    id: 'complete-beginner',
    title: 'Complete beginner',
    blurb: `I don't know any Portuguese yet.`,
  },
  {
    id: 'novice',
    title: 'Novice',
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

export function Onboarding({
  onComplete,
  onSignInInstead,
}: {
  onComplete: (profile: LearnerProfile) => void
  onSignInInstead: () => void
}) {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [level, setLevel] = useState<Level | null>(null)

  function handleNameSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setName(clean)
    setStep('level')
  }

  function pickLevel(lvl: Level) {
    setLevel(lvl)
    onComplete({ name: name.trim(), level: lvl })
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          <span className={`onboarding-dot ${step === 'name' ? 'active' : 'done'}`} />
          <span className={`onboarding-dot ${step === 'level' ? 'active' : ''}`} />
        </div>

        {step === 'name' && (
          <>
            <h2 className="onboarding-title">What should Natalia call you?</h2>
            <p className="onboarding-body">
              Natalia is your Brazilian Portuguese tutor. She'll greet you by name
              when you start.
            </p>
            <form onSubmit={handleNameSubmit} className="onboarding-form">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                className="onboarding-input"
                autoFocus
                autoComplete="given-name"
                maxLength={40}
              />
              <button
                type="submit"
                className="mic-btn start"
                disabled={!name.trim()}
              >
                Continue
              </button>
            </form>
            <button
              type="button"
              className="onboarding-link-btn"
              onClick={onSignInInstead}
            >
              Already a subscriber? Sign in
            </button>
          </>
        )}

        {step === 'level' && (
          <>
            <h2 className="onboarding-title">How much Portuguese do you know?</h2>
            <p className="onboarding-body">
              Pick the option that feels closest. Natalia will match your level.
            </p>
            <div className="onboarding-levels">
              {LEVELS.map((opt) => (
                <button
                  key={opt.id}
                  className={`onboarding-level ${level === opt.id ? 'selected' : ''}`}
                  onClick={() => pickLevel(opt.id)}
                >
                  <div className="onboarding-level-title">{opt.title}</div>
                  <div className="onboarding-level-blurb">{opt.blurb}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="onboarding-link-btn"
              onClick={() => setStep('name')}
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
