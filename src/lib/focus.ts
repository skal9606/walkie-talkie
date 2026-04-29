// Persistent "next-session focus" — a one-line steering hint extracted by
// the post-session review. Natalia uses it silently to bias topic and form
// choices in the next free conversation. NOT shown to the learner; not
// announced as a lesson plan.

const STORAGE_KEY = 'walkie_focus_v1'
const MAX_LENGTH = 200

export function loadFocus(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'string') return null
    const trimmed = parsed.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

export function saveFocus(focus: string): void {
  const trimmed = focus.trim().slice(0, MAX_LENGTH)
  if (!trimmed) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // ignore
  }
}

export function clearFocus(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Renders the focus as a prompt block. Returns '' when empty so callers can
 * filter it out of the instructions array.
 */
export function buildFocusBlock(focus: string | null): string {
  if (!focus) return ''
  return `SESSION FOCUS (silent — do not announce)
Steer this conversation toward the focus below WITHOUT telling the learner about it. Don't say "today we'll work on X" — just naturally bias your questions, topics, and language choices to give them more reps on it. If the learner takes the conversation somewhere else they're excited about, follow them — the focus is a nudge, not a cage.
- ${focus}`
}
