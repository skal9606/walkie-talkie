import { cost, type ModelKey } from './cost'

/**
 * Minimal wrapper around OpenAI Chat Completions. Adds usage to the cost
 * tracker on every call and returns the assistant message string + raw
 * usage so callers can decide whether to retry / abort.
 *
 * We don't use the `openai` npm package — keeps the dep footprint small
 * and matches the rest of the codebase's lightweight fetch-based style.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatOptions = {
  model: ModelKey
  messages: ChatMessage[]
  /** 0..2; defaults to 0.8 to match production Realtime default. */
  temperature?: number
  /** Output token limit; defaults to 800 for tutor turns. */
  maxTokens?: number
  /** JSON mode for the judge — forces JSON-shaped output. */
  jsonMode?: boolean
  /** Tag the cost under a category so the report can break it down. */
  category?: string
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export async function chat(opts: ChatOptions): Promise<{
  content: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local or your shell.')
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxTokens ?? 800,
  }
  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' }
  }
  const r = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '<no body>')
    throw new Error(`OpenAI ${r.status} for ${opts.model}: ${text.slice(0, 400)}`)
  }
  const data = (await r.json()) as {
    choices: Array<{ message: { content: string } }>
    usage: { prompt_tokens: number; completion_tokens: number }
  }
  const content = data.choices[0]?.message?.content ?? ''
  const inputTokens = data.usage.prompt_tokens
  const outputTokens = data.usage.completion_tokens
  const costUsd = cost.add(opts.model, inputTokens, outputTokens, opts.category)
  return { content, inputTokens, outputTokens, costUsd }
}
