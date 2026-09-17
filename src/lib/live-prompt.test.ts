import { describe, it, expect } from 'vitest'
import { LIVE_PROMPT_ADDENDUM } from './live'

// Regression for a real gpt-live-1 session (2026-09-17): the learner cut in
// with "Sim, exatamente.", Natalia yielded, then said "Beleza, deixa eu
// pensar em como te ajudar com isso rapidinho." and moved on to the next
// lesson item without ever reacting to the answer. Full duplex means any
// hesitation is spoken aloud, so the addendum has to forbid it explicitly.

describe('LIVE_PROMPT_ADDENDUM', () => {
  it('tells the tutor to react to what the learner said before continuing', () => {
    expect(LIVE_PROMPT_ADDENDUM).toMatch(/React to what they said in one short sentence .* before you continue/)
  })

  it('takes an early answer as applying to the part of the question already asked', () => {
    expect(LIVE_PROMPT_ADDENDUM).toMatch(/question you had not finished asking/)
    expect(LIVE_PROMPT_ADDENDUM).toMatch(/applying to the part you already said/)
  })

  it('forbids thinking-aloud filler by example', () => {
    const line = LIVE_PROMPT_ADDENDUM.split('\n').find((l) => l.includes('deixa eu pensar'))
    expect(line).toBeDefined()
    expect(line).toMatch(/Never narrate thinking/)
    expect(line).toContain('"let me think"')
    expect(line).toContain('"rapidinho"')
  })

  it('keeps the backchannel, listening, and greeting guidance', () => {
    expect(LIVE_PROMPT_ADDENDUM).toMatch(/Backchannel policy/)
    expect(LIVE_PROMPT_ADDENDUM).toMatch(/Keep listening while the learner pauses/)
    expect(LIVE_PROMPT_ADDENDUM).toMatch(/Start the call yourself/)
  })

  it('does not impose a blanket "never speak while the user speaks" rule', () => {
    // OpenAI's GPT-Live guide warns this suppresses natural listening sounds.
    expect(LIVE_PROMPT_ADDENDUM).not.toMatch(/never speak while/i)
  })

  it('stays short enough to ride on top of the ~11k-token tutor prompt', () => {
    const words = LIVE_PROMPT_ADDENDUM.trim().split(/\s+/).length
    expect(words).toBeLessThan(160)
  })
})
