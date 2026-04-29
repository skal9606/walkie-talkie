import { useState } from 'react'
import { TUTORS } from '../lib/tutors'
import type { LanguageCode, TutorId } from '../lib/tutors/types'
import { NATIVE_LANGUAGES, type NativeLanguage } from '../lib/profile'
import type { Level } from '../lib/scenarios'

// Pre-first-session onboarding: pick a native language, a tutor (language +
// region), and the learner's proficiency. Saved into the profile so the next
// visit skips this screen and goes straight into a session at the right level.

type LevelOption = {
  id: Level
  label: string
  blurb: string
  bars: number // 1..4 — visual fullness for the icon
}

// Labels follow the ISSEN convention (Novice = just starting out; Beginner =
// knows some phrases). Internal IDs are unchanged for compatibility.
const LEVELS: LevelOption[] = [
  {
    id: 'complete-beginner',
    label: 'Novice',
    blurb: `I'm just starting out`,
    bars: 1,
  },
  {
    id: 'novice',
    label: 'Beginner',
    blurb: 'I know some phrases and can have a short, basic conversation',
    bars: 2,
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    blurb: 'I can handle routine conversations',
    bars: 3,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'I can discuss complex topics',
    bars: 4,
  },
]

export function LanguagePicker({
  initialNativeLanguage,
  onComplete,
}: {
  initialNativeLanguage?: NativeLanguage
  onComplete: (picked: {
    nativeLanguage: NativeLanguage
    targetLanguage: LanguageCode
    tutorId: TutorId
    level: Level
  }) => void
}) {
  const [nativeLanguage, setNativeLanguage] = useState<NativeLanguage>(
    initialNativeLanguage ?? 'English',
  )
  const [tutorId, setTutorId] = useState<TutorId | null>(
    TUTORS.length === 1 ? TUTORS[0].id : null,
  )
  // Default to "Novice" so the worst case (a true beginner who clicks
  // through quickly) lands somewhere safe — matches the ISSEN default.
  const [level, setLevel] = useState<Level>('complete-beginner')

  const canSubmit = !!nativeLanguage && !!tutorId && !!level

  function handleSubmit() {
    if (!canSubmit) return
    const tutor = TUTORS.find((t) => t.id === tutorId)
    if (!tutor) return
    onComplete({
      nativeLanguage,
      targetLanguage: tutor.language,
      tutorId: tutor.id,
      level,
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

          <div className="onboarding-label">
            <span className="onboarding-label-text">
              How proficient are you in {tutorId
                ? TUTORS.find((t) => t.id === tutorId)?.languageLabel
                : 'the language'}?
            </span>
            <div className="level-picker-list">
              {LEVELS.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  className={`level-picker-tile ${level === opt.id ? 'selected' : ''}`}
                  onClick={() => setLevel(opt.id)}
                >
                  <LevelIcon bars={opt.bars} />
                  <span className="level-picker-text">
                    <span className="level-picker-label">{opt.label}</span>
                    <span className="level-picker-blurb">{opt.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
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

// Three-bar signal-strength icon — fills `bars` of the four bars to show
// proficiency level visually (1 = novice, 4 = advanced).
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
