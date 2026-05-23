import type { TestSpec, Preferences, LanguageCode } from '../framework/types'
import { DEFAULT_PREFERENCES } from '../../src/lib/preferences'

/**
 * Settings-adherence tests. The user reported that grammar-strictness and
 * pronunciation feedback settings feel like they're not being honored in
 * production. These tests run controlled A/B-style conversations where
 * the simulated learner makes the same kind of mistake under DIFFERENT
 * preferences settings and the judge scores whether the tutor's
 * correction behavior matches what the setting promised.
 *
 * IMPORTANT CAVEAT for pronunciation tests: the production tutor receives
 * AUDIO; we only have text in eval. The simulated learner types phonetic
 * mis-spellings ("kasa", "muyto", "bohn-jewer") as a proxy. This tests
 * whether the PROMPT INSTRUCTIONS are wired and parseable by the model —
 * it does NOT verify production audio behavior. Pair with a manual voice
 * test on at least pt-BR.
 *
 * Coverage strategy:
 *   - Strict modes (grammar + pronunciation): ALL 5 languages. These are
 *     the failing settings; we need cross-language signal.
 *   - Lax / honest / forgiving: pt-BR only. Already scored 5/5 in earlier
 *     runs; the plumbing is language-agnostic so re-testing all langs
 *     would just consume budget for diminishing signal.
 */

const ALL_LANGUAGES: LanguageCode[] = ['pt-BR', 'es-MX', 'fr-FR', 'de-DE', 'it-IT']

function prefs(overrides: Partial<Preferences>): Preferences {
  return { ...DEFAULT_PREFERENCES, ...overrides }
}

const GOAL_STRICT_GRAMMAR = 'I want my grammar tight — please correct me on every mistake'
const GOAL_LAX_GRAMMAR = 'Just casual chatting — not stressed about perfection'
const GOAL_STRICT_PRON = 'I want my accent to sound real — push me on pronunciation'
const GOAL_HONEST_PRON = 'Trying to improve pronunciation while still chatting'
const GOAL_FORGIVING_PRON = 'Building confidence — please don\'t pick on my accent'

export function settingsAdherenceSpecs(): TestSpec[] {
  const specs: TestSpec[] = []

  // --- Strict modes across all 5 languages ---
  for (const language of ALL_LANGUAGES) {
    specs.push({
      id: `settings__grammar_strict__${language}`,
      category: 'settings-adherence',
      language,
      level: 'intermediate',
      persona: 'grammar-mistakes-many-multilang',
      learnerGoal: GOAL_STRICT_GRAMMAR,
      numTurns: 6,
      rubric: 'grammar-strict-adherence',
      preferences: prefs({ strictness: 'strict' }),
    })
    specs.push({
      id: `settings__pronunciation_strict__${language}`,
      category: 'settings-adherence',
      language,
      level: 'intermediate',
      persona: 'phonetic-mispronouncer-multilang',
      learnerGoal: GOAL_STRICT_PRON,
      numTurns: 6,
      rubric: 'pronunciation-strict-adherence',
      preferences: prefs({ pronunciation: 'strict' }),
    })
  }

  // --- Non-strict modes: pt-BR only (already validated in first run) ---
  specs.push({
    id: 'settings__grammar_lax__pt-BR',
    category: 'settings-adherence',
    language: 'pt-BR',
    level: 'intermediate',
    persona: 'grammar-mistakes-many-multilang',
    learnerGoal: GOAL_LAX_GRAMMAR,
    numTurns: 6,
    rubric: 'grammar-lax-adherence',
    preferences: prefs({ strictness: 'lax' }),
  })
  specs.push({
    id: 'settings__pronunciation_honest__pt-BR',
    category: 'settings-adherence',
    language: 'pt-BR',
    level: 'intermediate',
    persona: 'phonetic-mispronouncer-multilang',
    learnerGoal: GOAL_HONEST_PRON,
    numTurns: 6,
    rubric: 'pronunciation-honest-adherence',
    preferences: prefs({ pronunciation: 'honest' }),
  })
  specs.push({
    id: 'settings__pronunciation_forgiving__pt-BR',
    category: 'settings-adherence',
    language: 'pt-BR',
    level: 'intermediate',
    persona: 'phonetic-mispronouncer-multilang',
    learnerGoal: GOAL_FORGIVING_PRON,
    numTurns: 6,
    rubric: 'pronunciation-forgiving-adherence',
    preferences: prefs({ pronunciation: 'forgiving' }),
  })

  return specs
}
