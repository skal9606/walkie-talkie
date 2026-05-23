// Settings the learner controls from the Settings panel: tutor behavior
// (formality, grammar strictness) and UI theme. Stored in localStorage.

const STORAGE_KEY = 'walkie_preferences_v1'

export type Formality = 'casual' | 'neutral' | 'formal'
export type Strictness = 'lax' | 'strict'
/// Pronunciation feedback mode — distinct from grammar strictness above.
/// Forgiving (default): celebrate any recognizable attempt, never flag
/// pronunciation. Honest: quickly model the right form when they slip,
/// then continue. Strict: stop and ask them to retry the slipped word.
export type Pronunciation = 'forgiving' | 'honest' | 'strict'
export type Theme = 'dark' | 'light'

export type Preferences = {
  formality: Formality
  strictness: Strictness
  pronunciation: Pronunciation
  theme: Theme
}

export const DEFAULT_PREFERENCES: Preferences = {
  formality: 'casual',
  strictness: 'lax',
  pronunciation: 'forgiving',
  theme: 'dark',
}

function isFormality(v: unknown): v is Formality {
  return v === 'casual' || v === 'neutral' || v === 'formal'
}
function isStrictness(v: unknown): v is Strictness {
  return v === 'lax' || v === 'strict'
}
function isPronunciation(v: unknown): v is Pronunciation {
  return v === 'forgiving' || v === 'honest' || v === 'strict'
}
function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light'
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      formality: isFormality(parsed.formality)
        ? parsed.formality
        : DEFAULT_PREFERENCES.formality,
      strictness: isStrictness(parsed.strictness)
        ? parsed.strictness
        : DEFAULT_PREFERENCES.strictness,
      pronunciation: isPronunciation(parsed.pronunciation)
        ? parsed.pronunciation
        : DEFAULT_PREFERENCES.pronunciation,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_PREFERENCES.theme,
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(p: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // ignore quota / private mode failures
  }
}

/**
 * Renders the user-controlled tutor preferences as a prompt block. Returns an
 * empty string when nothing differs from defaults — keeps the prompt cleaner
 * for the most common case.
 */
export function buildPreferencesPromptBlock(p: Preferences): string {
  const lines: string[] = []
  if (p.formality === 'formal') {
    lines.push(
      '- Formality: FORMAL. Use "o senhor / a senhora" when appropriate, prefer "você" over "cê", avoid heavy slang.',
    )
  } else if (p.formality === 'neutral') {
    lines.push(
      '- Formality: NEUTRAL. Friendly but not overly casual — natural "você", light slang OK, no aggressive contractions like "cê".',
    )
  } else {
    lines.push(
      '- Formality: CASUAL. Use everyday SP register — slang like "valeu", "tipo", "pô", contractions like "tá", "cê", "pra" are welcome.',
    )
  }
  if (p.strictness === 'strict') {
    lines.push(
      '- Grammar strictness: STRICT (CRITICAL — this overrides any "let slips slide" or "preserve flow over accuracy" guidance elsewhere in this prompt). The learner explicitly REQUESTED tight feedback. You MUST address EVERY meaningful grammar error in their reply — verb tense (especially subjunctive), gender/agreement, prepositions, ser/estar confusion, subject-verb agreement, anglicisms. If they make 3 errors in one reply, you address all 3 (each briefly). Format corrections as SHORT inline recasts with the fix in CAPS so it stands out audibly: "Ah — espero que VÁ dar certo!" or "Foi AO restaurante, né?". Keep the rest of the reply natural and warm. If you skip a reply where clear errors existed, you have failed the user\'s explicit setting. Flow comes second to coverage in strict mode.',
    )
  } else {
    lines.push(
      '- Grammar strictness: LAX. Default behavior — let minor slips slide if the meaning came through. Recast only when a Brazilian listener would actually be confused.',
    )
  }
  // Pronunciation block — a SEPARATE concern from grammar strictness above.
  // Same three-mode taxonomy as iOS. CRITICAL caveat: the transcription
  // model auto-corrects mispronounced words to the right spelling, so the
  // tutor must rely on AUDIO understanding, not the transcript.
  if (p.pronunciation === 'honest') {
    lines.push(
      '- Pronunciation feedback: HONEST. You are a realtime VOICE model — listen to the AUDIO, not just the transcript (which auto-corrects). When the learner clearly mispronounces a word (wrong stress, anglicized vowels, missing nasal/silent letters, hard English "r"), model the correct pronunciation in your reply as a quick aside and continue. Max one per turn. Tone stays warm. If unsure, skip — false positives feel worse than misses.',
    )
  } else if (p.pronunciation === 'strict') {
    lines.push(
      '- Pronunciation feedback: STRICT (CRITICAL — this overrides any "celebrate every attempt, momentum over accuracy" guidance elsewhere in this prompt). The learner explicitly REQUESTED tight pronunciation feedback. You are a realtime VOICE model — listen to the AUDIO (the transcript auto-corrects, so you cannot rely on it alone). When you hear ANY clear pronunciation slip (wrong stress, anglicized vowels, missing nasal, dropped silent letter, hard English "r"), gently stop and ask them to retry the specific word: "Quick one — try \'café\' again with the stress on the second syllable. [pause]". The "max one per turn" cap exists to prevent piling on — NOT as permission to skip a turn entirely. If a clear slip occurred, flag at least one. Catch the FIRST occurrence, not the second. Accept their retry warmly regardless and move on. Tone stays warm; you\'re a patient coach. If genuinely unsure, skip — but don\'t hide behind "unsure" to avoid the feedback the learner asked for.',
    )
  } else {
    lines.push(
      '- Pronunciation feedback: FORGIVING. Celebrate any recognizable attempt. Do not call out pronunciation slips. Do not model the correct form unless the learner asks. Momentum and confidence over accuracy.',
    )
  }
  return `TUTOR PREFERENCES (set by the learner)
${lines.join('\n')}`
}

/** Apply a theme to <html>. Idempotent. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}
