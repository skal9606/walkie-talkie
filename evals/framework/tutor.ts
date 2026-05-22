import { chat, type ChatMessage } from './openai-client'
import { buildPrompt, type PromptInputs } from './prompt'
import type { TranscriptTurn } from './types'

/**
 * The "system under test". Sends the EXACT production prompt for a
 * (language, level) pair and returns the next tutor utterance given the
 * transcript so far.
 *
 * We use gpt-4o for the tutor side instead of gpt-realtime-2. Caveat:
 * production runs on the Realtime API with a different fine-tune of the
 * same base model, so there may be small behavioral differences. gpt-4o
 * is the closest text-mode model and shares the same pricing tier. Note
 * this caveat in the final report.
 */

export async function tutorReply(
  promptInputs: PromptInputs,
  transcript: TranscriptTurn[],
  category?: string,
): Promise<string> {
  const systemPrompt = buildPrompt(promptInputs)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...transcript.map((t) => ({
      // Learner turns become USER messages from the tutor's POV.
      role: (t.role === 'learner' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: t.content,
    })),
  ]
  // If the transcript is empty (first turn), inject a synthetic primer
  // so the model emits the opener as defined in its scenario prompt.
  // The Realtime API doesn't need this primer (assistant speaks first
  // on session.create); Chat Completions requires at least one user
  // turn to respond to.
  if (messages.length === 1) {
    messages.push({
      role: 'user',
      content: '[Conversation start — please greet the learner with your opener now.]',
    })
  }
  const result = await chat({
    model: 'gpt-4o',
    messages,
    temperature: 0.85,
    maxTokens: 400,
    category,
  })
  return result.content.trim()
}
