import { useState, type FormEvent } from 'react'
import { TUTORS } from '../lib/tutors'
import type { LanguageCode, TutorId } from '../lib/tutors/types'
import {
  NATIVE_LANGUAGES,
  NATIVE_LANGUAGE_LABELS,
  type NativeLanguage,
} from '../lib/profile'
import type { Level } from '../lib/scenarios'

// Multi-step first-time onboarding (ISSEN/Speak-style). One question per
// screen with a progress bar, back button, and continue CTA. Used for the
// cold-start trial flow. The marketing landing page is the "welcome" — we
// jump straight into the questionnaire here.
//
// Steps:
//   name → native → target → level → goals → onComplete()
//
// Settings still uses simple selects to switch native/target — this
// component is only for the first-time path.

type Step = 'name' | 'native' | 'target' | 'mic' | 'level' | 'goals'

const ALL_STEPS: Step[] = ['name', 'native', 'target', 'mic', 'level', 'goals']

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
  goals?: string
}

export function OnboardingFlow({
  onComplete,
  onTutorPicked,
  onRequestMic,
}: {
  onComplete: (result: OnboardingResult) => void
  /// Fires as soon as a tutor is tapped on the "target" step — two steps
  /// (level, goals) before onComplete. The Tutor page uses it to start
  /// the GPT-Live prepare call early so the first session starts faster.
  onTutorPicked?: (tutorId: TutorId) => void
  /// When provided, a "Turn on your microphone" step runs right after the
  /// tutor pick. It should request mic permission (and do any local voice
  /// setup) and resolve on success / reject on denial. Requesting the mic
  /// here — instead of at session start — takes the permission prompt off
  /// the first session's critical path and surfaces a blocked mic before
  /// the learner is waiting for the tutor to speak (2026-09-20).
  onRequestMic?: () => Promise<void>
}) {
  const STEP_ORDER = onRequestMic ? ALL_STEPS : ALL_STEPS.filter((st) => st !== 'mic')
  const [micState, setMicState] = useState<'idle' | 'asking' | 'denied'>('idle')
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState<NativeLanguage>('English')
  const [tutorId, setTutorId] = useState<TutorId | null>(
    TUTORS.length === 1 ? TUTORS[0].id : null,
  )
  const [level, setLevel] = useState<Level>('complete-beginner')
  const [goals, setGoals] = useState('')

  const stepIdx = STEP_ORDER.indexOf(step)
  const progressPct = ((stepIdx + 1) / STEP_ORDER.length) * 100
  // Hide the back button on the first step — there's nothing to go back to
  // within the flow (the parent's nav handles "← Back" to the landing page).
  const canGoBack = stepIdx > 0
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
      goals: goals.trim() || undefined,
    })
  }

  function handleNameSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    goNext()
  }

  return (
    <div className="onboarding-flow">
      <header className="onboarding-flow-header">
        {canGoBack ? (
          <button
            type="button"
            className="onboarding-flow-back"
            onClick={goBack}
            aria-label="Back"
          >
            ←
          </button>
        ) : (
          <span className="onboarding-flow-back" aria-hidden />
        )}
        <div className="onboarding-flow-progress" aria-hidden>
          <div
            className="onboarding-flow-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <div className="onboarding-flow-card">
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
              {NATIVE_LANGUAGES.map((lang) => {
                const meta = NATIVE_LANGUAGE_LABELS[lang]
                return (
                  <button
                    type="button"
                    key={lang}
                    className={`onboarding-option ${nativeLanguage === lang ? 'selected' : ''}`}
                    onClick={() => setNativeLanguage(lang)}
                  >
                    <span className="onboarding-option-flag" aria-hidden>{meta.flag}</span>
                    <span className="onboarding-option-label">{meta.display}</span>
                  </button>
                )
              })}
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
                  onClick={() => {
                    setTutorId(t.id)
                    onTutorPicked?.(t.id)
                  }}
                >
                  <span className="onboarding-option-flag" aria-hidden>{t.flag}</span>
                  <span className="onboarding-option-text">
                    <span className="onboarding-option-label">{t.languageLabel}</span>
                    <span className="onboarding-option-sub">
                      {t.name} · {t.city}
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

        {step === 'mic' && (
          <div className="onboarding-step">
            <p className="onboarding-step-eyebrow">
              {tutor?.name ?? 'Your tutor'} talks out loud and listens to you.
            </p>
            <h1 className="onboarding-step-title">Turn on your microphone</h1>
            <p className="onboarding-step-help">
              Your browser will ask for permission. We only listen while a conversation is running.
            </p>
            {micState === 'denied' && (
              <p className="onboarding-step-help onboarding-step-error">
                We couldn't access your microphone. Check the microphone permission in your
                browser's address bar, then try again.
              </p>
            )}
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                disabled={micState === 'asking'}
                onClick={async () => {
                  setMicState('asking')
                  try {
                    await onRequestMic?.()
                    setMicState('idle')
                    goNext()
                  } catch {
                    setMicState('denied')
                  }
                }}
              >
                {micState === 'asking' ? 'Waiting for permission…' : micState === 'denied' ? 'Try again' : 'Enable microphone'}
              </button>
              {micState === 'denied' && (
                <button type="button" className="onboarding-flow-secondary" onClick={goNext}>
                  Continue anyway
                </button>
              )}
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
                disabled={!tutorId || !name.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'goals' && (
          <div className="onboarding-step">
            <p className="onboarding-step-eyebrow">
              We'll pre-fill lesson recommendations and steer your tutor toward what matters to you.
            </p>
            <h1 className="onboarding-step-title">Why are you learning?</h1>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="e.g. Visiting Brazil next year · talking with my in-laws · work meetings…"
              className="onboarding-input onboarding-textarea"
              rows={3}
              maxLength={300}
              autoFocus
            />
            <div className="onboarding-flow-actions">
              <button
                type="button"
                className="onboarding-flow-cta"
                onClick={handleComplete}
                disabled={!tutorId || !name.trim()}
              >
                {goals.trim() ? 'Start free trial' : 'Skip for now'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
