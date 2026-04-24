// Learner profile captured during onboarding. Persisted in localStorage so a
// returning anonymous user skips the onboarding screens. The profile is also
// threaded into the tutor prompt for a personalized opener.

import type { Level } from './scenarios'

const STORAGE_KEY = 'walkie_profile_v1'

export type LearnerProfile = {
  name: string
  level: Level
}

function isLevel(v: unknown): v is Level {
  return (
    v === 'complete-beginner' ||
    v === 'novice' ||
    v === 'intermediate' ||
    v === 'advanced'
  )
}

export function loadProfile(): LearnerProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { name?: unknown; level?: unknown }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) return null
    if (!isLevel(parsed.level)) return null
    return { name: parsed.name.trim(), level: parsed.level }
  } catch {
    return null
  }
}

export function saveProfile(profile: LearnerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // localStorage can throw in private-browsing / quota-exceeded scenarios;
    // the user just sees onboarding again next visit.
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
