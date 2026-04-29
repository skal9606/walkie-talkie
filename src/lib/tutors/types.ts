// Multi-tutor type definitions. Each tutor is a (language + region + persona)
// triple — e.g. Natalia from São Paulo for Brazilian Portuguese, Santiago from
// Mexico City for Mexican Spanish. Adding a tutor = adding a module under
// src/lib/tutors/<lang-region>/<name>.ts and registering it in ./index.ts.

import type { Level, Scenario, ModeId, ModeContext, VadEagerness } from '../scenarios'

/**
 * BCP-47-flavored language+region code. Kept narrow and explicit so we can
 * exhaustively-switch and so the transcription model gets a clean pin. Add
 * new variants to this union as tutors come online.
 */
export type LanguageCode = 'pt-BR' | 'es-MX' // | 'es-ES' | 'es-AR' | 'fr-FR' | 'it-IT'

/** Stable identifier for a tutor — used as the registry key and in storage. */
export type TutorId = string

/**
 * What a tutor module exports. The metadata block drives the picker UI; the
 * `buildSystemInstructions` callback returns the full base prompt for a session
 * with this tutor; `scenarios` carries the language-specific scenario set
 * (free conversations, roleplays, mode addons).
 */
export type Tutor = {
  // -- Identity ------------------------------------------------------------
  id: TutorId
  name: string
  language: LanguageCode
  /** Free-text city label, shown in the picker (e.g. "São Paulo"). */
  city: string
  /** Country flag emoji, shown in the picker. */
  flag: string
  /** Tutor's age, shown in the picker (ISSEN-style). */
  age: number

  // -- Display -------------------------------------------------------------
  /** Short language label for headers/badges (e.g. "Brazilian Portuguese"). */
  languageLabel: string

  // -- Behavior ------------------------------------------------------------
  /**
   * Returns the full base system prompt for a session with this tutor. Pulled
   * once at session start and concatenated with the scenario addon, learner
   * context, vocab/focus blocks, and preferences block.
   */
  buildSystemInstructions: () => string

  /** All scenarios this tutor can run (free convo per level + roleplays). */
  scenarios: TutorScenarios

  /**
   * ISO-639-1 hint (or null) for gpt-4o-transcribe. null means auto-detect,
   * appropriate during the level-discovery first session when we don't yet
   * know whether the learner will reply in EN or in the target language.
   */
  transcriptionLanguage: (level: Level | undefined) => 'pt' | 'en' | 'es' | 'fr' | 'it' | undefined
}

/**
 * The scenario set bundled with a tutor. All scenario builders live with the
 * tutor module so language-specific openers, roleplays, and grammar topics
 * stay co-located with the persona that delivers them.
 */
export type TutorScenarios = {
  /** Flat list for lookups and the scenario picker. */
  all: Scenario[]
  /** Free-conversation scenarios, one per learner level. */
  freeConversations: Scenario[]
  /** Character-driven roleplays (café, in-laws, etc.). */
  roleplays: Scenario[]
  /** Returns the free-conversation scenario for a given learner level. */
  forLevel: (level: Level) => Scenario
  /** Builds the scenario addon for a non-roleplay practice mode. */
  buildModePromptAddon: (mode: ModeId, ctx: ModeContext) => string
  /** VAD eagerness for a (mode, level) pair. */
  vadForMode: (mode: ModeId, level: Level | undefined) => VadEagerness
}
