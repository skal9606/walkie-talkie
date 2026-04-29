// Shared scenario shapes — the types and the language-agnostic metadata
// used across all tutors. Per-language scenario CONTENT (openers, roleplays,
// mode addons) lives under src/lib/tutors/<lang-region>/scenarios.ts.

export type VadEagerness = 'low' | 'medium' | 'high' | 'auto'

/** The four levels the learner chooses from during onboarding. */
export type Level = 'complete-beginner' | 'novice' | 'intermediate' | 'advanced'

export type PromptContext = {
  /** Learner's first name, captured during onboarding. */
  name?: string
  /**
   * Short factual bullets about the learner from prior sessions
   * (e.g. "Has a daughter named Lucy", "Works as a VC"). When present,
   * the Free Conversation opener references one of these instead of using
   * the canned script.
   */
  memory?: string[]
}

export type Scenario = {
  id: string
  title: string
  description: string
  /** Called once per session. Returns the prompt addon appended to the base tutor prompt. */
  buildPromptAddon: (ctx?: PromptContext) => string
  /**
   * How eagerly the semantic VAD decides the learner is done talking.
   * 'low' waits longest (good for beginners who pause mid-sentence).
   * 'high' responds fastest (good for fluent speakers). Defaults to 'low'.
   */
  vadEagerness?: VadEagerness
}

export type ModeId =
  | 'free'
  | 'grammar'
  | 'scenario'
  | 'repeat'
  | 'translations'
  | 'discover'

export type ModeContext = {
  name?: string
  /** Level may be unknown for the very first session — see `discover` mode. */
  level?: Level
  /** Optional memory bullets from prior sessions; used by free-mode opener. */
  memory?: string[]
}

export type ModeMeta = {
  id: ModeId
  title: string
  blurb: string
  /** Emoji shown in the portal card. */
  icon: string
}

// Note: 'free' mode is intentionally NOT in this list — Free Conversation
// is rendered as the prominent floating CTA at the bottom of /practice,
// not as a card in the grid (matches the ISSEN portal pattern).
export const PRACTICE_MODES: ModeMeta[] = [
  {
    id: 'grammar',
    title: 'Grammar lesson',
    blurb: 'Learn and practice grammar concepts through conversation',
    icon: '📚',
  },
  {
    id: 'scenario',
    title: 'Scenario',
    blurb: 'Practice real-world conversations and role-play situations',
    icon: '🎭',
  },
  {
    id: 'repeat',
    title: 'Repeat after me',
    blurb: 'Echo your tutor to practice your pronunciation and speaking skills',
    icon: '🔁',
  },
  {
    id: 'translations',
    title: 'Translations',
    blurb: 'Practice translating short phrases to hone your vocab',
    icon: '🌐',
  },
]
