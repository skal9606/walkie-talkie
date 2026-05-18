import { describe, it, expect } from 'vitest'
import { ptBrScenarios } from './scenarios'

// These tests pin the cross-session memory contract on the WEB side:
// given a learner with prior-session memory bullets, the Free
// Conversation opener should reference one of them by name instead of
// the canned "Hi, I'm Natalia" intro. If this regresses, returning
// learners will get re-introduced to their own tutor.
//
// SCOPE: This file covers the OPENER injection only — the part the
// learner hears in the first turn. The deeper "weave it in mid-
// conversation" behavior depends on model adherence and is exercised
// by the live integration script (scripts/test-memory.ts), not unit
// tests.

function freeConversationScenario(level: string) {
  const s = ptBrScenarios.freeConversations.find((x) => x.id === `free-${level}`)
  if (!s) throw new Error(`free-${level} scenario not found`)
  return s
}

const baseCtx = {
  name: 'Sam',
  native: 'English' as const,
  goals: 'Visiting Brazil next year',
  pronunciationStrictness: 'forgiving' as const,
}

describe('memoryAwareFreeOpener — intermediate', () => {
  const scenario = freeConversationScenario('intermediate')

  it('falls back to a generic opener when there is no prior memory', () => {
    const prompt = scenario.buildPromptAddon({ ...baseCtx, memory: [] })
    // Generic intermediate opener — not a memory-aware one.
    expect(prompt).toContain('OPENING')
    expect(prompt).not.toContain('You\'re not meeting this learner for the first time')
  })

  it('uses a memory-aware opener when prior memory exists', () => {
    const memory = [
      'Wife Cláudia is from Salvador',
      'Works as a venture capitalist in San Francisco',
      'Daughter Lucy is 7 and just started piano',
    ]
    const prompt = scenario.buildPromptAddon({ ...baseCtx, memory })
    // The memory-aware opener block kicks in — references the bullets
    // and tells the model not to redo the first-meeting arc.
    expect(prompt).toContain("you've talked before")
    expect(prompt).toContain('Wife Cláudia is from Salvador')
    expect(prompt).toContain('Works as a venture capitalist in San Francisco')
    expect(prompt).toContain('Daughter Lucy is 7 and just started piano')
    // And the explicit "don't reintroduce" guardrail.
    expect(prompt).toContain("Don't introduce yourself")
  })

  it('drops empty / whitespace-only memory items', () => {
    const prompt = scenario.buildPromptAddon({
      ...baseCtx,
      memory: ['', '  ', 'Wife Cláudia is from Salvador'],
    })
    expect(prompt).toContain('Wife Cláudia is from Salvador')
    // The opener block has the form:
    //   You're not meeting this learner for the first time — you've talked before.
    //   Here's what you remember about Sam:
    //   - <memory bullets>
    //
    //   Greet ...
    // Pull out just the bulleted memory window and confirm exactly one
    // bullet rendered (not three, with two blanks).
    const block = prompt.match(/Here's what you remember about[^:]*:\n([\s\S]*?)\n\n/)
    expect(block).not.toBeNull()
    const memoryBullets = (block![1].match(/^- /gm) ?? []).length
    expect(memoryBullets).toBe(1)
  })
})

describe('memoryAwareFreeOpener — advanced', () => {
  const scenario = freeConversationScenario('advanced')

  it('uses memory at advanced level too', () => {
    const prompt = scenario.buildPromptAddon({
      ...baseCtx,
      memory: ['Just got back from a trip to Lisbon'],
    })
    expect(prompt).toContain("you've talked before")
    expect(prompt).toContain('Just got back from a trip to Lisbon')
  })
})
