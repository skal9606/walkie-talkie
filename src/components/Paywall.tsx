import { useState, type FormEvent } from 'react'
import { startCheckout } from '../lib/checkout'
import { type Plan } from '../lib/subscription'
import { supabase } from '../lib/supabase'
import { getFreshAccessToken } from '../lib/auth'

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
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    // recoverable from another device via magic-link sign-in. Supabase will
    // send a confirmation email, but the current session remains valid and
    // we can proceed straight to Stripe.
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

  // Anonymous users who've picked a plan — show email form before Stripe.
  if (isAnonymous && selectedPlan) {
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
              className="mic-btn start"
              disabled={loading || !email.trim()}
            >
              {loading
                ? 'Redirecting…'
                : `Continue to payment · ${selectedPlan === 'monthly' ? '$10/mo' : '$100/yr'}`}
            </button>
            <button
              type="button"
              className="onboarding-link-btn"
              onClick={() => setSelectedPlan(null)}
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

  function onPlanClick(plan: Plan) {
    if (isAnonymous) {
      setSelectedPlan(plan)
      return
    }
    subscribe(plan)
  }

  return (
    <div className="paywall">
      <div className="paywall-card">
        <div className="paywall-header">
          {reason === 'exhausted' ? (
            <>
              <h2>Your free 2 minutes are up</h2>
              <p>
                Subscribe to keep practicing — unlimited conversations, reviews, and
                scenarios.
              </p>
            </>
          ) : (
            <>
              <h2>Subscribe to keep practicing</h2>
              <p>You've used your free minutes. Pick a plan to continue.</p>
            </>
          )}
        </div>

        <div className="paywall-plans">
          <button
            className="paywall-plan"
            disabled={loading}
            onClick={() => onPlanClick('monthly')}
          >
            <div className="paywall-plan-title">Monthly</div>
            <div className="paywall-plan-price">
              <span className="paywall-plan-amount">$10</span>
              <span className="paywall-plan-period"> / month</span>
            </div>
            <div className="paywall-plan-note">Cancel anytime</div>
            <div className="paywall-plan-cta">
              {loading && selectedPlan === 'monthly' ? 'Redirecting…' : 'Choose monthly'}
            </div>
          </button>

          <button
            className="paywall-plan highlighted"
            disabled={loading}
            onClick={() => onPlanClick('yearly')}
          >
            <div className="paywall-plan-badge">Save $20</div>
            <div className="paywall-plan-title">Yearly</div>
            <div className="paywall-plan-price">
              <span className="paywall-plan-amount">$100</span>
              <span className="paywall-plan-period"> / year</span>
            </div>
            <div className="paywall-plan-note">~$8.33 / month</div>
            <div className="paywall-plan-cta">
              {loading && selectedPlan === 'yearly' ? 'Redirecting…' : 'Choose yearly'}
            </div>
          </button>
        </div>

        {error && <div className="paywall-error">{error}</div>}
      </div>
    </div>
  )
}
