import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="app legal">
      <nav className="tutor-nav">
        <Link to="/practice" className="tutor-nav-back">
          ← Back
        </Link>
      </nav>
      <header className="header">
        <h1>Privacy Policy</h1>
        <p className="subtitle">Last updated: April 25, 2026</p>
      </header>
      <article className="legal-body">
        <p>
          This is the plain-language version of how Walkie Talkie handles your
          data. Questions? Email support@walkietalkie.so.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account info:</strong> email (if you sign in), and a unique
            account ID issued by our auth provider (Supabase).
          </li>
          <li>
            <strong>Profile info:</strong> the name, native language,
            proficiency level, and learning goal you enter on the questionnaire.
            Stored on your device and used to personalize Natalia's
            conversations.
          </li>
          <li>
            <strong>Subscription info:</strong> billing handled by Stripe; we
            store a customer ID and subscription state to gate access.
          </li>
          <li>
            <strong>Usage:</strong> seconds of voice practice, used to enforce
            the free trial limit.
          </li>
          <li>
            <strong>Session content:</strong> audio is streamed to OpenAI for
            real-time transcription and response generation. We don't keep
            audio after a session ends. Transcripts are sent to OpenAI to
            generate your post-session review and then discarded.
          </li>
        </ul>
        <h2>What we don't do</h2>
        <ul>
          <li>We don't sell your data.</li>
          <li>We don't share data with advertisers.</li>
          <li>
            We don't keep your audio recordings after a session ends — only the
            text transcript is briefly used to generate the review, then
            discarded.
          </li>
        </ul>
        <h2>Third parties</h2>
        <p>
          We use OpenAI for AI/voice processing, Supabase for auth and
          database, Stripe for payments, and Vercel for hosting. Each provider
          has its own privacy policy.
        </p>
        <h2>Deleting your data</h2>
        <p>
          Settings → Account → Delete account permanently removes your
          account, cancels any active subscription, and deletes your associated
          rows from our database.
        </p>
        <h2>Changes</h2>
        <p>
          We'll update this policy as the product evolves. Material changes
          will be announced in-app.
        </p>
      </article>
    </div>
  )
}
