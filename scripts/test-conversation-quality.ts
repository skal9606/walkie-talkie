/**
 * Conversation-quality harness for the Portuguese tutor (Natalia).
 *
 * Drives both FREE CONVERSATION (per level) and LESSONS (per type)
 * through their actual production prompt assembly, then simulates a
 * 12-turn conversation against a level/lesson-tuned learner persona,
 * then evaluates with a judge LLM against a research-backed rubric.
 *
 * Cost: ~$0.10–0.15 per scenario. Default run is 7 scenarios = ~$1.
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
import { buildLessonInstructions, LESSON_SCENARIO_OVERRIDE } from '../src/lib/lessons/instructions.js'
import { lessonById } from '../src/lib/lessons/catalog.js'

// .env.local loader (inline).
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
// Common types
// ============================================================================

type WebLevel = 'complete-beginner' | 'novice' | 'intermediate' | 'advanced'

type TestScenario = {
  id: string                       // slug for the report
  kind: 'free' | 'lesson'
  displayName: string
  buildTutorPrompt: () => string   // exact prompt the live tutor would see
  learnerName: string
  learnerSystemPrompt: string
  judgeRubric: string              // level/lesson-specific criteria
  turnCount?: number               // default 12
}

// ============================================================================
// Tutor-prompt builders — REUSE the production assembly verbatim so the
// test exercises the same code path the live app sends to OpenAI Realtime.
// ============================================================================

function buildFreeConversationPrompt(args: {
  level: WebLevel
  learnerName: string
  goals: string
}): string {
  const base = natalia.buildSystemInstructions({ nativeLanguage: 'English' })
  const scenarioId = `free-${args.level}`
  const scenario = ptBrScenarios.freeConversations.find((s) => s.id === scenarioId)
  if (!scenario) throw new Error(`scenario ${scenarioId} not found`)
  const addon = scenario.buildPromptAddon({
    name: args.learnerName,
    memory: [],
    nativeLanguage: 'English',
  })
  const learnerCtx = buildLearnerContextBlock({
    name: args.learnerName,
    nativeLanguage: 'English',
    tutorId: 'pt-br-natalia',
    level: args.level,
    goals: args.goals,
  })
  return [base, addon, learnerCtx].filter(Boolean).join('\n\n')
}

function buildLessonPrompt(args: {
  lessonId: string
  level: WebLevel
  learnerName: string
  goals: string
}): string {
  const lesson = lessonById(args.lessonId)
  if (!lesson) throw new Error(`lesson ${args.lessonId} not found`)
  const base = natalia.buildSystemInstructions({ nativeLanguage: 'English' })
  const lessonBlock = buildLessonInstructions(lesson, 'pt-BR', args.level)
  const learnerCtx = buildLearnerContextBlock({
    name: args.learnerName,
    nativeLanguage: 'English',
    tutorId: 'pt-br-natalia',
    level: args.level,
    goals: args.goals,
  })
  // Matches Tutor.tsx start() ordering: LESSON_SCENARIO_OVERRIDE at top
  // (forces scene-mode), addon = lesson block, then learner context.
  return [base, LESSON_SCENARIO_OVERRIDE, lessonBlock, learnerCtx].filter(Boolean).join('\n\n')
}

// ============================================================================
// Scenarios
// ============================================================================

const FREE_CONVERSATION_SCENARIOS: TestScenario[] = [
  {
    id: 'free-first-timer',
    kind: 'free',
    displayName: 'Free conv · First Timer (A0)',
    buildTutorPrompt: () =>
      buildFreeConversationPrompt({
        level: 'complete-beginner',
        learnerName: 'Alex',
        goals: 'My partner is Brazilian and I want to surprise their family with a few phrases.',
      }),
    learnerName: 'Alex',
    learnerSystemPrompt:
      `You are a TRUE BEGINNER English speaker simulating a Portuguese voice-tutor session.

ZERO KNOWLEDGE
- You know exactly zero Portuguese words coming in. Do NOT make any up. Only repeat what the tutor has just modeled.
- Name: Alex. Partner is Brazilian from São Paulo. You want to surprise their family.

YOUR REPLIES MUST:
- Be in ENGLISH only (with hesitation markers like "um", "uh"). Repeat Portuguese phrases the tutor models, with phonetic mispronunciation ("tudo behm", "obri-gah-doh").
- Be 1-2 sentences max — nervous beginner energy.
- Show curiosity ("wait, what was that?"), occasional confusion ("did I say it right?").
- If the tutor speaks more than ~3 Portuguese words without translating, ask them to slow down or explain.`,
    judgeRubric: `FIRST TIMER (A0, true beginner, zero Portuguese):
- Language mix should be ~85% English / ~15% Portuguese. Every Portuguese phrase paired with English translation in the same breath.
- Tutor NEVER expects unprompted Portuguese output beyond repeating a phrase she just modeled.
- Rotates teaching patterns (embedded use, short aside, no-teach turn, occasional explicit "try saying X"). Doesn't use the same formula twice in a row.
- DENSITY: many turns have NO Portuguese at all — the conversation is the point; phrases are seasoning.
- Tone: warm friend-on-the-phone. Never tutor-formal or schoolmarmish.
- Pulls on threads the learner opened (e.g. asks about partner's family, what about São Paulo, etc.).`,
  },
  {
    id: 'free-basic',
    kind: 'free',
    displayName: 'Free conv · Basic (A1)',
    buildTutorPrompt: () =>
      buildFreeConversationPrompt({
        level: 'novice',
        learnerName: 'Jamie',
        goals: 'Traveling to Rio next year with friends.',
      }),
    learnerName: 'Jamie',
    learnerSystemPrompt:
      `You are a BASIC (A1) English-speaking learner of Brazilian Portuguese.

YOUR KNOWLEDGE
- ~30 phrases: greetings (oi, tudo bem, bom dia), numbers 1-20, please/thanks, basic food (água, café, cerveja), where is X (onde fica), how much (quanto custa).
- You CANNOT hold a real conversation in Portuguese — only short transactional phrases.
- Name: Jamie. Going to Rio with two friends next April.

REPLY RULES
- ~70% English / ~30% Portuguese. Try a Portuguese phrase when relevant.
- Make occasional small mistakes ("a problema" gender flip, "obrigatu" mispronunciation).
- 1-2 sentences per reply.
- If tutor speaks too much PT in a row, ask them to slow down.`,
    judgeRubric: `BASIC (A1, knows ~30 phrases):
- Language mix should be ~70% English / ~30% Portuguese. Builds on phrases the learner already used.
- Treats learner attempts with warm reinforcement FIRST, then a gentle recast on meaningful slips. Doesn't drill grammar.
- Asks deeper follow-up questions to keep them in the conversation. Doesn't default to "let's learn another phrase" every turn.
- Surfaces useful new vocab in CONTEXT (e.g. when the learner mentions food, naturally introduces a related phrase).`,
  },
  {
    id: 'free-intermediate-strict',
    kind: 'free',
    displayName: 'Free conv · Intermediate (B1) — with planted mistakes',
    buildTutorPrompt: () =>
      buildFreeConversationPrompt({
        level: 'intermediate',
        learnerName: 'Sam',
        goals: 'My wife is from Salvador. We visit her family yearly and I want to actually talk with her parents.',
      }),
    learnerName: 'Sam',
    learnerSystemPrompt:
      `You are simulating an INTERMEDIATE (B1) English-speaking learner of Brazilian Portuguese.

CRITICAL — YOU MUST MAKE THESE EXACT MISTAKES naturally during the conversation:
- Say "eu fui no restaurante" at least ONCE (the correct form is "eu fui ao restaurante").
- Say "a problema" at least once (correct: "o problema").
- Say "se eu tinha tempo" at least once (correct: "se eu tivesse tempo").
- Default to present tense when talking about a past event at least once ("ontem eu vou..." instead of "ontem eu fui...").

These are typical intermediate mistakes — you make them confidently, without flagging them. If the tutor recasts them, repeat the correction once but don't dwell.

LEARNER BACKGROUND
- Name: Sam. Wife Cláudia from Salvador. Daughter Lucy (age 7). VC in San Francisco.

REPLY RULES
- ~85% Portuguese / 15% English when stuck.
- 2-3 sentences per reply.
- Be warm + chatty — talk about your weekend, family, work plans, etc.
- Naturally weave in the planted mistakes (not all at once — spread across the conversation).
- If pushed on a topic, engage genuinely. If recast on a grammar point, take it gracefully.`,
    judgeRubric: `INTERMEDIATE (B1-B2):
- Speaks predominantly in Portuguese. Drops to English ONLY for vocab help or a quick grammar gloss.
- ACTIVELY DRIVES: within 3-4 turns, picks a substantive topic (debate, real decision, country comparison, story) and pushes the learner on it. Not generic "tell me about your day."
- Catches the PLANTED MISTAKES the learner makes ("fui no restaurante", "a problema", "se eu tinha tempo", wrong past tense) — at minimum 1, ideally 2 of these get recast. Recasts are SHORT, in passing, not lectures. Returns to topic.
- Warm + curious + willing to push back / disagree to elicit more language.
- DOES NOT over-correct (no more than 1 recast per turn, never two in a row).`,
  },
  {
    id: 'free-advanced',
    kind: 'free',
    displayName: 'Free conv · Advanced (C1)',
    buildTutorPrompt: () =>
      buildFreeConversationPrompt({
        level: 'advanced',
        learnerName: 'Marina',
        goals: 'I work for a Brazilian fintech and need to sound more natural in client meetings.',
      }),
    learnerName: 'Marina',
    learnerSystemPrompt:
      `You are an ADVANCED (C1) English-speaking learner of Brazilian Portuguese.

YOUR LEVEL
- Fluent. Speak ~95% Portuguese, occasionally ask for English-to-Portuguese term ("como vocês diriam 'reaching out'?").
- Your slips are SUBTLE: occasional wrong subjunctive ("se eu era" instead of "se eu fosse"), stiff register at times, slightly European constructions where Brazilian would differ.
- You sound more textbook than Paulistana — that's the gap you want closed.

BACKGROUND
- Name: Marina. Work in fintech. Based in London. Often deal with Brazilian client meetings.

REPLY RULES
- All Portuguese unless asking for a specific term.
- Be opinionated; share specific work scenarios.
- 2-4 sentences per reply.
- Sometimes push back on the tutor to test if she handles disagreement well.`,
    judgeRubric: `ADVANCED (C1-C2):
- Speaks ENTIRELY in Portuguese. Uses idioms and slang naturally ("dar um gás", "tá ligado", "valeu", "pô", etc.).
- CHALLENGES the learner: takes opposite side in debate, pushes for nuance, doesn't lob softballs.
- Notices ONE language-LEVEL-UP move (subtle nuance, register shift, more elegant connector) and surfaces it ONCE in passing — not a grammar lecture.
- Speaks at natural native pace. Doesn't slow down or simplify.
- Sounds like a real Paulistana friend, not a tutor.`,
  },
]

const LESSON_SCENARIOS: TestScenario[] = [
  {
    // First Timer transactional role-play. Tests the scaffolded
    // Tell→Repeat pattern.
    id: 'lesson-ft-2-1-coffee',
    kind: 'lesson',
    displayName: 'Lesson · ft-2-1 Order a coffee (First Timer role-play)',
    buildTutorPrompt: () =>
      buildLessonPrompt({
        lessonId: 'ft-2-1',
        level: 'complete-beginner',
        learnerName: 'Alex',
        goals: 'My partner is Brazilian and I want to surprise their family with a few phrases.',
      }),
    learnerName: 'Alex',
    learnerSystemPrompt:
      `You are a TRUE BEGINNER (A0) English speaker doing a Portuguese LESSON via voice. The lesson is "Order a coffee" — set in a Brazilian café.

KNOWLEDGE
- ZERO Portuguese coming in. Repeat what the tutor models, with hesitation + occasional mispronunciation.
- Name: Alex.

REPLY RULES
- Default to ENGLISH; repeat Portuguese phrases the tutor explicitly teaches.
- 1-2 sentences max. Sometimes get distracted: "wait, what does 'um café' mean?", "did I say it right?"
- Occasionally try to chat off-topic ("how's your day?", "what's the weather like in SP?") to test if the tutor steers back warmly.`,
    judgeRubric: `LESSON @ FIRST TIMER (role-play, Order a coffee):
- Uses the TELL → REPEAT pattern: tutor models a phrase in Portuguese, English translation in the same turn, then asks learner to repeat. NEVER asks for unprompted Portuguese.
- Sets the scene clearly at the start ("imagine you walk into a café in SP, I'm the barista...").
- Praises every attempt warmly. No nitpicking pronunciation.
- Off-topic handling: warm but steers back to the lesson (per the OFF-TOPIC HANDLING block).
- Walks through ~5 anchor phrases over the session.
- Tone: warm, encouraging, friend-not-teacher.`,
  },
  {
    // Intermediate discussion lesson. Tests the new "scene framing for
    // discussion" + drive-the-conversation behavior.
    id: 'lesson-i-1-2-opinion',
    kind: 'lesson',
    displayName: 'Lesson · i-1-2 Share an opinion (Intermediate discussion)',
    buildTutorPrompt: () =>
      buildLessonPrompt({
        lessonId: 'i-1-2',
        level: 'intermediate',
        learnerName: 'Sam',
        goals: 'My wife is from Salvador. We visit her family yearly and I want to actually talk with her parents.',
      }),
    learnerName: 'Sam',
    learnerSystemPrompt:
      `You are an INTERMEDIATE (B1) Portuguese learner doing a LESSON titled "Share an opinion" — a free-flowing discussion lesson.

PERSONA
- Name: Sam. Wife Cláudia from Salvador. Daughter Lucy 7. VC in SF.
- You CAN hold a Portuguese conversation but you HEDGE a lot, avoid taking strong positions, often soften with "talvez", "acho que", "não sei muito sobre isso".
- Occasionally make these mistakes:
  - "Pra mim, eu acho que..." (wordy)
  - "Não tenho certeza, mas..." used as escape from committing
  - "Eu acho que é importante" (vague filler)

REPLY RULES
- Reply ~85% in Portuguese, 2-3 sentences.
- HEDGE on opinions when first asked. If pushed, slowly commit.
- Be warm but reluctant to take a hard stance. The tutor's job is to push you to commit and defend.`,
    judgeRubric: `LESSON @ INTERMEDIATE (discussion, Share an opinion):
- Tutor opens by NAMING the topic in Portuguese, then asking an opening question. Doesn't make small talk first.
- Pushes the learner to COMMIT to a position (not just "tell me what you think" but "OK but which one — A or B?").
- Provides the anchor phrases from the lesson IN CONTEXT (not as a recitation up front).
- Catches hedging behavior ("você não tá comprometendo — vai, escolhe um lado") and pushes back warmly.
- Provides at least one recast when the learner stumbles grammatically.
- Doesn't let the lesson drift into pure free chat — keeps the "share an opinion" frame.`,
  },
  {
    // Advanced discussion. Tests the "challenge + nuance" behavior at
    // the top of the level ladder.
    id: 'lesson-a-1-2-defend-unpopular',
    kind: 'lesson',
    displayName: 'Lesson · a-1-2 Defend an unpopular opinion (Advanced)',
    buildTutorPrompt: () =>
      buildLessonPrompt({
        lessonId: 'a-1-2',
        level: 'advanced',
        learnerName: 'Marina',
        goals: 'I work for a Brazilian fintech and need to sound more natural in client meetings.',
      }),
    learnerName: 'Marina',
    learnerSystemPrompt:
      `You are an ADVANCED (C1) Portuguese learner doing a LESSON titled "Defend an unpopular opinion."

PERSONA
- Name: Marina. Fintech in London.
- Fluent Portuguese but sometimes textbook-stiff. Slightly under-committal in debate — you'd rather discuss balance than pick a side.
- Subtle slips: occasional wrong subjunctive ("se eu era" vs "fosse"), missed idioms.

REPLY RULES
- Reply 100% Portuguese. 2-4 sentences.
- When asked to defend an unpopular opinion, start cautiously but commit when pushed. Don't be too perfect — make subtle slips.`,
    judgeRubric: `LESSON @ ADVANCED (discussion, Defend an unpopular opinion):
- Tutor frames the lesson clearly: "today we're defending an unpopular opinion — pick one you actually hold."
- Pushes for depth: counter-arguments, "why", "but what about X?"
- Notices the learner being safe and PUSHES them out of safe vocabulary into nuance.
- Surfaces ONE elegant language move ("uma forma mais natural seria...") — passing, not a lecture.
- Doesn't let Marina hedge — calls it out warmly.
- Speaks at full native pace with idiomatic flow.`,
  },
]

const ALL_SCENARIOS = [...FREE_CONVERSATION_SCENARIOS, ...LESSON_SCENARIOS]

// ============================================================================
// OpenAI chat helper
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
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7,
      ...(args.responseFormat ? { response_format: { type: args.responseFormat } } : {}),
    }),
  })
  if (!r.ok) {
    throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`)
  }
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

// ============================================================================
// Simulate one conversation
// ============================================================================

async function simulate(s: TestScenario): Promise<Msg[]> {
  const tutorSystem = s.buildTutorPrompt()
  const learnerSystem = s.learnerSystemPrompt
  const turnCount = s.turnCount ?? 12

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
    const learnerReply = await chat({ model: 'gpt-4o-mini', messages: learnerHistory, temperature: 0.9 })
    transcript.push({ role: 'user', content: learnerReply })
    tutorHistory.push({ role: 'user', content: learnerReply })

    const tutorReply = await chat({ model: 'gpt-4o', messages: tutorHistory, temperature: 0.8 })
    transcript.push({ role: 'assistant', content: tutorReply })
    tutorHistory.push({ role: 'assistant', content: tutorReply })
    learnerHistory.push({ role: 'assistant', content: learnerReply })
    learnerHistory.push({ role: 'user', content: `Tutor's next turn: "${tutorReply}"\n\nReply as the learner would, in character. Keep it to 1-3 sentences.` })
  }
  return transcript
}

// ============================================================================
// Judge
// ============================================================================

type JudgeReport = {
  scores: Record<string, { score: number; notes: string }>
  overall: number
  summary: string
  recommended_fixes: string[]
}

/// Research-backed rubric dimensions applied to EVERY scenario (the
/// scenario-specific rubric is layered on top of these). Built from
/// the SLA literature scan in scripts/research-notes.md.
const COMMON_RUBRIC_DIMENSIONS = `
1. comprehensible_input: Is the tutor's language calibrated just above the learner's level (i+1, per Krashen)? Not too easy, not way too hard.
2. pushed_output: Does the tutor elicit and push the learner to produce LANGUAGE (Swain) — not just react with English?
3. negotiation_of_meaning: When confusion arises, does the tutor scaffold (slow down, rephrase, clarify) rather than just plowing on (Long)?
4. recast_vs_explicit_correction: Is the correction strategy fit for the learner's level — gentle recasts for low levels, more explicit at advanced?
5. thread_pulling: Does the tutor build on what the learner just said, or pivot to generic next-topic questions?
6. on_task_focus: Does the tutor stay focused on the scenario's purpose (free conv goal / lesson scene) without drifting?
7. affective_warmth: Does the tutor sound like a friend, not a teacher? Praise + curiosity, not correction-first?
8. talk_time_balance: Is the learner doing most of the talking? (Tutor turns should be SHORT — 1-2 sentences usually.)
`

async function judge(s: TestScenario, transcript: Msg[]): Promise<JudgeReport> {
  const transcriptText = transcript
    .map((m) => `${m.role === 'assistant' ? 'Tutor (Natalia)' : s.learnerName}: ${m.content}`)
    .join('\n\n')

  const judgePrompt = `You are evaluating a Brazilian Portuguese voice-tutor conversation between Natalia (the AI tutor) and a learner. You are a strict, evidence-based evaluator — DO NOT inflate scores. A 5/5 must be earned.

LEARNER PROFILE
- Name: ${s.learnerName}
- Scenario: ${s.displayName}

TUTOR PERSONA
Natalia is a warm late-20s Paulistana — casual SP slang ("tá", "pra", "tô"), allergic to textbook-formal language, friend-on-the-phone vibe, never schoolmarmish.

EVALUATE ON THESE DIMENSIONS (research-backed; score each 1-5)
${COMMON_RUBRIC_DIMENSIONS}

ALSO EVALUATE SCENARIO-SPECIFIC CRITERIA
${s.judgeRubric}

TRANSCRIPT
${transcriptText}

Produce JSON in this EXACT shape:
{
  "scores": {
    "comprehensible_input":         { "score": <1-5>, "notes": "<concrete observation>" },
    "pushed_output":                { "score": <1-5>, "notes": "<concrete observation>" },
    "negotiation_of_meaning":       { "score": <1-5>, "notes": "<concrete observation>" },
    "recast_vs_explicit_correction":{ "score": <1-5>, "notes": "<concrete observation>" },
    "thread_pulling":               { "score": <1-5>, "notes": "<concrete observation>" },
    "on_task_focus":                { "score": <1-5>, "notes": "<concrete observation>" },
    "affective_warmth":             { "score": <1-5>, "notes": "<concrete observation>" },
    "talk_time_balance":            { "score": <1-5>, "notes": "<concrete observation>" },
    "scenario_specific":            { "score": <1-5>, "notes": "<concrete observation; this captures the scenario rubric>" }
  },
  "overall":           <1-5 — your synthesized verdict, NOT an average>,
  "summary":           "<2-3 honest sentences — what worked / what was off>",
  "recommended_fixes": ["<single concrete prompt change>", "<another>", "..."]
}

Be brutally honest. If the tutor missed planted mistakes (intermediate scenario), call it out. If she over-corrected at first-timer level, call it out. If she lectured instead of conversing, call it out.`

  const raw = await chat({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.2,
    responseFormat: 'json_object',
  })
  return JSON.parse(raw) as JudgeReport
}

// ============================================================================
// Main
// ============================================================================

;(async () => {
  const startedAt = new Date()
  const sections: string[] = [
    `# Portuguese tutor — extensive conversation quality report`,
    `Generated: ${startedAt.toISOString()}`,
    ``,
    `## Rubric provenance`,
    ``,
    `Dimensions 1-8 are research-backed SLA principles (Krashen, Swain, Long, etc.). Scenario-specific criteria layered on top. See \`scripts/research-notes.md\` for sources.`,
    ``,
  ]

  type RollupRow = { id: string; displayName: string; overall: number; scores: Record<string, number> }
  const rollup: RollupRow[] = []

  for (const s of ALL_SCENARIOS) {
    console.log(`\n=== ${s.id} ===`)
    console.log('Simulating...')
    const transcript = await simulate(s)
    console.log('Judging...')
    const report = await judge(s, transcript)

    rollup.push({
      id: s.id,
      displayName: s.displayName,
      overall: report.overall,
      scores: Object.fromEntries(
        Object.entries(report.scores).map(([k, v]) => [k, v.score]),
      ),
    })

    sections.push(`## ${s.displayName} — overall ${report.overall}/5`)
    sections.push(``)
    sections.push(`| Dimension | Score | Note |`)
    sections.push(`|---|---|---|`)
    for (const [k, v] of Object.entries(report.scores)) {
      sections.push(`| ${k.replace(/_/g, ' ')} | ${v.score}/5 | ${v.notes} |`)
    }
    sections.push(``)
    sections.push(`**Summary:** ${report.summary}`)
    sections.push(``)
    if (report.recommended_fixes.length > 0) {
      sections.push(`**Recommended fixes:**`)
      for (const f of report.recommended_fixes) sections.push(`- ${f}`)
      sections.push(``)
    }
    sections.push(`<details><summary>Transcript</summary>\n`)
    for (const m of transcript) {
      sections.push(`**${m.role === 'assistant' ? 'Natalia' : s.learnerName}:** ${m.content}\n`)
    }
    sections.push(`</details>`)
    sections.push(``)
  }

  // Top-of-file rollup
  const rollupBlock = [
    `## Rollup`,
    ``,
    `| Scenario | Overall | CI | PO | NoM | Rec | Thread | OnTask | Warmth | TalkBal | Specific |`,
    `|---|---|---|---|---|---|---|---|---|---|---|`,
    ...rollup.map((r) =>
      `| ${r.displayName} | **${r.overall}/5** | ${r.scores.comprehensible_input ?? '-'} | ${r.scores.pushed_output ?? '-'} | ${r.scores.negotiation_of_meaning ?? '-'} | ${r.scores.recast_vs_explicit_correction ?? '-'} | ${r.scores.thread_pulling ?? '-'} | ${r.scores.on_task_focus ?? '-'} | ${r.scores.affective_warmth ?? '-'} | ${r.scores.talk_time_balance ?? '-'} | ${r.scores.scenario_specific ?? '-'} |`,
    ),
    ``,
    `Legend: CI=comprehensible input · PO=pushed output · NoM=negotiation of meaning · Rec=recast/correction · Thread=thread pulling · OnTask=on-task focus · Warmth=affective warmth · TalkBal=talk-time balance · Specific=scenario-specific`,
    ``,
  ]
  sections.splice(2, 0, ...rollupBlock)

  const outPath = path.resolve(process.cwd(), 'conversation-quality-report.md')
  fs.writeFileSync(outPath, sections.join('\n'))
  console.log(`\nReport written to ${outPath}`)
  console.log(`\nRollup:`)
  for (const r of rollup) console.log(`  ${r.displayName.padEnd(60)} ${r.overall}/5`)
})().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
