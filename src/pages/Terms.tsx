import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="app legal">
      <nav className="tutor-nav">
        <Link to="/practice" className="tutor-nav-back">
          ← Back
        </Link>
      </nav>
      <header className="header">
        <h1>Terms of Use</h1>
        <p className="subtitle">Last updated: May 7, 2026</p>
      </header>
      <article className="legal-body">
        <p>
          Welcome to Walkie Talkie. By using the website at walkietalkie.so or
          the Walkie Talkie iOS app you agree to these Terms. They're meant to
          be plain-language; if anything is unclear, email
          support@walkietalkie.so.
        </p>
        <h2>What we provide</h2>
        <p>
          Walkie Talkie offers AI-powered voice conversations with a virtual
          Brazilian Portuguese tutor (Natalia). Conversations are streamed in
          real time using OpenAI services. Processed audio is not retained
          beyond what's needed to generate your session review.
        </p>
        <h2>Free trial</h2>
        <p>
          New users get a free trial of 10 minutes of conversation. After
          you've used your trial, full access requires an active subscription.
        </p>
        <h2>Subscriptions and billing</h2>
        <p>
          Subscriptions are sold at $15/month or $150/year. Plans
          auto-renew at the end of each billing period until cancelled.
        </p>
        <p>
          <strong>On the web:</strong> billing is handled by Stripe. Cancel
          any time at Settings → Account → Cancel subscription. Cancellation
          takes effect at the end of your current billing period, and we
          don't issue prorated refunds for unused time.
        </p>
        <p>
          <strong>On iOS:</strong> subscriptions are sold and billed through
          Apple's App Store as auto-renewable subscriptions. Payment is
          charged to your Apple ID at confirmation of purchase. Subscriptions
          renew automatically unless auto-renew is turned off at least 24
          hours before the end of the current period. To cancel, manage your
          subscription, or turn off auto-renewal, go to iPhone Settings →
          Apple ID → Subscriptions. Refunds for App Store purchases are
          handled by Apple per their refund policy at
          reportaproblem.apple.com — we cannot issue them on Apple's behalf.
        </p>
        <p>
          A subscription purchased on one platform unlocks the service on the
          other when you sign in with the same identity (Sign In with Apple
          or matching email).
        </p>
        <h2>Acceptable use</h2>
        <p>
          Don't use the service to harass others, generate harmful content, or
          attempt to extract or abuse the underlying AI models. We may suspend
          accounts that violate these rules.
        </p>
        <h2>Disclaimer</h2>
        <p>
          Natalia is an AI tutor — she may occasionally produce mistakes. The
          service is provided "as is" with no warranties about availability,
          accuracy, or fitness for a particular purpose. We don't guarantee
          uninterrupted availability.
        </p>
        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, our total liability for any
          claim arising out of or relating to the service is limited to the
          amount you paid for the service in the 12 months preceding the
          claim.
        </p>
        <h2>Changes</h2>
        <p>
          We may update these Terms periodically. Material changes will be
          announced in-app. Continued use after a change constitutes
          acceptance.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about these Terms? Email support@walkietalkie.so.
        </p>
      </article>
    </div>
  )
}
