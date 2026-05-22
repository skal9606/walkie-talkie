import type { LanguageCode } from '../../src/lib/tutors/types'
import type { Level } from '../../src/lib/scenarios'

export type { LanguageCode, Level }

export type TranscriptTurn = {
  role: 'tutor' | 'learner'
  content: string
}

/** A self-contained spec the runner can execute. */
export type TestSpec = {
  id: string
  category: TestCategory
  language: LanguageCode
  level: Level
  /** Learner persona key from learner-personas.ts. */
  persona: string
  /** Optional one-time goal/motivation injected into the tutor prompt context. */
  learnerGoal?: string
  /** Optional learner name (defaults to "Alex"). */
  learnerName?: string
  /** How many learner turns the conversation runs for. */
  numTurns: number
  /** Which rubric the judge applies to the transcript. */
  rubric: RubricId
  /**
   * Optional canned learner utterances to inject at specific turn indices.
   * Useful for tests like confusion-recovery where the input must contain
   * "I don't understand" verbatim.
   */
  scriptedTurns?: Record<number, string>
}

export type TestCategory =
  | 'level-calibration'
  | 'over-correction'
  | 'confusion-recovery'
  | 'momentum'
  | 'repetition'
  | 'code-switching'
  | 'adaptive-difficulty'

export type RubricId =
  | 'level-calibration'
  | 'over-correction'
  | 'confusion-recovery'
  | 'momentum'
  | 'repetition'
  | 'code-switching'
  | 'adaptive-difficulty'

export type RubricDimension = {
  key: string
  /** Question the judge answers, e.g. "Did the tutor over-correct?". */
  question: string
  /** Low end of scale (1). */
  lowAnchor: string
  /** High end of scale (5). */
  highAnchor: string
}

export type Rubric = {
  id: RubricId
  /** Plain-English summary of what this rubric scores. */
  intent: string
  dimensions: RubricDimension[]
}

export type JudgeScore = {
  /** Map of rubric dimension key → 1-5 score. */
  scores: Record<string, number>
  /** Map of rubric dimension key → short justification. */
  justifications: Record<string, string>
  /** Plain-English flags surfaced by the judge (e.g. "TUTOR OVER-CORRECTED"). */
  flags: string[]
  /** Overall 1-5 average. */
  overall: number
}

export type TestResult = {
  spec: TestSpec
  transcript: TranscriptTurn[]
  score: JudgeScore
  /** Milliseconds the test took end-to-end. */
  durationMs: number
  /** Per-model cost in USD for this test. */
  costUsd: number
}
