/**
 * Noise-robustness test for the Portuguese tutor.
 *
 * Tests whether Natalia handles common voice-pipeline noise artifacts
 * gracefully — pausing and asking for clarification rather than
 * pretending random transcription garbage was real speech.
 *
 * Failure modes this catches:
 *   1. Empty / silent inputs (Whisper outputs "" for total silence)
 *   2. Short interjections (Whisper hears coughs / "uh" / "ah")
 *   3. Whisper hallucinations on background noise (random English
 *      words like "the news at 10", "okay okay okay")
 *   4. Tutor-echo (Whisper transcribes Natalia's own voice as if the
 *      user said it — common when the audio mic doesn't gate well)
 *   5. Cross-language hallucinations (Whisper outputs random Korean
 *      or Hindi when fed background noise; less common with the pt
 *      language pin but happens on long silences)
 *   6. Punctuation-only / fragment inputs
 *
 * Cost: ~$0.05 per noise artifact × 8 artifacts × 4 levels = ~$1.60.
 *
 * Usage: npx tsx scripts/test-noise-robustness.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { natalia } from '../src/lib/tutors/pt-br/natalia.js'
import { ptBrScenarios } from '../src/lib/tutors/pt-br/scenarios.js'
import { buildLearnerContextBlock } from '../src/lib/profile.js'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    if (process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
const OPENAI_KEY = process.env.OPENAI_API_KEY!
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1) }

// ============================================================================
// Noise artifacts — what bad voice pipelines actually send to the model
// ============================================================================

type NoiseCase = {
  id: string
  description: string
  /// What Whisper actually transmitted to the model after mis-
  /// interpreting background noise. We feed this as a user message.
  transcription: string
  /// What a robust tutor should do — used by the judge.
  expectedBehavior: string
}

const NOISE_CASES: NoiseCase[] = [
  {
    id: 'empty',
    description: 'Pure silence — Whisper sent an empty string.',
    transcription: '',
    expectedBehavior: 'Wait silently OR gently prompt with one short check-in ("Tá aí?" / "Sam, ainda comigo?"). NOT respond as if real speech.',
  },
  {
    id: 'single-uh',
    description: 'User cleared their throat — Whisper transcribed "uh".',
    transcription: 'uh',
    expectedBehavior: 'Treat as a partial. Wait briefly or ask gently for them to repeat ("Sorry, didn\'t catch that — say it again?"). NOT fabricate a topic from "uh".',
  },
  {
    id: 'cough',
    description: 'Cough fragment transcribed.',
    transcription: 'ahem',
    expectedBehavior: 'Same as cough — wait or check in. NOT treat "ahem" as a meaningful contribution.',
  },
  {
    id: 'random-okay',
    description: 'Background TV transcribed as "okay okay yes".',
    transcription: 'okay okay yes',
    expectedBehavior: 'This is suspicious low-context input. Tutor should ask for clarification ("Tudo bem? Você quis dizer alguma coisa específica?") rather than building a response on it.',
  },
  {
    id: 'tv-hallucination',
    description: 'Background news transcribed.',
    transcription: 'and that is the news at ten thirty please subscribe',
    expectedBehavior: 'Doesn\'t fit the conversation. Tutor should recognize it as off-context and ask for clarification, not respond to "news at 10:30".',
  },
  {
    id: 'tutor-echo',
    description: 'Mic picked up Natalia\'s OWN opener, Whisper transcribed it as user input.',
    // Sentinel: runOne() replaces this with the actual opener at runtime
    // so the echo matches a real prior tutor line (realistic mic-bleed).
    transcription: '__TUTOR_OPENER__',
    expectedBehavior: 'Recognize that this is the tutor\'s own line being echoed back, not a real user question. Wait or gently re-anchor the conversation.',
  },
  {
    id: 'pure-punctuation',
    description: 'Audio-detection artifact — Whisper sent only punctuation.',
    transcription: '...',
    expectedBehavior: 'Treat as silence — wait or check in once.',
  },
  {
    id: 'cross-language-hallucination',
    description: 'Whisper hallucinated Korean from background noise.',
    transcription: '안녕하세요 잘 부탁드립니다',
    expectedBehavior: 'Recognize the input is in a totally unrelated language. Don\'t guess. Switch to native: "Sorry, didn\'t catch that — say it again in English or Portuguese?"',
  },
]

// ============================================================================
// Build the system prompt — same Intermediate free-conv assembly as live
// ============================================================================

function buildPrompt(): string {
  const base = natalia.buildSystemInstructions({ nativeLanguage: 'English' })
  const scenario = ptBrScenarios.freeConversations.find((s) => s.id === 'free-intermediate')!
  const addon = scenario.buildPromptAddon({
    name: 'Sam',
    memory: [],
    nativeLanguage: 'English',
  })
  const learnerCtx = buildLearnerContextBlock({
    name: 'Sam',
    nativeLanguage: 'English',
    tutorId: 'pt-br-natalia',
    level: 'intermediate',
    goals: 'My wife is from Salvador.',
  })
  return [base, addon, learnerCtx].filter(Boolean).join('\n\n')
}

// ============================================================================
// OpenAI helper
// ============================================================================

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

async function chat(args: { model: string; messages: Msg[]; temperature?: number; responseFormat?: 'json_object' }): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7,
      ...(args.responseFormat ? { response_format: { type: args.responseFormat } } : {}),
    }),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

// ============================================================================
// Test runner
// ============================================================================

type CaseResult = {
  noiseCase: NoiseCase
  tutorOpener: string
  noiseTurn: string  // the noise we fed
  tutorResponse: string
  judgment: { score: number; verdict: 'robust' | 'guessing' | 'failed'; notes: string }
}

async function runOne(noise: NoiseCase): Promise<CaseResult> {
  const system = buildPrompt()
  // Get the tutor's opener first (matches a real session). Then feed
  // the noise as the FIRST user turn so the tutor has no real context.
  const history: Msg[] = [
    { role: 'system', content: system },
    { role: 'user', content: '[Session just started. The learner is on the line; produce your opener exactly as you would for a fresh voice session.]' },
  ]
  const opener = await chat({ model: 'gpt-4o', messages: history, temperature: 0.7 })
  history.push({ role: 'assistant', content: opener })
  // Feed the noise transcription as if Whisper sent it. The tutor-echo
  // case uses a sentinel so the echo matches a real prior tutor line.
  const noiseInput = noise.transcription === '__TUTOR_OPENER__' ? opener : noise.transcription
  history.push({ role: 'user', content: noiseInput })
  const tutorResponse = await chat({ model: 'gpt-4o', messages: history, temperature: 0.7 })

  // Judge
  const judgePrompt = `You are evaluating how a Brazilian Portuguese voice tutor (Natalia) handled a noise artifact that came from the voice pipeline (Whisper transcribed background noise / silence / interference as the learner's input).

NOISE CASE
- ${noise.description}
- Whisper transcribed: ${JSON.stringify(noiseInput)}
- A ROBUST tutor would: ${noise.expectedBehavior}

CONVERSATION SO FAR
Tutor opener: ${opener}
Learner input (the noise): ${JSON.stringify(noise.transcription)}
Tutor response: ${tutorResponse}

Score the tutor's response on robustness (1-5):
- 5: Cleanly recognized the noise — paused, asked for repeat, OR re-anchored gently. Didn't fabricate context.
- 4: Mostly robust — asked for clarification but in a slightly clumsy way.
- 3: Mixed — partial recognition but tried to respond to fragments.
- 2: Mostly failed — treated noise as meaningful and built a response on it.
- 1: Completely failed — confidently responded to nonsense, fabricated a topic, or pretended the learner asked a real question.

Output JSON:
{
  "score":   <1-5>,
  "verdict": "robust" | "guessing" | "failed",
  "notes":   "<one sentence — what the tutor actually did vs. what it should have done>"
}`

  const raw = await chat({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.2,
    responseFormat: 'json_object',
  })
  const judgment = JSON.parse(raw) as CaseResult['judgment']
  return { noiseCase: noise, tutorOpener: opener, noiseTurn: noise.transcription, tutorResponse, judgment }
}

;(async () => {
  const sections: string[] = [
    `# Noise-robustness report`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `Tests Natalia's response to 8 common voice-pipeline noise artifacts (silence, coughs, Whisper hallucinations, tutor-echo, etc.). A robust tutor pauses / asks for repeat rather than treating noise as meaningful speech.`,
    ``,
  ]

  const rollup: Array<{ id: string; score: number; verdict: string }> = []
  for (const noise of NOISE_CASES) {
    console.log(`Testing: ${noise.id}`)
    const result = await runOne(noise)
    rollup.push({ id: noise.id, score: result.judgment.score, verdict: result.judgment.verdict })
    sections.push(`## ${noise.id} — score ${result.judgment.score}/5 (${result.judgment.verdict})`)
    sections.push(``)
    sections.push(`**Noise:** ${noise.description}`)
    sections.push(`**Whisper sent:** \`${noise.transcription || '(empty string)'}\``)
    sections.push(``)
    sections.push(`**Tutor opener:** ${result.tutorOpener}`)
    sections.push(`**Tutor response to noise:** ${result.tutorResponse}`)
    sections.push(``)
    sections.push(`**Judge:** ${result.judgment.notes}`)
    sections.push(``)
  }

  sections.splice(4, 0,
    `## Rollup`,
    ``,
    `| Noise case | Score | Verdict |`,
    `|---|---|---|`,
    ...rollup.map((r) => `| ${r.id} | ${r.score}/5 | ${r.verdict} |`),
    ``,
  )

  const outPath = path.resolve(process.cwd(), 'noise-robustness-report.md')
  fs.writeFileSync(outPath, sections.join('\n'))
  console.log(`\nReport written to ${outPath}`)
  console.log(`\nRollup:`)
  for (const r of rollup) console.log(`  ${r.id.padEnd(32)} ${r.score}/5  ${r.verdict}`)
})().catch((err) => { console.error('Script failed:', err); process.exit(1) })
