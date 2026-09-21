import { describe, it, expect } from 'vitest'
import { LIVE_GREET_NUDGE, LIVE_OPENING_BLOCK, LIVE_PROMPT_ADDENDUM, buildLiveInstructions } from './live'

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

// Regression for 2026-09-20: on the web, with Natalia's full ~42k-char
// prompt, GPT-Live stayed silent until the learner spoke (reproduced 2/2
// with a Node probe; the short probe prompt always greeted). The prompt
// says "wait silently for the learner's answer" several times, and the one
// line telling her to start the call was the last of 372 lines. Fix: lead
// the prompt with the speak-first rule AND nudge her on session.started.
// Probe results: prompt-order alone 2/3, order + nudge 4/4.
describe('buildLiveInstructions', () => {
  const body =
    "You are Natalia.\n\nOPENING THE SESSION\nStop after the question and wait silently for the learner's answer."

  it('puts the speak-first rule at the very top of the prompt', () => {
    const out = buildLiveInstructions(body)
    expect(out.startsWith(LIVE_OPENING_BLOCK)).toBe(true)
    expect(out.slice(0, 400)).toMatch(/speak first/i)
  })

  it('places the conversation-flow addendum before the tutor body and keeps the body intact at the end', () => {
    const out = buildLiveInstructions(body)
    expect(out.indexOf(LIVE_PROMPT_ADDENDUM)).toBeLessThan(out.indexOf(body))
    expect(out.endsWith(body)).toBe(true)
  })

  it('greet nudge asks her to speak now and fits the 500-token append limit', () => {
    expect(LIVE_GREET_NUDGE).toMatch(/speak now/i)
    expect(LIVE_GREET_NUDGE.split(/\s+/).length).toBeLessThan(80)
  })
})
