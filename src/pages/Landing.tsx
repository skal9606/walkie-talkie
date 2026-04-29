import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Plan } from '../lib/subscription'
import { useAuth } from '../lib/auth'
import { TUTORS } from '../lib/tutors'

// Flags shown in the marquee. Live tutors come from the registry; "soon"
// flags are aspirational marketing — they hint at the roadmap without
// committing to a specific date.
const COMING_SOON_FLAGS = [
  { flag: '🇪🇸', label: 'Castilian Spanish' },
  { flag: '🇦🇷', label: 'Argentinian Spanish' },
  { flag: '🇫🇷', label: 'French' },
  { flag: '🇮🇹', label: 'Italian' },
  { flag: '🇩🇪', label: 'German' },
  { flag: '🇯🇵', label: 'Japanese' },
  { flag: '🇰🇷', label: 'Korean' },
  { flag: '🇨🇳', label: 'Mandarin' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  // Returning learners with a real (non-anonymous) account go straight to
  // /practice. Anonymous trial users stay on the landing page so they can
  // still see pricing, FAQ, and re-enter the trial via Chat Now.
  useEffect(() => {
    if (loading || !user) return
    if (user.is_anonymous) return
    navigate('/practice', { replace: true })
  }, [user, loading, navigate])

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
          <Link to="/login" className="landing-nav-link">
            Login
          </Link>
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
            Voice AI tutor for any language
          </div>
          <h1 className="hero-headline">
            Master a new language with your personal AI tutor
          </h1>
          <p className="hero-subtext">
            Real voice conversations with a tutor that hears you, corrects you, and speaks
            as slowly as you need. 24/7, no scheduling, no judgment.
          </p>
          <div className="hero-cta-group">
            <Link to="/chat" className="landing-cta landing-cta-large">
              Chat Now
            </Link>
            <div className="hero-footnote">First 5 minutes free · $10/month after</div>
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

      <FlagMarquee />

      <section className="languages-available">
        <h2 className="section-title">Available now</h2>
        <p className="section-subtitle">
          One subscription, every tutor. More languages and regional dialects landing soon.
        </p>
        <div className="language-tile-grid">
          {TUTORS.map((t) => (
            <div key={t.id} className="language-tile">
              <span className="language-tile-flag" aria-hidden>{t.flag}</span>
              <div className="language-tile-text">
                <div className="language-tile-language">{t.languageLabel}</div>
                <div className="language-tile-tutor">
                  {t.name} · {t.city} · {t.age}
                </div>
              </div>
            </div>
          ))}
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
            body="Order tacos in CDMX, meet the in-laws, check into a hotel — practice the conversations you'll actually have."
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
          Try 5 minutes free — or subscribe now to practice without limits.
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
            q="What languages can I learn?"
            a="Brazilian Portuguese (Natalia in São Paulo) and Mexican Spanish (Santiago in Mexico City) are live today. Castilian Spanish, Argentinian Spanish, French, Italian, and more are next on the list."
          />
          <FaqItem
            q="Do I need a different subscription per language?"
            a="No — one subscription unlocks every tutor. Switch languages anytime from Settings."
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
        <div>Walkie Talkie · Voice AI tutor for English speakers</div>
      </footer>
    </div>
  )
}

function FlagMarquee() {
  // Speak.com-style infinite scroll. Live tutors first (with names), then
  // aspirational flags labeled "soon". Duplicated once so the CSS
  // animation can loop seamlessly.
  const items = [
    ...TUTORS.map((t) => ({ flag: t.flag, label: t.languageLabel, live: true })),
    ...COMING_SOON_FLAGS.map((f) => ({ ...f, live: false })),
  ]
  return (
    <div className="flag-marquee" aria-hidden>
      <div className="flag-marquee-track">
        {[...items, ...items].map((item, i) => (
          <div key={i} className={`flag-marquee-item ${item.live ? 'live' : ''}`}>
            <span className="flag-marquee-flag">{item.flag}</span>
            <span className="flag-marquee-label">
              {item.label}
              {!item.live && <span className="flag-marquee-soon"> · soon</span>}
            </span>
          </div>
        ))}
      </div>
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
