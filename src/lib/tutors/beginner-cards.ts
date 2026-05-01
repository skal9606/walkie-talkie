import type { BeginnerCard, BeginnerTopic } from './types'

function stripDiacritics(s: string): string {
  // Decompose to base + combining marks, then strip the marks (U+0300–U+036F).
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Returns the first card whose `word` (or any alias) appears as a discrete
 * token in `text`, excluding any whose word is already in `seen`. Token
 * boundaries are whitespace, common punctuation, and curly quotes — so
 * "água!" matches "água" but "águamonster" would not.
 *
 * Matches in two passes: an exact pass first, then a diacritic-stripped
 * fallback (so "agua" matches the "água" card when the EN-pinned
 * transcription drops the accent at complete-beginner level). The
 * stripped pass is gated to card words longer than 2 characters to avoid
 * collisions like Spanish "sí" (yes) → "si" (if).
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
  const rawTokens = new Set(
    text
      .toLowerCase()
      .split(/[\s.,!?;:()…—–"‘’“”]+/u)
      .filter(Boolean),
  )
  const strippedTokens = new Set(
    Array.from(rawTokens).map((t) => stripDiacritics(t)),
  )
  for (const card of cards) {
    if (seen.has(card.word)) continue
    // 1. Exact match (preserves diacritics — preferred when transcript is
    //    pinned to the target language and renders accents correctly).
    if (rawTokens.has(card.word)) return card
    if (card.aliases?.some((a) => rawTokens.has(a.toLowerCase()))) return card
    // 2. Diacritic-stripped fallback for longer words. Catches the common
    //    case of EN-pinned transcripts dropping accents on target-language
    //    words ("familia" instead of "família"). Skip ≤2-char card words
    //    where stripping creates collisions (sí↔si, etc.).
    if (card.word.length > 2) {
      const strippedWord = stripDiacritics(card.word)
      if (strippedWord !== card.word && strippedTokens.has(strippedWord)) {
        return card
      }
    }
    if (card.aliases) {
      for (const alias of card.aliases) {
        if (alias.length > 2) {
          const strippedAlias = stripDiacritics(alias.toLowerCase())
          if (
            strippedAlias !== alias.toLowerCase() &&
            strippedTokens.has(strippedAlias)
          ) {
            return card
          }
        }
      }
    }
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

/**
 * Renders the topic-selection block for a complete-beginner system prompt.
 * Each session is themed around ONE topic the model picks based on what
 * the learner shares — modeled on Duolingo's Section 1 unit structure
 * (Order at a cafe / Identify family members / Find places in the city /
 * etc). Themed sessions feel cohesive and earn a clearer "you covered
 * this" beat at the end vs. open-ended drift.
 */
export function buildBeginnerTopicsPromptBlock(
  topics: readonly BeginnerTopic[],
): string {
  if (topics.length === 0) return ''
  const list = topics
    .map(
      (t) =>
        `  - ${t.title} — fits when: ${t.matchHint}. Lean on these words: ${t.cardWords.join(', ')}.`,
    )
    .join('\n')
  return `TOPIC FOR THIS SESSION (PICK ONE FROM THE LIST BELOW)
- After hearing the learner's reason for learning (their answer to the opener), pick ONE topic from the list below that best fits what they shared. Stay focused on that single topic for the rest of the session.
- The topic narrows the priority vocabulary you should surface — pull from THAT topic's word list first, even though the full priority list above is technically available.
- Topics:
${list}
- If their reason is generic ("just for fun", "I'm curious") or unclear, default to "Greet and say goodbye".
- DO NOT announce the topic ("today we're going to talk about cafes"). Just steer naturally — the topic is invisible scaffolding.
- ONE topic per session, not a tour of three. Cohesion over coverage at this level.`
}
