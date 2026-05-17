// Per-unit color palette. Mirrors UnitAccent.swift exactly so iOS and
// web share the same visual language for each unit. Muted on purpose —
// bright saturation would compete with the accent CTA + Free Talk
// button.
//
// Each color is a 3-channel array [r, g, b] in 0..1, ready for CSS rgb().

import type { Lesson, LessonUnit } from './types'

export type RGB = [number, number, number]

const PALETTE: Record<string, RGB> = {
  'ft-1': [0.40, 0.75, 0.95], // sky
  'ft-2': [0.98, 0.65, 0.36], // amber
  'ft-3': [0.68, 0.52, 0.95], // violet
  'ft-4': [0.96, 0.46, 0.62], // rose
  'b-1':  [0.45, 0.82, 0.66], // mint
  'b-2':  [0.95, 0.74, 0.40], // gold
  'b-3':  [0.62, 0.70, 0.95], // periwinkle
  'b-4':  [0.96, 0.55, 0.50], // coral
  'i-1':  [0.50, 0.85, 0.90], // teal
  'i-2':  [0.80, 0.55, 0.95], // orchid
  'i-3':  [0.95, 0.62, 0.45], // tangerine
  'i-4':  [0.60, 0.80, 0.55], // sage
}

const FALLBACK: RGB = [0.20, 0.85, 0.62] // matches iOS AccentColor

function unitPrefix(lessonOrUnit: { id: string }): string {
  return lessonOrUnit.id.split('-').slice(0, 2).join('-')
}

export function unitAccentRGB(lessonOrUnit: Lesson | LessonUnit): RGB {
  return PALETTE[unitPrefix(lessonOrUnit)] ?? FALLBACK
}

/** Build a CSS rgba() string with the given opacity (0..1). */
export function unitAccentCSS(lessonOrUnit: Lesson | LessonUnit, opacity = 1): string {
  const [r, g, b] = unitAccentRGB(lessonOrUnit)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`
}
