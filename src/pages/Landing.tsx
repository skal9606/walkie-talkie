import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Plan } from '../lib/subscription'
import { JUST_SIGNED_OUT_FLAG, decideLandingAction, useAuth } from '../lib/auth'

export default function Landing() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  // Signed-in users skip the marketing page entirely. See decideLandingAction
  // for the auth-resolution race we have to wait through before deciding.
  useEffect(() => {
    const justSignedOut =
      typeof window !== 'undefined' &&
      sessionStorage.getItem(JUST_SIGNED_OUT_FLAG) === '1'
    const action = decideLandingAction({ loading, user, justSignedOut })
    if (action === 'wait') return
    if (justSignedOut && typeof window !== 'undefined') {
      sessionStorage.removeItem(JUST_SIGNED_OUT_FLAG)
    }
    if (action === 'redirect-to-lessons') {
      navigate('/lessons', { replace: true })
    }
  }, [user, loading, navigate])

  function handleSubscribe(plan: Plan) {
    navigate(`/chat?checkout=${plan}`)
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">Walkie Talkie</div>
        <div className="landing-nav-right">
          <a href="#pricing" className="landing-nav-link">Pricing</a>
          <a href="#faq" className="landing-nav-link">FAQ</a>
          <Link to="/login" className="landing-nav-link">Login</Link>
          <Link to="/chat" className="landing-cta">Chat Now</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Voice AI for language learners
          </div>
          <h1 className="hero-headline">
            Learn a language by talking.
          </h1>
          <p className="hero-subtext">
            Real voice practice for people who already know the basics. Your
            tutor remembers what you talked about last time and what you keep
            getting wrong.
          </p>
          <div className="hero-cta-group">
            <Link to="/chat" className="landing-cta landing-cta-large">Download App</Link>
            <Link to="/chat" className="landing-cta-outline">Chat on web</Link>
          </div>
          <div className="hero-footnote">First 10 minutes free · $14.99/month after</div>
        </div>

        <div className="hero-image-wrap" aria-hidden>
          <div className="hero-image-glow" />
          <img src="/walkie-talkie-hero.png" alt="" className="hero-image" />
        </div>
      </section>

      <section className="languages">
        <h2 className="section-title">Practice in 5 languages</h2>
        <p className="section-subtitle">One subscription unlocks every tutor.</p>
        <div className="language-medals">
          <LanguageMedal flag="🇧🇷" name="Portuguese" />
          <LanguageMedal flag="🇲🇽" name="Spanish" />
          <LanguageMedal flag="🇮🇹" name="Italian" />
          <LanguageMedal flag="🇫🇷" name="French" />
          <LanguageMedal flag="🇩🇪" name="German" />
        </div>
      </section>

      <section className="chat-preview">
        <div className="chat-preview-text">
          <h2 className="section-title">Like texting,<br />but for speaking.</h2>
          <p className="section-subtitle">
            Natural conversations. Helpful corrections. Real progress.
          </p>
        </div>
        <div className="chat-preview-paper">
          <div className="chat-preview-paper-inner">
            <div className="chat-line chat-line-tutor">
              <span className="chat-line-speaker">Natalia</span>
              <span className="chat-line-text">Oi! Como foi seu fim de semana?</span>
            </div>
            <div className="chat-line chat-line-user">
              <span className="chat-line-speaker">You</span>
              <span className="chat-line-text">Eu fui ao parque com meu cachorro.</span>
            </div>
            <div className="chat-line chat-line-tutor">
              <span className="chat-line-speaker">Natalia</span>
              <span className="chat-line-text">Que legal! Como se chama seu cachorro?</span>
            </div>
            <div className="chat-line chat-line-user">
              <span className="chat-line-speaker">You</span>
              <span className="chat-line-text">Ele se chama Luna.</span>
            </div>
            <div className="chat-typing">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="feature-grid">
          <Feature
            icon="🎙️"
            title="Speak naturally"
            body="Real conversations. Just talk."
          />
          <Feature
            icon="🎯"
            title="Tailored feedback"
            body="Slips caught and corrected, gently."
          />
          <Feature
            icon="🧠"
            title="Remembers you"
            body="Your goals, gaps, and topics."
          />
          <Feature
            icon="⏰"
            title="Always on"
            body="24/7. No bookings."
          />
        </div>
      </section>

      <section id="testimonials" className="testimonials">
        <h2 className="section-title">Loved by language learners</h2>
        <div className="testimonial-grid">
          <Testimonial
            avatar="👩‍💼"
            name="Elena R."
            role="Learning Portuguese · Lisbon"
            quote="Feels like talking to a patient friend who happens to be an amazing teacher."
          />
          <Testimonial
            avatar="🧑‍🎓"
            name="Marc S."
            role="Learning Spanish · NYC"
            quote="The feedback is so natural — and I actually remember how to say things better."
          />
          <Testimonial
            avatar="👨‍🔬"
            name="Lucas B."
            role="Learning Italian · London"
            quote="I can practice anytime, and it remembers everything. Game-changer."
          />
        </div>
      </section>

      <section id="pricing" className="pricing">
        <h2 className="section-title">Simple pricing</h2>
        <p className="section-subtitle">
          Try free, then pick the plan that fits.
        </p>
        <div className="price-cards">
          <PriceCard
            plan={null}
            title="Free"
            price="$0"
            period=""
            description="10 minutes of voice practice. No card required."
            features={["10-minute voice trial", "All 5 languages", "Basic feedback"]}
            ctaLabel="Get started"
            onClick={() => navigate('/chat')}
          />
          <PriceCard
            plan="monthly"
            title="Monthly"
            price="$14.99"
            period="/ month"
            description="Unlimited conversations. Cancel anytime."
            features={["Unlimited voice practice", "All 5 languages", "Memory across sessions", "Cancel anytime"]}
            ctaLabel="Subscribe"
            onClick={() => handleSubscribe('monthly')}
          />
          <PriceCard
            plan="yearly"
            title="Yearly"
            price="$149.99"
            period="/ year"
            description="Save $30 · $12.49/mo."
            features={["Everything in Monthly", "Save $30 vs monthly", "Priority improvements", "Best value"]}
            ctaLabel="Subscribe"
            highlighted
            onClick={() => handleSubscribe('yearly')}
          />
        </div>
      </section>

      <section className="cta-strip">
        <h2 className="cta-strip-title">Ready to start talking?</h2>
        <p className="cta-strip-subtitle">Your language tutor is one tap away.</p>
        <Link to="/chat" className="landing-cta landing-cta-large">Get Started</Link>
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
            a="Five languages today — Brazilian Portuguese, Mexican Spanish, Italian, French, and German. More on the way."
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
            a="Yes. Modern browsers on iPhone or Android, plus a native iOS app. Allow microphone access when prompted."
          />
          <FaqItem
            q="Can I cancel anytime?"
            a="Yes. Subscriptions can be cancelled from your account at any time."
          />
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-logo">Walkie Talkie</div>
        <div className="landing-footer-tagline">
          Voice AI tutor for English speakers learning a second language.
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="feature">
      <div className="feature-medal">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-body">{body}</p>
    </div>
  )
}

function LanguageMedal({ flag, name }: { flag: string; name: string }) {
  return (
    <div className="language-medal">
      <div className="language-medal-disc">
        <span>{flag}</span>
      </div>
      <div className="language-medal-name">{name}</div>
    </div>
  )
}

function Testimonial({
  avatar,
  name,
  role,
  quote,
}: {
  avatar: string
  name: string
  role: string
  quote: string
}) {
  return (
    <article className="testimonial">
      <header className="testimonial-header">
        <div className="testimonial-portrait">{avatar}</div>
        <div className="testimonial-meta">
          <div className="testimonial-name">{name}</div>
          <div className="testimonial-role">{role}</div>
        </div>
      </header>
      <div className="testimonial-stars">★★★★★</div>
      <p className="testimonial-quote">{quote}</p>
    </article>
  )
}

function PriceCard({
  title,
  price,
  period,
  description,
  features,
  ctaLabel,
  highlighted,
  onClick,
}: {
  plan: Plan | null
  title: string
  price: string
  period: string
  description: string
  features: string[]
  ctaLabel: string
  highlighted?: boolean
  onClick: () => void
}) {
  return (
    <div className={`price-card ${highlighted ? 'highlighted' : ''}`}>
      {highlighted && <div className="price-badge">Best value</div>}
      <div className="price-title">{title}</div>
      <div className="price-amount-row">
        <span className="price-amount">{price}</span>
        <span className="price-period">{period}</span>
      </div>
      <div className="price-desc">{description}</div>
      <ul className="price-features">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <button className="price-cta" onClick={onClick}>{ctaLabel}</button>
    </div>
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
