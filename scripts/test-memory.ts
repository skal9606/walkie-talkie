/**
 * Live integration test for the cross-session memory loop.
 *
 * What it does, in order:
 *   1. Looks up your real (non-anon) Supabase user by email.
 *   2. Prints the recent_mistakes / recent_memory / next_focus the
 *      tutor would see in your NEXT session for each language. This
 *      is what's actually in the database right now.
 *   3. Runs a synthetic learner transcript through reviewTranscript()
 *      to confirm the extraction model picks up the planted facts +
 *      grammar slips. (Read-only — does NOT write to your profile.)
 *
 * Usage:
 *   npx tsx scripts/test-memory.ts <your-email>
 *
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { reviewTranscript, loadLearnerState } from '../lib/api-handlers.js'
import * as fs from 'fs'
import * as path from 'path'

// Inline .env.local loader so we don't have to add the dotenv dependency
// just for this script. Same shape as standard KEY=value lines.
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_KEY = process.env.OPENAI_API_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
  console.error('Missing env: need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY in .env.local')
  process.exit(1)
}

const targetEmail = process.argv[2]
if (!targetEmail) {
  console.error('Usage: npx tsx scripts/test-memory.ts <your-email>')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserId(email: string): Promise<string | null> {
  // listUsers paginates; for a small base we just walk pages.
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id
    if (data.users.length < 200) return null
    page++
  }
}

async function dumpCurrentLearnerState(userId: string) {
  console.log('\n=== Current learner state (per language) ===\n')
  for (const lang of ['pt-BR', 'es-MX', 'it-IT', 'fr-FR', 'de-DE']) {
    const state = await loadLearnerState(userId, lang)
    const hasAny =
      state.mistakes.length > 0 ||
      state.memory.length > 0 ||
      !!state.nextFocus
    if (!hasAny) continue
    console.log(`[${lang}]`)
    console.log(`  memory (${state.memory.length}):`)
    for (const m of state.memory) console.log(`    - ${m}`)
    console.log(`  mistakes (${state.mistakes.length}):`)
    for (const m of state.mistakes) {
      console.log(`    - "${m.original}" → "${m.corrected}" (${m.explanation})`)
    }
    console.log(`  nextFocus: ${state.nextFocus ?? '(none)'}\n`)
  }
}

async function testExtraction() {
  console.log('\n=== Live extraction test ===')
  console.log('Sending a synthetic transcript with planted facts + a grammar slip.\n')

  // Synthetic Portuguese-tutor session. Plants:
  //   - personal facts: name Sam, wife Cláudia, daughter Lucy is 7,
  //     works as a VC in SF, going to Brazil in March
  //   - grammar slip: "eu fui no restaurante ontem" should be "fui ao
  //     restaurante" (preposition mistake)
  //   - vocab gap: weak past-tense
  const transcript = [
    { role: 'assistant' as const, text: 'Oi! Sou a Natalia. Como posso te chamar?' },
    { role: 'user' as const, text: 'Hi, my name is Sam. I am learning Portuguese because my wife Cláudia is from Salvador.' },
    { role: 'assistant' as const, text: 'Que legal! Salvador é maravilhosa. Você já visitou?' },
    { role: 'user' as const, text: 'Yes, I went last year. We are going again in March with our daughter Lucy. She is 7.' },
    { role: 'assistant' as const, text: 'Que fofa! E você trabalha com o quê?' },
    { role: 'user' as const, text: 'I work as a venture capitalist in San Francisco. Yesterday eu fui no restaurante brasileiro com a Cláudia.' },
    { role: 'assistant' as const, text: 'Ah, "fui ao restaurante" — com "ao". Que restaurante foi?' },
    { role: 'user' as const, text: 'Um restaurante chamado Bossa. Eu comi feijoada e gostei muito.' },
  ]

  const result = await reviewTranscript(OPENAI_KEY, {
    transcript,
    language: 'pt-BR',
    scenario: 'Free conversation — first-time learner introduction',
  })

  if (result.status !== 200) {
    console.error('❌ Extraction failed:', result.body)
    return
  }
  type ReviewBody = {
    summary?: string
    memory?: string[]
    corrections?: Array<{ original?: string; corrected?: string; explanation?: string }>
    nextFocus?: string | null
  }
  const body = result.body as ReviewBody
  console.log('Summary:    ', body.summary)
  console.log('\nMemory bullets extracted:')
  for (const m of body.memory ?? []) console.log(`  - ${m}`)
  console.log('\nCorrections extracted:')
  for (const c of body.corrections ?? []) {
    console.log(`  - "${c.original}" → "${c.corrected}" (${c.explanation})`)
  }
  console.log('\nNextFocus:  ', body.nextFocus ?? '(none)')

  // Quick assertions on the planted signals.
  const memText = (body.memory ?? []).join(' | ').toLowerCase()
  const corrText = (body.corrections ?? []).map((c) => c.original ?? '').join(' | ').toLowerCase()
  const checks: Array<[string, boolean]> = [
    ['Caught the wife from Salvador',     memText.includes('salvador') || memText.includes('cláudia')],
    ['Caught the daughter Lucy/age 7',    memText.includes('lucy') || memText.includes('daughter') || memText.includes('7')],
    ['Caught the VC job',                 memText.includes('venture') || memText.includes('vc') || memText.includes('capitalist')],
    ['Caught the upcoming March trip',    memText.includes('march') || memText.includes('brazil') || memText.includes('salvador')],
    ['Caught the "fui no" → "fui ao" slip', corrText.includes('no restaurante') || corrText.includes('fui no')],
  ]
  console.log('\n=== Planted-signal checks ===')
  for (const [label, passed] of checks) {
    console.log(`  ${passed ? '✅' : '❌'} ${label}`)
  }
  const passed = checks.filter(([, ok]) => ok).length
  console.log(`\n${passed}/${checks.length} signals caught.\n`)
}

;(async () => {
  console.log(`Looking up user by email: ${targetEmail}`)
  const userId = await findUserId(targetEmail)
  if (!userId) {
    console.warn(`No Supabase user found for ${targetEmail} — skipping current-state dump.`)
  } else {
    console.log(`User id: ${userId}`)
    await dumpCurrentLearnerState(userId)
  }
  await testExtraction()
})().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
