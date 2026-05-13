import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

/// Two-step email-OTP sign-in. Step 1 collects the email and asks
/// Supabase to send a 6-digit code (Supabase emails it alongside the
/// legacy magic-link, so existing senders aren't affected). Step 2
/// collects the code and verifies it inline — no email-app context-
/// switch like the magic-link flow required.
export function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'awaitingCode' | 'verifying' | 'error'
  >('idle')
  const [error, setError] = useState<string | null>(null)

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
        Enter your email — we'll send you a 6-digit code. No password required.
      </p>
      <form onSubmit={sendCode} className="auth-form">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="auth-input"
          required
          autoFocus
          disabled={status === 'sending'}
        />
        <button
          type="submit"
          className="mic-btn start"
          disabled={status === 'sending' || !email.trim()}
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
