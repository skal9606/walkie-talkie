import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = email.trim()
    if (!clean) return
    setStatus('sending')
    setError(null)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: `${window.location.origin}/practice`,
      },
    })
    if (sendError) {
      setError(sendError.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div className="auth-card">
        <h2 className="auth-title">Check your email</h2>
        <p className="auth-body">
          We sent a magic link to <strong>{email}</strong>. Open it on this device
          to finish signing in.
        </p>
        <button
          type="button"
          className="auth-link-btn"
          onClick={() => {
            setEmail('')
            setStatus('idle')
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
        Enter your email — we'll send you a magic link. No password required.
      </p>
      <form onSubmit={handleSubmit} className="auth-form">
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
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
        {error && <div className="error auth-error">{error}</div>}
      </form>
      <div className="auth-footnote">
        First 5 minutes of conversation free, then $15/month.
      </div>
    </div>
  )
}
