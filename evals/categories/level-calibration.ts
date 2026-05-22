import type { LanguageCode, Level, TestSpec } from '../framework/types'

/**
 * Level-calibration tests. For each language × level, simulate a learner
 * AT that level and check whether the tutor's output stays calibrated.
 *
 * The simulated learner persona is picked to match the declared level —
 * if the tutor is told "this is a complete-beginner" but the simulated
 * learner replies in fluent intermediate, the test isn't measuring what
 * we want. The adaptive-difficulty category tests the mismatch case.
 */

const PERSONA_FOR_LEVEL: Record<Level, string> = {
  'complete-beginner': 'beginner-true',
  novice: 'novice-mostly-english',
  intermediate: 'intermediate-fluent-ish',
  advanced: 'advanced-strong',
}

/**
 * Per-language destination/context so goals are coherent with the
 * language being tested. The first run shipped a Brazilian-themed goal
 * across ALL languages, which made the judge flag es-MX/fr-FR tests as
 * "tutor speaking the wrong language" — false positive. Goals must
 * match the language the tutor is actually trained for.
 */
const COUNTRY_FOR_LANG: Record<LanguageCode, string> = {
  'pt-BR': 'Brazil',
  'es-MX': 'Mexico',
  'fr-FR': 'France',
  'de-DE': 'Germany',
  'it-IT': 'Italy',
}

function goalForLevel(level: Level, language: LanguageCode): string {
  const country = COUNTRY_FOR_LANG[language]
  switch (level) {
    case 'complete-beginner':
      return `I want to learn the basics for a trip to ${country} next year`
    case 'novice':
      return 'I have family who speaks the language and want to chat with them more'
    case 'intermediate':
      return `I am trying to live and work in ${country} — need real-world fluency`
    case 'advanced':
      return 'I want to read literature and follow politics in the target language'
  }
}

const LANGUAGES: LanguageCode[] = ['pt-BR', 'es-MX', 'fr-FR', 'de-DE', 'it-IT']
const LEVELS: Level[] = ['complete-beginner', 'novice', 'intermediate', 'advanced']

export function levelCalibrationSpecs(opts: { smoke?: boolean } = {}): TestSpec[] {
  // Smoke mode: just pt-BR × all 4 levels (4 tests, ~$0.50).
  // Full mode: all 5 languages × all 4 levels (20 tests).
  const languages = opts.smoke ? (['pt-BR'] as LanguageCode[]) : LANGUAGES
  const specs: TestSpec[] = []
  for (const language of languages) {
    for (const level of LEVELS) {
      specs.push({
        id: `level-calibration__${language}__${level}`,
        category: 'level-calibration',
        language,
        level,
        persona: PERSONA_FOR_LEVEL[level],
        learnerGoal: goalForLevel(level, language),
        numTurns: 6,
        rubric: 'level-calibration',
      })
    }
  }
  return specs
}
