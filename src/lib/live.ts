/// Web client for the OpenAI GPT-Live API (gpt-live-1).
///
/// Sibling of `realtime.ts` (OpenAI Realtime API). The two engines share
/// nothing on the wire, so this is a separate module rather than a branch
/// inside RealtimeTutor; the Tutor page picks one via `src/lib/engine.ts`.
///
/// How a GPT-Live call works (verified against the API on 2026-09-12):
///   1. Browser opens the mic, creates an RTCPeerConnection, adds the mic
///      track, creates the `oai-events` data channel BEFORE the offer.
///   2. Browser creates an SDP offer, waits for ICE gathering, and POSTs
///      the offer + assembled prompt + voice to our own /api/session.
///      There are no ephemeral tokens in GPT-Live: the server forwards the
///      offer to OpenAI with the project key and returns the answer.
///   3. Browser applies the answer. `session.started` arrives on the data
///      channel; the tutor starts speaking on its own (no response.create).
///   4. Transcripts stream as `session.input_transcript.delta` (learner) and
///      `session.output_transcript.delta` (tutor), word-level with
///      start_ms / end_ms, no turn ids, no "done" events. The
///      TranscriptSegmenter turns them into bubbles.
///   5. The model is full duplex: it listens while it speaks and stops
///      itself when interrupted. The mic is NEVER muted here — the browser's
///      echo cancellation is what keeps Natalia from hearing herself.
///   6. Ending: send `session.close`, wait briefly for `session.closed`,
///      then tear down.
///
/// Everything the page consumes is a normalized LiveEvent; raw OpenAI
/// events are exposed only under type 'raw' for debugging.

import { TranscriptSegmenter, type SegmentedTurn } from './transcript-segmenter'

/// Appended to the assembled tutor prompt on the GPT-Live engine only.
/// GPT-Live has no turn-detection or interruption settings; OpenAI's
/// prompting guide steers both with plain text, and warns against a
/// blanket "never speak while the user speaks" rule (it also suppresses
/// natural listening sounds). Kept short: it rides on top of Natalia's
/// ~11k-token prompt inside a 16k limit.
export const LIVE_PROMPT_ADDENDUM = `CONVERSATION FLOW (full-duplex voice call):
- Interruption policy: stop speaking when the learner interrupts. Listen to what they say, then respond to it.
- Backchannel policy: use light, natural backchannels ("uhum", "isso") while the learner speaks; never talk over their main point.
- Keep listening while the learner pauses to think. Do not treat a cough, background music, or nearby conversation as a new request.
- Start the call yourself with your usual short greeting; do not wait for the learner.`

export type LiveEvent =
  | { type: 'turns'; turns: SegmentedTurn[] }
  | { type: 'speaking'; speaking: boolean }
  | { type: 'usage'; seconds: number }
  | { type: 'closed'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'raw'; event: { type: string; [key: string]: unknown } }

type EventHandler = (event: LiveEvent) => void

export type LivePrepared = {
  subscribed: boolean
  secondsRemaining: number
  recentMistakes: Array<{ original: string; corrected: string; explanation: string; recordedAt?: string }>
  recentMemory: string[]
  nextFocus: string | null
}

type SessionError = Error & { status?: number; secondsRemaining?: number }

/// How long to wait for ICE gathering before sending the offer anyway.
/// Full gathering usually completes in well under a second; the cap keeps a
/// flaky STUN path from stalling the connect.
const ICE_GATHER_TIMEOUT_MS = 2500
/// How long to wait for `session.started` after applying the answer.
const SESSION_START_TIMEOUT_MS = 15_000
/// Quiet period after the last transcript delta before open bubbles are
/// marked done (which unlocks click-to-translate).
const TRANSCRIPT_IDLE_MS = 1500
/// Inbound audio RMS above this = Natalia is audibly speaking.
const SPEAKING_THRESHOLD = 0.01
const SPEAKING_POLL_MS = 100
const SPEAKING_HANGOVER_MS = 400
/// Grace period for `session.closed` after we send `session.close`.
const CLOSE_GRACE_MS = 800

export class LiveTutor {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private audioEl: HTMLAudioElement | null = null
  private localStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private handlers = new Set<EventHandler>()
  private segmenter = new TranscriptSegmenter()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private speakingTimer: ReturnType<typeof setInterval> | null = null
  private closed = false
  /// Session id from OpenAI. Kept for logs / support; not used on the wire.
  sessionId: string | null = null

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private emit(event: LiveEvent) {
    this.handlers.forEach((h) => h(event))
  }

  /// Access check + learner state, no OpenAI call. Mirrors
  /// RealtimeTutor.mintSession() so the Tutor page can build the prompt
  /// from server memory before the call starts.
  async prepareSession(opts: { accessToken?: string; language?: string } = {}): Promise<LivePrepared> {
    const params = new URLSearchParams({ engine: 'live' })
    if (opts.language) params.set('language', opts.language)
    const res = await fetch(`/api/session?${params.toString()}`, {
      headers: opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {},
    })
    const data = (await res.json()) as Partial<LivePrepared> & {
      error?: string
      streakCount?: number
      streakLastDay?: string | null
    }
    if (!res.ok) {
      const err: SessionError = new Error(data.error ?? `Session request failed (${res.status})`)
      err.status = res.status
      err.secondsRemaining = data.secondsRemaining
      throw err
    }
    if (typeof data.streakCount === 'number') {
      const { applyServerStreak } = await import('./streak.js')
      applyServerStreak(data.streakCount, data.streakLastDay ?? null)
    }
    return {
      subscribed: !!data.subscribed,
      secondsRemaining: data.secondsRemaining ?? 0,
      recentMistakes: data.recentMistakes ?? [],
      recentMemory: data.recentMemory ?? [],
      nextFocus: data.nextFocus ?? null,
    }
  }

  async connect(
    instructions: string,
    options: { accessToken?: string; voice?: string } = {},
  ): Promise<{ subscribed: boolean; secondsRemaining: number }> {
    // Mic first: a permission prompt is the slowest step and the one most
    // likely to be denied, so fail before anything is created.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Load-bearing for GPT-Live. The mic stays hot while Natalia
        // speaks, so echo cancellation is the only thing stopping her own
        // voice from coming back as learner speech.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    this.localStream = stream

    const pc = new RTCPeerConnection()
    this.pc = pc
    for (const track of stream.getAudioTracks()) pc.addTrack(track, stream)

    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.setAttribute('playsinline', 'true')
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)
    this.audioEl = audioEl

    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})
    this.audioCtx = audioCtx

    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track])
      audioEl.srcObject = remote
      audioEl.play().catch(() => {})
      // Analyser on a cloned track (same Safari quirk as realtime.ts: the
      // audio element consumes the original). Drives the "Natalia is
      // speaking" indicator, since GPT-Live has no response start/end
      // events at all.
      try {
        const cloned = e.track.clone()
        const source = audioCtx.createMediaStreamSource(new MediaStream([cloned]))
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        this.startSpeakingMonitor(analyser)
      } catch {
        /* no indicator; conversation still works */
      }
    }

    // Data channel must exist before the offer so it is negotiated in the
    // SDP. Label is fixed by OpenAI.
    const dc = pc.createDataChannel('oai-events')
    this.dc = dc
    let startedResolve: (() => void) | null = null
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve
    })
    dc.addEventListener('message', (e) => this.handleMessage(e.data, () => startedResolve?.()))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc, ICE_GATHER_TIMEOUT_MS)
    const sdp = pc.localDescription?.sdp
    if (!sdp) throw new Error('Could not create a WebRTC offer.')

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: JSON.stringify({ sdp, instructions, voice: options.voice }),
    })
    const data = (await res.json()) as {
      answerSdp?: string
      sessionId?: string | null
      error?: string
      subscribed?: boolean
      secondsRemaining?: number
    }
    if (!res.ok || !data.answerSdp) {
      const err: SessionError = new Error(data.error ?? `GPT-Live session failed (${res.status})`)
      err.status = res.status
      err.secondsRemaining = data.secondsRemaining
      throw err
    }
    this.sessionId = data.sessionId ?? null
    await pc.setRemoteDescription({ type: 'answer', sdp: data.answerSdp })

    // The HTTP request started the session; never send session.start.
    await Promise.race([
      started,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('GPT-Live session did not start in time.')), SESSION_START_TIMEOUT_MS),
      ),
    ])

    return {
      subscribed: !!data.subscribed,
      secondsRemaining: data.secondsRemaining ?? 0,
    }
  }

  private handleMessage(raw: unknown, onStarted: () => void) {
    let event: { type: string; [key: string]: unknown }
    try {
      event = JSON.parse(String(raw))
    } catch {
      return
    }
    if (import.meta.env.DEV && !event.type.endsWith('transcript.delta')) {
      // Transcript deltas are too chatty to log one by one; everything
      // else is worth seeing while the engine is under evaluation.
      console.log('[Live] rx', event.type, event)
    }
    switch (event.type) {
      case 'session.started':
        onStarted()
        break
      case 'session.input_transcript.delta':
      case 'session.output_transcript.delta': {
        const role = event.type === 'session.input_transcript.delta' ? 'user' : 'tutor'
        const turns = this.segmenter.push(
          role,
          String(event.delta ?? ''),
          Number(event.start_ms ?? 0),
          Number(event.end_ms ?? 0),
        )
        this.emit({ type: 'turns', turns })
        this.armIdleTimer()
        break
      }
      case 'session.usage.updated': {
        const usage = event.usage as { seconds?: number } | undefined
        if (typeof usage?.seconds === 'number') this.emit({ type: 'usage', seconds: usage.seconds })
        break
      }
      case 'session.closed': {
        this.closed = true
        this.emit({ type: 'closed', reason: String(event.reason ?? 'unknown') })
        break
      }
      case 'error': {
        const err = event.error as { message?: string } | undefined
        this.emit({ type: 'error', message: err?.message ?? 'Unknown error from GPT-Live' })
        break
      }
    }
    this.emit({ type: 'raw', event })
  }

  private armIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.emit({ type: 'turns', turns: this.segmenter.markIdle() })
    }, TRANSCRIPT_IDLE_MS)
  }

  private startSpeakingMonitor(analyser: AnalyserNode) {
    const buf = new Float32Array(analyser.fftSize)
    let speaking = false
    let quietSince = 0
    this.speakingTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      const now = Date.now()
      if (rms >= SPEAKING_THRESHOLD) {
        quietSince = 0
        if (!speaking) {
          speaking = true
          this.emit({ type: 'speaking', speaking: true })
        }
      } else if (speaking) {
        if (!quietSince) quietSince = now
        if (now - quietSince >= SPEAKING_HANGOVER_MS) {
          speaking = false
          this.emit({ type: 'speaking', speaking: false })
        }
      }
    }, SPEAKING_POLL_MS)
  }

  /// Current bubbles, for callers that need them outside the event stream
  /// (e.g. building the hint request or the end-of-session review).
  turns(): SegmentedTurn[] {
    return this.segmenter.snapshot()
  }

  /// "Try saying…" hints. GPT-Live has no silent text channel, so this is
  /// a server round-trip over the recent transcript. Resolves to the hint
  /// lines (already cleaned server-side).
  async requestHint(opts: {
    proficiency: string
    languageLabel: string
    nativeLanguage: string
    accessToken?: string
  }): Promise<string[]> {
    const transcript = this.segmenter
      .snapshot()
      .filter((t) => t.text.trim())
      .map((t) => ({ role: t.role, text: t.text.trim() }))
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
      },
      body: JSON.stringify({
        type: 'hint',
        transcript,
        proficiency: opts.proficiency,
        languageLabel: opts.languageLabel,
        nativeLanguage: opts.nativeLanguage,
      }),
    })
    const data = (await res.json()) as { lines?: string[]; error?: string }
    if (!res.ok) throw new Error(data.error ?? `Hint request failed (${res.status})`)
    return data.lines ?? []
  }

  /// Send a raw client event (session.input_audio.mute etc.). Kept for
  /// experiments; the normal flow never needs it.
  send(event: object) {
    if (this.dc?.readyState === 'open') {
      if (import.meta.env.DEV) console.log('[Live] tx', (event as { type?: string })?.type, event)
      this.dc.send(JSON.stringify(event))
    }
  }

  disconnect() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer)
      this.speakingTimer = null
    }
    const pc = this.pc
    const dc = this.dc
    const audioEl = this.audioEl
    const localStream = this.localStream
    const audioCtx = this.audioCtx
    this.pc = null
    this.dc = null
    this.audioEl = null
    this.localStream = null
    this.audioCtx = null

    // Stop the mic immediately so the tab's recording indicator clears,
    // and mute playback so a half-spoken reply doesn't keep going.
    localStream?.getTracks().forEach((t) => t.stop())
    if (audioEl) audioEl.muted = true

    const teardown = () => {
      try {
        dc?.close()
      } catch {
        /* noop */
      }
      pc?.getSenders().forEach((s) => s.track?.stop())
      pc?.close()
      audioEl?.remove()
      audioCtx?.close().catch(() => {})
      this.handlers.clear()
    }

    // Ask OpenAI to close so the session stops billing right away and the
    // final usage lands; closing the transport first can drop that event.
    if (dc?.readyState === 'open' && !this.closed) {
      try {
        dc.send(JSON.stringify({ type: 'session.close' }))
      } catch {
        /* noop */
      }
      setTimeout(teardown, CLOSE_GRACE_MS)
    } else {
      teardown()
    }
  }
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    const timer = setTimeout(done, timeoutMs)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}
