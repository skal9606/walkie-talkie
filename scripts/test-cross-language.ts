/**
 * Cross-language validation — runs just the Intermediate free-conv
 * scenario for each of the 5 supported languages so we can confirm
 * the prompt fixes (typical-B1-errors recast list + hedging detection
 * + noise handling) work uniformly across languages, not just PT.
 *
 * Cost: ~$0.15 × 5 = ~$0.75.
 *
 * Usage: npx tsx scripts/test-cross-language.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { natalia } from '../src/lib/tutors/pt-br/natalia.js'
import { ptBrScenarios } from '../src/lib/tutors/pt-br/scenarios.js'
import { maria } from '../src/lib/tutors/es-MX/maria.js'
import { esMxScenarios } from '../src/lib/tutors/es-MX/scenarios.js'
import { sofia } from '../src/lib/tutors/it-IT/sofia.js'
import { itItScenarios } from '../src/lib/tutors/it-IT/scenarios.js'
import { camille } from '../src/lib/tutors/fr-FR/camille.js'
import { frFrScenarios } from '../src/lib/tutors/fr-FR/scenarios.js'
import { lena } from '../src/lib/tutors/de-DE/lena.js'
import { deDeScenarios } from '../src/lib/tutors/de-DE/scenarios.js'
import { buildLearnerContextBlock } from '../src/lib/profile.js'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
const OPENAI_KEY = process.env.OPENAI_API_KEY!

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

async function chat(args: { model: string; messages: Msg[]; temperature?: number; responseFormat?: 'json_object' }): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model, messages: args.messages, temperature: args.temperature ?? 0.7,
      ...(args.responseFormat ? { response_format: { type: args.responseFormat } } : {}),
    }),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}`)
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

// Per-language test config — planted mistakes specific to each L2.
const LANGS = [
  {
    code: 'pt-BR',
    name: 'Portuguese',
    tutor: natalia,
    scenarios: ptBrScenarios,
    tutorId: 'pt-br-natalia',
    plantedMistakes: [
      '"eu fui no restaurante" (should be "fui ao restaurante")',
      '"a problema" (should be "o problema")',
      '"se eu tinha tempo" (should be "se eu tivesse tempo")',
    ],
    learnerPersona: `You're an INTERMEDIATE Portuguese learner. Speak ~85% Portuguese. MUST use these incorrect forms at least once each, naturally: "eu fui no restaurante" (correct: "fui ao restaurante"), "a problema" (correct: "o problema"), "se eu tinha tempo" (correct: "se eu tivesse tempo"). 2-3 sentences per reply. Talk about Salvador, your wife Cláudia, your daughter Lucy.`,
  },
  {
    code: 'es-MX',
    name: 'Spanish',
    tutor: maria,
    scenarios: esMxScenarios,
    tutorId: 'es-mx-maria',
    plantedMistakes: [
      '"soy cansado" (should be "estoy cansado")',
      '"la problema" (should be "el problema")',
      '"si yo tenía tiempo" (should be "si yo tuviera tiempo")',
      '"gracias para venir" (should be "gracias por venir")',
    ],
    learnerPersona: `You're an INTERMEDIATE Spanish learner. Speak ~85% Spanish. MUST use these incorrect forms at least once each, naturally: "soy cansado" (correct: "estoy cansado"), "la problema" (correct: "el problema"), "si yo tenía tiempo" (correct: "si yo tuviera tiempo"), "gracias para venir" (correct: "gracias por venir"). 2-3 sentences per reply. Talk about Mexico City, your work, your weekend.`,
  },
  {
    code: 'it-IT',
    name: 'Italian',
    tutor: sofia,
    scenarios: itItScenarios,
    tutorId: 'it-it-sofia',
    plantedMistakes: [
      '"ho andato a Roma" (should be "sono andato a Roma")',
      '"il problema" stays masculine — say "la problema" wrong once',
      '"penso che è bello" (should be "penso che sia bello")',
      '"vado a pizzeria" (should be "vado in pizzeria")',
    ],
    learnerPersona: `You're an INTERMEDIATE Italian learner. Speak ~85% Italian. MUST use these incorrect forms at least once each: "ho andato a Roma" (correct: "sono andato a Roma"), "la problema" (correct: "il problema"), "penso che è bello" (correct: "penso che SIA bello"), "vado a pizzeria" (correct: "vado IN pizzeria"). 2-3 sentences per reply. Talk about your trip to Rome, food, work.`,
  },
  {
    code: 'fr-FR',
    name: 'French',
    tutor: camille,
    scenarios: frFrScenarios,
    tutorId: 'fr-fr-camille',
    plantedMistakes: [
      '"j\'ai allé à Paris" (should be "je suis allé à Paris")',
      '"il faut que je vais" (should be "il faut que j\'aille")',
      '"si j\'avais le temps, je vais le faire" (should use conditionnel: "je le ferais")',
      '"la problème" (should be "le problème")',
    ],
    learnerPersona: `You're an INTERMEDIATE French learner. Speak ~85% French. MUST use these incorrect forms at least once each: "j'ai allé à Paris" (correct: "je suis allé"), "il faut que je vais" (correct: "il faut que j'aille"), "si j'avais le temps, je vais le faire" (correct: "je le ferais"), "la problème" (correct: "le problème"). 2-3 sentences per reply. Talk about Paris, your work, your weekend.`,
  },
  {
    code: 'de-DE',
    name: 'German',
    tutor: lena,
    scenarios: deDeScenarios,
    tutorId: 'de-de-lena',
    plantedMistakes: [
      '"weil ich bin müde" (should put verb at end: "weil ich müde BIN")',
      '"ich habe gegangen" (should be "ich BIN gegangen")',
      '"wenn ich Zeit habe, würde ich kommen" (should use Konjunktiv II: "wenn ich Zeit HÄTTE")',
      '"die Mädchen" (should be "das Mädchen" — neuter)',
    ],
    learnerPersona: `You're an INTERMEDIATE German learner. Speak ~85% German. MUST use these incorrect forms at least once each: "weil ich bin müde" (correct: verb at end "weil ich müde BIN"), "ich habe gegangen" (correct: "ich BIN gegangen"), "wenn ich Zeit habe, würde ich kommen" (correct: "wenn ich Zeit HÄTTE"), "die Mädchen" referring to one girl (correct: "das Mädchen"). 2-3 sentences per reply. Talk about Berlin, work, weekend plans.`,
  },
]

async function runOne(lang: typeof LANGS[number]) {
  const base = lang.tutor.buildSystemInstructions({ nativeLanguage: 'English' })
  const scenario = lang.scenarios.freeConversations.find((s) => s.id === 'free-intermediate')!
  const addon = scenario.buildPromptAddon({ name: 'Sam', memory: [], nativeLanguage: 'English' })
  const learnerCtx = buildLearnerContextBlock({
    name: 'Sam', nativeLanguage: 'English', tutorId: lang.tutorId as never,
    level: 'intermediate', goals: `Learning ${lang.name} for travel + family.`,
  })
  const tutorSystem = [base, addon, learnerCtx].filter(Boolean).join('\n\n')

  const tutorHistory: Msg[] = [
    { role: 'system', content: tutorSystem },
    { role: 'user', content: '[Session just started. Produce your opener exactly as you would in a fresh voice session.]' },
  ]
  const opener = await chat({ model: 'gpt-4o', messages: tutorHistory, temperature: 0.8 })
  tutorHistory.push({ role: 'assistant', content: opener })

  const learnerHistory: Msg[] = [
    { role: 'system', content: lang.learnerPersona },
    { role: 'user', content: `Tutor's opener: "${opener}"\n\nReply in character.` },
  ]
  const transcript: Msg[] = [{ role: 'assistant', content: opener }]
  for (let i = 0; i < 10; i++) {
    const learnerReply = await chat({ model: 'gpt-4o-mini', messages: learnerHistory, temperature: 0.9 })
    transcript.push({ role: 'user', content: learnerReply })
    tutorHistory.push({ role: 'user', content: learnerReply })
    const tutorReply = await chat({ model: 'gpt-4o', messages: tutorHistory, temperature: 0.8 })
    transcript.push({ role: 'assistant', content: tutorReply })
    tutorHistory.push({ role: 'assistant', content: tutorReply })
    learnerHistory.push({ role: 'assistant', content: learnerReply })
    learnerHistory.push({ role: 'user', content: `Tutor's next turn: "${tutorReply}"\n\nReply in character. 1-3 sentences.` })
  }

  // Judge — focus specifically on whether planted mistakes got recast.
  const transcriptText = transcript.map((m) => `${m.role === 'assistant' ? 'Tutor' : 'Sam'}: ${m.content}`).join('\n\n')
  const judgePrompt = `You are evaluating a ${lang.name} voice-tutor conversation. The simulated learner was PLANTED with these specific mistakes that they were supposed to make:
${lang.plantedMistakes.map((m) => `- ${m}`).join('\n')}

For each planted mistake, did the tutor catch and recast it (count it as caught even if recast was very brief / in passing)? Also assess overall how the tutor handled mistakes.

TRANSCRIPT
${transcriptText}

Output JSON:
{
  "planted_caught":   <number of planted mistakes the tutor recast — be strict>,
  "planted_total":    ${lang.plantedMistakes.length},
  "mistakes_score":   <1-5, holistic score on mistake handling>,
  "overall":          <1-5, holistic score on the conversation>,
  "notes":            "<2 sentences>"
}`

  const raw = await chat({
    model: 'gpt-4o', messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.2, responseFormat: 'json_object',
  })
  return { lang, transcript, ...JSON.parse(raw) }
}

;(async () => {
  const sections: string[] = [
    `# Cross-language intermediate validation`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `Tests the typical-B1-errors recast list across all 5 languages with planted mistakes.`,
    ``,
    `| Language | Planted | Caught | Mistakes score | Overall |`,
    `|---|---|---|---|---|`,
  ]
  const rollup: Array<{ name: string; planted: number; caught: number; mScore: number; overall: number }> = []

  for (const lang of LANGS) {
    console.log(`\n=== ${lang.code} (${lang.name}) ===`)
    const r = await runOne(lang)
    rollup.push({
      name: lang.name, planted: r.planted_total, caught: r.planted_caught,
      mScore: r.mistakes_score, overall: r.overall,
    })
    sections.push(`| ${lang.name} | ${r.planted_total} | ${r.planted_caught} | ${r.mistakes_score}/5 | ${r.overall}/5 |`)
    sections[sections.length - 1] // no-op, just for clarity
  }

  // Per-language details
  for (let i = 0; i < LANGS.length; i++) {
    const lang = LANGS[i]
    const r = rollup[i]
    sections.push(``)
    sections.push(`## ${lang.name} — caught ${r.caught}/${r.planted}, mistakes ${r.mScore}/5, overall ${r.overall}/5`)
  }

  const outPath = path.resolve(process.cwd(), 'cross-language-report.md')
  fs.writeFileSync(outPath, sections.join('\n'))
  console.log(`\nReport written to ${outPath}`)
  console.log(`\nRollup:`)
  for (const r of rollup) console.log(`  ${r.name.padEnd(12)} caught ${r.caught}/${r.planted}  mistakes ${r.mScore}/5  overall ${r.overall}/5`)
})().catch((err) => { console.error(err); process.exit(1) })
