import type { TestSpec } from '../framework/types'

/**
 * Repetition tests. Run 15-turn conversations with a low-energy learner
 * who gives short, similar answers — this is the worst-case input for
 * an AI tutor falling into repetitive "Great job! Can you tell me more?"
 * patterns. Judge counts phrase repetition explicitly.
 */

export function repetitionSpecs(): TestSpec[] {
  return [
    {
      id: 'repetition__pt-BR__novice__silent-learner',
      category: 'repetition',
      language: 'pt-BR',
      level: 'novice',
      persona: 'silent-and-short',
      learnerGoal: 'Just curious about Brazilian Portuguese',
      numTurns: 15,
      rubric: 'repetition',
    },
    {
      id: 'repetition__pt-BR__intermediate__chatty',
      category: 'repetition',
      language: 'pt-BR',
      level: 'intermediate',
      persona: 'intermediate-fluent-ish',
      learnerGoal: 'Want to feel at home in São Paulo',
      numTurns: 15,
      rubric: 'repetition',
    },
  ]
}
