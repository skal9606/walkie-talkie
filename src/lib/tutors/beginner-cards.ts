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
  return `PRIORITY VOCABULARY (THE CARDS)
- A small visual flashcard (image + word + audio replay) pops up on the learner's screen the INSTANT you say one of the following target-language words. These cards are how the learner sees the written word, hears your pronunciation, and gets a clean image association — they're the primary learning loop at the complete-beginner level.
- THE PRIORITY LIST: ${list}.
- When you sprinkle a target-language word into a turn (per the rules above), it should ALMOST ALWAYS come from this list. Other target-language words are fine occasionally but produce no visual card — the learner gets less value from them.
- TRIGGER YOUR FIRST CARD EARLY — by your second or third turn at the latest. After the opener (which is 100% English), the next time you have a natural reason to introduce a noun, pick a priority word and let the card pop. The learner needs to see this happen early to understand that this app is different from chat-only voice tutors.
- Don't announce the card. Don't say "watch the screen", "see the picture", or "a card just appeared". The card is the learner's reward — they'll notice it themselves.
- Aim for 4–6 different cards over a 5-minute session, paced naturally — never as a checklist, never two in the same turn.`
}
