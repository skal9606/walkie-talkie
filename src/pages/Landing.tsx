import { Link, useNavigate } from 'react-router-dom'
import type { Plan } from '../lib/subscription'

export default function Landing() {
  const navigate = useNavigate()

  // Pricing cards navigate to /chat with a ?checkout=<plan> param. Tutor.tsx
  // sends the user through sign-in if needed, then auto-starts checkout.
  function handleSubscribe(plan: Plan) {
    navigate(`/chat?checkout=${plan}`)
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">Walkie Talkie</div>
        <div className="landing-nav-right">
          <a href="#pricing" className="landing-nav-link">
            Pricing
          </a>
          <a href="#faq" className="landing-nav-link">
            FAQ
          </a>
          <Link to="/chat" className="landing-cta">
            Chat Now
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-aurora" aria-hidden />

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Brazilian Portuguese · AI voice tutor
          </div>
          <h1 className="hero-headline">
            Master Portuguese with your personal AI tutor
          </h1>
          <p className="hero-subtext">
            Real voice conversations with a tutor that hears you, corrects you, and speaks
            as slowly as you need. 24/7, no scheduling, no judgment.
          </p>
          <div className="hero-cta-group">
            <Link to="/chat" className="landing-cta landing-cta-large">
              Chat Now
            </Link>
            <div className="hero-footnote">First 2 minutes free · $10/month after</div>
          </div>
        </div>

        <div className="hero-orb-wrap" aria-hidden>
          <div className="orb-ping orb-ping-1" />
          <div className="orb-ping orb-ping-2" />
          <div className="orb-ping orb-ping-3" />
          <div className="orb">
            <div className="orb-shine" />
            <div className="orb-wave">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <h2 className="section-title">Why learners love it</h2>
        <div className="feature-grid">
          <Feature
            title="Real voice, in real time"
            body="Speech-to-speech AI that actually hears your pronunciation and corrects it — not another flashcard app."
          />
          <Feature
            title="Tailored to your level"
            body="Pick beginner, intermediate, or advanced. The tutor meets you where you are and pushes you forward."
          />
          <Feature
            title="Roleplays for real life"
            body="Order coffee in São Paulo, meet the in-laws, check into a hotel — practice the conversations you'll actually have."
          />
          <Feature
            title="Every session, reviewed"
            body="Each session ends with a summary of corrections, new vocabulary, and what to work on next time."
          />
        </div>
      </section>

      <section id="pricing" className="pricing">
        <h2 className="section-title">Simple pricing</h2>
        <p className="section-subtitle">
          Try 2 minutes free — or subscribe now to practice without limits.
        </p>
        <div className="price-cards">
          <PriceCard
            plan="monthly"
            title="Monthly"
            price="$10"
            period="/ month"
            description="Cancel anytime"
            onSubscribe={handleSubscribe}
          />
          <PriceCard
            plan="yearly"
            title="Yearly"
            price="$100"
            period="/ year"
            description="Save $20 · ~$8.33/mo"
            highlighted
            onSubscribe={handleSubscribe}
          />
        </div>
      </section>

      <section id="faq" className="faq">
        <h2 className="section-title">Questions</h2>
        <div className="faq-list">
          <FaqItem
            q="Do I need to book a time slot?"
            a="No. The tutor is available 24/7. Open the app and start talking."
          />
          <FaqItem
            q="What accent does the tutor use?"
            a="Brazilian Portuguese — warm, conversational, neutral São Paulo accent."
          />
          <FaqItem
            q="Can I practice speaking without judgment?"
            a="That's the whole point. No one is watching. Make as many mistakes as you need."
          />
          <FaqItem
            q="Does it work on mobile?"
            a="Yes, any modern browser on mobile or desktop. Allow microphone access when prompted."
          />
          <FaqItem
            q="Can I cancel anytime?"
            a="Yes. Subscriptions can be cancelled from your account at any time."
          />
        </div>
      </section>

      <footer className="landing-footer">
        <div>Walkie Talkie · Brazilian Portuguese for English speakers</div>
      </footer>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="feature">
      <h3 className="feature-title">{title}</h3>
      <p className="feature-body">{body}</p>
    </div>
  )
}

function PriceCard({
  plan,
  title,
  price,
  period,
  description,
  highlighted,
  onSubscribe,
}: {
  plan: Plan
  title: string
  price: string
  period: string
  description: string
  highlighted?: boolean
  onSubscribe: (plan: Plan) => void
}) {
  return (
    <button
      className={`price-card ${highlighted ? 'highlighted' : ''}`}
      onClick={() => onSubscribe(plan)}
    >
      {highlighted && <div className="price-badge">Best value</div>}
      <div className="price-title">{title}</div>
      <div className="price-amount-row">
        <span className="price-amount">{price}</span>
        <span className="price-period">{period}</span>
      </div>
      <div className="price-desc">{description}</div>
      <div className="price-cta">Subscribe →</div>
    </button>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="faq-item">
      <summary>{q}</summary>
      <p>{a}</p>
    </details>
  )
}
