import { TUTORS } from '../../src/lib/tutors/index'
import type { Tutor } from '../../src/lib/tutors/types'
import type { LanguageCode, Level } from './types'
import { buildLearnerContextBlock, type NativeLanguage } from '../../src/lib/profile'
import {
  buildPreferencesPromptBlock,
  DEFAULT_PREFERENCES,
  type Preferences,
} from '../../src/lib/preferences'

/**
 * Builds the exact instruction string production sends to OpenAI for a
 * (language, level, learner-context) combination. Mirrors the assembly
 * in Tutor.tsx:803-813 but skips client-only state blocks that are
 * empty for new users anyway (vocab, focus, mistakes, preferences).
 *
 * The eval asks: "if a new user with this profile started a session,
 * what would Natalia/Sofia/etc. say?" — so we only include the base
 * persona + free-conversation scenario + learner context.
 */

export type PromptInputs = {
  language: LanguageCode
  level: Level
  /** Learner's display name. */
  name?: string
  /** Native language as English noun. */
  nativeLanguage?: NativeLanguage
  /** Goal/motivation block — populated for new users post-onboarding. */
  goals?: string
  /**
   * Learner-controlled tutor preferences (grammar strictness, pronunciation
   * feedback, formality, theme). Defaults to DEFAULT_PREFERENCES when
   * omitted, matching production behavior for a fresh user. Tests that
   * exercise specific settings (strict grammar, strict pronunciation,
   * etc.) override.
   */
  preferences?: Preferences
}

function tutorFor(language: LanguageCode): Tutor {
  const t = TUTORS.find((t) => t.language === language)
  if (!t) throw new Error(`No tutor registered for language ${language}`)
  return t
}

export function buildPrompt(inputs: PromptInputs): string {
  const tutor = tutorFor(inputs.language)
  const nativeLanguage = inputs.nativeLanguage ?? 'English'
  const name = inputs.name ?? 'Alex'

  const scenario = tutor.scenarios.forLevel(inputs.level)
  // Synthesize a memory bullet from goals so the opener references the
  // learner's motivation — same path the production app takes for
  // first-session new users (see Tutor.tsx auto-start effect).
  const memory = inputs.goals?.trim()
    ? [`Learning ${tutor.languageLabel} because: ${inputs.goals.trim()}`]
    : []
  const addon = scenario.buildPromptAddon({
    name,
    memory,
    nativeLanguage,
  })

  const learnerContext = buildLearnerContextBlock({
    name,
    nativeLanguage,
    targetLanguage: inputs.language,
    tutorId: tutor.id,
    level: inputs.level,
    goals: inputs.goals,
  })

  // Preferences block was previously missing from the eval prompt — that
  // meant settings tests (grammar strictness, pronunciation feedback) had
  // no chance of producing meaningful results because the system prompt
  // didn't include the directives the settings control. Now mirrors the
  // production assembly in Tutor.tsx exactly.
  const preferences = inputs.preferences ?? DEFAULT_PREFERENCES
  const preferencesBlock = buildPreferencesPromptBlock(preferences)

  return [
    tutor.buildSystemInstructions({ nativeLanguage }),
    addon,
    learnerContext,
    preferencesBlock,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Convenience: list the language codes the registry actually supports. */
export function supportedLanguages(): LanguageCode[] {
  const set = new Set<LanguageCode>()
  for (const t of TUTORS) set.add(t.language)
  return Array.from(set)
}

export function tutorNameFor(language: LanguageCode): string {
  return tutorFor(language).name
}
