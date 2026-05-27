import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/// Internal usage dashboard. Server-side enforces the admin gate
/// (ADMIN_EMAIL env var on Vercel must match the authenticated user's
/// email). On a non-admin auth — or no auth — the API returns 404 and
/// this page shows "Not found." which also obscures the route's
/// existence to casual visitors.

type AdminStats = {
  totalUsers: number
  newUsers7d: number
  newUsers30d: number
  activeUsers7d: number
  activeUsers30d: number
  activeSubscribers: number
  subscribersBySource: Record<string, number>
  usersByProvider: Record<string, number>
  totalTrialSeconds: number
  usersByLanguage: Record<string, number>
  totalConversations: number
  totalPracticeSeconds: number
  avgSessionSeconds: number
  cancelledSubs: number
  pendingCancellations: number
  mrrUsd: number
  recentSignups: Array<{
    id: string
    email: string | null
    name: string | null
    createdAt: string
    isAnonymous: boolean
    ipHashShort: string | null
    ipHashCount: number
  }>
}

export default function Admin() {
  const { user, accessToken, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [status, setStatus] = useState<'loading' | 'forbidden' | 'error' | 'ok'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user || !accessToken) {
      navigate('/login', { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/subscription-status?scope=admin', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        if (r.status === 404 || r.status === 401) {
          setStatus('forbidden')
          return
        }
        if (!r.ok) {
          setStatus('error')
          setErrorMessage(`HTTP ${r.status}`)
          return
        }
        const data = (await r.json()) as AdminStats
        if (cancelled) return
        setStats(data)
        setStatus('ok')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, user, accessToken, navigate])

  if (authLoading || status === 'loading') {
    return (
      <div className="admin">
        <div className="admin-empty">Loading…</div>
      </div>
    )
  }

  if (status === 'forbidden') {
    return (
      <div className="admin">
        <div className="admin-empty">Not found.</div>
      </div>
    )
  }

  if (status === 'error' || !stats) {
    return (
      <div className="admin">
        <div className="admin-empty">Failed to load. {errorMessage}</div>
      </div>
    )
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>Dashboard</h1>
        <p>Internal usage snapshot · {new Date().toLocaleString()}</p>
      </header>

      <section className="admin-kpi-grid">
        <KPI label="Total users" value={stats.totalUsers} />
        <KPI label="Active subscribers" value={stats.activeSubscribers} />
        <KPI
          label="MRR"
          value={`$${stats.mrrUsd.toFixed(2)}`}
          subtitle={`${stats.activeSubscribers} active subs`}
        />
        <KPI
          label="Free → Paid"
          value={`${conversionPct(stats)}%`}
          subtitle={`${stats.activeSubscribers} / ${stats.totalUsers}`}
        />
        <KPI label="New (7d)" value={stats.newUsers7d} />
        <KPI label="New (30d)" value={stats.newUsers30d} />
        <KPI label="Active (7d)" value={stats.activeUsers7d} />
        <KPI label="Active (30d)" value={stats.activeUsers30d} />
        <KPI
          label="Conversations"
          value={stats.totalConversations.toLocaleString()}
          subtitle="total sessions started"
        />
        <KPI
          label="Total minutes"
          value={Math.round(stats.totalPracticeSeconds / 60).toLocaleString()}
          subtitle="all users, all time"
        />
        <KPI
          label="Avg session"
          value={formatSessionDuration(stats.avgSessionSeconds)}
          subtitle="per conversation"
        />
        <KPI
          label="Churn"
          value={stats.cancelledSubs + stats.pendingCancellations}
          subtitle={`${stats.cancelledSubs} done · ${stats.pendingCancellations} pending`}
        />
      </section>

      <div className="admin-two-col">
        <section className="admin-panel">
          <h2>Subscribers by source</h2>
          {Object.keys(stats.subscribersBySource).length === 0 ? (
            <p className="admin-empty-inline">No active subscribers yet.</p>
          ) : (
            <ul className="admin-list">
              {Object.entries(stats.subscribersBySource).map(([source, count]) => (
                <li key={source}>
                  <span className="admin-list-key">{labelSource(source)}</span>
                  <span className="admin-list-value">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-panel">
          <h2>Users by language</h2>
          {Object.keys(stats.usersByLanguage).length === 0 ? (
            <p className="admin-empty-inline">No language preferences set.</p>
          ) : (
            <ul className="admin-list">
              {Object.entries(stats.usersByLanguage)
                .sort(([, a], [, b]) => b - a)
                .map(([lang, count]) => (
                  <li key={lang}>
                    <span className="admin-list-key">{labelLanguage(lang)}</span>
                    <span className="admin-list-value">{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <section className="admin-panel">
        <h2>Users by sign-in provider</h2>
        <p className="admin-panel-sub">
          Best proxy for web vs iOS origin. Apple users skew iOS; email
          and anonymous skew web.
        </p>
        {Object.keys(stats.usersByProvider).length === 0 ? (
          <p className="admin-empty-inline">No users yet.</p>
        ) : (
          <ul className="admin-list">
            {Object.entries(stats.usersByProvider)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, count]) => (
                <li key={provider}>
                  <span className="admin-list-key">{labelProvider(provider)}</span>
                  <span className="admin-list-value">{count}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="admin-panel">
        <h2>Recent signups</h2>
        {stats.recentSignups.length === 0 ? (
          <p className="admin-empty-inline">No signups yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentSignups.map((u) => (
                <tr key={u.id}>
                  <td>{relativeTime(u.createdAt)}</td>
                  <td>{u.name ?? '—'}</td>
                  <td>{u.email ?? <span className="admin-muted">(anonymous)</span>}</td>
                  <td>{u.isAnonymous ? 'Anon' : 'Signed in'}</td>
                  <td>
                    {u.ipHashShort ? (
                      <span className="admin-ip-hash">
                        <code>{u.ipHashShort}</code>
                        {u.ipHashCount > 1 && (
                          <span className="admin-ip-dup" title={`${u.ipHashCount} accounts share this IP`}>
                            ×{u.ipHashCount}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function KPI({
  label,
  value,
  subtitle,
}: {
  label: string
  value: number | string
  subtitle?: string
}) {
  return (
    <div className="admin-kpi">
      <div className="admin-kpi-label">{label}</div>
      <div className="admin-kpi-value">{value}</div>
      {subtitle && <div className="admin-kpi-subtitle">{subtitle}</div>}
    </div>
  )
}

function conversionPct(stats: AdminStats): string {
  if (stats.totalUsers === 0) return '0'
  return ((stats.activeSubscribers / stats.totalUsers) * 100).toFixed(1)
}

function labelSource(source: string): string {
  switch (source) {
    case 'stripe': return 'Stripe (web)'
    case 'apple': return 'Apple (iOS)'
    default: return source
  }
}

function labelProvider(provider: string): string {
  switch (provider) {
    case 'apple': return '🍎 Apple Sign-In (skews iOS)'
    case 'google': return '🔍 Google Sign-In'
    case 'email': return '✉️ Email / magic link (web)'
    case 'anonymous': return '👤 Anonymous (web trial)'
    case 'unknown': return '❓ Unknown'
    default: return provider
  }
}

function labelLanguage(code: string): string {
  switch (code) {
    case 'pt-BR': return '🇧🇷 Portuguese'
    case 'es-MX': return '🇲🇽 Spanish'
    case 'it-IT': return '🇮🇹 Italian'
    case 'fr-FR': return '🇫🇷 French'
    case 'de-DE': return '🇩🇪 German'
    default: return code
  }
}

/// "M:SS" for short sessions, "M min" for longer. Hide seconds past a
/// minute since "12:34 min per session" is more noise than signal.
function formatSessionDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '—'
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m === 0) return `${s}s`
  if (m < 10) return `${m}:${s.toString().padStart(2, '0')}`
  return `${m} min`
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
