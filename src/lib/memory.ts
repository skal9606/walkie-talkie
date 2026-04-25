// Persistent memory across Free Conversation sessions. Lives in localStorage
// (per device) — short factual bullets about the learner that the next
// session's opener can reference. Capped + deduped so it doesn't grow
// unbounded.

const STORAGE_KEY = 'walkie_memory_v1'
const MAX_ITEMS = 10

export type Memory = string[]

function readRaw(): Memory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  } catch {
    return []
  }
}

function writeRaw(memory: Memory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // localStorage can throw (private browsing / quota); swallow.
  }
}

export function loadMemory(): Memory {
  return readRaw()
}

/**
 * Merges new items into stored memory, with most-recent first. Dedupes
 * case-insensitively and caps at MAX_ITEMS.
 */
export function addMemoryItems(items: string[]): void {
  const cleanIncoming = items
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (cleanIncoming.length === 0) return

  const merged = [...cleanIncoming, ...readRaw()]
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const item of merged) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
    if (deduped.length >= MAX_ITEMS) break
  }
  writeRaw(deduped)
}

export function clearMemory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
