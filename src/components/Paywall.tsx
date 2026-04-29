import { useState, type FormEvent } from 'react'
import { startCheckout } from '../lib/checkout'
import { type Plan } from '../lib/subscription'
import { supabase } from '../lib/supabase'
import { getFreshAccessToken } from '../lib/auth'

const BENEFITS = [
  {
    icon: '💬',
    title: 'Unlimited conversations',
    body: 'Practice with Natalia for as long as you want, anytime.',
  },
  {
    icon: '🇧🇷',
    title: 'Real Brazilian immersion',
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

export function Paywall({
  accessToken,
  reason,
  isAnonymous,
}: {
  accessToken: string
  reason: 'exhausted' | 'blocked'
  /** True when the user signed in anonymously. We collect an email before
   *  checkout so their subscription can be restored on another device. */
  isAnonymous: boolean
}) {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>('yearly')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Anonymous users go through an extra "leave us your email" step before
  // we redirect to Stripe. Tracked separately so we can show the email
  // form WITHOUT losing the selectedPlan.
  const [collectingEmail, setCollectingEmail] = useState(false)

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
                : `Continue · ${selectedPlan === 'monthly' ? '$10/mo' : '$100/yr'}`}
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

        <ul className="paywall-benefits">
          {BENEFITS.map((b) => (
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
            <div className="paywall-plan-tile-price">$100</div>
            <div className="paywall-plan-tile-note">$8.33 / month</div>
          </button>

          <button
            type="button"
            className={`paywall-plan-tile ${selectedPlan === 'monthly' ? 'selected' : ''}`}
            onClick={() => setSelectedPlan('monthly')}
            disabled={loading}
          >
            <div className="paywall-plan-tile-period">1 month</div>
            <div className="paywall-plan-tile-price">$10</div>
            <div className="paywall-plan-tile-note">$10 / month</div>
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
