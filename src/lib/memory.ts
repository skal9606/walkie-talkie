// Persistent memory across Free Conversation sessions. Lives in localStorage
// (per device) — short factual bullets about the learner that the next
// session's opener can reference. Capped + deduped so it doesn't grow
// unbounded.
//
// Storage is scoped per tutor — facts the learner shared with their PT tutor
// (sister in Salvador, etc.) shouldn't suddenly appear in their ES tutor's
// opener. Legacy unscoped data is migrated to the default tutor on first read.

import type { TutorId } from './tutors/types'
import { DEFAULT_TUTOR_ID } from './tutors'

const LEGACY_KEY = 'walkie_memory_v1'
const MAX_ITEMS = 10

export type Memory = string[]

function storageKey(tutorId: TutorId): string {
  return `walkie_memory_v2_${tutorId}`
}

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

function readRaw(tutorId: TutorId): Memory {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(storageKey(tutorId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  } catch {
    return []
  }
}

function writeRaw(tutorId: TutorId, memory: Memory): void {
  try {
    localStorage.setItem(storageKey(tutorId), JSON.stringify(memory))
  } catch {
    // localStorage can throw (private browsing / quota); swallow.
  }
}

export function loadMemory(tutorId: TutorId): Memory {
  return readRaw(tutorId)
}

/**
 * Merges new items into stored memory, with most-recent first. Dedupes
 * case-insensitively and caps at MAX_ITEMS.
 */
export function addMemoryItems(tutorId: TutorId, items: string[]): void {
  const cleanIncoming = items
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (cleanIncoming.length === 0) return

  const merged = [...cleanIncoming, ...readRaw(tutorId)]
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const item of merged) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
    if (deduped.length >= MAX_ITEMS) break
  }
  writeRaw(tutorId, deduped)
}

export function clearMemory(tutorId: TutorId): void {
  try {
    localStorage.removeItem(storageKey(tutorId))
  } catch {
    // ignore
  }
}
