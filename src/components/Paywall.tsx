import { useMemo, useState, type FormEvent } from 'react'
import { startCheckout } from '../lib/checkout'
import { type Plan } from '../lib/subscription'
import { supabase } from '../lib/supabase'
import { getFreshAccessToken } from '../lib/auth'
import { loadProfile } from '../lib/profile'
import { getTutor, type Tutor } from '../lib/tutors'

/// Backend-shaped result from /api/assess-cefr. Kept inline (not imported
/// from the api-handlers lib) so the frontend bundle doesn't depend on
/// the serverless module graph.
type CefrAssessment = {
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'INSUFFICIENT_DATA'
  note: string
  language: string
  assessedAt: string
}

/// Builds the paywall benefits list against the active tutor — so the
/// learner sees their actual tutor's name + dialect, not the original
/// Natalia/Brazilian copy that shipped before the multi-tutor rollout.
/// `dialect` strips the language qualifier from `languageLabel` so the
/// headline reads "Real Mexican immersion" not "Real Mexican Spanish
/// immersion" (which scans awkwardly). For label-only languages like
/// "Italian" / "French" / "German" the split is a no-op.
function buildBenefits(tutor: Tutor) {
  const dialect = tutor.languageLabel.split(' ')[0]
  return [
    {
      icon: '💬',
      title: 'Unlimited conversations',
      body: `Practice with ${tutor.name} for as long as you want, anytime.`,
    },
    {
      icon: tutor.flag,
      title: `Real ${dialect} immersion`,
      body: 'Voice-first practice with a native-sounding tutor — the fastest path to fluency.',
    },
    {
      icon: '🎯',
      title: 'Multiple ways to practice',
      body: 'Free conversation, roleplays, grammar lessons, translation drills, and pronunciation.',
    },
    {
      icon: '📈',
      title: 'Daily progress you can feel',
      body: 'Build a streak, see a review after every session, and watch your fluency compound.',
    },
  ]
}

export function Paywall({
  accessToken,
  reason,
  isAnonymous,
  cefr,
}: {
  accessToken: string
  reason: 'exhausted' | 'blocked'
  /** True when the user signed in anonymously. We collect an email before
   *  checkout so their subscription can be restored on another device. */
  isAnonymous: boolean
  /** CEFR assessment from the trial conversation. Null when this paywall
   *  open isn't trial-driven, when the call is still in flight, or when
   *  it failed. Displayed as a personalized hook above the benefits. */
  cefr: CefrAssessment | null
}) {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>('yearly')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Anonymous users go through an extra "leave us your email" step before
  // we redirect to Stripe. Tracked separately so we can show the email
  // form WITHOUT losing the selectedPlan.
  const [collectingEmail, setCollectingEmail] = useState(false)

  // Resolve the active tutor once on mount so benefits + name references
  // reflect what this learner actually picked (Natalia for Portuguese,
  // María for Spanish, etc.). loadProfile() returns null for fresh users
  // — getTutor() falls back to the default.
  const tutor = useMemo(() => getTutor(loadProfile()?.tutorId), [])
  const benefits = useMemo(() => buildBenefits(tutor), [tutor])

  // Plain language name for the CEFR headline ("Your Portuguese level"
  // rather than "Your Brazilian Portuguese level"). Last word of
  // languageLabel: "Brazilian Portuguese" → "Portuguese", "Italian" →
  // "Italian", "Mexican Spanish" → "Spanish".
  const plainLanguage = tutor.languageLabel.split(' ').slice(-1)[0]

  // Only render CEFR if it lined up with the active tutor's language —
  // a stale Portuguese assessment shouldn't show on a Spanish paywall
  // session.
  const showCefr =
    cefr !== null &&
    cefr.language === tutor.language &&
    cefr.level !== 'INSUFFICIENT_DATA'

  async function subscribe(plan: Plan) {
    setError(null)
    setLoading(true)
    try {
      const fresh = (await getFreshAccessToken()) ?? accessToken
      await startCheckout(plan, fresh)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedPlan) return
    const clean = email.trim()
    if (!clean) return
    setError(null)
    setLoading(true)
    // Attach the email to the anonymous account so the subscription is
    // recoverable from another device via magic-link sign-in.
    const { error: updateErr } = await supabase.auth.updateUser({ email: clean })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }
    try {
      const fresh = (await getFreshAccessToken()) ?? accessToken
      await startCheckout(selectedPlan, fresh)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  function onUnlock() {
    if (!selectedPlan) return
    if (isAnonymous) {
      setCollectingEmail(true)
      return
    }
    subscribe(selectedPlan)
  }

  // Anonymous users who picked a plan — show email form before Stripe.
  if (collectingEmail && selectedPlan) {
    return (
      <div className="paywall">
        <div className="paywall-card">
          <div className="paywall-header">
            <h2>One last step — your email</h2>
            <p>
              We'll send your receipt here, and you can use it to sign in on
              other devices.
            </p>
          </div>
          <form onSubmit={handleEmailSubmit} className="paywall-email-form">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
              required
              autoFocus
              disabled={loading}
            />
            <button
              type="submit"
              className="paywall-unlock-cta"
              disabled={loading || !email.trim()}
            >
              {loading
                ? 'Redirecting…'
                : `Continue · ${selectedPlan === 'monthly' ? '$14.99/mo' : '$149.99/yr'}`}
            </button>
            <button
              type="button"
              className="onboarding-link-btn"
              onClick={() => setCollectingEmail(false)}
              disabled={loading}
            >
              ← Back to plans
            </button>
            {error && <div className="paywall-error">{error}</div>}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="paywall">
      <div className="paywall-card paywall-card-pitch">
        <div className="paywall-pitch-header">
          <div className="paywall-pitch-title">Walkie Talkie</div>
          <h2>
            {reason === 'exhausted'
              ? "You've used your free 5 minutes."
              : "You've reached your free conversation limit."}
            <br />
            <span className="paywall-pitch-sub">
              Subscribe for unlimited conversations.
            </span>
          </h2>
        </div>

        {showCefr && cefr && (
          <div className="paywall-cefr">
            <div className="paywall-cefr-label">
              Your {plainLanguage} level
            </div>
            <div className="paywall-cefr-level">{cefr.level}</div>
            <div className="paywall-cefr-note">{cefr.note}</div>
          </div>
        )}

        <ul className="paywall-benefits">
          {benefits.map((b) => (
            <li key={b.title} className="paywall-benefit">
              <span className="paywall-benefit-icon" aria-hidden>
                {b.icon}
              </span>
              <div className="paywall-benefit-text">
                <div className="paywall-benefit-title">{b.title}</div>
                <div className="paywall-benefit-body">{b.body}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="paywall-plans paywall-plans-pitch">
          <button
            type="button"
            className={`paywall-plan-tile ${selectedPlan === 'yearly' ? 'selected' : ''}`}
            onClick={() => setSelectedPlan('yearly')}
            disabled={loading}
          >
            <div className="paywall-plan-tile-badge">Best value</div>
            <div className="paywall-plan-tile-period">12 months</div>
            <div className="paywall-plan-tile-price">$149.99</div>
            <div className="paywall-plan-tile-note">$12.49 / month</div>
          </button>

          <button
            type="button"
            className={`paywall-plan-tile ${selectedPlan === 'monthly' ? 'selected' : ''}`}
            onClick={() => setSelectedPlan('monthly')}
            disabled={loading}
          >
            <div className="paywall-plan-tile-period">1 month</div>
            <div className="paywall-plan-tile-price">$14.99</div>
            <div className="paywall-plan-tile-note">$14.99 / month</div>
          </button>
        </div>

        <button
          type="button"
          className="paywall-unlock-cta"
          onClick={onUnlock}
          disabled={!selectedPlan || loading}
        >
          {loading ? 'Redirecting…' : 'Unlock unlimited'}
        </button>

        {error && <div className="paywall-error">{error}</div>}
      </div>
    </div>
  )
}
