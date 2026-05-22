import type { TestSpec } from '../framework/types'

/**
 * Confusion-recovery tests. Inject scripted "I don't understand" /
 * "what does that mean?" / "can you say that slower?" utterances at
 * specific turns and check whether the tutor simplifies, translates,
 * or repeats appropriately — without shaming the learner.
 *
 * scriptedTurns override the persona-generated reply at exact indices.
 */

export function confusionRecoverySpecs(): TestSpec[] {
  return [
    {
      id: 'confusion-recovery__pt-BR__complete-beginner',
      category: 'confusion-recovery',
      language: 'pt-BR',
      level: 'complete-beginner',
      persona: 'confused-asks-for-help',
      learnerGoal: 'First trip to Brazil next month — total beginner',
      numTurns: 6,
      rubric: 'confusion-recovery',
      scriptedTurns: {
        1: "I don't understand. What did you just say?",
        3: 'Can you say that slower? You speak fast.',
        5: 'What does that word mean? Can you translate?',
      },
    },
    {
      id: 'confusion-recovery__pt-BR__intermediate',
      category: 'confusion-recovery',
      language: 'pt-BR',
      level: 'intermediate',
      persona: 'intermediate-fluent-ish',
      learnerGoal: 'Living in São Paulo for work',
      numTurns: 6,
      rubric: 'confusion-recovery',
      scriptedTurns: {
        2: 'Desculpe, não entendi essa última parte. Pode repetir?',
        4: 'O que significa esta palavra exatamente? Pode explicar em inglês?',
      },
    },
  ]
}
