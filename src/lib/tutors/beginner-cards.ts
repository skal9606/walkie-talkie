import type { BeginnerCard } from './types'

/**
 * Returns the first card whose `word` (or any alias) appears as a discrete
 * token in `text`, excluding any whose word is already in `seen`. Token
 * boundaries are whitespace, common punctuation, and curly quotes — so
 * "água!" matches "água" but "águamonster" would not.
 *
 * Designed to be called repeatedly with the cumulative tutor turn text as
 * Realtime audio_transcript deltas arrive. The `seen` set is the caller's
 * way of preventing the same card from re-firing within a session.
 */
export function findBeginnerCardInText(
  text: string,
  cards: readonly BeginnerCard[],
  seen: Set<string>,
): BeginnerCard | null {
  if (!text || cards.length === 0) return null
  const tokens = new Set(
    text
      .toLowerCase()
      .split(/[\s.,!?;:()…—–"‘’“”]+/u)
      .filter(Boolean),
  )
  for (const card of cards) {
    if (seen.has(card.word)) continue
    if (tokens.has(card.word)) return card
    if (card.aliases?.some((a) => tokens.has(a.toLowerCase()))) return card
  }
  return null
}

/**
 * Renders the priority-vocabulary block for a complete-beginner system
 * prompt. Lists each card's word so the model knows which words trigger a
 * visual card on the learner's screen.
 */
export function buildBeginnerCardsPromptBlock(
  cards: readonly BeginnerCard[],
): string {
  if (cards.length === 0) return ''
  const list = cards.map((c) => c.word).join(', ')
  return `PRIORITY VOCABULARY (a visual card appears for these)
- The UI shows a small image card the moment you say one of these specific target-language words. Lean toward them when introducing a noun for the first time, but don't force any of them — they should fit what the learner is talking about:
  ${list}.
- Don't announce the card. Don't say "watch the screen" or "see the picture." The card is the learner's reward — they'll notice it themselves.
- Aim for 3–5 of these over a 5-minute session, woven naturally into the conversation. Not all at once. Not as a checklist.`
}
