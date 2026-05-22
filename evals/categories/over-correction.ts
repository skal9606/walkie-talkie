import type { Level, TestSpec } from '../framework/types'

/**
 * Over-correction tests. The simulated learner makes lots of small
 * mistakes every turn. The tutor should pick 1-2 high-value corrections
 * — NOT call out every error and kill conversational flow.
 *
 * Restricted to pt-BR + es-MX since the correction calibration logic
 * lives in shared prompt scaffolding, and these are the two highest-
 * volume languages.
 */

const LEVELS_TO_TEST: Level[] = ['novice', 'intermediate', 'advanced']

export function overCorrectionSpecs(): TestSpec[] {
  const specs: TestSpec[] = []
  for (const level of LEVELS_TO_TEST) {
    specs.push({
      id: `over-correction__pt-BR__${level}`,
      category: 'over-correction',
      language: 'pt-BR',
      level,
      persona: 'small-mistakes-galore',
      learnerGoal: 'Visiting Brazil with my family in 4 months',
      numTurns: 6,
      rubric: 'over-correction',
    })
  }
  return specs
}
