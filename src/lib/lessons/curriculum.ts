import { lessonById, unitsForLevel } from './catalog'
import type { Lesson, LessonLevel } from './types'

/// Hand-curated tag set per lesson. Mirror of iOS LessonTags.swift —
/// keep both files in sync so cross-platform recommendations match.
const TAGS: Record<string, string[]> = {
  // First Timer
  'ft-1-1': ['greetings', 'basics'],
  'ft-1-2': ['greetings', 'basics', 'social', 'work'],
  'ft-1-3': ['greetings', 'basics', 'social'],
  'ft-2-1': ['food', 'travel', 'daily-life'],
  'ft-2-2': ['shopping', 'travel', 'daily-life'],
  'ft-2-3': ['basics', 'social'],
  'ft-3-1': ['travel', 'navigation', 'daily-life'],
  'ft-3-2': ['travel', 'navigation'],
  'ft-3-3': ['basics', 'travel'],
  'ft-4-1': ['family', 'social'],
  'ft-4-2': ['social', 'basics'],
  'ft-4-3': ['work', 'professional', 'social'],
  // Basic
  'b-1-1': ['travel', 'shopping', 'social'],
  'b-1-2': ['shopping', 'daily-life'],
  'b-1-3': ['shopping', 'food', 'travel'],
  'b-2-1': ['food', 'social', 'family'],
  'b-2-2': ['social', 'dating', 'culture'],
  'b-2-3': ['social', 'dating', 'daily-life'],
  'b-3-1': ['family', 'social'],
  'b-3-2': ['family', 'social'],
  'b-3-3': ['family', 'social'],
  'b-4-1': ['travel'],
  'b-4-2': ['daily-life', 'work'],
  'b-4-3': ['social', 'dating', 'travel'],
  // Intermediate
  'i-1-1': ['storytelling', 'social', 'daily-life'],
  'i-1-2': ['opinions', 'debate', 'social'],
  'i-1-3': ['opinions', 'social', 'work'],
  'i-2-1': ['complaints', 'travel', 'daily-life'],
  'i-2-2': ['social', 'work', 'daily-life'],
  'i-2-3': ['shopping', 'travel', 'work'],
  'i-3-1': ['social', 'dating', 'work'],
  'i-3-2': ['work', 'professional'],
  'i-3-3': ['social', 'family'],
  'i-4-1': ['culture', 'travel', 'social'],
  'i-4-2': ['travel', 'storytelling'],
  'i-4-3': ['travel', 'social', 'food'],
  // Advanced
  'a-1-1': ['opinions', 'debate', 'work'],
  'a-1-2': ['opinions', 'debate'],
  'a-1-3': ['opinions', 'debate', 'culture'],
  'a-2-1': ['storytelling'],
  'a-2-2': ['storytelling', 'family', 'social'],
  'a-2-3': ['culture', 'dating', 'social'],
  'a-3-1': ['work', 'professional', 'social'],
  'a-3-2': ['work', 'professional'],
  'a-3-3': ['work', 'professional', 'opinions'],
  'a-4-1': ['culture', 'travel'],
  'a-4-2': ['culture', 'opinions'],
  'a-4-3': ['culture', 'social'],
}

/// Goal-keyword → tag map. Mirror of iOS CurriculumRecommender. Case-
/// insensitive substring match on the goals text — "Brazil" matches
/// "going to Brazil for work" without exact-word matching.
const GOAL_KEYWORDS: { keywords: string[]; tags: string[] }[] = [
  {
    keywords: [
      'travel', 'trip', 'vacation', 'vacationing', 'holiday', 'abroad',
      'visit', 'visiting', 'tourist', 'tourism', 'going to',
      'brazil', 'portugal', 'mexico', 'spain', 'italy', 'france', 'germany',
      'sao paulo', 'são paulo', 'rio', 'lisbon', 'madrid', 'mexico city',
      'barcelona', 'rome', 'milan', 'paris', 'berlin', 'munich',
    ],
    tags: ['travel', 'navigation'],
  },
  {
    keywords: [
      'family', 'wife', 'husband', 'partner', 'spouse', 'girlfriend',
      'boyfriend', 'kids', 'children', 'parents', 'in-law', 'mother-in-law',
      'father-in-law', 'relatives', 'grandparent', 'abuela', 'abuelo',
    ],
    tags: ['family', 'social'],
  },
  {
    keywords: [
      'work', 'job', 'career', 'business', 'office', 'professional',
      'meeting', 'colleague', 'client', 'boss', 'industry', 'company',
      'remote', 'consulting', 'project',
    ],
    tags: ['work', 'professional'],
  },
  {
    keywords: ['food', 'eat', 'eating', 'cook', 'cooking', 'restaurant', 'café', 'cafe', 'cuisine'],
    tags: ['food'],
  },
  {
    keywords: ['dating', 'date', 'romance', 'love', 'social', 'friends', 'friendships', 'bar', 'drinks'],
    tags: ['dating', 'social'],
  },
  {
    keywords: ['culture', 'music', 'art', 'movies', 'film', 'history', 'literature', 'books'],
    tags: ['culture'],
  },
  {
    keywords: ['live', 'living', 'moving to', 'moved to', 'expat', 'daily life', 'every day'],
    tags: ['daily-life', 'social'],
  },
]

export function tagsForLesson(lessonId: string): Set<string> {
  return new Set(TAGS[lessonId] ?? [])
}

/// Pick up to `limit` lessons that match the learner's goals, scored
/// by tag overlap. Empty string / no matching tags → empty array,
/// caller hides the section entirely.
export function recommendForGoals(args: {
  goals: string | null | undefined
  level: LessonLevel
  completedLessonIds: Set<string>
  limit?: number
}): Lesson[] {
  const goalText = (args.goals ?? '').toLowerCase()
  if (!goalText.trim()) return []

  const matchedTags = new Set<string>()
  for (const entry of GOAL_KEYWORDS) {
    if (entry.keywords.some((k) => goalText.includes(k))) {
      for (const t of entry.tags) matchedTags.add(t)
    }
  }
  if (matchedTags.size === 0) return []

  const candidates = unitsForLevel(args.level)
    .flatMap((u) => u.lessons)
    .filter((l) => !args.completedLessonIds.has(l.id))

  const scored = candidates
    .map((lesson) => ({
      lesson,
      score: [...tagsForLesson(lesson.id)].filter((t) => matchedTags.has(t)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, args.limit ?? 5).map((x) => x.lesson)
}

// Re-export for unused-import suppression in the web Lessons surface.
void lessonById
