// Persistent vocab pool across Free Conversation sessions. The post-session
// review extracts `newVocabulary` (words/phrases Natalia introduced); we save
// them here so the next session's prompt can ask Natalia to weave them back
// in for spaced retrieval.

const STORAGE_KEY = 'walkie_vocab_v1'
const MAX_ITEMS = 10
const PROMPT_ITEMS = 5

export type VocabItem = {
  word: string
  translation: string
}

function readRaw(): VocabItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is VocabItem =>
        v &&
        typeof v.word === 'string' &&
        v.word.trim().length > 0 &&
        typeof v.translation === 'string',
    )
  } catch {
    return []
  }
}

function writeRaw(items: VocabItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage can throw (private browsing / quota); swallow.
  }
}

export function loadVocab(): VocabItem[] {
  return readRaw()
}

/**
 * Merges new items in front (most-recent first), dedupes case-insensitively
 * by word, caps at MAX_ITEMS.
 */
export function addVocabItems(items: VocabItem[]): void {
  const cleanIncoming = items
    .map((v) => ({ word: v.word.trim(), translation: (v.translation ?? '').trim() }))
    .filter((v) => v.word.length > 0)
  if (cleanIncoming.length === 0) return

  const merged = [...cleanIncoming, ...readRaw()]
  const seen = new Set<string>()
  const deduped: VocabItem[] = []
  for (const item of merged) {
    const key = item.word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
    if (deduped.length >= MAX_ITEMS) break
  }
  writeRaw(deduped)
}

export function clearVocab(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Renders the vocab pool as a prompt block. Returns '' when empty so callers
 * can filter it out of the instructions array.
 */
export function buildVocabBlock(items: VocabItem[]): string {
  const top = items.slice(0, PROMPT_ITEMS)
  if (top.length === 0) return ''
  const lines = top.map((v) =>
    v.translation ? `- ${v.word} — ${v.translation}` : `- ${v.word}`,
  )
  return `VOCAB TO REWEAVE THIS SESSION
You introduced these words/phrases in earlier sessions. Try to bring 2–3 of them back into THIS conversation, naturally — in fresh contexts, not drilled. If the learner uses one of them themselves, react warmly to the meaning, don't congratulate them on the word.
${lines.join('\n')}`
}
