import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RealtimeTutor, buildHintInstructions, type RealtimeEvent } from './realtime'

// Tests focus on the things that are easy to break without anyone noticing
// at runtime: the hint-prompt content (changes feed straight into model
// behavior + user-visible output), the event subscription mechanism, and
// the connect() error paths for 401/402 which gate paywall + sign-in
// flows. Full WebRTC integration testing is intentionally out of scope —
// happy-dom doesn't ship a real RTCPeerConnection and mocking it well
// enough to be useful is more code than the test surface justifies.

describe('buildHintInstructions', () => {
  // The prompt content materially shapes what learners see when they tap
  // the hint button. Regressions are easy to introduce (a stray rule
  // change) and hard to spot in code review.

  it('first-timer: includes target language phrases with native translations', () => {
    const out = buildHintInstructions('first_timer', 'Brazilian Portuguese', 'English')
    expect(out).toContain('TRUE BEGINNER in Brazilian Portuguese')
    expect(out).toContain('Brazilian Portuguese phrases')
    expect(out).toContain('English translation in parentheses')
    expect(out).toContain('2 short, useful')
    expect(out).toContain('Oi! (Hi)')
  })

  it('also handles legacy "complete-beginner" level alias', () => {
    // Web profiles still use the old "complete-beginner" key; iOS uses
    // "first_timer". Both must route to the same prompt branch so the
    // hint feels identical to the user regardless of which platform's
    // proficiency value flows in.
    const a = buildHintInstructions('first_timer', 'Italian', 'English')
    const b = buildHintInstructions('complete-beginner', 'Italian', 'English')
    expect(a).toBe(b)
  })

  it('basic: short phrases with brief native hints', () => {
    const out = buildHintInstructions('basic', 'Spanish', 'English')
    expect(out).toContain('BASIC Spanish learner')
    expect(out).toContain('brief English hints in parens')
    expect(out).not.toContain('TRUE BEGINNER')
  })

  it('intermediate/advanced: nudges without translations', () => {
    const intermediate = buildHintInstructions('intermediate', 'French', 'English')
    const advanced = buildHintInstructions('advanced', 'French', 'English')
    expect(intermediate).toContain('stuck for ideas')
    expect(intermediate).toContain('do NOT need translations')
    // Same prompt for both levels — they share the "you have vocabulary,
    // you need an idea" failure mode.
    expect(intermediate).toBe(advanced)
  })

  it('every level enforces the strict no-preamble rule', () => {
    const levels = ['first_timer', 'basic', 'intermediate', 'advanced', 'unknown-level']
    for (const level of levels) {
      const out = buildHintInstructions(level, 'German', 'English')
      expect(out).toContain('OUTPUT RULES (STRICT')
      expect(out).toContain('NO preamble line')
      expect(out).toContain('NO numbering')
    }
  })

  it('unknown proficiency falls back to a sensible default', () => {
    const out = buildHintInstructions('unrecognized', 'Italian', 'English')
    expect(out).toContain('Italian phrases')
    expect(out).toContain('English hints in parens')
  })

  it('substitutes nativeLanguage into the prompt body', () => {
    // Non-English-native learner shouldn't see "English translation in
    // parentheses" — they should see whatever they picked at onboarding.
    const out = buildHintInstructions('first_timer', 'Portuguese', 'French')
    expect(out).toContain('French translation in parentheses')
    expect(out).not.toContain('English translation in parentheses')
  })
})

describe('RealtimeTutor event subscription', () => {
  it('onEvent returns an unsubscribe function that detaches the handler', () => {
    const tutor = new RealtimeTutor()
    const received: RealtimeEvent[] = []
    const handler = (e: RealtimeEvent) => received.push(e)

    const unsubscribe = tutor.onEvent(handler)
    expect(typeof unsubscribe).toBe('function')

    // Calling the returned function should remove the handler. We can't
    // observe handler delivery without a connected session, but we can
    // assert that the unsubscribe function exists and doesn't throw —
    // this catches the most common regression (forgetting to return the
    // cleanup function from onEvent).
    expect(() => unsubscribe()).not.toThrow()
  })

  it('supports multiple subscribers without throwing', () => {
    const tutor = new RealtimeTutor()
    const u1 = tutor.onEvent(() => {})
    const u2 = tutor.onEvent(() => {})
    expect(() => {
      u1()
      u2()
    }).not.toThrow()
  })
})

describe('RealtimeTutor.connect error handling', () => {
  // The 401 and 402 paths drive paywall and sign-in routing — getting
  // them wrong silently breaks gating. happy-dom doesn't support full
  // WebRTC, but the error paths happen before any WebRTC setup so we
  // can exercise them with just a fetch mock.

  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('throws with status=401 when /api/session returns 401', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const tutor = new RealtimeTutor()
    try {
      await tutor.connect('test instructions')
      throw new Error('expected connect() to throw')
    } catch (err) {
      const typed = err as Error & { status?: number }
      expect(typed.status).toBe(401)
      expect(typed.message).toContain('Not signed in')
    }
  })

  it('throws with status=402 + secondsRemaining when trial is exhausted', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: 'Trial exhausted', secondsRemaining: 0 }),
        {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as unknown as typeof fetch

    const tutor = new RealtimeTutor()
    try {
      await tutor.connect('test instructions')
      throw new Error('expected connect() to throw')
    } catch (err) {
      const typed = err as Error & { status?: number; secondsRemaining?: number }
      expect(typed.status).toBe(402)
      expect(typed.secondsRemaining).toBe(0)
    }
  })

  it('throws on malformed response missing client_secret', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ subscribed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const tutor = new RealtimeTutor()
    await expect(tutor.connect('test instructions')).rejects.toThrow(
      /Malformed session response/,
    )
  })
})
