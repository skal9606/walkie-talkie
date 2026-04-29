import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { TUTORS } from '../lib/tutors'
import type { LanguageCode, TutorId } from '../lib/tutors/types'
import { NATIVE_LANGUAGES, type NativeLanguage } from '../lib/profile'
import type { Level } from '../lib/scenarios'

// Multi-step first-time onboarding (ISSEN/Speak-style). One question per
// screen with a progress bar, back button, and continue CTA. Used for the
// cold-start trial flow.
//
// Steps:
//   welcome → name → native → target → level → prep → onComplete()
//
// Settings still uses simple selects to switch native/target — this
// component is only for the first-time path.

type Step = 'welcome' | 'name' | 'native' | 'target' | 'level' | 'prep'

const STEP_ORDER: Step[] = ['welcome', 'name', 'native', 'target', 'level', 'prep']

type LevelOption = {
  id: Level
  label: string
  blurb: string
  bars: number
}

const LEVELS: LevelOption[] = [
  { id: 'complete-beginner', label: 'Novice', blurb: `I'm just starting out`, bars: 1 },
  {
    id: 'novice',
    label: 'Beginner',
    blurb: 'I know some phrases and can have a short, basic conversation',
    bars: 2,
  },
  { id: 'intermediate', label: 'Intermediate', blurb: 'I can handle routine conversations', bars: 3 },
  { id: 'advanced', label: 'Advanced', blurb: 'I can discuss complex topics', bars: 4 },
]

export type OnboardingResult = {
  name: string
  nativeLanguage: NativeLanguage
  targetLanguage: LanguageCode
  tutorId: TutorId
  level: Level
}

export function OnboardingFlow({
  onComplete,
}: {
  onComplete: (result: OnboardingResult) => void
}) {
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState<NativeLanguage>('English')
  const [tutorId, setTutorId] = useState<TutorId | null>(
    TUTORS.length === 1 ? TUTORS[0].id : null,
  )
  const [level, setLevel] = useState<Level>('complete-beginner')

  const stepIdx = STEP_ORDER.indexOf(step)
  const progressPct = ((stepIdx + 1) / STEP_ORDER.length) * 100
  const showHeader = step !== 'welcome'
  const tutor = tutorId ? TUTORS.find((t) => t.id === tutorId) : null

  function goNext() {
    const i = STEP_ORDER.indexOf(step)
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
  }

  function goBack() {
    const i = STEP_ORDER.indexOf(step)
    if (i > 0) setStep(STEP_ORDER[i - 1])
  }

  function handleComplete() {
    if (!tutorId || !tutor || !name.trim()) return
    onComplete({
      name: name.trim(),
      nativeLanguage,
      targetLanguage: tutor.language,
      tutorId: tutor.id,
      level,
    })
  }

  function handleNameSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    goNext()
  }

  return (
    <div className="onboarding-flow">
      {showHeader && (
        <header className="onboarding-flow-header">
          <button
            type="button"
            className="onboarding-flow-back"
            onClick={goBack}
            aria-label="Back"
          >
            ←
          </button>
          <div className="onboarding-flow-progress" aria-hidden>
            <div
              className="onboarding-flow-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </header>
      )}

      <div className="onboarding-flow-card">
        {step === 'welcome' && (
          <div className="onboarding-step onboarding-welcome">
            <h2 className="onboarding-welcome-eyebrow">Welcome to</h2>
            <h1 className="onboarding-welcome-title">Walkie Talkie</h1>
            <p className="onboarding-welcome-tagline">
              The fastest way to master a language
            </p>
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                onClick={goNext}
              >
                Get started
              </button>
              <Link to="/login" className="onboarding-flow-secondary">
                I already have an account
              </Link>
            </div>
          </div>
        )}

        {step === 'name' && (
          <form className="onboarding-step" onSubmit={handleNameSubmit}>
            <p className="onboarding-step-eyebrow">We'll pass it on to your tutor.</p>
            <h1 className="onboarding-step-title">What's your name?</h1>
            <input
              type="text"
              className="onboarding-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              autoComplete="given-name"
              autoFocus
              maxLength={40}
              required
            />
            <div className="onboarding-flow-actions">
              <button
                type="submit"
                className="onboarding-flow-cta"
                disabled={!name.trim()}
              >
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'native' && (
          <div className="onboarding-step">
            <p className="onboarding-step-eyebrow">
              The language you grew up speaking at home.
            </p>
            <h1 className="onboarding-step-title">What's your native language?</h1>
            <div className="onboarding-options">
              {NATIVE_LANGUAGES.map((lang) => (
                <button
                  type="button"
                  key={lang}
                  className={`onboarding-option ${nativeLanguage === lang ? 'selected' : ''}`}
                  onClick={() => setNativeLanguage(lang)}
                >
                  <span className="onboarding-option-flag" aria-hidden>🇺🇸</span>
                  <span className="onboarding-option-label">{lang}</span>
                </button>
              ))}
              {/* Coming-soon natives. Disabled but visible so future support is signaled. */}
              {[
                { flag: '🇪🇸', label: 'Español' },
                { flag: '🇫🇷', label: 'Français' },
                { flag: '🇩🇪', label: 'Deutsch' },
                { flag: '🇮🇹', label: 'Italiano' },
                { flag: '🇨🇳', label: '普通话' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.label}
                  className="onboarding-option onboarding-option-disabled"
                  disabled
                  aria-disabled
                >
                  <span className="onboarding-option-flag" aria-hidden>{opt.flag}</span>
                  <span className="onboarding-option-label">{opt.label}</span>
                  <span className="onboarding-option-soon">Soon</span>
                </button>
              ))}
            </div>
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                onClick={goNext}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'target' && (
          <div className="onboarding-step">
            <p className="onboarding-step-eyebrow">
              {name.trim()
                ? `Your journey begins today, ${name.trim()}!`
                : 'Pick the language you want to learn.'}
            </p>
            <h1 className="onboarding-step-title">What language are you learning?</h1>
            <div className="onboarding-options">
              {TUTORS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`onboarding-option ${tutorId === t.id ? 'selected' : ''}`}
                  onClick={() => setTutorId(t.id)}
                >
                  <span className="onboarding-option-flag" aria-hidden>{t.flag}</span>
                  <span className="onboarding-option-text">
                    <span className="onboarding-option-label">{t.languageLabel}</span>
                    <span className="onboarding-option-sub">
                      {t.name} · {t.city} · {t.age}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="onboarding-coming-soon">More languages coming soon.</p>
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                onClick={goNext}
                disabled={!tutorId}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'level' && (
          <div className="onboarding-step">
            <p className="onboarding-step-eyebrow">
              We'll adjust your tutor's pace to match.
            </p>
            <h1 className="onboarding-step-title">
              How proficient are you in {tutor?.languageLabel ?? 'the language'}?
            </h1>
            <div className="onboarding-options">
              {LEVELS.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  className={`onboarding-option onboarding-option-level ${level === opt.id ? 'selected' : ''}`}
                  onClick={() => setLevel(opt.id)}
                >
                  <LevelIcon bars={opt.bars} />
                  <span className="onboarding-option-text">
                    <span className="onboarding-option-label-small">{opt.label}</span>
                    <span className="onboarding-option-sub">{opt.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                onClick={goNext}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'prep' && tutor && (
          <div className="onboarding-step">
            <h1 className="onboarding-step-title">
              You're about to start your first chat with {tutor.name}!
            </h1>
            <ul className="onboarding-prep-list">
              <PrepBullet
                emoji="👋"
                title="Getting to know you"
                body={`The journey begins with ${tutor.name} learning what matters to you and what you want to achieve in ${tutor.languageLabel}.`}
              />
              <PrepBullet
                emoji="🎯"
                title="Tuned to your level"
                body={`${tutor.name} adjusts pace, vocabulary, and grammar in real time as you talk — meeting you where you are.`}
              />
              <PrepBullet
                emoji="🎧"
                title="Pick a quiet place"
                body={`It helps ${tutor.name} hear you clearly and makes the conversation flow.`}
              />
              <PrepBullet
                emoji="📈"
                title="Keep the momentum"
                body="Short daily sessions build the habit faster than long, infrequent ones."
              />
            </ul>
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                onClick={handleComplete}
              >
                Start free trial
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PrepBullet({
  emoji,
  title,
  body,
}: {
  emoji: string
  title: string
  body: string
}) {
  return (
    <li className="onboarding-prep-item">
      <span className="onboarding-prep-emoji" aria-hidden>
        {emoji}
      </span>
      <div className="onboarding-prep-text">
        <div className="onboarding-prep-title">{title}</div>
        <div className="onboarding-prep-body">{body}</div>
      </div>
    </li>
  )
}

// 4-bar signal-strength icon (proficiency).
function LevelIcon({ bars }: { bars: number }) {
  return (
    <span className="level-picker-icon" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`level-picker-bar ${i <= bars ? 'filled' : ''}`}
          style={{ height: `${30 + i * 18}%` }}
        />
      ))}
    </span>
  )
}
