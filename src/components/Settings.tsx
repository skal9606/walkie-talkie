import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from '../lib/auth'
import {
  loadProfile,
  saveProfile,
  type LearnerProfile,
} from '../lib/profile'
import {
  applyTheme,
  loadPreferences,
  savePreferences,
  type Formality,
  type Preferences,
  type Strictness,
  type Theme,
} from '../lib/preferences'

type SubscriptionDetail = {
  plan: 'monthly' | 'yearly' | null
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

type Tab = 'profile' | 'tutor' | 'account'

const LEVEL_OPTIONS: { id: NonNullable<LearnerProfile['level']>; label: string }[] = [
  { id: 'complete-beginner', label: 'First timer' },
  { id: 'novice', label: 'Basic' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

export function Settings({
  accessToken,
  onClose,
  onProfileChange,
}: {
  accessToken: string
  onClose: () => void
  onProfileChange: (p: LearnerProfile) => void
}) {
  const [tab, setTab] = useState<Tab>('profile')
  const [profile, setProfile] = useState<LearnerProfile>(
    () => loadProfile() ?? {},
  )
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences())
  const [sub, setSub] = useState<SubscriptionDetail | null>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  // Persist profile + preferences whenever they change. Profile saves bubble
  // up to the parent so the portal reflects the new name immediately.
  useEffect(() => {
    saveProfile(profile)
    onProfileChange(profile)
  }, [profile, onProfileChange])

  useEffect(() => {
    savePreferences(prefs)
    applyTheme(prefs.theme)
  }, [prefs])

  // Load subscription detail when the Account tab is opened (or on mount).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/subscription-status', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!r.ok) throw new Error(await r.text())
        const data = (await r.json()) as SubscriptionDetail
        if (!cancelled) setSub(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setSubLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  async function handleCancel() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Cancellation failed')
      }
      // Refresh subscription state so the UI shows "cancellation scheduled".
      const refreshed = await fetch('/api/subscription-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setSub((await refreshed.json()) as SubscriptionDetail)
      setConfirmingCancel(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Account deletion failed')
      }
      // Sign out locally — the server already invalidated the user.
      await signOut()
      window.location.href = '/'
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <nav className="settings-tabs" role="tablist">
          {(['profile', 'tutor', 'account'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`settings-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'profile' ? 'Profile' : t === 'tutor' ? 'Tutor' : 'Account'}
            </button>
          ))}
        </nav>

        {tab === 'profile' && (
          <ProfileTab profile={profile} onChange={setProfile} />
        )}

        {tab === 'tutor' && <TutorTab prefs={prefs} onChange={setPrefs} />}

        {tab === 'account' && (
          <AccountTab
            sub={sub}
            subLoading={subLoading}
            prefs={prefs}
            onPrefsChange={setPrefs}
            confirmingCancel={confirmingCancel}
            setConfirmingCancel={setConfirmingCancel}
            confirmingDelete={confirmingDelete}
            setConfirmingDelete={setConfirmingDelete}
            onCancel={handleCancel}
            onDelete={handleDelete}
            busy={busy}
          />
        )}

        {error && <div className="settings-error">{error}</div>}
      </div>
    </div>
  )
}

function ProfileTab({
  profile,
  onChange,
}: {
  profile: LearnerProfile
  onChange: (p: LearnerProfile) => void
}) {
  function update<K extends keyof LearnerProfile>(key: K, value: LearnerProfile[K]) {
    onChange({ ...profile, [key]: value })
  }
  return (
    <div className="settings-tab-body">
      <Field label="Your name">
        <input
          type="text"
          className="settings-input"
          value={profile.name ?? ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="What should Natalia call you?"
        />
      </Field>

      <Field label="Native language">
        <input
          type="text"
          className="settings-input"
          value={profile.nativeLanguage ?? ''}
          onChange={(e) => update('nativeLanguage', e.target.value)}
          placeholder="English, Spanish, etc."
        />
      </Field>

      <Field label="Language being learned">
        <div className="settings-readonly">Brazilian Portuguese</div>
      </Field>

      <Field label="Proficiency level">
        <div className="settings-radio-group">
          {LEVEL_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`settings-radio ${profile.level === opt.id ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="level"
                value={opt.id}
                checked={profile.level === opt.id}
                onChange={() => update('level', opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Why you're learning">
        <textarea
          className="settings-input settings-textarea"
          value={profile.goals ?? ''}
          onChange={(e) => update('goals', e.target.value)}
          placeholder="To talk to my Brazilian in-laws, traveling to Rio next year, etc."
          rows={3}
        />
      </Field>
    </div>
  )
}

function TutorTab({
  prefs,
  onChange,
}: {
  prefs: Preferences
  onChange: (p: Preferences) => void
}) {
  return (
    <div className="settings-tab-body">
      <Field
        label="Formality"
        hint="How casual should Natalia sound?"
      >
        <div className="settings-radio-group settings-radio-group-row">
          {(['casual', 'neutral', 'formal'] as Formality[]).map((f) => (
            <label
              key={f}
              className={`settings-radio ${prefs.formality === f ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="formality"
                value={f}
                checked={prefs.formality === f}
                onChange={() => onChange({ ...prefs, formality: f })}
              />
              <span>{f === 'casual' ? 'Casual' : f === 'neutral' ? 'Neutral' : 'Formal'}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Grammar strictness"
        hint="Strict mode tells Natalia to correct meaningful errors every time."
      >
        <div className="settings-radio-group settings-radio-group-row">
          {(['lax', 'strict'] as Strictness[]).map((s) => (
            <label
              key={s}
              className={`settings-radio ${prefs.strictness === s ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="strictness"
                value={s}
                checked={prefs.strictness === s}
                onChange={() => onChange({ ...prefs, strictness: s })}
              />
              <span>{s === 'lax' ? 'Let things flow' : 'Correct me'}</span>
            </label>
          ))}
        </div>
      </Field>
    </div>
  )
}

function AccountTab({
  sub,
  subLoading,
  prefs,
  onPrefsChange,
  confirmingCancel,
  setConfirmingCancel,
  confirmingDelete,
  setConfirmingDelete,
  onCancel,
  onDelete,
  busy,
}: {
  sub: SubscriptionDetail | null
  subLoading: boolean
  prefs: Preferences
  onPrefsChange: (p: Preferences) => void
  confirmingCancel: boolean
  setConfirmingCancel: (b: boolean) => void
  confirmingDelete: boolean
  setConfirmingDelete: (b: boolean) => void
  onCancel: () => void
  onDelete: () => void
  busy: boolean
}) {
  return (
    <div className="settings-tab-body">
      <Field label="Subscription">
        <SubscriptionStatus sub={sub} loading={subLoading} />
        {sub && sub.plan && !sub.cancelAtPeriodEnd && (
          <>
            {!confirmingCancel ? (
              <button
                type="button"
                className="settings-link-btn settings-link-btn-danger"
                onClick={() => setConfirmingCancel(true)}
                disabled={busy}
              >
                Cancel subscription
              </button>
            ) : (
              <div className="settings-confirm">
                <p className="settings-confirm-text">
                  Cancel? You'll keep access until{' '}
                  {sub.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                    : 'the end of your current period'}
                  .
                </p>
                <div className="settings-confirm-actions">
                  <button
                    type="button"
                    className="settings-btn-danger"
                    onClick={onCancel}
                    disabled={busy}
                  >
                    {busy ? 'Cancelling…' : 'Yes, cancel'}
                  </button>
                  <button
                    type="button"
                    className="settings-btn-secondary"
                    onClick={() => setConfirmingCancel(false)}
                    disabled={busy}
                  >
                    Keep subscription
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Field>

      <Field label="Theme">
        <div className="settings-radio-group settings-radio-group-row">
          {(['dark', 'light'] as Theme[]).map((t) => (
            <label
              key={t}
              className={`settings-radio ${prefs.theme === t ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={t}
                checked={prefs.theme === t}
                onChange={() => onPrefsChange({ ...prefs, theme: t })}
              />
              <span>{t === 'dark' ? 'Dark' : 'Light'}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Legal">
        <div className="settings-link-row">
          <Link to="/terms" className="settings-link">
            Terms of Use
          </Link>
          <Link to="/privacy" className="settings-link">
            Privacy Policy
          </Link>
        </div>
      </Field>

      <Field label="Danger zone">
        {!confirmingDelete ? (
          <button
            type="button"
            className="settings-link-btn settings-link-btn-danger"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            Delete account
          </button>
        ) : (
          <div className="settings-confirm">
            <p className="settings-confirm-text">
              Permanently delete your account? This cancels your subscription
              immediately and removes all your data. This cannot be undone.
            </p>
            <div className="settings-confirm-actions">
              <button
                type="button"
                className="settings-btn-danger"
                onClick={onDelete}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
              >
                Keep account
              </button>
            </div>
          </div>
        )}
      </Field>
    </div>
  )
}

function SubscriptionStatus({
  sub,
  loading,
}: {
  sub: SubscriptionDetail | null
  loading: boolean
}) {
  if (loading) return <div className="settings-readonly">Loading…</div>
  if (!sub) return <div className="settings-readonly">Unknown</div>

  if (sub.status === 'trial' || !sub.plan) {
    return <div className="settings-readonly">Free trial</div>
  }
  const planLabel = sub.plan === 'yearly' ? 'Annual' : 'Monthly'
  if (sub.cancelAtPeriodEnd) {
    return (
      <div className="settings-readonly">
        Subscribed ({planLabel}) — cancels{' '}
        {sub.currentPeriodEnd
          ? new Date(sub.currentPeriodEnd).toLocaleDateString()
          : 'at period end'}
      </div>
    )
  }
  if (sub.status === 'past_due') {
    return (
      <div className="settings-readonly">Subscribed ({planLabel}) — payment past due</div>
    )
  }
  return <div className="settings-readonly">Subscribed ({planLabel})</div>
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">{label}</div>
      {hint && <div className="settings-field-hint">{hint}</div>}
      {children}
    </div>
  )
}

