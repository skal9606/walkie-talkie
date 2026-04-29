import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from '../lib/auth'
import {
  NATIVE_LANGUAGES,
  loadProfile,
  saveProfile,
  type LearnerProfile,
  type NativeLanguage,
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
import { TUTORS, getTutor } from '../lib/tutors'
import type { TutorId } from '../lib/tutors/types'

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
  // Persisted state — only updated when the user clicks Save Changes (or for
  // the theme, which is a UI setting and applies instantly).
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

  function handleProfileSave(next: LearnerProfile) {
    saveProfile(next)
    setProfile(next)
    onProfileChange(next)
  }

  function handlePrefsSave(next: Preferences) {
    savePreferences(next)
    setPrefs(next)
  }

  // Theme toggles apply instantly — it's a UI choice, not a tutor setting.
  function handleThemeChange(theme: Theme) {
    const next = { ...prefs, theme }
    savePreferences(next)
    applyTheme(theme)
    setPrefs(next)
  }

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
          <ProfileTab profile={profile} onSave={handleProfileSave} />
        )}

        {tab === 'tutor' && <TutorTab prefs={prefs} onSave={handlePrefsSave} />}

        {tab === 'account' && (
          <AccountTab
            accessToken={accessToken}
            sub={sub}
            subLoading={subLoading}
            setSub={setSub}
            theme={prefs.theme}
            onThemeChange={handleThemeChange}
            confirmingCancel={confirmingCancel}
            setConfirmingCancel={setConfirmingCancel}
            confirmingDelete={confirmingDelete}
            setConfirmingDelete={setConfirmingDelete}
            onCancel={handleCancel}
            onDelete={handleDelete}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        )}

        {error && <div className="settings-error">{error}</div>}
      </div>
    </div>
  )
}

function ProfileTab({
  profile,
  onSave,
}: {
  profile: LearnerProfile
  onSave: (p: LearnerProfile) => void
}) {
  // Draft state — what the user is editing. Only flushed to localStorage and
  // bubbled up when they click Save Changes. Reset whenever the persisted
  // profile changes (e.g. after a successful save).
  const [draft, setDraft] = useState<LearnerProfile>(profile)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => {
    setDraft(profile)
  }, [profile])

  function update<K extends keyof LearnerProfile>(key: K, value: LearnerProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setJustSaved(false)
  }

  function handleSave() {
    onSave(draft)
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="settings-tab-body">
      <Field label="Your name">
        <input
          type="text"
          className="settings-input"
          value={draft.name ?? ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="What should Natalia call you?"
        />
      </Field>

      <Field label="Native language">
        <select
          className="settings-input"
          value={draft.nativeLanguage ?? 'English'}
          onChange={(e) => update('nativeLanguage', e.target.value as NativeLanguage)}
        >
          {NATIVE_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Language being learned"
        hint="Switching language resets your proficiency so the next session starts fresh."
      >
        <select
          className="settings-input"
          value={draft.tutorId ?? TUTORS[0].id}
          onChange={(e) => {
            const nextId = e.target.value as TutorId
            const nextTutor = getTutor(nextId)
            // Switching tutor → drop the old level + name so the next
            // session goes through Discover for the new language.
            setDraft((d) => ({
              ...d,
              tutorId: nextId,
              targetLanguage: nextTutor.language,
              level: d.tutorId === nextId ? d.level : undefined,
            }))
            setJustSaved(false)
          }}
        >
          {TUTORS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag} {t.languageLabel} — {t.name}, {t.city}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Proficiency level">
        <div className="settings-radio-group">
          {LEVEL_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`settings-radio ${draft.level === opt.id ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="level"
                value={opt.id}
                checked={draft.level === opt.id}
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
          value={draft.goals ?? ''}
          onChange={(e) => update('goals', e.target.value)}
          placeholder="To talk to my Brazilian in-laws, traveling to Rio next year, etc."
          rows={3}
        />
      </Field>

      <SaveBar
        justSaved={justSaved}
        onSave={handleSave}
        hint="Changes apply to your next conversation with Natalia."
      />
    </div>
  )
}

function TutorTab({
  prefs,
  onSave,
}: {
  prefs: Preferences
  onSave: (p: Preferences) => void
}) {
  const [draft, setDraft] = useState<Preferences>(prefs)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => {
    setDraft(prefs)
  }, [prefs])

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setJustSaved(false)
  }

  function handleSave() {
    // Theme isn't edited from this tab — preserve whatever the persisted
    // value is.
    onSave({ ...draft, theme: prefs.theme })
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 2000)
  }

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
              className={`settings-radio ${draft.formality === f ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="formality"
                value={f}
                checked={draft.formality === f}
                onChange={() => update('formality', f)}
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
              className={`settings-radio ${draft.strictness === s ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="strictness"
                value={s}
                checked={draft.strictness === s}
                onChange={() => update('strictness', s)}
              />
              <span>{s === 'lax' ? 'Let things flow' : 'Correct me'}</span>
            </label>
          ))}
        </div>
      </Field>

      <SaveBar
        justSaved={justSaved}
        onSave={handleSave}
        hint="Changes apply to your next conversation with Natalia."
      />
    </div>
  )
}

function AccountTab({
  accessToken,
  sub,
  subLoading,
  setSub,
  theme,
  onThemeChange,
  confirmingCancel,
  setConfirmingCancel,
  confirmingDelete,
  setConfirmingDelete,
  onCancel,
  onDelete,
  busy,
  setBusy,
  setError,
}: {
  accessToken: string
  sub: SubscriptionDetail | null
  subLoading: boolean
  setSub: (s: SubscriptionDetail) => void
  theme: Theme
  onThemeChange: (t: Theme) => void
  confirmingCancel: boolean
  setConfirmingCancel: (b: boolean) => void
  confirmingDelete: boolean
  setConfirmingDelete: (b: boolean) => void
  onCancel: () => void
  onDelete: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  setError: (e: string | null) => void
}) {
  async function handleReactivate() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/reactivate-subscription', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Reactivation failed')
      }
      const refreshed = await fetch('/api/subscription-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setSub((await refreshed.json()) as SubscriptionDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-tab-body">
      <Field label="Subscription">
        <SubscriptionDetailCard sub={sub} loading={subLoading} />

        {/* Active, not scheduled to cancel — show Cancel CTA */}
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
                  . You can change your mind anytime before then.
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

        {/* Cancellation scheduled — show Reactivate CTA */}
        {sub && sub.plan && sub.cancelAtPeriodEnd && (
          <button
            type="button"
            className="settings-btn-primary"
            onClick={handleReactivate}
            disabled={busy}
          >
            {busy ? 'Reactivating…' : 'Reactivate subscription'}
          </button>
        )}
      </Field>

      <Field label="Theme">
        <div className="settings-radio-group settings-radio-group-row">
          {(['dark', 'light'] as Theme[]).map((t) => (
            <label
              key={t}
              className={`settings-radio ${theme === t ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={t}
                checked={theme === t}
                onChange={() => onThemeChange(t)}
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

// Pricing source of truth for the subscription panel. Mirrors the Paywall
// copy — keep in sync if pricing changes.
const PLAN_DISPLAY: Record<'monthly' | 'yearly', { label: string; price: string }> = {
  monthly: { label: 'Monthly', price: '$10 / month' },
  yearly: { label: 'Annual', price: '$100 / year ($8.33 / month)' },
}

function SubscriptionDetailCard({
  sub,
  loading,
}: {
  sub: SubscriptionDetail | null
  loading: boolean
}) {
  if (loading) return <div className="settings-readonly">Loading…</div>
  if (!sub) return <div className="settings-readonly">Unknown</div>

  if (sub.status === 'trial' || !sub.plan) {
    return (
      <div className="settings-sub-card">
        <div className="settings-sub-row">
          <span className="settings-sub-label">Plan</span>
          <span className="settings-sub-value">Free trial</span>
        </div>
        <div className="settings-sub-hint">
          Subscribe from the home screen to unlock unlimited conversations.
        </div>
      </div>
    )
  }

  const display = PLAN_DISPLAY[sub.plan]
  const renewDate = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString()
    : null

  return (
    <div className="settings-sub-card">
      <div className="settings-sub-row">
        <span className="settings-sub-label">Plan</span>
        <span className="settings-sub-value">{display.label}</span>
      </div>
      <div className="settings-sub-row">
        <span className="settings-sub-label">Price</span>
        <span className="settings-sub-value">{display.price}</span>
      </div>
      {renewDate && (
        <div className="settings-sub-row">
          <span className="settings-sub-label">
            {sub.cancelAtPeriodEnd ? 'Access ends' : 'Next billed'}
          </span>
          <span className="settings-sub-value">{renewDate}</span>
        </div>
      )}
      {sub.status === 'past_due' && (
        <div className="settings-sub-warning">
          Payment past due — please update your card to keep access.
        </div>
      )}
      {sub.cancelAtPeriodEnd && (
        <div className="settings-sub-warning">
          Cancellation scheduled. You'll keep access until the date above.
        </div>
      )}
    </div>
  )
}

function SaveBar({
  justSaved,
  onSave,
  hint,
}: {
  justSaved: boolean
  onSave: () => void
  hint?: string
}) {
  // Always-enabled button. After a click, the label flips to "✓ Saved" for
  // 2s and the button color shifts to communicate success — no greyed-out
  // state, since that reads as "broken / click didn't register" right when
  // the user wants confirmation.
  return (
    <div className="settings-save-bar">
      {hint && <div className="settings-save-hint">{hint}</div>}
      <button
        type="button"
        className={`settings-btn-primary ${justSaved ? 'just-saved' : ''}`}
        onClick={onSave}
      >
        {justSaved ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  )
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

