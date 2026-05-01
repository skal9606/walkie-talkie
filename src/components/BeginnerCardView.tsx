import type { BeginnerCard, LanguageCode } from '../lib/tutors/types'

// BCP-47 language tags for the browser SpeechSynthesis voice picker. Both
// happen to match LanguageCode 1:1 today; kept as a map so adding a new
// tutor language doesn't silently fall through to default voice.
const SPEECH_LANG: Record<LanguageCode, string> = {
  'pt-BR': 'pt-BR',
  'es-MX': 'es-MX',
  'it-IT': 'it-IT',
  'fr-FR': 'fr-FR',
  'de-DE': 'de-DE',
}

/**
 * Visual flashcard pinned over the chat surface for complete-beginner
 * sessions. Pops in the moment Natalia/María says one of the curated
 * priority words. Image is an emoji (no infra). Audio replay uses the
 * built-in browser SpeechSynthesis API — quality varies by OS, but it
 * ships today with no third-party dependencies. We can swap in an
 * /api/tts endpoint later without touching call sites.
 */
export function BeginnerCardView({
  card,
  language,
  onDismiss,
}: {
  card: BeginnerCard
  language: LanguageCode
  onDismiss: () => void
}) {
  function speak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const utt = new SpeechSynthesisUtterance(card.word)
    utt.lang = SPEECH_LANG[language]
    utt.rate = 0.85
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utt)
  }

  return (
    <div
      className="beginner-card"
      role="dialog"
      aria-label={`Vocabulary card: ${card.native}`}
    >
      <button
        type="button"
        className="beginner-card-close"
        onClick={onDismiss}
        aria-label="Close card"
      >
        ×
      </button>
      <div className="beginner-card-emoji" aria-hidden>
        {card.emoji}
      </div>
      <div className="beginner-card-text">
        <div className="beginner-card-word" lang={language}>
          {card.word}
        </div>
        <div className="beginner-card-native">{card.native}</div>
      </div>
      <button
        type="button"
        className="beginner-card-speak"
        onClick={speak}
        aria-label={`Hear ${card.word} pronounced`}
      >
        🔊 Hear it
      </button>
    </div>
  )
}
