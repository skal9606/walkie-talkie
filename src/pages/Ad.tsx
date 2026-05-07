import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './ad.css'

// Cumulative start times (ms) for each scene. Total runtime ~18s.
const SCENES = [
  { at: 0, name: 'Notification' },
  { at: 2600, name: 'Chat opens' },
  { at: 6000, name: 'Panic' },
  { at: 9000, name: 'Walkie Talkie' },
  { at: 13200, name: 'Reply sent' },
  { at: 16300, name: 'End card' },
]
const TOTAL_MS = 18200

export default function AdNeymarDM() {
  const [key, setKey] = useState(0)
  const [scene, setScene] = useState(-1)

  useEffect(() => {
    if (key === 0) return
    const timers = SCENES.map((s, i) => setTimeout(() => setScene(i), s.at))
    const endTimer = setTimeout(() => {
      // leave on end card
    }, TOTAL_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(endTimer)
    }
  }, [key])

  function play() {
    setScene(-1)
    // force animation reset by remounting scene subtree via key
    setKey((k) => k + 1)
  }

  return (
    <div className="ad-page">
      <div className="ad-top">
        <Link to="/" className="ad-back">
          ← Back
        </Link>
        <div>
          <h1 className="ad-title">Neymar DM · 18s ad</h1>
          <p className="ad-subtitle">9:16 · TikTok / Reels · silent (add VO/music in post)</p>
        </div>
      </div>

      <div className="ad-frame-wrap">
        <div className="ad-frame">
          <div key={key} style={{ position: 'absolute', inset: 0 }}>
            <SceneNotification active={scene === 0} />
            <SceneChat active={scene === 1} />
            <ScenePanic active={scene === 2} />
            <SceneWalkieTalkie active={scene === 3} />
            <SceneReply active={scene === 4} />
            <SceneEnd active={scene === 5} />
          </div>

          {scene === -1 && (
            <div className="ad-pre-play" onClick={play}>
              <div className="ad-play-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M6 4l14 8-14 8V4z" fill="#fff" />
                </svg>
              </div>
              <div className="ad-pre-play-label">Tap to play</div>
            </div>
          )}
        </div>
      </div>

      <div className="ad-controls">
        <button onClick={play}>{scene === -1 ? 'Play' : 'Replay'}</button>
      </div>

      <section className="ad-guide">
        <h3>Export as an MP4</h3>
        <ol>
          <li>
            Press <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>5</kbd> (Mac) to open the screen
            recorder.
          </li>
          <li>
            Click <em>Record Selected Portion</em>, drag exactly over the phone-shaped frame
            above.
          </li>
          <li>Click <strong>Record</strong>.</li>
          <li>
            Come back and hit <strong>Replay</strong> — let the full 18s play to the end card.
          </li>
          <li>Stop the recording (menubar icon). The MP4 saves to your Desktop.</li>
          <li>Trim leading/trailing silence in QuickTime, then upload to TikTok or Reels.</li>
        </ol>
        <div className="ad-guide-caveat">
          <strong>Heads-up:</strong> this uses Neymar's name and handle as parody / editorial
          reference. For a paid ad campaign running through Meta Ads Manager or TikTok Ads,
          either swap for a clearly fictional footballer ("@neymar_10_bot", etc.) or get
          licensing. Organic posts on your own account carry less risk.
        </div>
      </section>
    </div>
  )
}

// --- Scenes ---

function IosStatusBar() {
  return (
    <div className="ios-statusbar">
      <span>21:47</span>
      <div className="ios-statusbar-icons">
        <span>5G</span>
        <div className="ios-battery" />
      </div>
    </div>
  )
}

function SceneNotification({ active }: { active: boolean }) {
  return (
    <div className={`ad-scene scene-notification ${active ? 'active' : ''}`}>
      <IosStatusBar />
      <div className="ig-notification">
        <div className="ig-notification-icon">📷</div>
        <div className="ig-notification-body">
          <div className="ig-notification-head">
            <span>Instagram</span>
            <span>now</span>
          </div>
          <div className="ig-notification-sender">neymarjr</div>
          <div className="ig-notification-preview">E aí! Bora ver o jogo sábado? 😉</div>
        </div>
      </div>
      <div className="scene-notification-label">Incoming…</div>
    </div>
  )
}

function SceneChat({ active }: { active: boolean }) {
  return (
    <div className={`ad-scene scene-chat ${active ? 'active' : ''}`}>
      <IosStatusBar />
      <div className="ig-chat-header">
        <span className="ig-chat-back">‹</span>
        <div className="ig-chat-avatar" />
        <div className="ig-chat-name">
          neymarjr <span className="ig-chat-verified" />
        </div>
      </div>
      <div className="ig-chat-body">
        <div className="ig-date-stamp">TODAY · 21:47</div>
        <div className="ig-bubble ig-bubble-in">E aí! Bora ver o jogo sábado? 😉</div>
      </div>
      <div className="ig-input">Message…</div>
    </div>
  )
}

function ScenePanic({ active }: { active: boolean }) {
  return (
    <div className={`ad-scene scene-panic ${active ? 'active' : ''}`}>
      <IosStatusBar />
      <div className="ig-chat-header" style={{ opacity: 0.35 }}>
        <span className="ig-chat-back">‹</span>
        <div className="ig-chat-avatar" />
        <div className="ig-chat-name">
          neymarjr <span className="ig-chat-verified" />
        </div>
      </div>
      <div className="ig-chat-body" style={{ opacity: 0.25 }}>
        <div className="ig-bubble ig-bubble-in" style={{ opacity: 1 }}>
          E aí! Bora ver o jogo sábado? 😉
        </div>
      </div>
      <div className="panic-text">
        <div className="panic-text-main">I don't speak Portuguese</div>
        <div className="panic-text-emoji">😭</div>
      </div>
    </div>
  )
}

function SceneWalkieTalkie({ active }: { active: boolean }) {
  return (
    <div className={`ad-scene scene-wt ${active ? 'active' : ''}`}>
      <div className="wt-header">
        <div className="wt-brand">Walkie Talkie</div>
        <div className="wt-scenario">Free conversation — Beginner</div>
      </div>
      <div className="wt-orb-wrap">
        <div className="ad-orb-ping" />
        <div className="ad-orb-ping" />
        <div className="ad-orb">
          <div className="ad-orb-wave">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <div className="wt-transcript">
        <div className="wt-bubble tutor wt-bubble-tutor-1">
          <div className="wt-bubble-label">Tutor</div>
          Say this: <em>"Adoro futebol! Que horas é o jogo?"</em>
        </div>
        <div className="wt-bubble user wt-bubble-user">
          <div className="wt-bubble-label">You</div>
          Adoro futebol! Que horas é o jogo?
        </div>
        <div className="wt-bubble tutor wt-bubble-tutor-2">
          <div className="wt-bubble-label">Tutor</div>
          Perfeito — agora com confiança. 🔥
        </div>
      </div>
    </div>
  )
}

function SceneReply({ active }: { active: boolean }) {
  return (
    <div className={`ad-scene scene-reply ${active ? 'active' : ''}`}>
      <IosStatusBar />
      <div className="ig-chat-header">
        <span className="ig-chat-back">‹</span>
        <div className="ig-chat-avatar" />
        <div className="ig-chat-name">
          neymarjr <span className="ig-chat-verified" />
        </div>
      </div>
      <div className="ig-chat-body">
        <div className="ig-bubble ig-bubble-in" style={{ opacity: 0.75, animation: 'none' }}>
          E aí! Bora ver o jogo sábado? 😉
        </div>
        <div className="ig-bubble ig-bubble-out">Adoro futebol! Que horas é o jogo?</div>
        <div className="ig-typing">
          <span />
          <span />
          <span />
        </div>
        <div className="ig-bubble ig-bubble-in ig-bubble-reply-emoji">🔥</div>
      </div>
      <div className="ig-input">Message…</div>
    </div>
  )
}

function SceneEnd({ active }: { active: boolean }) {
  return (
    <div className={`ad-scene scene-end ${active ? 'active' : ''}`}>
      <div className="end-logo-row">
        <div className="end-logo-orb" />
        <div className="end-logo-name">Walkie Talkie</div>
      </div>
      <div className="end-tagline">Master Portuguese. Just in case.</div>
      <div className="end-cta">Try 5 minutes free →</div>
      <div className="end-footnote">Brazilian Portuguese · $15/month</div>
    </div>
  )
}
