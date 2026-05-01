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
   *
   * `nativeLanguage` is the learner's native language as an English name
   * ("English", "Spanish", "French", …). It's templated into the persona
   * wherever the prompt references the language the learner falls back to.
   */
  buildSystemInstructions: (ctx: { nativeLanguage: string }) => string

  /** All scenarios this tutor can run (free convo per level + roleplays). */
  scenarios: TutorScenarios

  /**
   * ISO-639-1 hint (or null) for gpt-4o-transcribe. null means auto-detect,
   * appropriate during the level-discovery first session when we don't yet
   * know whether the learner will reply in EN or in the target language.
   */
  transcriptionLanguage: (level: Level | undefined) => 'pt' | 'en' | 'es' | 'fr' | 'it' | undefined

  /**
   * Curated vocabulary cards that pop up mid-conversation when this tutor
   * says one of these specific words during a complete-beginner session.
   * Image-only (emoji) for v1; the trigger is a token-boundary match
   * against the tutor's transcript.
   */
  beginnerCards: BeginnerCard[]

  /**
   * Themed topics for the complete-beginner level — modeled on Duolingo's
   * Section 1 unit structure. The tutor picks ONE topic per session based
   * on the learner's stated reason for learning, then steers vocabulary
   * toward that topic's `cardWords` subset of `beginnerCards`.
   */
  beginnerTopics: BeginnerTopic[]
}

/**
 * Visual flashcard shown mid-conversation for complete-beginner learners
 * the moment the tutor says the matching word. Image is an emoji for v1
 * (no infra, ships today); the data model is forward-compatible to image
 * URLs and pre-recorded audio.
 */
export type BeginnerCard = {
  /** The target-language word, lowercase, exactly as the trigger looks for it. */
  word: string
  /** English gloss shown beneath the word on the card. */
  native: string
  /** Emoji used as the card image (e.g. "🍎"). */
  emoji: string
  /** Alternate spellings the tutor might say (e.g. "obrigada" for "obrigado"). */
  aliases?: string[]
}

/**
 * Themed topic for a complete-beginner session — Duolingo Section-1-style.
 * Each topic groups a small subset (4–6) of priority words around a
 * concrete scene (ordering at a cafe, identifying family, finding places
 * in a city). The tutor picks one per session and stays focused on its
 * vocabulary.
 */
export type BeginnerTopic = {
  /** Stable identifier for logging / future "topics covered" tracking. */
  id: string
  /** Short title shown to the model (e.g. "Order at a cafe"). */
  title: string
  /** One-line topical description used in the prompt block. */
  blurb: string
  /**
   * Card words this topic should surface. Must all exist in the tutor's
   * `beginnerCards` list — these subset the priority vocabulary so the
   * session feels themed instead of grab-bag.
   */
  cardWords: string[]
  /**
   * Free-form hint to help the tutor pick this topic from learner context
   * ("learner mentions cafes, coffee, food service"). Not shown to the
   * learner — purely to steer the model's selection.
   */
  matchHint: string
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
