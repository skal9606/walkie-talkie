import type { TestSpec } from '../framework/types'

/**
 * Code-switching tests. The learner mixes target language + English
 * freely. The tutor must:
 *   - NOT switch fully to English in response (unless level is
 *     complete-beginner where English-led is by design)
 *   - NOT shame or call out the mixing
 *   - Keep momentum and weave in some target-language scaffolding
 *
 * Tested on pt-BR + es-MX because the most common production code-
 * switching cases are Portuguese↔English (Brazilian learners) and
 * Spanish↔English (US Latino learners).
 */

export function codeSwitchingSpecs(): TestSpec[] {
  return [
    {
      id: 'code-switching__pt-BR__novice',
      category: 'code-switching',
      language: 'pt-BR',
      level: 'novice',
      persona: 'code-switcher',
      learnerGoal: 'Brazilian wife — want to understand her family',
      numTurns: 6,
      rubric: 'code-switching',
    },
    {
      id: 'code-switching__pt-BR__intermediate',
      category: 'code-switching',
      language: 'pt-BR',
      level: 'intermediate',
      persona: 'code-switcher',
      learnerGoal: 'Living in São Paulo, want to stop falling back on English',
      numTurns: 6,
      rubric: 'code-switching',
    },
    {
      id: 'code-switching__es-MX__intermediate',
      category: 'code-switching',
      language: 'es-MX',
      level: 'intermediate',
      persona: 'code-switcher',
      learnerGoal: 'My partner is from Mexico City',
      numTurns: 6,
      rubric: 'code-switching',
    },
  ]
}
