// Tutor registry. Add new tutors by importing them here and including in
// TUTORS. Everything else (picker UI, profile defaults, storage scoping)
// reads from this list.

import type { LanguageCode, Tutor, TutorId } from './types'
import { natalia } from './pt-br/natalia'
import { maria } from './es-MX/maria'

export const TUTORS: Tutor[] = [
  natalia,
  maria,
  // Coming next: Carlos (Madrid Spanish), Ana (Buenos Aires Spanish)
]

export const DEFAULT_TUTOR_ID: TutorId = 'pt-br-natalia'

export function getTutor(id: TutorId | undefined): Tutor {
  if (!id) return getTutorByIdOrThrow(DEFAULT_TUTOR_ID)
  return TUTORS.find((t) => t.id === id) ?? getTutorByIdOrThrow(DEFAULT_TUTOR_ID)
}

function getTutorByIdOrThrow(id: TutorId): Tutor {
  const tutor = TUTORS.find((t) => t.id === id)
  if (!tutor) throw new Error(`Tutor not found in registry: ${id}`)
  return tutor
}

/** All tutors for a given language code (used by the picker). */
export function tutorsForLanguage(language: LanguageCode): Tutor[] {
  return TUTORS.filter((t) => t.language === language)
}

/** All distinct languages currently supported by the registry. */
export function supportedLanguages(): LanguageCode[] {
  const seen = new Set<LanguageCode>()
  for (const t of TUTORS) seen.add(t.language)
  return Array.from(seen)
}

export type { LanguageCode, Tutor, TutorId } from './types'
