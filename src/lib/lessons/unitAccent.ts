// Lesson accent color. Previously varied per unit (16 different hues:
// sky/violet/rose/mint/gold/periwinkle/coral/teal/orchid/tangerine/
// sage/crimson/slate-blue/forest/burnt-orange) so units felt visually
// distinct. That polychrome approach fought the Option B warm palette
// — each lesson card looked like a different brand. Standardized on
// the single brand accent (peach #FFB26B) so every lesson card reads
// as "the same app."
//
// Variety now comes from the lesson emoji + title, not the color.
//
// Kept the API shape (unitAccentRGB / unitAccentCSS) so the existing
// callers in LessonCards / LessonDetail don't need to change.

import type { Lesson, LessonUnit } from './types'

export type RGB = [number, number, number]

// #FFB26B in 0..1 floats — matches iOS Theme.accent + the
// AccentColor.colorset value, so web and iOS share one number.
const ACCENT: RGB = [1.0, 0.698, 0.420]

export function unitAccentRGB(_: Lesson | LessonUnit): RGB {
  return ACCENT
}

/** Build a CSS rgba() string with the given opacity (0..1). */
export function unitAccentCSS(lessonOrUnit: Lesson | LessonUnit, opacity = 1): string {
  const [r, g, b] = unitAccentRGB(lessonOrUnit)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`
}
