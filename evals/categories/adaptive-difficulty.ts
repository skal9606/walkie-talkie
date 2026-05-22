import type { TestSpec } from '../framework/types'

/**
 * Adaptive-difficulty tests. The simulated learner's level shifts
 * mid-conversation:
 *   - "starts-low-improves": beginner first 3 turns, intermediate by
 *     turn 7+. Tutor should ramp difficulty up smoothly.
 *   - "starts-high-stumbles": fluent first 2-3 turns, then progressively
 *     struggling. Tutor should simplify and reassure.
 *
 * 10 turns each so the level shift has room to play out.
 */

export function adaptiveDifficultySpecs(): TestSpec[] {
  return [
    {
      id: 'adaptive__pt-BR__ramps-up',
      category: 'adaptive-difficulty',
      language: 'pt-BR',
      // Declared as novice — learner will outgrow the level mid-convo.
      level: 'novice',
      persona: 'starts-low-improves',
      learnerGoal: 'Heading to Brazil in a few weeks — picking up the basics',
      numTurns: 10,
      rubric: 'adaptive-difficulty',
    },
    {
      id: 'adaptive__pt-BR__starts-high-stumbles',
      category: 'adaptive-difficulty',
      language: 'pt-BR',
      // Declared as advanced — learner will undershoot the level mid-convo.
      level: 'advanced',
      persona: 'starts-high-stumbles',
      learnerGoal: 'Lived in Brazil 5 years ago — getting back into it',
      numTurns: 10,
      rubric: 'adaptive-difficulty',
    },
  ]
}
