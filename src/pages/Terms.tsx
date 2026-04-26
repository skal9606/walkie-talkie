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
        <p className="subtitle">Last updated: April 25, 2026</p>
      </header>
      <article className="legal-body">
        <p>
          Welcome to Walkie Talkie. By using this app you agree to these Terms.
          They're meant to be plain-language; if anything is unclear, email
          support@walkietalkie.so.
        </p>
        <h2>What we provide</h2>
        <p>
          Walkie Talkie offers AI-powered voice conversations with a virtual
          Brazilian Portuguese tutor (Natalia). Conversations are streamed in
          real time using OpenAI services and processed audio is not retained
          beyond what's needed to generate your session review.
        </p>
        <h2>Subscriptions and billing</h2>
        <p>
          Subscriptions are billed via Stripe at the price displayed at
          checkout. Plans renew automatically until cancelled. You can cancel
          any time from Settings → Account; cancellation takes effect at the
          end of your current billing period and we don't issue prorated
          refunds for unused time.
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
          accuracy, or fitness for a particular purpose.
        </p>
        <h2>Changes</h2>
        <p>
          We may update these Terms periodically. Material changes will be
          announced in-app. Continued use after a change constitutes
          acceptance.
        </p>
      </article>
    </div>
  )
}
