/**
 * Cost tracking. Every OpenAI call routes through openai-client.ts which
 * accumulates token usage here. The runner checks `total()` before each
 * new conversation and aborts gracefully if the next call would exceed
 * the budget cap.
 *
 * Prices in USD per 1M tokens. Sourced from OpenAI's published pricing
 * as of 2026-05-22 — update when OpenAI changes their list.
 */

export type ModelKey =
  | 'gpt-4o'
  | 'gpt-4o-mini'

export const MODEL_PRICES: Record<ModelKey, { input: number; output: number }> = {
  // gpt-4o ~$5 / $20 per million tokens (input / output).
  'gpt-4o': { input: 5.0, output: 20.0 },
  // gpt-4o-mini ~$0.15 / $0.60 per million.
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
}

type Usage = { inputTokens: number; outputTokens: number; costUsd: number }

class CostTracker {
  private usageByModel = new Map<ModelKey, Usage>()
  private usageByCategory = new Map<string, number>()

  add(model: ModelKey, inputTokens: number, outputTokens: number, category?: string) {
    const price = MODEL_PRICES[model]
    const costUsd =
      (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output
    const existing = this.usageByModel.get(model) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
    this.usageByModel.set(model, {
      inputTokens: existing.inputTokens + inputTokens,
      outputTokens: existing.outputTokens + outputTokens,
      costUsd: existing.costUsd + costUsd,
    })
    if (category) {
      this.usageByCategory.set(category, (this.usageByCategory.get(category) ?? 0) + costUsd)
    }
    return costUsd
  }

  total(): number {
    let sum = 0
    for (const u of this.usageByModel.values()) sum += u.costUsd
    return sum
  }

  byModel(): Record<string, Usage> {
    const out: Record<string, Usage> = {}
    for (const [k, v] of this.usageByModel) out[k] = v
    return out
  }

  byCategory(): Record<string, number> {
    return Object.fromEntries(this.usageByCategory)
  }

  /** Hard-budget check used by the runner pre-flight. */
  canSpend(estimatedNextCallUsd: number, budgetCapUsd: number): boolean {
    return this.total() + estimatedNextCallUsd <= budgetCapUsd
  }

  reset() {
    this.usageByModel.clear()
    this.usageByCategory.clear()
  }
}

/** Singleton — there's only one budget per run. */
export const cost = new CostTracker()
