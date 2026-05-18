import { describe, it, expect } from 'vitest'
import { decideLandingAction } from './auth'

describe('decideLandingAction', () => {
  // Reproduction of the sign-out → /lessons bounce bug. When the user
  // clicks Sign Out we navigate to / and drop a just-signed-out flag.
  // Landing's effect previously read+removed the flag during its
  // loading-state pass, BEFORE supabase had returned the still-cached
  // session. The next render had a defined user but no flag — so it
  // bounced the learner straight back to /lessons.
  it('returns wait while auth is still loading, even with justSignedOut=true', () => {
    expect(
      decideLandingAction({ loading: true, user: null, justSignedOut: true }),
    ).toBe('wait')
  })

  it('stays on landing when user resolves AND justSignedOut is true (the bug fix)', () => {
    // Simulates the second render: supabase returned the still-cached
    // session before signOut completed. The flag must still be honored.
    expect(
      decideLandingAction({
        loading: false,
        user: { is_anonymous: false },
        justSignedOut: true,
      }),
    ).toBe('stay-on-landing')
  })

  it('stays on landing when user becomes null after sign-out completes', () => {
    expect(
      decideLandingAction({ loading: false, user: null, justSignedOut: true }),
    ).toBe('stay-on-landing')
  })

  it('redirects signed-in non-anonymous learners with no flag', () => {
    expect(
      decideLandingAction({
        loading: false,
        user: { is_anonymous: false },
        justSignedOut: false,
      }),
    ).toBe('redirect-to-lessons')
  })

  it('stays on landing for anonymous users (trial pitch still visible)', () => {
    expect(
      decideLandingAction({
        loading: false,
        user: { is_anonymous: true },
        justSignedOut: false,
      }),
    ).toBe('stay-on-landing')
  })

  it('stays on landing when no user and no flag (logged-out visitor)', () => {
    expect(
      decideLandingAction({ loading: false, user: null, justSignedOut: false }),
    ).toBe('stay-on-landing')
  })
})
