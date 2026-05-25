import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="app legal">
      <nav className="tutor-nav">
        <Link to="/lessons" className="tutor-nav-back">
          ← Back
        </Link>
      </nav>
      <header className="header">
        <h1>Privacy Policy</h1>
        <p className="subtitle">Last updated: May 7, 2026</p>
      </header>
      <article className="legal-body">
        <p>
          This is the plain-language version of how Walkie Talkie handles your
          data, both on the web at walkietalkie.so and in the Walkie Talkie iOS
          app. Questions? Email support@walkietalkie.so.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account info:</strong> email (when provided via sign-in),
            and a unique account ID issued by our auth provider (Supabase). If
            you use Sign In with Apple, we also receive a stable Apple-issued
            user identifier so we can recognize you across devices and
            reinstalls. We do not receive your Apple ID or password.
          </li>
          <li>
            <strong>Profile info:</strong> the name, native language,
            proficiency level, and learning goal you enter during onboarding.
            Used to personalize Natalia's conversations.
          </li>
          <li>
            <strong>Subscription info:</strong> billing is handled by Stripe
            (web) or Apple (iOS in-app purchase). We store a customer or
            transaction identifier, the plan you're on, the renewal date, and
            the current status — enough to gate access. We never see your
            credit card or Apple Pay details; those stay with the payment
            provider.
          </li>
          <li>
            <strong>Usage:</strong> seconds of voice practice, used to enforce
            the free trial limit.
          </li>
          <li>
            <strong>Session content:</strong> audio from your microphone is
            streamed in real time to OpenAI so the AI tutor can hear and
            respond to you. Transcripts of what you say are also sent to
            OpenAI so the tutor can correct you and remember the
            conversation across sessions. We don't keep audio after a
            session ends. OpenAI processes this data under privacy
            protections equivalent to ours (OpenAI's API tier does not
            use customer data to train models); see{' '}
            <a
              href="https://openai.com/policies/privacy-policy"
              target="_blank"
              rel="noreferrer noopener"
            >
              OpenAI's privacy policy
            </a>
            . You're asked to acknowledge this before your first session
            in the iOS app, and you can read the same disclosure here.
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
          <li>
            We don't track you across other apps or websites for advertising.
          </li>
        </ul>
        <h2>Third parties</h2>
        <p>
          We rely on the following providers, each with its own privacy
          policy:
        </p>
        <ul>
          <li>
            <strong>OpenAI</strong> — AI voice processing and
            transcription. Subject to OpenAI's privacy commitments;
            API-tier customer data is not used to train models.
          </li>
          <li>
            <strong>Supabase</strong> — authentication and database.
          </li>
          <li>
            <strong>Stripe</strong> — payments on the web.
          </li>
          <li>
            <strong>Apple</strong> — Sign In with Apple, App Store in-app
            purchases, and App Store Server Notifications for the iOS app.
          </li>
          <li>
            <strong>Vercel</strong> — hosting and serverless functions.
          </li>
        </ul>
        <h2>Deleting your data</h2>
        <p>
          On the web: Settings → Account → Delete account permanently removes
          your account, cancels any active Stripe subscription, and deletes
          your rows from our database.
        </p>
        <p>
          On iOS: the same Delete account action removes your Walkie Talkie
          rows. To cancel an active App Store subscription you must also do so
          via iPhone Settings → Apple ID → Subscriptions — only Apple can
          cancel an Apple-billed subscription.
        </p>
        <h2>Children</h2>
        <p>
          Walkie Talkie is not directed at children under 13. We don't
          knowingly collect data from anyone under 13.
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
