/**
 * Conversation-quality harness for the Portuguese tutor (Natalia).
 *
 * Assembles the same system prompt the live web app sends to the
 * Realtime API for each level (first_timer / basic / intermediate /
 * advanced), then simulates a 12-turn conversation against a learner-
 * persona LLM tuned to that level. A judge model rates the conversation
 * on six criteria.
 *
 * Cost: ~$0.10–0.15 per level. 4 levels = ~$0.50.
 *
 * Usage: npx tsx scripts/test-conversation-quality.ts
 *
 * Requires OPENAI_API_KEY in .env.local.
 */

import * as fs from 'fs'
import * as path from 'path'
import { natalia } from '../src/lib/tutors/pt-br/natalia.js'
import { ptBrScenarios } from '../src/lib/tutors/pt-br/scenarios.js'
import { buildLearnerContextBlock } from '../src/lib/profile.js'

// .env.local loader (inline; avoids dotenv dep).
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key]) continue
    process.env[key] = raw.replace(/^['"]|['"]$/g, '')
  }
}
const OPENAI_KEY = process.env.OPENAI_API_KEY!
if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY in .env.local')
  process.exit(1)
}

// ============================================================================
// Levels we test + the matching learner persona we simulate against.
// ============================================================================

type LevelKey = 'first_timer' | 'basic' | 'intermediate' | 'advanced'

const LEVELS: Array<{
  key: LevelKey
  scenarioId: string
  webLevel: 'complete-beginner' | 'novice' | 'intermediate' | 'advanced'
  learnerName: string
  goals: string
  learnerSystemPrompt: string
}> = [
  {
    key: 'first_timer',
    scenarioId: 'free-complete-beginner',
    webLevel: 'complete-beginner',
    learnerName: 'Alex',
    goals: 'My partner is Brazilian and I want to surprise their family with a few phrases.',
    learnerSystemPrompt:
      `You are a true beginner English speaker simulating a learner in a Portuguese voice tutor session.

YOUR KNOWLEDGE
- You know ZERO Portuguese words coming in. Don't make any up. Only repeat what the tutor has just modeled.
- Your name is Alex. Your partner is Brazilian (from São Paulo). You want to surprise their family.

HOW YOU REPLY
- Reply in ENGLISH only, except when the tutor asks you to repeat a specific Portuguese phrase — then repeat it (with some hesitation, occasional slight mispronunciation marked phonetically, e.g. "tudo behm").
- Be warm and curious. Ask reasonable beginner questions like "is that pronounced 'thank you' the same way?" or "wait, what was that word again?"
- Keep replies SHORT — 1-2 sentences. You're nervous about speaking.
- Sometimes stumble or trail off as if uncertain.`,
  },
  {
    key: 'basic',
    scenarioId: 'free-novice',
    webLevel: 'novice',
    learnerName: 'Jamie',
    goals: 'Traveling to Rio next year with friends.',
    learnerSystemPrompt:
      `You are a Basic-level English-speaking learner of Brazilian Portuguese in a voice tutor session.

YOUR KNOWLEDGE
- You know about 30-50 Portuguese words and phrases: greetings (oi, tudo bem, bom dia), numbers 1-20, please/thanks (por favor, obrigado/a), basic food (água, café, cerveja), where is X (onde fica), how much (quanto custa).
- You CANNOT hold a real conversation in Portuguese — you can only string together short transactional phrases.
- Your name is Jamie. You're going to Rio with two friends next April.

HOW YOU REPLY
- Reply MOSTLY in English (~70%), with occasional Portuguese phrases you actually know (~30%).
- When you try Portuguese, occasionally make a small mistake like wrong gender ("a problema" / "o cerveja"), or mispronounce ("obrigatu" instead of "obrigado").
- Be warm, curious, eager. Keep replies to 1-2 sentences.
- If the tutor speaks too much Portuguese in a row, naturally ask them to slow down or translate.`,
  },
  {
    key: 'intermediate',
    scenarioId: 'free-intermediate',
    webLevel: 'intermediate',
    learnerName: 'Sam',
    goals: 'My wife is from Salvador. We visit her family yearly and I want to actually talk with her parents.',
    learnerSystemPrompt:
      `You are an Intermediate (B1-B2) English-speaking learner of Brazilian Portuguese in a voice tutor session.

YOUR KNOWLEDGE
- You can hold a basic conversation in Portuguese. You speak in full sentences but make typical intermediate mistakes:
  * Preposition mistakes: "eu fui no restaurante" (should be "ao"), "estou em Brasil" (should be "no")
  * Present-tense default for past: "ontem eu vou ao mercado" (should be "fui")
  * Gender confusion on less-common nouns: "a problema", "o pizza"
  * Avoiding subjunctive: "se eu tinha tempo" instead of "se eu tivesse tempo"
- Your name is Sam. Your wife Cláudia is from Salvador. You're a venture capitalist in San Francisco. You have a daughter Lucy who is 7.

HOW YOU REPLY
- Reply MOSTLY in Portuguese (~80%) with occasional code-switches to English when stuck on a word.
- Make the mistakes listed above naturally, without flagging them.
- Be warm, curious, willing to be corrected. Reply length: 2-3 sentences.
- When the tutor introduces a hard word, ask what it means in English.`,
  },
  {
    key: 'advanced',
    scenarioId: 'free-advanced',
    webLevel: 'advanced',
    learnerName: 'Marina',
    goals: 'I work for a Brazilian fintech and need to sound more natural in client meetings.',
    learnerSystemPrompt:
      `You are an Advanced (C1) English-speaking learner of Brazilian Portuguese in a voice tutor session.

YOUR KNOWLEDGE
- You're fluent. You speak almost entirely in Portuguese (~95%) with idiomatic flow. Your slips are subtle:
  * Occasional wrong subjunctive ("se eu era" instead of "se eu fosse")
  * Sometimes use European Portuguese constructions where Brazilian would differ
  * Miss a few idioms, ask for them ("como vocês diriam 'reaching out' aqui?")
  * Slightly stiff register at times — sounds more like a textbook than a Paulistana
- Your name is Marina. You work in fintech, often deal with Brazilian client meetings. You're based in London.

HOW YOU REPLY
- Reply entirely in Portuguese unless you genuinely need to ask for a specific English-to-Portuguese term.
- Be opinionated, share specific work scenarios, engage in real exchange.
- Reply length: 2-4 sentences. Speak like a real fluent professional, not a perfect grammar test.
- Sometimes push back on the tutor or disagree to test if they handle it well.`,
  },
]

// ============================================================================
// OpenAI chat helper. Uses the standard /v1/chat/completions endpoint.
// ============================================================================

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

async function chat(args: {
  model: string
  messages: Msg[]
  temperature?: number
  responseFormat?: 'json_object'
}): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7,
      ...(args.responseFormat
        ? { response_format: { type: args.responseFormat } }
        : {}),
    }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`OpenAI ${r.status}: ${text.slice(0, 300)}`)
  }
  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

// ============================================================================
// Build the EXACT system prompt the web app sends for a given level.
// ============================================================================

function buildTutorSystemPrompt(level: typeof LEVELS[number]): string {
  // 1. Per-tutor base instructions (Natalia's persona, casual SP register,
  //    correction rules, etc.).
  const base = natalia.buildSystemInstructions({ nativeLanguage: 'English' })

  // 2. Per-scenario addon for the chosen level. Empty memory because we're
  //    simulating a first-time-of-this-session conversation; the test is
  //    about in-session behavior, not returning-learner memory wiring
  //    (which is exercised in test-memory.ts).
  const scenario = ptBrScenarios.freeConversations.find((s) => s.id === level.scenarioId)
  if (!scenario) throw new Error(`scenario ${level.scenarioId} not found`)
  const addon = scenario.buildPromptAddon({
    name: level.learnerName,
    memory: [],
    nativeLanguage: 'English',
  })

  // 3. Learner context block (name, native lang, level, goals).
  const learnerCtx = buildLearnerContextBlock({
    name: level.learnerName,
    nativeLanguage: 'English',
    tutorId: 'pt-br-natalia',
    level: level.webLevel,
    goals: level.goals,
  })

  return [base, addon, learnerCtx].filter(Boolean).join('\n\n')
}

// ============================================================================
// Run one simulated conversation. Returns the transcript.
// ============================================================================

async function simulateConversation(level: typeof LEVELS[number], turnCount = 12): Promise<Msg[]> {
  const tutorSystem = buildTutorSystemPrompt(level)
  const learnerSystem = level.learnerSystemPrompt

  // Tutor speaks first (the "opener"). We give it a kickoff user message
  // that says "[learner just connected]" so it produces the opener.
  // Note: in production the opener fires as a `response.create` without
  // a user prompt; here we synthesize an equivalent kickoff so the
  // chat-completions API has something to respond to.
  const tutorHistory: Msg[] = [
    { role: 'system', content: tutorSystem },
    { role: 'user', content: '[Session just started. The learner is on the line; produce your opener exactly as you would for a fresh voice session.]' },
  ]
  const opener = await chat({ model: 'gpt-4o', messages: tutorHistory, temperature: 0.8 })
  tutorHistory.push({ role: 'assistant', content: opener })

  const learnerHistory: Msg[] = [
    { role: 'system', content: learnerSystem },
    { role: 'user', content: `Your tutor's opener: "${opener}"\n\nReply as the learner would, in character.` },
  ]
  const transcript: Msg[] = [{ role: 'assistant', content: opener }]

  for (let i = 0; i < turnCount; i++) {
    const learnerReply = await chat({
      model: 'gpt-4o-mini',
      messages: learnerHistory,
      temperature: 0.9,
    })
    transcript.push({ role: 'user', content: learnerReply })
    tutorHistory.push({ role: 'user', content: learnerReply })

    const tutorReply = await chat({
      model: 'gpt-4o',
      messages: tutorHistory,
      temperature: 0.8,
    })
    transcript.push({ role: 'assistant', content: tutorReply })
    tutorHistory.push({ role: 'assistant', content: tutorReply })
    learnerHistory.push({ role: 'assistant', content: learnerReply })
    learnerHistory.push({ role: 'user', content: `Tutor's next turn: "${tutorReply}"\n\nReply as the learner would, in character. Keep it to 1-3 sentences.` })
  }
  return transcript
}

// ============================================================================
// Judge: rate the conversation against level-specific rubrics.
// ============================================================================

const JUDGE_RUBRIC: Record<LevelKey, string> = {
  first_timer: `For a FIRST TIMER (true beginner, zero Portuguese):
- Language mix: tutor should be ~85% English / ~15% Portuguese. Each Portuguese phrase paired with an English translation.
- Pace: extremely gentle. Never expects unprompted Portuguese.
- Variety: rotates through teaching patterns (embedded use, short aside, no-teach turn, occasional explicit "try saying X"). Doesn't use the same formula two turns in a row.
- Tone: warm, friend-on-the-phone, never tutor-formal.`,
  basic: `For a BASIC learner (knows ~30 phrases):
- Language mix: tutor should be ~70% English / ~30% Portuguese. Builds on phrases the learner used.
- Treats learner attempts (even wrong gender / mispronunciation) with warm reinforcement first, then a gentle recast on the meaningful slips.
- Doesn't lecture grammar. Doesn't drill.
- Asks deeper follow-up questions to keep them in the conversation, not always defaulting to "let's learn another phrase."`,
  intermediate: `For an INTERMEDIATE learner (B1-B2):
- Speaks predominantly in Portuguese. Switches to English only for vocab help or quick grammar gloss.
- ACTIVELY DRIVES: within 3-4 turns, picks a substantive topic (debate, story, real decision, country comparison) and pushes the learner on it.
- Within the conversation, surfaces ONE grammar gap from the learner's replies (preposition / past tense / subjunctive / gender) — one short recast with explanation, then moves on. Not a drill.
- Warm + curious but not afraid to push or disagree.`,
  advanced: `For an ADVANCED learner (C1-C2):
- Speaks ENTIRELY in Portuguese. Uses idioms and slang naturally.
- CHALLENGES the learner: debate, narrate, explain complex ideas. Takes the opposite side when needed. Doesn't lob softballs.
- Notices ONE language gap that would meaningfully level them up (subtle nuance, register, more elegant connector) and surfaces it ONCE in passing.
- Speaks at natural native pace. Doesn't slow down or simplify.`,
}

type JudgeReport = {
  language_appropriateness: { score: number; notes: string }
  conversational_flow: { score: number; notes: string }
  mistake_handling: { score: number; notes: string }
  drive_and_push: { score: number; notes: string }
  persona_consistency: { score: number; notes: string }
  overall: number
  summary: string
  recommended_fixes: string[]
}

async function judge(level: typeof LEVELS[number], transcript: Msg[]): Promise<JudgeReport> {
  const transcriptText = transcript
    .map((m) => `${m.role === 'assistant' ? 'Tutor (Natalia)' : 'Learner'}: ${m.content}`)
    .join('\n\n')

  const judgePrompt = `You are evaluating a Brazilian Portuguese voice-tutor conversation between Natalia (the AI tutor) and a learner.

LEARNER PROFILE
- Name: ${level.learnerName}
- Level: ${level.key}
- Goal: ${level.goals}

LEVEL EXPECTATIONS
${JUDGE_RUBRIC[level.key]}

TUTOR PERSONA
Natalia is a warm late-20s Paulistana — casual SP slang ("tá", "pra", "tô"), allergic to textbook-formal language, friend-on-the-phone vibe, never schoolmarmish.

TRANSCRIPT
${transcriptText}

Score each criterion 1-5 (5=excellent, 1=poor) and produce a JSON object EXACTLY in this shape:
{
  "language_appropriateness": { "score": <1-5>, "notes": "<one sentence>" },
  "conversational_flow":      { "score": <1-5>, "notes": "<one sentence>" },
  "mistake_handling":         { "score": <1-5>, "notes": "<one sentence>" },
  "drive_and_push":           { "score": <1-5>, "notes": "<one sentence — for first_timer this means appropriate pacing, not pushing>" },
  "persona_consistency":      { "score": <1-5>, "notes": "<one sentence>" },
  "overall":                  <1-5 — your synthesized verdict>,
  "summary":                  "<2-3 sentences — what worked / what was off>",
  "recommended_fixes":        ["<single concrete prompt change>", "<another>", "..."]
}

Be honest and specific. If something was bad, say so plainly.`

  const raw = await chat({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.2,
    responseFormat: 'json_object',
  })
  return JSON.parse(raw) as JudgeReport
}

// ============================================================================
// Main: run each level sequentially, write a markdown report.
// ============================================================================

;(async () => {
  const startedAt = new Date()
  const sections: string[] = [
    `# Portuguese tutor — conversation quality report`,
    `Generated: ${startedAt.toISOString()}`,
    ``,
  ]

  const summaries: Array<{ level: string; overall: number; verdict: string }> = []

  for (const level of LEVELS) {
    console.log(`\n=== ${level.key} ===`)
    console.log('Simulating 12-turn conversation...')
    const transcript = await simulateConversation(level)
    console.log('Judging...')
    const report = await judge(level, transcript)

    sections.push(`## ${level.key.replace('_', ' ').toUpperCase()} — overall ${report.overall}/5`)
    sections.push(`**Learner persona:** ${level.learnerName} — ${level.goals}`)
    sections.push(``)
    sections.push(`| Criterion | Score | Note |`)
    sections.push(`|---|---|---|`)
    const rows: Array<[string, { score: number; notes: string }]> = [
      ['Language mix appropriate for level', report.language_appropriateness],
      ['Conversational flow + thread-pulling', report.conversational_flow],
      ['Mistake handling for this level', report.mistake_handling],
      ['Drive / push (pacing for first timer)', report.drive_and_push],
      ['Natalia persona consistency', report.persona_consistency],
    ]
    for (const [label, c] of rows) {
      sections.push(`| ${label} | ${c.score}/5 | ${c.notes} |`)
    }
    sections.push(``)
    sections.push(`**Summary:** ${report.summary}`)
    sections.push(``)
    if (report.recommended_fixes.length > 0) {
      sections.push(`**Recommended fixes:**`)
      for (const f of report.recommended_fixes) sections.push(`- ${f}`)
      sections.push(``)
    }
    sections.push(`<details><summary>Transcript (12 turns)</summary>\n`)
    for (const m of transcript) {
      sections.push(`**${m.role === 'assistant' ? 'Natalia' : level.learnerName}:** ${m.content}\n`)
    }
    sections.push(`</details>`)
    sections.push(``)

    summaries.push({
      level: level.key,
      overall: report.overall,
      verdict: report.summary,
    })
  }

  // Top-of-file rollup for quick scanning.
  const rollup = [
    `## Rollup`,
    ``,
    `| Level | Overall |`,
    `|---|---|`,
    ...summaries.map((s) => `| ${s.level} | ${s.overall}/5 |`),
    ``,
  ]
  sections.splice(2, 0, ...rollup)

  const outPath = path.resolve(process.cwd(), 'conversation-quality-report.md')
  fs.writeFileSync(outPath, sections.join('\n'))
  console.log(`\nReport written to ${outPath}`)
  console.log(`\nRollup:`)
  for (const s of summaries) {
    console.log(`  ${s.level.padEnd(14)} ${s.overall}/5`)
  }
})().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
