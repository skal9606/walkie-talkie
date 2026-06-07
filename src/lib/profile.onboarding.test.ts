import { describe, it, expect } from 'vitest'
// shouldShowOnboarding does not exist yet — this test reproduces the bug:
// onboarding completion is decided from localStorage only, so a logged-in
// user who already onboarded (profile lives on their account) is forced
// through onboarding again on a fresh browser / after sign-out wiped
// localStorage. The fix introduces a server-aware decision so the account,
// not the device, is the source of truth.
import { shouldShowOnboarding } from './profile'

const COMPLETE = { targetLanguage: 'pt-BR' as const, tutorId: 'pt-br-natalia' as const }

describe('shouldShowOnboarding — account is the source of truth, not the browser', () => {
  it('does NOT re-onboard a returning user whose profile is on the server but localStorage is empty (the bug)', () => {
    expect(
      shouldShowOnboarding({ localProfile: null, serverProfile: COMPLETE }),
    ).toBe(false)
  })

  it('still onboards a genuinely new user with nothing on the server and nothing local', () => {
    expect(
      shouldShowOnboarding({ localProfile: null, serverProfile: null }),
    ).toBe(true)
  })

  it('does NOT onboard when the local cache already has a selection (fast path, no server round-trip needed)', () => {
    expect(
      shouldShowOnboarding({ localProfile: COMPLETE, serverProfile: null }),
    ).toBe(false)
  })

  it('onboards when neither local nor server has a complete selection (partial server profile counts as incomplete)', () => {
    expect(
      shouldShowOnboarding({
        localProfile: null,
        serverProfile: { targetLanguage: 'pt-BR' as const }, // no tutorId → incomplete
      }),
    ).toBe(true)
  })
})
