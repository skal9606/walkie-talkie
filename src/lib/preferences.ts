// Settings the learner controls from the Settings panel: tutor behavior
// (formality, grammar strictness) and UI theme. Stored in localStorage.

const STORAGE_KEY = 'walkie_preferences_v1'

export type Formality = 'casual' | 'neutral' | 'formal'
export type Strictness = 'lax' | 'strict'
export type Theme = 'dark' | 'light'

export type Preferences = {
  formality: Formality
  strictness: Strictness
  theme: Theme
}

export const DEFAULT_PREFERENCES: Preferences = {
  formality: 'casual',
  strictness: 'lax',
  theme: 'dark',
}

function isFormality(v: unknown): v is Formality {
  return v === 'casual' || v === 'neutral' || v === 'formal'
}
function isStrictness(v: unknown): v is Strictness {
  return v === 'lax' || v === 'strict'
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
      '- Grammar strictness: STRICT. Override the usual "minor slips slide" default. Recast or briefly correct meaningful grammar errors (verb tense, gender/agreement, prepositions) every time they happen, with the corrected form modeled clearly. The learner has explicitly asked for tighter feedback.',
    )
  } else {
    lines.push(
      '- Grammar strictness: LAX. Default behavior — let minor slips slide if the meaning came through. Recast only when a Brazilian listener would actually be confused.',
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
