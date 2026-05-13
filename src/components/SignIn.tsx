import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

/// Three-option sign-in: Sign in with Apple (OAuth) up top, then a
/// divider, then a two-step email-OTP flow. Apple returns the user via
/// Supabase's callback URL and the parent route re-renders when the
/// auth-state-change event fires. The email flow asks Supabase to send
/// a 6-digit code (still emails the legacy magic-link alongside, so
/// existing senders aren't affected) and verifies it inline — no
/// email-app context-switch like the magic-link flow required.
export function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'awaitingCode' | 'verifying' | 'error' | 'oauth'
  >('idle')
  const [error, setError] = useState<string | null>(null)

  async function signInWithApple() {
    setStatus('oauth')
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      // Keep query params (e.g. ?checkout=monthly) so the user lands
      // back exactly where they started the sign-in flow.
      options: { redirectTo: window.location.href },
    })
    if (oauthError) {
      setError(oauthError.message)
      setStatus('error')
    }
    // On success the browser navigates away to appleid.apple.com —
    // nothing else to do here.
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    const clean = email.trim()
    if (!clean) return
    setStatus('sending')
    setError(null)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: clean,
      // Don't pass emailRedirectTo — that would make the link in the
      // email auto-redirect users away. We want them to copy the 6-digit
      // code instead.
    })
    if (sendError) {
      setError(sendError.message)
      setStatus('error')
      return
    }
    setStatus('awaitingCode')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    const cleanCode = code.trim()
    if (cleanCode.length < 6) return
    setStatus('verifying')
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: cleanCode,
      type: 'email',
    })
    if (verifyError) {
      setError(verifyError.message)
      setStatus('awaitingCode')
      return
    }
    // On success Supabase auth-state-change fires and the parent route
    // re-renders with the signed-in user. Nothing to do here.
  }

  if (status === 'awaitingCode' || status === 'verifying') {
    return (
      <div className="auth-card">
        <h2 className="auth-title">Enter your code</h2>
        <p className="auth-body">
          We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
        </p>
        <form onSubmit={verifyCode} className="auth-form">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="auth-input"
            required
            autoFocus
            maxLength={6}
            disabled={status === 'verifying'}
          />
          <button
            type="submit"
            className="mic-btn start"
            disabled={status === 'verifying' || code.length < 6}
          >
            {status === 'verifying' ? 'Verifying…' : 'Sign in'}
          </button>
          {error && <div className="error auth-error">{error}</div>}
        </form>
        <button
          type="button"
          className="auth-link-btn"
          onClick={() => {
            setEmail('')
            setCode('')
            setStatus('idle')
            setError(null)
          }}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h2 className="auth-title">Sign in to start practicing</h2>
      <p className="auth-body">
        Continue with Apple, or enter your email for a 6-digit code.
      </p>

      <button
        type="button"
        className="auth-oauth-btn auth-oauth-apple"
        onClick={signInWithApple}
        disabled={status === 'oauth' || status === 'sending'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 384 512"
          fill="currentColor"
          aria-hidden
        >
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        {status === 'oauth' ? 'Redirecting…' : 'Continue with Apple'}
      </button>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form onSubmit={sendCode} className="auth-form">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="auth-input"
          required
          disabled={status === 'sending' || status === 'oauth'}
        />
        <button
          type="submit"
          className="mic-btn start"
          disabled={status === 'sending' || status === 'oauth' || !email.trim()}
        >
          {status === 'sending' ? 'Sending…' : 'Send code'}
        </button>
        {error && <div className="error auth-error">{error}</div>}
      </form>
      <div className="auth-footnote">
        First 10 minutes of conversation free, then $14.99/month.
      </div>
    </div>
  )
}
