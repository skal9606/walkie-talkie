import { useState } from 'react'
import { TUTORS } from '../lib/tutors'
import type { LanguageCode, TutorId } from '../lib/tutors/types'
import { NATIVE_LANGUAGES, type NativeLanguage } from '../lib/profile'

// Pre-first-session onboarding: pick a native language + a tutor (each tutor
// represents a language + region). Saved into the profile so the next visit
// skips this screen and goes straight to the discover session.

export function LanguagePicker({
  initialNativeLanguage,
  onComplete,
}: {
  initialNativeLanguage?: NativeLanguage
  onComplete: (picked: {
    nativeLanguage: NativeLanguage
    targetLanguage: LanguageCode
    tutorId: TutorId
  }) => void
}) {
  const [nativeLanguage, setNativeLanguage] = useState<NativeLanguage>(
    initialNativeLanguage ?? 'English',
  )
  const [tutorId, setTutorId] = useState<TutorId | null>(
    TUTORS.length === 1 ? TUTORS[0].id : null,
  )

  const canSubmit = !!nativeLanguage && !!tutorId

  function handleSubmit() {
    if (!canSubmit) return
    const tutor = TUTORS.find((t) => t.id === tutorId)
    if (!tutor) return
    onComplete({
      nativeLanguage,
      targetLanguage: tutor.language,
      tutorId: tutor.id,
    })
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h2 className="onboarding-title">Welcome — let's set you up</h2>
        <p className="onboarding-body">
          Two quick picks and you'll be in your first conversation.
        </p>

        <div className="onboarding-form">
          <div className="onboarding-label">
            <span className="onboarding-label-text">Your native language</span>
            <select
              value={nativeLanguage}
              onChange={(e) => setNativeLanguage(e.target.value as NativeLanguage)}
              className="onboarding-input"
            >
              {NATIVE_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div className="onboarding-label">
            <span className="onboarding-label-text">What do you want to learn?</span>
            <div className="language-picker-list">
              {TUTORS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`language-picker-tile ${tutorId === t.id ? 'selected' : ''}`}
                  onClick={() => setTutorId(t.id)}
                >
                  <span className="language-picker-flag" aria-hidden>
                    {t.flag}
                  </span>
                  <span className="language-picker-text">
                    <span className="language-picker-language">
                      {t.languageLabel}
                    </span>
                    <span className="language-picker-tutor">
                      {t.name} · {t.city} · {t.age}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="language-picker-coming-soon">
              More languages coming soon.
            </p>
          </div>

          <button
            type="button"
            className="mic-btn start"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Start practicing
          </button>
        </div>
      </div>
    </div>
  )
}
