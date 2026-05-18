/// Web-side counterpart to the iOS TutorPrompt "MISTAKES TO REVISIT"
/// block. Closes the cross-session memory gap on web — mistakes were
/// stored server-side via /api/review but never injected into the
/// next session's system prompt. Now they are.
///
/// Source: the recentMistakes payload returned by /api/session, which
/// is loaded from profiles.recent_mistakes (per language). Web only
/// uses this block for free-conversation sessions — for roleplays
/// (barista / in-laws), surfacing prior grammar slips would break
/// character.

export type PromptMistake = {
  original: string
  corrected: string
  explanation: string
}

const MAX_MISTAKES_IN_PROMPT = 6

export function buildMistakesBlock(mistakes: PromptMistake[]): string {
  const cleaned = mistakes.filter(
    (m) => m.original?.trim() && m.corrected?.trim(),
  )
  if (cleaned.length === 0) return ''
  const lines = cleaned.slice(0, MAX_MISTAKES_IN_PROMPT).map((m) => {
    const explanation = m.explanation?.trim() ? ` — ${m.explanation.trim()}` : ''
    return `- They said "${m.original}"; correct form is "${m.corrected}"${explanation}`
  })
  return `MISTAKES TO REVISIT (from prior sessions) — WEAVE IN, DO NOT OPEN WITH (CRITICAL)
${lines.join('\n')}
Rules for using this list:
- NEVER reference these in the opener. The opener stays warm and reactive.
- Listen to the conversation. When the learner is about to use one of these structures OR has a natural opening, ONE of three moves:
  1. Gentle recast: if they make the same slip again, model the correct form in your reply without calling it out.
  2. Mini callback: "I noticed last time you said X — try saying Y instead. Want to try a quick sentence with it?"
  3. Steer toward a moment where they'd need the correct form, then notice if they get it.
- ONE mistake at a time. Never two in a row. If they nail one, move on; don't drill.
- If none of these mistakes come up naturally, that's fine — don't force it.`
}
