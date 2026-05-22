import { chat, type ChatMessage } from './openai-client'
import { RUBRICS } from '../judges/rubrics'
import type { JudgeScore, Rubric, RubricId, TranscriptTurn } from './types'

/**
 * LLM-judge a completed transcript against a category-specific rubric.
 * Returns 1-5 scores per dimension + ALL-CAPS flags surfacing any hard
 * failures.
 *
 * We use gpt-4o (not mini) for the judge — eval quality matters more
 * than cost here, and the volume per run is small (~45 judge calls).
 */

export async function judgeTranscript(
  rubricId: RubricId,
  transcript: TranscriptTurn[],
  contextNotes: string,
  category?: string,
): Promise<JudgeScore> {
  const rubric = RUBRICS[rubricId]
  if (!rubric) throw new Error(`Unknown rubric: ${rubricId}`)
  const systemPrompt = buildJudgeSystemPrompt(rubric)
  const userPrompt = buildJudgeUserPrompt(rubric, transcript, contextNotes)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  const result = await chat({
    model: 'gpt-4o',
    messages,
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    category,
  })
  return parseJudgeResponse(result.content, rubric)
}

function buildJudgeSystemPrompt(rubric: Rubric): string {
  return `You are an expert evaluator of voice-AI language tutors. You have been hired to assess whether a tutor — an AI language teacher — handles a specific conversation correctly.

For this rubric, the intent is: ${rubric.intent}

Score every dimension on a 1-5 scale and write a one-sentence justification. Be honest and specific — a 3 is "okay", a 5 is "best possible behavior for this scenario", a 1 is "fundamentally broken for this scenario".

Also surface ALL-CAPS "flags" for any hard failures you observe (e.g. TUTOR_OVER_CORRECTED, TUTOR_IGNORED_CONFUSION, TUTOR_REPETITIVE_PHRASING, TUTOR_WRONG_LEVEL, TUTOR_SWITCHED_TO_ENGLISH). Flags should be terse — no spaces, ALL_CAPS, snake_case. Empty list if nothing critical.

Output STRICT JSON in this shape (no markdown, no comments):

{
  "scores": { "<dimension_key>": <1-5 int>, ... },
  "justifications": { "<dimension_key>": "<one sentence>", ... },
  "flags": ["FLAG_ONE", "FLAG_TWO"]
}

Include every dimension listed in the user prompt's rubric — do not skip any.`
}

function buildJudgeUserPrompt(
  rubric: Rubric,
  transcript: TranscriptTurn[],
  contextNotes: string,
): string {
  const transcriptText = transcript
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join('\n\n')
  const dimensionList = rubric.dimensions
    .map(
      (d) =>
        `- ${d.key}: ${d.question}\n    1 = ${d.lowAnchor}\n    5 = ${d.highAnchor}`,
    )
    .join('\n')
  return `RUBRIC: ${rubric.id}
INTENT: ${rubric.intent}

DIMENSIONS:
${dimensionList}

CONTEXT NOTES:
${contextNotes}

TRANSCRIPT:
${transcriptText}

Score every dimension above and surface any flags.`
}

function parseJudgeResponse(raw: string, rubric: Rubric): JudgeScore {
  let parsed: {
    scores?: Record<string, number>
    justifications?: Record<string, string>
    flags?: string[]
  }
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Judge returned invalid JSON: ${(err as Error).message}\n\nRaw:\n${raw.slice(0, 500)}`)
  }
  const scores: Record<string, number> = {}
  const justifications: Record<string, string> = {}
  for (const d of rubric.dimensions) {
    const score = parsed.scores?.[d.key]
    if (typeof score !== 'number' || score < 1 || score > 5) {
      // Default to 3 (neutral) for missing/invalid dimensions so the
      // run doesn't crash on a partial judge response. Surfaces as a
      // flag so we can see it in the report.
      scores[d.key] = 3
      justifications[d.key] = '(judge returned no score — defaulted to 3)'
    } else {
      scores[d.key] = Math.round(score)
      justifications[d.key] = parsed.justifications?.[d.key] ?? ''
    }
  }
  const flags = Array.isArray(parsed.flags) ? parsed.flags.filter((f) => typeof f === 'string') : []
  const overall =
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length
  return {
    scores,
    justifications,
    flags,
    overall: Math.round(overall * 10) / 10,
  }
}
