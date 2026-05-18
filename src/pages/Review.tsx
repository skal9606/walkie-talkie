import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { loadProfile } from '../lib/profile'
import { DEFAULT_TUTOR_ID, getTutor } from '../lib/tutors'
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

  const loadCards = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const due = await dueCards(user.id, languageCode, 25)
    setCards(due)
    setIndex(0)
    setRevealed(false)
    setLoading(false)
  }, [user, languageCode])

  useEffect(() => {
    if (authLoading) return
    if (!user || !accessToken) {
      navigate('/login', { replace: true })
      return
    }
    void loadCards()
  }, [authLoading, user, accessToken, navigate, loadCards])

  const current = cards[index]

  // Auto-speak the target phrase the moment a card is revealed so the
  // learner hears the model pronunciation alongside the visible text.
  useEffect(() => {
    if (!revealed || !current) return
    speakTarget(current.phrase_target, languageCode)
  }, [revealed, current, languageCode])

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

/// Browser TTS — best-effort. If the browser doesn't have a voice
/// matching the language tag, it falls back to its default voice. We
/// don't block on this; the visible text is the primary signal.
function speakTarget(text: string, languageCode: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = languageCode
    u.rate = 0.9
    window.speechSynthesis.speak(u)
  } catch {
    // Silent — the visible target is the primary signal.
  }
}
