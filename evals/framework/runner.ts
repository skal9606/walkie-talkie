import { tutorReply } from './tutor'
import { learnerReply, PERSONAS } from './learner'
import { judgeTranscript } from './judge'
import { cost } from './cost'
import { tutorNameFor } from './prompt'
import type { TestResult, TestSpec, TranscriptTurn } from './types'

/**
 * Orchestrates one conversation: tutor opener → alternating turns up to
 * spec.numTurns learner replies → judge call → bundled TestResult.
 *
 * Hard budget enforcement: the runner aborts mid-suite if a new test
 * would push cumulative spend over budgetCapUsd. Already-finished tests
 * still get saved.
 */

export type RunnerOptions = {
  /** USD cap. Run aborts if a new test would push spend over this. */
  budgetCapUsd: number
  /** Called after each test result, including failures. */
  onTestComplete?: (result: TestResult) => void
  /** Called when a test errored (transient OpenAI failure, etc.). */
  onTestError?: (spec: TestSpec, err: Error) => void
}

/**
 * Per-test cost estimate used for pre-flight budget check. Tuned from
 * observed smoke-test numbers — refine after first full run.
 *
 *   tutor (gpt-4o):      ~$0.075 / convo
 *   learner (mini):      ~$0.001
 *   judge (gpt-4o):      ~$0.050
 *                        ~$0.126 round-trip
 */
const ESTIMATED_COST_PER_TEST = 0.13

export async function runOne(spec: TestSpec): Promise<TestResult> {
  const startedAt = Date.now()
  const startCost = cost.total()
  const persona = PERSONAS[spec.persona]
  if (!persona) throw new Error(`Unknown persona: ${spec.persona}`)
  const promptInputs = {
    language: spec.language,
    level: spec.level,
    name: spec.learnerName ?? 'Alex',
    nativeLanguage: 'English' as const,
    goals: spec.learnerGoal,
  }

  const transcript: TranscriptTurn[] = []

  // 1. Tutor speaks first (synthetic primer in tutor.ts triggers opener).
  const opener = await tutorReply(promptInputs, transcript, spec.category)
  transcript.push({ role: 'tutor', content: opener })

  // 2. Alternate learner → tutor for numTurns.
  for (let i = 0; i < spec.numTurns; i++) {
    // Scripted turns let confusion-recovery tests inject literal user
    // utterances that must contain phrases like "I don't understand".
    const scripted = spec.scriptedTurns?.[i]
    const learnerMessage = scripted
      ? scripted
      : await learnerReply(persona, transcript, spec.category)
    transcript.push({ role: 'learner', content: learnerMessage })

    // After the LAST learner turn we still get the tutor's response —
    // it's part of the transcript the judge scores. Then stop.
    const tutorMessage = await tutorReply(promptInputs, transcript, spec.category)
    transcript.push({ role: 'tutor', content: tutorMessage })
  }

  // 3. Judge.
  const contextNotes = buildContextNotes(spec)
  const score = await judgeTranscript(spec.rubric, transcript, contextNotes, spec.category)

  const endCost = cost.total()
  return {
    spec,
    transcript,
    score,
    durationMs: Date.now() - startedAt,
    costUsd: Math.round((endCost - startCost) * 10000) / 10000,
  }
}

function buildContextNotes(spec: TestSpec): string {
  const tutorName = tutorNameFor(spec.language)
  return [
    `Tutor: ${tutorName} (${spec.language})`,
    `Declared learner level: ${spec.level}`,
    `Simulated learner persona: ${PERSONAS[spec.persona]?.label ?? spec.persona}`,
    spec.learnerGoal ? `Learner's stated goal: ${spec.learnerGoal}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function runSuite(specs: TestSpec[], opts: RunnerOptions): Promise<TestResult[]> {
  const results: TestResult[] = []
  for (const spec of specs) {
    // Pre-flight budget check: refuse to spawn a test we estimate would
    // push us over the cap. The estimate is conservative; we'd rather
    // skip 1-2 tests than blow the budget.
    if (!cost.canSpend(ESTIMATED_COST_PER_TEST, opts.budgetCapUsd)) {
      console.warn(
        `[runner] Aborting: cumulative cost $${cost.total().toFixed(2)} + estimated ` +
          `$${ESTIMATED_COST_PER_TEST.toFixed(2)} would exceed budget $${opts.budgetCapUsd.toFixed(2)}.`,
      )
      break
    }
    try {
      const result = await runOne(spec)
      results.push(result)
      opts.onTestComplete?.(result)
    } catch (err) {
      const e = err as Error
      console.error(`[runner] Test ${spec.id} failed: ${e.message}`)
      opts.onTestError?.(spec, e)
    }
  }
  return results
}
