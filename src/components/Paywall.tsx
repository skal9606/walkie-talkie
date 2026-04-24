import { useState } from 'react'
import { startCheckout } from '../lib/checkout'
import { type Plan } from '../lib/subscription'

export function Paywall({
  accessToken,
  reason,
}: {
  accessToken: string
  reason: 'exhausted' | 'blocked'
}) {
  const [loading, setLoading] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function subscribe(plan: Plan) {
    setError(null)
    setLoading(plan)
    try {
      await startCheckout(plan, accessToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(null)
    }
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
            disabled={loading !== null}
            onClick={() => subscribe('monthly')}
          >
            <div className="paywall-plan-title">Monthly</div>
            <div className="paywall-plan-price">
              <span className="paywall-plan-amount">$10</span>
              <span className="paywall-plan-period"> / month</span>
            </div>
            <div className="paywall-plan-note">Cancel anytime</div>
            <div className="paywall-plan-cta">
              {loading === 'monthly' ? 'Redirecting…' : 'Choose monthly'}
            </div>
          </button>

          <button
            className="paywall-plan highlighted"
            disabled={loading !== null}
            onClick={() => subscribe('yearly')}
          >
            <div className="paywall-plan-badge">Save $20</div>
            <div className="paywall-plan-title">Yearly</div>
            <div className="paywall-plan-price">
              <span className="paywall-plan-amount">$100</span>
              <span className="paywall-plan-period"> / year</span>
            </div>
            <div className="paywall-plan-note">~$8.33 / month</div>
            <div className="paywall-plan-cta">
              {loading === 'yearly' ? 'Redirecting…' : 'Choose yearly'}
            </div>
          </button>
        </div>

        {error && <div className="paywall-error">{error}</div>}
      </div>
    </div>
  )
}
