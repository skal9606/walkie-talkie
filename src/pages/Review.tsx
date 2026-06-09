import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { loadProfile } from '../lib/profile'
import { DEFAULT_TUTOR_ID, getTutor } from '../lib/tutors'
import { track } from '../lib/analytics'
import {
  allCards,
  dueCards,
  gradeCard,
  toAnkiCsv,
  type Grade,
  type ReviewCard,
} from '../lib/review'

/// SRS review surface. Pulls cards whose next_due_at <= now in the
/// user's current target language, walks the learner through them one
/// at a time. Each card flips on tap (native → target reveal), then
/// the learner self-grades (got it / almost / show again). Grades
/// update the card's next_due_at via the SM-2-lite logic in review.ts.
///
/// Voice playback: the Web Speech API speaks the target phrase on
/// reveal. We don't grade pronunciation here — that's a much bigger
/// build. The point is the FLIP and the SCHEDULING, not voice grading.
type Mistake = { original: string; corrected: string; explanation: string }

export default function Review() {
  const { user, accessToken, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const profile = loadProfile()
  const tutor = getTutor(profile?.tutorId ?? DEFAULT_TUTOR_ID)
  const languageCode = tutor.language

  const [cards, setCards] = useState<ReviewCard[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  /// Persisted "mistakes the tutor is tracking for you" — moved here
  /// from /lessons. Loaded from /api/subscription-status (mistakes are
  /// piggybacked on that endpoint to keep us under the Vercel Hobby
  /// 12-function limit).
  const [mistakes, setMistakes] = useState<Mistake[]>([])

  const loadCards = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const due = await dueCards(user.id, languageCode, 25)
    setCards(due)
    setIndex(0)
    setRevealed(false)
    setLoading(false)
  }, [user, languageCode])

  const loadMistakes = useCallback(async () => {
    if (!user || !accessToken) return
    try {
      const r = await fetch('/api/subscription-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) return
      const body = (await r.json()) as {
        recentMistakes?: Record<string, Mistake[]>
      }
      setMistakes(body.recentMistakes?.[languageCode] ?? [])
    } catch {
      // Silent — mistakes section just won't render. Review cards
      // (the primary content) still work.
    }
  }, [user, accessToken, languageCode])

  useEffect(() => {
    if (authLoading) return
    if (!user || !accessToken) {
      navigate('/login', { replace: true })
      return
    }
    void loadCards()
    void loadMistakes()
  }, [authLoading, user, accessToken, navigate, loadCards, loadMistakes])

  // PostHog: Review tab opened. Metadata only (language code) — no card text.
  useEffect(() => {
    track.reviewTabOpened({ language_code: languageCode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = cards[index]

  // Auto-speak the target phrase the moment a card is revealed so the
  // learner hears the model pronunciation alongside the visible text.
  // Uses the same OpenAI 'coral' voice as live tutor sessions (via the
  // /api/translate TTS piggyback) rather than the browser default.
  useEffect(() => {
    if (!revealed || !current || !accessToken) return
    void speakTarget(current.phrase_target, accessToken)
  }, [revealed, current, accessToken])

  async function onGrade(g: Grade) {
    if (!current) return
    await gradeCard(current, g)
    if (index + 1 < cards.length) {
      setIndex(index + 1)
      setRevealed(false)
    } else {
      // Session complete — refetch in case new cards came due during
      // the run (rare but possible if the user was on the page a long
      // time and a "show again" card looped back in).
      void loadCards()
    }
  }

  if (authLoading || loading) {
    return (
      <div className="app">
        <ReviewNav />
        <div className="empty" style={{ marginTop: 80 }}>Loading…</div>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="app">
        <ReviewNav />
        <MistakesSection mistakes={mistakes} />
        <div className="review-empty">
          <h2>You're all caught up.</h2>
          <p>Finish a lesson to add phrases to your review deck.</p>
          <Link to="/lessons" className="review-cta">Back to lessons</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <ReviewNav />
      <MistakesSection mistakes={mistakes} />
      <div className="review-shell">
        <div className="review-progress">
          {index + 1} / {cards.length}
        </div>
        <ExportAnkiButton userId={user!.id} languageCode={languageCode} />
        {current && (
          <button
            type="button"
            className={`review-card ${revealed ? 'revealed' : ''}`}
            onClick={() => setRevealed(true)}
            aria-label={revealed ? 'Target phrase shown' : 'Tap to reveal target phrase'}
          >
            <div className="review-card-native">{current.phrase_native}</div>
            {revealed && (
              <div className="review-card-target">{current.phrase_target}</div>
            )}
            {!revealed && (
              <div className="review-card-hint">Tap to reveal</div>
            )}
          </button>
        )}
        {revealed && (
          <div className="review-grade-row">
            <button
              type="button"
              className="review-grade-btn show-again"
              onClick={() => onGrade('show-again')}
            >
              Show again
            </button>
            <button
              type="button"
              className="review-grade-btn almost"
              onClick={() => onGrade('almost')}
            >
              Almost
            </button>
            <button
              type="button"
              className="review-grade-btn got-it"
              onClick={() => onGrade('got-it')}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ExportAnkiButton({
  userId,
  languageCode,
}: {
  userId: string
  languageCode: string
}) {
  const [busy, setBusy] = useState(false)
  async function handleClick() {
    setBusy(true)
    try {
      const cards = await allCards(userId, languageCode)
      if (cards.length === 0) return
      const csv = toAnkiCsv(cards)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `walkietalkie-${languageCode}-deck.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      className="review-export-btn"
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? 'Exporting…' : 'Export deck to Anki (CSV)'}
    </button>
  )
}

/// "What you're working on" — moved here from /lessons. Renders the
/// horizontal-scroll strip of recent mistakes the tutor has flagged
/// for the current target language. Source: profiles.recent_mistakes
/// via /api/subscription-status. Hidden when there's nothing tracked
/// (brand-new learner, or after the user has cleared everything).
function MistakesSection({
  mistakes,
}: {
  mistakes: Array<{ original: string; corrected: string; explanation: string }>
}) {
  if (mistakes.length === 0) return null
  // Cap at 8 so the strip stays scannable. Freshest entries are last
  // in the array (server-side dedupes / caps already).
  const visible = mistakes.slice(0, 8)
  return (
    <section className="lessons-section" style={{ paddingTop: 16 }}>
      <div className="lessons-section-label">WHAT YOU'RE WORKING ON</div>
      <div className="mistakes-strip">
        {visible.map((m, i) => (
          <div key={`${m.original}-${i}`} className="mistake-card">
            <div className="mistake-original">{m.original}</div>
            <div className="mistake-arrow" aria-hidden>→</div>
            <div className="mistake-corrected">{m.corrected}</div>
            {m.explanation && (
              <div className="mistake-explanation">{m.explanation}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function ReviewNav() {
  return (
    <nav className="tutor-nav">
      <Link to="/lessons" className="tutor-nav-back">← Back to lessons</Link>
      <div className="tutor-nav-right">
        <div className="tutor-nav-badge">Review</div>
      </div>
    </nav>
  )
}

/// Tracks the current audio playback so a quick "next card" tap can
/// cancel a stale playback in flight. Module-scoped because Review
/// re-renders on every card change and we don't want a fresh ref each
/// time.
let currentAudio: HTMLAudioElement | null = null

/// Speak the target phrase via OpenAI TTS (matches the live tutor's
/// 'coral' voice). Falls back silently on network/permission errors —
/// the visible text is the primary signal regardless.
async function speakTarget(text: string, accessToken: string): Promise<void> {
  try {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'tts', text, voice: 'coral' }),
    })
    if (!r.ok) return
    const body = (await r.json()) as { audioBase64?: string; mimeType?: string }
    if (!body.audioBase64) return
    const audio = new Audio(`data:${body.mimeType ?? 'audio/mpeg'};base64,${body.audioBase64}`)
    currentAudio = audio
    await audio.play()
  } catch {
    // Silent — the visible target is the primary signal.
  }
}
