import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Plan } from '../lib/subscription'
import { JUST_SIGNED_OUT_FLAG, decideLandingAction, useAuth } from '../lib/auth'
import { track } from '../lib/analytics'

export default function Landing() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const closeMobileMenu = () => setMobileMenuOpen(false)
  // Fire landing_viewed at most once, and only for a visitor who actually
  // stays on the marketing page (signed-in users get redirected to /lessons).
  const landingTrackedRef = useRef(false)

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
      return
    }
    // Stayed on the landing page — count the view once.
    if (!landingTrackedRef.current) {
      landingTrackedRef.current = true
      track.landingViewed()
    }
  }, [user, loading, navigate])

  function handleSubscribe(plan: Plan) {
    navigate(`/chat?checkout=${plan}`)
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <span className="landing-led" aria-hidden />
            Walkie · Talkie
          </div>
          <ul className="landing-nav-right">
            <li><a href="#pricing" className="landing-nav-link">Pricing</a></li>
            <li><a href="#faq" className="landing-nav-link">FAQ</a></li>
            <li><Link to="/login" className="landing-nav-link login-pill">Login</Link></li>
            <li><Link to="/chat" className="landing-cta">Chat Now</Link></li>
          </ul>
          <button
            type="button"
            className="landing-nav-hamburger"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <span className={`landing-nav-hamburger-bar ${mobileMenuOpen ? 'open' : ''}`} />
            <span className={`landing-nav-hamburger-bar ${mobileMenuOpen ? 'open' : ''}`} />
            <span className={`landing-nav-hamburger-bar ${mobileMenuOpen ? 'open' : ''}`} />
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="landing-nav-mobile-menu">
            <a href="#pricing" className="landing-nav-mobile-link" onClick={closeMobileMenu}>Pricing</a>
            <a href="#faq" className="landing-nav-mobile-link" onClick={closeMobileMenu}>FAQ</a>
            <Link to="/login" className="landing-nav-mobile-link" onClick={closeMobileMenu}>Login</Link>
            <Link to="/chat" className="landing-nav-mobile-link landing-nav-mobile-link-cta" onClick={closeMobileMenu}>Chat Now →</Link>
          </div>
        )}
      </nav>

      <section className="hero">
        <div className="hero-grid">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-dot" aria-hidden>◉</span>
              Voice AI · Language Learners
            </div>
            <h1 className="hero-headline">
              Learn a language <em>by talking.</em>
            </h1>
            <p className="hero-subtext">
              Real voice practice for people who already know the basics. Your
              tutor remembers what you talked about last time and what you keep
              getting wrong.
            </p>
            <div className="hero-cta-group">
              <a
                href="https://apps.apple.com/app/walkie-talkie-ai-tutor/id6767578891"
                target="_blank"
                rel="noopener noreferrer"
                className="landing-cta-secondary"
              >
                Download App
              </a>
              <Link to="/chat" className="landing-cta-outline">Chat on Web</Link>
            </div>
            <div className="hero-footnote">First 10 minutes free · $14.99/month after</div>
          </div>

          <ChatPreview />
        </div>
      </section>

      <section className="languages">
        <div className="languages-inner">
          <h2 className="section-title">Practice in 5 <em>languages</em></h2>
          <p className="section-subtitle">One subscription · every tutor</p>
          <div className="language-medals">
            <LanguageMedal flag="🇧🇷" name="Portuguese" />
            <LanguageMedal flag="🇲🇽" name="Spanish" />
            <LanguageMedal flag="🇮🇹" name="Italian" />
            <LanguageMedal flag="🇫🇷" name="French" />
            <LanguageMedal flag="🇩🇪" name="German" />
          </div>
        </div>
      </section>

      <section className="chat-preview">
        <div className="chat-preview-grid">
          <div className="chat-preview-text">
            <h2 className="section-title">Like texting,<br /><em>but for speaking.</em></h2>
            <p className="section-subtitle">
              Natural conversations. Helpful corrections. Real progress.
            </p>
            <div className="chat-preview-status">LIVE SIGNAL — PRESS TO TX</div>
          </div>
          <div className="hero-console" aria-hidden>
            <div className="hero-console-screen">
              <div className="hero-console-screen-row glow"><span>◉ CHANNEL 11</span><span>92.6 MHZ</span></div>
              <div className="hero-console-screen-row"><span>SIG STRENGTH</span><span>▓▓▓▓▓░░ STRONG</span></div>
              <div className="hero-console-screen-row"><span>OP NAME</span><span>NATALIA</span></div>
              <div className="hero-console-screen-row"><span>LOC</span><span>PT-BR</span></div>
              <div className="hero-console-screen-row"><span>STATUS</span><span className="online">ONLINE</span></div>
            </div>
            <img src="/walkie-talkie-hero.png" alt="" className="hero-image" />
            <div className="hero-console-dials">
              <div className="hero-dial"><div className="hero-dial-knob" /><div className="hero-dial-label">VOL</div></div>
              <div className="hero-dial"><div className="hero-dial-knob" /><div className="hero-dial-label">SQUELCH</div></div>
              <div className="hero-dial"><div className="hero-dial-knob" /><div className="hero-dial-label">CHANNEL</div></div>
              <div className="hero-dial"><div className="hero-dial-knob" /><div className="hero-dial-label">MODE</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="features-inner">
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
        </div>
      </section>

      <section id="testimonials" className="testimonials">
        <div className="testimonials-inner">
          <h2 className="section-title">Loved by <em>learners</em></h2>
          <div className="testimonial-grid">
            <Testimonial
              txId="0451"
              avatar="👩‍💼"
              name="Elena R."
              role="Portuguese · Lisbon"
              quote="Feels like talking to a patient friend who happens to be an amazing teacher."
            />
            <Testimonial
              txId="0883"
              avatar="🧑‍🎓"
              name="Marc S."
              role="Spanish · NYC"
              quote="The feedback is so natural — and I actually remember how to say things better."
            />
            <Testimonial
              txId="1207"
              avatar="👨‍🔬"
              name="Lucas B."
              role="Italian · London"
              quote="I can practice anytime, and it remembers everything. Game-changer."
            />
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing">
        <div className="pricing-inner">
          <h2 className="section-title">Simple pricing</h2>
          <p className="section-subtitle">Try free · pick the plan that fits</p>
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
              period="/mo"
              description="Unlimited conversations. Cancel anytime."
              features={["Unlimited voice practice", "All 5 languages", "Memory across sessions", "Cancel anytime"]}
              ctaLabel="Subscribe"
              onClick={() => handleSubscribe('monthly')}
            />
            <PriceCard
              plan="yearly"
              title="Yearly"
              price="$149.99"
              period="/yr"
              description="Save $30 · $12.49/mo."
              features={["Everything in Monthly", "Save $30 vs monthly", "Priority improvements", "Best value"]}
              ctaLabel="Subscribe"
              highlighted
              onClick={() => handleSubscribe('yearly')}
            />
          </div>
        </div>
      </section>

      <div className="cta-strip-wrap">
        <div className="landing-container">
          <section className="cta-strip">
            <div>
              <h2 className="cta-strip-title">Ready to <em>start talking?</em></h2>
              <p className="cta-strip-subtitle">Your language tutor is one tap away</p>
            </div>
            <Link to="/chat" className="landing-cta landing-cta-large">Get Started</Link>
          </section>
        </div>
      </div>

      <section id="faq" className="faq">
        <div className="faq-inner">
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
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-logo">
          <span className="landing-led" aria-hidden />
          Walkie · Talkie
        </div>
        <div className="landing-footer-tagline">
          Voice AI tutor for English speakers learning a second language.
        </div>
        <div className="landing-footer-links">
          <Link to="/blog">Blog</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </div>
        <div className="landing-footer-copy">© 2026 · WT-470 · all freqs reserved</div>
      </footer>
    </div>
  )
}

// Scripted conversation that plays out on load: Natalia "types" before
// each of her replies, the user's replies pop in instantly. After the
// last message we leave Natalia typing for a beat, then reset and loop.
// Total runtime ~10s, looped. The cadence is intentionally faster than
// real speech so the visual reads as "alive" inside a single fold view.
const CHAT_SCRIPT = [
  { speaker: 'tutor', text: 'Oi! Como foi seu fim de semana?' },
  { speaker: 'user', text: 'Eu fui ao parque com meu cachorro.' },
  { speaker: 'tutor', text: 'Que legal! Como se chama seu cachorro?' },
  { speaker: 'user', text: 'Ele se chama Luna.' },
] as const

function ChatPreview() {
  const [visibleCount, setVisibleCount] = useState(0)
  const [isTutorTyping, setIsTutorTyping] = useState(false)
  const [loopKey, setLoopKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => { if (!cancelled) fn() }, ms))
    }

    // Reset to empty at the start of each loop.
    setVisibleCount(0)
    setIsTutorTyping(false)

    // Timeline (ms from loop start):
    //   0    typing dots show (Natalia)
    //   1100 dots gone, message 1 (Natalia) appears
    //   2100 message 2 (You) appears
    //   3000 typing dots show (Natalia)
    //   4100 dots gone, message 3 (Natalia) appears
    //   5100 message 4 (You) appears
    //   8500 restart loop (hold final state — no trailing typing
    //        indicator because it grows the box and feels disorienting)
    at(0,    () => setIsTutorTyping(true))
    at(1100, () => { setIsTutorTyping(false); setVisibleCount(1) })
    at(2100, () => setVisibleCount(2))
    at(3000, () => setIsTutorTyping(true))
    at(4100, () => { setIsTutorTyping(false); setVisibleCount(3) })
    at(5100, () => setVisibleCount(4))
    at(8500, () => setLoopKey((k) => k + 1))

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [loopKey])

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <span>◉</span>
        <span className="chat-window-header-freq">NATALIA · PT-BR</span>
      </div>
      <div className="chat-window-body">
        {CHAT_SCRIPT.slice(0, visibleCount).map((msg, i) => (
          <div key={`${loopKey}-${i}`} className={`chat-line chat-line-${msg.speaker}`}>
            <span className="chat-line-speaker">
              {msg.speaker === 'tutor' ? '▸ Natalia' : 'You ▸'}
            </span>
            <span className="chat-line-text">{msg.text}</span>
          </div>
        ))}
        {isTutorTyping && (
          <div key={`${loopKey}-typing`} className="chat-line chat-line-tutor">
            <span className="chat-line-speaker">▸ Natalia</span>
            <div className="chat-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <div className="chat-window-footer">
        <span className="chat-window-mic-dot" />
        TAP TO SPEAK
      </div>
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
  txId,
  avatar,
  name,
  role,
  quote,
}: {
  txId: string
  avatar: string
  name: string
  role: string
  quote: string
}) {
  return (
    <article className="testimonial" data-tx-id={txId}>
      <div className="testimonial-stars">★★★★★</div>
      <p className="testimonial-quote">{quote}</p>
      <header className="testimonial-header">
        <div className="testimonial-portrait">{avatar}</div>
        <div className="testimonial-meta">
          <div className="testimonial-name">{name}</div>
          <div className="testimonial-role">{role}</div>
        </div>
      </header>
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
      <div className="price-title">— {title} —</div>
      <div className="price-amount-row">
        <span className="price-amount">{price}</span>
        {period && <span className="price-period">{period}</span>}
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
