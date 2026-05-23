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
  'grammar-strict-adherence': {
    id: 'grammar-strict-adherence',
    intent: 'The learner explicitly set Grammar Strictness = STRICT. Did the tutor honor that setting and correct grammar mistakes every time, not just selectively?',
    dimensions: [
      {
        key: 'correction_coverage',
        question: 'Did the tutor correct AT LEAST ONE meaningful grammar error in EVERY tutor turn where the learner made one? (Strict mode requires per-turn correction, not selective.)',
        lowAnchor: 'Mostly let mistakes slide — same lax behavior as default',
        highAnchor: 'Caught and corrected a mistake on essentially every turn',
      },
      {
        key: 'correction_form',
        question: 'When correcting, did the tutor MODEL the corrected form clearly (e.g. "Ah, você FOI AO restaurante!") rather than just hinting?',
        lowAnchor: 'Vague hints or no corrected form shown',
        highAnchor: 'Always models the right form explicitly',
      },
      {
        key: 'flow_preservation',
        question: 'Even with strict correction, did the tutor preserve conversational flow (recasts within natural replies) rather than lecturing?',
        lowAnchor: 'Stop-and-explain that killed the conversation',
        highAnchor: 'Frequent corrections folded inside otherwise-natural replies',
      },
    ],
  },
  'grammar-lax-adherence': {
    id: 'grammar-lax-adherence',
    intent: 'The learner explicitly set Grammar Strictness = LAX. Did the tutor honor that and let minor slips slide, correcting only when meaning was at risk?',
    dimensions: [
      {
        key: 'restraint',
        question: 'Did the tutor RESTRAIN itself — letting small grammar slips pass without correction when meaning was clear?',
        lowAnchor: 'Corrected most or all mistakes anyway (ignored the setting)',
        highAnchor: 'Visibly held back; corrections rare and reserved for meaning breakdowns',
      },
      {
        key: 'meaning_threshold',
        question: 'When the tutor DID correct, was it because a Brazilian listener would have actually been confused — not just because the form was wrong?',
        lowAnchor: 'Corrected purely on form, not on communicative impact',
        highAnchor: 'Corrections were tied to genuine clarity issues',
      },
    ],
  },
  'pronunciation-strict-adherence': {
    id: 'pronunciation-strict-adherence',
    intent: 'The learner set Pronunciation Feedback = STRICT. The simulated learner is typing deliberately mis-pronounced phonetic spellings (kasa, muyto, etc.) as a text-mode proxy for audio mispronunciation. Did the tutor identify those AND ask the learner to retry the word?',
    dimensions: [
      {
        key: 'detected_mispronunciations',
        question: 'Did the tutor identify the phonetic mis-spellings as pronunciation issues (not grammar / not vocabulary)?',
        lowAnchor: 'Treated them as typos or ignored them entirely',
        highAnchor: 'Explicitly flagged them as pronunciation issues',
      },
      {
        key: 'retry_prompts',
        question: 'When flagging, did the tutor explicitly ask the learner to TRY THE WORD AGAIN (per the strict-mode directive: "gently stop and ask them to retry")?',
        lowAnchor: 'Just modeled the right form, no retry prompt',
        highAnchor: 'Consistently asked for a retry attempt',
      },
      {
        key: 'warmth_preserved',
        question: 'Did pronunciation correction stay warm and patient, not nitpicky or condescending?',
        lowAnchor: 'Felt like a drill sergeant',
        highAnchor: 'Patient coach tone preserved throughout',
      },
    ],
  },
  'pronunciation-honest-adherence': {
    id: 'pronunciation-honest-adherence',
    intent: 'Pronunciation Feedback = HONEST (middle setting). Tutor should model the correct pronunciation as a quick aside, then continue — NOT ask for retry.',
    dimensions: [
      {
        key: 'aside_corrections',
        question: 'Did the tutor model the correct pronunciation as a brief aside in its reply (and then continue the conversation)?',
        lowAnchor: 'Ignored mis-pronunciations OR did a full retry stop',
        highAnchor: 'Quick inline asides that named the right form',
      },
      {
        key: 'no_retry_stops',
        question: 'Did the tutor AVOID stopping the conversation to demand a retry (that\'s STRICT-mode behavior, not HONEST)?',
        lowAnchor: 'Repeatedly stopped to demand retry',
        highAnchor: 'Smooth — modeled and moved on every time',
      },
    ],
  },
  'pronunciation-forgiving-adherence': {
    id: 'pronunciation-forgiving-adherence',
    intent: 'Pronunciation Feedback = FORGIVING (default). Tutor should celebrate any recognizable attempt and NOT call out pronunciation slips at all.',
    dimensions: [
      {
        key: 'silence_on_pronunciation',
        question: 'Did the tutor STAY SILENT on pronunciation slips, not flagging them?',
        lowAnchor: 'Called out mispronunciations anyway (ignored the setting)',
        highAnchor: 'Made zero unsolicited pronunciation corrections',
      },
      {
        key: 'celebrates_attempts',
        question: 'Did the tutor warmly affirm recognizable attempts even when off?',
        lowAnchor: 'Neutral or corrective',
        highAnchor: 'Visibly celebratory of attempts',
      },
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
