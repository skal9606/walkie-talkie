// Persistent vocab pool across Free Conversation sessions. The post-session
// review extracts `newVocabulary` (words/phrases the tutor introduced); we
// save them here so the next session's prompt can ask the tutor to weave
// them back in for spaced retrieval.
//
// Storage is scoped per tutor — Mexican Spanish vocab shouldn't bleed into
// a Brazilian Portuguese session and vice versa. Legacy unscoped data from
// before multi-tutor support is migrated to the default tutor on first read.

import type { TutorId } from './tutors/types'
import { DEFAULT_TUTOR_ID } from './tutors'

const LEGACY_KEY = 'walkie_vocab_v1'
const MAX_ITEMS = 10
const PROMPT_ITEMS = 5

export type VocabItem = {
  word: string
  translation: string
}

function storageKey(tutorId: TutorId): string {
  return `walkie_vocab_v2_${tutorId}`
}

/**
 * One-shot migration: pre-multi-tutor data lived under the global
 * walkie_vocab_v1 key. Move it to the default tutor's scope and forget.
 */
function migrateLegacyIfNeeded(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return
    const targetKey = storageKey(DEFAULT_TUTOR_ID)
    if (!localStorage.getItem(targetKey)) {
      localStorage.setItem(targetKey, raw)
    }
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // ignore
  }
}

function readRaw(tutorId: TutorId): VocabItem[] {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(storageKey(tutorId))
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

function writeRaw(tutorId: TutorId, items: VocabItem[]): void {
  try {
    localStorage.setItem(storageKey(tutorId), JSON.stringify(items))
  } catch {
    // localStorage can throw (private browsing / quota); swallow.
  }
}

export function loadVocab(tutorId: TutorId): VocabItem[] {
  return readRaw(tutorId)
}

/**
 * Merges new items in front (most-recent first), dedupes case-insensitively
 * by word, caps at MAX_ITEMS.
 */
export function addVocabItems(tutorId: TutorId, items: VocabItem[]): void {
  const cleanIncoming = items
    .map((v) => ({ word: v.word.trim(), translation: (v.translation ?? '').trim() }))
    .filter((v) => v.word.length > 0)
  if (cleanIncoming.length === 0) return

  const merged = [...cleanIncoming, ...readRaw(tutorId)]
  const seen = new Set<string>()
  const deduped: VocabItem[] = []
  for (const item of merged) {
    const key = item.word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
    if (deduped.length >= MAX_ITEMS) break
  }
  writeRaw(tutorId, deduped)
}

export function clearVocab(tutorId: TutorId): void {
  try {
    localStorage.removeItem(storageKey(tutorId))
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
