import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cost } from './cost'
import type { TestResult } from './types'

/**
 * Writes per-run artifacts under evals/results/<timestamp>/:
 *   - transcripts/<test-id>.json   — full conversation + score + spec
 *   - scores.csv                    — flat one-row-per-test rollup
 *   - summary.md                    — non-engineer readable narrative
 *   - cost.json                     — per-model + per-category spend
 */

export function writeRunArtifacts(
  outDir: string,
  results: TestResult[],
  failed: Array<{ id: string; reason: string }>,
): void {
  mkdirSync(outDir, { recursive: true })
  mkdirSync(join(outDir, 'transcripts'), { recursive: true })

  for (const r of results) {
    writeFileSync(
      join(outDir, 'transcripts', `${r.spec.id}.json`),
      JSON.stringify(r, null, 2),
    )
  }

  writeFileSync(join(outDir, 'scores.csv'), buildScoresCsv(results))
  writeFileSync(join(outDir, 'summary.md'), buildSummaryMarkdown(results, failed))
  writeFileSync(
    join(outDir, 'cost.json'),
    JSON.stringify(
      {
        total: cost.total(),
        byModel: cost.byModel(),
        byCategory: cost.byCategory(),
      },
      null,
      2,
    ),
  )
}

function buildScoresCsv(results: TestResult[]): string {
  if (results.length === 0) return 'no results\n'
  // Find every dimension key across all rubrics so the CSV has stable cols.
  const dimKeys = new Set<string>()
  for (const r of results) {
    for (const k of Object.keys(r.score.scores)) dimKeys.add(k)
  }
  const sortedDims = Array.from(dimKeys).sort()
  const header = [
    'test_id',
    'category',
    'language',
    'level',
    'persona',
    'overall',
    'flags',
    'cost_usd',
    'duration_ms',
    ...sortedDims,
  ]
  const rows = results.map((r) => {
    const row: (string | number)[] = [
      r.spec.id,
      r.spec.category,
      r.spec.language,
      r.spec.level,
      r.spec.persona,
      r.score.overall,
      r.score.flags.join('|'),
      r.costUsd,
      r.durationMs,
    ]
    for (const k of sortedDims) {
      row.push(r.score.scores[k] ?? '')
    }
    return row.map(csvCell).join(',')
  })
  return [header.join(','), ...rows].join('\n') + '\n'
}

function csvCell(v: string | number): string {
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildSummaryMarkdown(
  results: TestResult[],
  failed: Array<{ id: string; reason: string }>,
): string {
  const sections: string[] = []
  sections.push(`# Conversationality eval run\n`)
  sections.push(`**${results.length}** tests passed, **${failed.length}** errored.\n`)
  sections.push(`**Total cost:** $${cost.total().toFixed(2)}\n`)

  if (results.length === 0) {
    sections.push(`\nNo tests completed.\n`)
    return sections.join('\n')
  }

  // Overall summary table.
  const byCategory = new Map<string, TestResult[]>()
  for (const r of results) {
    const arr = byCategory.get(r.spec.category) ?? []
    arr.push(r)
    byCategory.set(r.spec.category, arr)
  }
  sections.push(`\n## At a glance\n`)
  sections.push(`| Category | Tests | Avg overall | Worst score | Common flags |`)
  sections.push(`|---|---|---|---|---|`)
  for (const [category, arr] of byCategory) {
    const avg = arr.reduce((a, r) => a + r.score.overall, 0) / arr.length
    const worst = Math.min(...arr.map((r) => r.score.overall))
    const flagCounts = new Map<string, number>()
    for (const r of arr) {
      for (const f of r.score.flags) {
        flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1)
      }
    }
    const commonFlags = Array.from(flagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f, n]) => `${f}×${n}`)
      .join(', ') || '—'
    sections.push(
      `| ${category} | ${arr.length} | ${avg.toFixed(1)} | ${worst.toFixed(1)} | ${commonFlags} |`,
    )
  }

  // Per-test detail.
  sections.push(`\n## Per-test results\n`)
  const sorted = [...results].sort((a, b) => a.score.overall - b.score.overall)
  for (const r of sorted) {
    sections.push(`### ${r.spec.id} — overall ${r.score.overall}/5`)
    sections.push(``)
    sections.push(`- **Language**: ${r.spec.language}`)
    sections.push(`- **Level**: ${r.spec.level}`)
    sections.push(`- **Persona**: ${r.spec.persona}`)
    sections.push(`- **Cost**: $${r.costUsd.toFixed(3)}`)
    if (r.score.flags.length > 0) {
      sections.push(`- **Flags**: \`${r.score.flags.join('`, `')}\``)
    }
    sections.push(``)
    sections.push(`Dimension scores:\n`)
    for (const [k, v] of Object.entries(r.score.scores)) {
      sections.push(`- **${k}**: ${v}/5 — ${r.score.justifications[k] ?? ''}`)
    }
    sections.push(``)
    sections.push(`<details><summary>Transcript</summary>\n`)
    for (const turn of r.transcript) {
      sections.push(`\n**${turn.role.toUpperCase()}**: ${turn.content}\n`)
    }
    sections.push(`</details>\n`)
  }

  if (failed.length > 0) {
    sections.push(`\n## Failed tests\n`)
    for (const f of failed) {
      sections.push(`- **${f.id}**: ${f.reason}`)
    }
  }

  // Cost breakdown.
  sections.push(`\n## Cost breakdown\n`)
  sections.push(`### By model\n`)
  sections.push(`| Model | Input tokens | Output tokens | Cost USD |`)
  sections.push(`|---|---|---|---|`)
  for (const [m, u] of Object.entries(cost.byModel())) {
    sections.push(
      `| ${m} | ${u.inputTokens.toLocaleString()} | ${u.outputTokens.toLocaleString()} | $${u.costUsd.toFixed(2)} |`,
    )
  }
  sections.push(`\n### By test category\n`)
  sections.push(`| Category | Cost USD |`)
  sections.push(`|---|---|`)
  for (const [c, n] of Object.entries(cost.byCategory())) {
    sections.push(`| ${c} | $${n.toFixed(2)} |`)
  }

  return sections.join('\n') + '\n'
}
