import type { Rubric, RubricId } from '../framework/types'

/**
 * Each rubric is a category-specific scoring grid. The judge fills in a
 * 1-5 score per dimension plus a one-sentence justification, then also
 * surfaces explicit "flags" — short ALL-CAPS strings that mark a hard
 * failure (e.g. TUTOR_OVER_CORRECTED). Flags are easier to scan than
 * scores when triaging dozens of runs.
 *
 * Persona/warmth dimensions are folded into every rubric since they're
 * always relevant — no separate persona category needed.
 */

const PERSONA_DIMENSIONS = [
  {
    key: 'warmth',
    question: 'Does the tutor feel warm and supportive, not clinical?',
    lowAnchor: 'Robotic / cold / textbook',
    highAnchor: 'Warm, encouraging, human',
  },
  {
    key: 'naturalness',
    question: 'Does the tutor sound like a real person, not an AI script?',
    lowAnchor: 'Repetitive AI patterns ("Great job!", "Let\'s continue!")',
    highAnchor: 'Sounds like a real conversation partner',
  },
  {
    key: 'curiosity',
    question: 'Does the tutor ask follow-ups that show genuine interest?',
    lowAnchor: 'Generic, scripted questions',
    highAnchor: 'Specific follow-ups tied to what the learner said',
  },
]

export const RUBRICS: Record<RubricId, Rubric> = {
  'level-calibration': {
    id: 'level-calibration',
    intent: 'Did the tutor stay at the right CEFR level for the declared learner level?',
    dimensions: [
      {
        key: 'level_match',
        question:
          'Does the tutor\'s output match the declared level (first-timer=mostly native lang + simple target phrases; beginner=simple target; intermediate=mostly target with B1 vocab; advanced=rich target with C1 nuance)?',
        lowAnchor: 'Wrong level — too hard or too easy',
        highAnchor: 'Spot-on for the declared level',
      },
      {
        key: 'response_length',
        question: 'For first-timer/beginner, are responses short (1-2 sentences)? For advanced, can responses be richer?',
        lowAnchor: 'Wrong length for the level',
        highAnchor: 'Appropriate length for the level',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
  'over-correction': {
    id: 'over-correction',
    intent: 'Did the tutor correct selectively, not on every error?',
    dimensions: [
      {
        key: 'correction_selectivity',
        question: 'Of all learner mistakes, did the tutor address only the most pedagogically important ones (1-2 per turn max)?',
        lowAnchor: 'Corrected every mistake — interview vibe',
        highAnchor: 'Selective, prioritized meaningful errors',
      },
      {
        key: 'flow_preservation',
        question: 'Did corrections preserve conversational flow (inline recasts, not stop-and-explain lectures)?',
        lowAnchor: 'Killed flow with explanations',
        highAnchor: 'Recast inside a natural response',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
  'confusion-recovery': {
    id: 'confusion-recovery',
    intent: 'When the learner said "I don\'t understand" / "can you slow down" / "what does X mean?", did the tutor respond appropriately?',
    dimensions: [
      {
        key: 'help_appropriateness',
        question: 'Did the tutor simplify, translate, or slow down when asked?',
        lowAnchor: 'Ignored the confusion or kept going the same way',
        highAnchor: 'Responded helpfully — translated, simplified, or rephrased',
      },
      {
        key: 'no_shaming',
        question: 'Did the tutor avoid making the learner feel bad about not understanding?',
        lowAnchor: 'Condescending or impatient',
        highAnchor: 'Patient and supportive',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
  momentum: {
    id: 'momentum',
    intent: 'Did the conversation feel like a real chat, or an interview script?',
    dimensions: [
      {
        key: 'topic_continuity',
        question: 'Did the tutor build on previous turns instead of resetting topics randomly?',
        lowAnchor: 'Random topic resets, no thread',
        highAnchor: 'Strong topical thread across turns',
      },
      {
        key: 'callbacks',
        question: 'Did the tutor reference earlier learner details (mom\'s name, planned trip, hobby)?',
        lowAnchor: 'No callbacks, generic',
        highAnchor: 'Specific callbacks that show listening',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
  repetition: {
    id: 'repetition',
    intent: 'Over a 15-turn conversation, did the tutor avoid repeating canned AI phrases?',
    dimensions: [
      {
        key: 'phrase_diversity',
        question: 'Are encouragement / follow-up patterns varied across turns? Flag if "Great job!", "Let\'s continue!", "Can you tell me more?" appear 3+ times.',
        lowAnchor: 'Same phrases 3+ times',
        highAnchor: 'Varied, natural phrasing',
      },
      {
        key: 'question_diversity',
        question: 'Are follow-up questions varied or templated?',
        lowAnchor: 'Same question shape every turn',
        highAnchor: 'Mix of open / closed / playful follow-ups',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
  'code-switching': {
    id: 'code-switching',
    intent: 'When the learner mixed languages, did the tutor handle it gracefully?',
    dimensions: [
      {
        key: 'no_full_english_switch',
        question: 'Did the tutor stay in the target language (with minimal English support) rather than fully switching to English?',
        lowAnchor: 'Switched fully to English unnecessarily',
        highAnchor: 'Stayed on the target language gracefully',
      },
      {
        key: 'no_shaming',
        question: 'Did the tutor avoid scolding or correcting the code-switch itself?',
        lowAnchor: 'Made learner feel bad about mixing',
        highAnchor: 'Treated mixing as normal',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
  'adaptive-difficulty': {
    id: 'adaptive-difficulty',
    intent: 'When the learner\'s level shifted mid-conversation (up or down), did the tutor adapt?',
    dimensions: [
      {
        key: 'adaptation',
        question: 'Did the tutor scale difficulty up when the learner improved, OR down when the learner started struggling?',
        lowAnchor: 'Stayed at one level, ignored the shift',
        highAnchor: 'Smoothly scaled difficulty in the right direction',
      },
      {
        key: 'no_overshoot',
        question: 'Did the tutor avoid swinging too far (e.g. from beginner to PhD-level overnight)?',
        lowAnchor: 'Overshot — too much, too fast',
        highAnchor: 'Gradual, calibrated step changes',
      },
      ...PERSONA_DIMENSIONS,
    ],
  },
}
