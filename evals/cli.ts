import { runSuite } from './framework/runner'
import { writeRunArtifacts } from './framework/report'
import { cost } from './framework/cost'
import type { TestSpec, TestCategory } from './framework/types'
import { levelCalibrationSpecs } from './categories/level-calibration'
import { overCorrectionSpecs } from './categories/over-correction'
import { confusionRecoverySpecs } from './categories/confusion-recovery'
import { momentumSpecs } from './categories/momentum'
import { repetitionSpecs } from './categories/repetition'
import { codeSwitchingSpecs } from './categories/code-switching'
import { adaptiveDifficultySpecs } from './categories/adaptive-difficulty'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

/**
 * Entry point. `npx tsx evals/cli.ts [flags]`.
 *
 * Flags:
 *   --smoke                Run minimal subset (~$0.50).
 *   --budget=<usd>         Hard cap. Default 20.
 *   --category=<id>        Run only one category (level-calibration etc.).
 *
 * Env:
 *   OPENAI_API_KEY         Required. Loaded from .env.local if present.
 *   EVAL_BUDGET=<usd>      Alternative to --budget flag.
 */

type CliArgs = {
  smoke: boolean
  budget: number
  category?: TestCategory
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2)
  let smoke = false
  let budget = 20
  let category: TestCategory | undefined
  for (const arg of argv) {
    if (arg === '--smoke') smoke = true
    else if (arg.startsWith('--budget=')) budget = Number(arg.slice('--budget='.length))
    else if (arg.startsWith('--category=')) category = arg.slice('--category='.length) as TestCategory
  }
  if (process.env.EVAL_BUDGET) budget = Number(process.env.EVAL_BUDGET)
  return { smoke, budget, category }
}

function loadDotEnvLocal() {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function buildAllSpecs(opts: { smoke: boolean }): TestSpec[] {
  if (opts.smoke) {
    return levelCalibrationSpecs({ smoke: true })
  }
  return [
    ...levelCalibrationSpecs(),
    ...overCorrectionSpecs(),
    ...confusionRecoverySpecs(),
    ...momentumSpecs(),
    ...repetitionSpecs(),
    ...codeSwitchingSpecs(),
    ...adaptiveDifficultySpecs(),
  ]
}

async function main() {
  loadDotEnvLocal()
  const args = parseArgs()
  if (!process.env.OPENAI_API_KEY) {
    console.error('Set OPENAI_API_KEY in .env.local or your shell.')
    process.exit(1)
  }

  let specs = buildAllSpecs({ smoke: args.smoke })
  if (args.category) {
    specs = specs.filter((s) => s.category === args.category)
    if (specs.length === 0) {
      console.error(`No specs match --category=${args.category}`)
      process.exit(1)
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = join(process.cwd(), 'evals', 'results', timestamp)

  console.log(`\n=== Conversationality eval ===`)
  console.log(`Mode:     ${args.smoke ? 'SMOKE' : 'FULL'}`)
  console.log(`Tests:    ${specs.length}`)
  console.log(`Budget:   $${args.budget.toFixed(2)}`)
  console.log(`Output:   evals/results/${timestamp}/\n`)

  const failed: Array<{ id: string; reason: string }> = []
  const results = await runSuite(specs, {
    budgetCapUsd: args.budget,
    onTestComplete: (r) => {
      console.log(
        `  ✓ ${r.spec.id.padEnd(50)} overall=${r.score.overall}/5  ` +
          `cost=$${r.costUsd.toFixed(3)}  total=$${cost.total().toFixed(2)}`,
      )
    },
    onTestError: (spec, err) => {
      failed.push({ id: spec.id, reason: err.message })
      console.log(`  ✗ ${spec.id} — ${err.message.slice(0, 100)}`)
    },
  })

  writeRunArtifacts(outDir, results, failed)

  console.log(`\n=== Done ===`)
  console.log(`Total spend:  $${cost.total().toFixed(2)}`)
  console.log(`Results:      ${outDir}`)
  console.log(`Summary:      ${outDir}/summary.md`)
  console.log()
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`)
  console.error(err.stack)
  process.exit(1)
})
