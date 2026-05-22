import type { Level, TestSpec } from '../framework/types'

/**
 * Momentum tests. Run 10-turn conversations with a chatty learner and
 * check whether the tutor builds on prior turns (callbacks, topical
 * continuity) instead of resetting topics every other message.
 */

const LEVELS_TO_TEST: Level[] = ['novice', 'intermediate']

export function momentumSpecs(): TestSpec[] {
  const specs: TestSpec[] = []
  for (const level of LEVELS_TO_TEST) {
    specs.push({
      id: `momentum__pt-BR__${level}`,
      category: 'momentum',
      language: 'pt-BR',
      level,
      persona:
        level === 'novice' ? 'novice-mostly-english' : 'intermediate-fluent-ish',
      learnerGoal:
        'Planning a 3-month trip from São Paulo to Salvador with my wife',
      numTurns: 10,
      rubric: 'momentum',
    })
  }
  return specs
}
