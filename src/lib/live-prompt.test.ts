import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    expect(words).toBeLessThan(340)
  })
})

// Regression for the App Store 1.1.0 reports (2026-09-21), intermediate
// level on speakerphone: Natalia answered a substantive turn in English,
// treated a mid-sentence pause ("Por que você começou…") as the end of the
// learner's turn, stalled with "deixa eu pensar um pouco", and spoke too
// fast. Probe (liveprobe/probe-speech.mjs, real TTS speech into production
// gpt-live-1): the language rule fixed the English case 3/3 (baseline 1/3,
// with 2/3 ignored outright); filler never reproduced (0/22 runs); the
// turn-taking and pace rules did not change the model's behaviour and are
// kept as stated intent (GPT-Live exposes no VAD/endpointing/speed knobs).
describe('LIVE_PROMPT_ADDENDUM rules added 2026-09-21', () => {
  const lines = LIVE_PROMPT_ADDENDUM.split('\n')
  const line = (prefix: string) => {
    const l = lines.find((x) => x.startsWith(prefix))
    expect(l, `missing addendum line ${prefix}`).toBeDefined()
    return l as string
  }

  it("says a mid-sentence pause is not the tutor's turn and to wait when unsure", () => {
    const l = line('- Turn-taking:')
    expect(l).toMatch(/pause mid-sentence is not your turn/)
    expect(l).toMatch(/about two seconds/)
    expect(l).toMatch(/If unsure whether they are done, keep waiting/)
    expect(l).toMatch(/Never finish their sentence for them/)
  })

  it('tells her to stay silent rather than narrate thinking, and that nothing needs looking up', () => {
    const l = line('- Never narrate thinking')
    expect(l).toMatch(/stay silent or use a brief backchannel/)
    expect(l).toMatch(/then answer directly/)
    // GPT-Live can "delegate" hard questions to a backend and speak filler
    // meanwhile; we run no backend, so tell her explicitly.
    expect(l).toMatch(/never need to look anything up/)
  })

  it('keeps intermediate/advanced learners in the target language even when they answer in their native language', () => {
    const l = line('- Language:')
    expect(l).toMatch(/Intermediate or Advanced learner speaking their native language is still talking to you; answer them in the target language/)
    expect(l).toMatch(/not a request to switch/)
    expect(l).toMatch(/garbled transcript/)
    // The only English cases: "I don't understand" and a vocab question asked in English.
    expect(l).toMatch(/say they don't understand or ask what a word means/)
    expect(l).toMatch(/return to the target language on the next turn/)
  })

  it('gives a concrete pace target instead of a percentage', () => {
    const l = line('- Pace:')
    expect(l).toMatch(/about two words per second/)
    expect(l).toMatch(/Short sentences/)
    expect(l).toMatch(/Do not speed up/)
    expect(LIVE_PROMPT_ADDENDUM).not.toMatch(/90%/)
  })

  // The iOS client carries the same addendum as a Swift multi-line string
  // literal (TutorPrompt.liveAddendum). When the sibling repo is checked out
  // next to this one, assert the two are the same text, line for line.
  const swiftPath = resolve(__dirname, '../../../walkie-talkie-ios/WalkieTalkie/Services/TutorPrompt.swift')
  const hasSwift = existsSync(swiftPath)
  it.skipIf(!hasSwift)('matches the iOS liveAddendum line for line', () => {
    const swift = readFileSync(swiftPath, 'utf-8')
    const m = /static let liveAddendum = """\n([\s\S]*?)\n {4}"""/.exec(swift)
    expect(m, 'liveAddendum literal not found in TutorPrompt.swift').not.toBeNull()
    const ios = (m as RegExpExecArray)[1].split('\n').map((l) => l.replace(/^ {4}/, ''))
    expect(ios).toEqual(LIVE_PROMPT_ADDENDUM.split('\n'))
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
