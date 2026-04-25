import { AudioCapture, pcmFrameToBase64, type PcmFrame } from './audio-capture'

type EventHandler = (event: RealtimeEvent) => void

export type RealtimeEvent = {
  type: string
  [key: string]: unknown
}

const REALTIME_MODEL = 'gpt-realtime'
const REALTIME_BASE_URL = 'https://api.openai.com/v1/realtime'

export class RealtimeTutor {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private audioEl: HTMLAudioElement | null = null
  private localStream: MediaStream | null = null
  private capture: AudioCapture | null = null
  private handlers = new Set<EventHandler>()

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async connect(
    instructions: string,
    options: {
      vadEagerness?: 'low' | 'medium' | 'high' | 'auto'
      accessToken?: string
      /**
       * ISO-639-1 hint for the transcription model. Pinning eliminates
       * cross-language hallucinations (room tone rendered as Japanese,
       * Korean, etc.) but at a cost: the model is *forced* to decode the
       * audio into the pinned language, so an English reply under a 'pt'
       * pin will come back as Portuguese-sounding gibberish. Leave
       * undefined to let gpt-4o-transcribe auto-detect — appropriate
       * during the level-discovery session, when we don't know yet
       * whether the learner will reply in English or Portuguese.
       */
      transcriptionLanguage?: 'pt' | 'en'
    } = {},
  ): Promise<{ subscribed: boolean; secondsRemaining: number }> {
    const tokenRes = await fetch('/api/session', {
      headers: options.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : {},
    })
    const tokenData = (await tokenRes.json()) as {
      client_secret?: { value?: string }
      error?: string
      subscribed?: boolean
      secondsRemaining?: number
    }
    if (!tokenRes.ok) {
      // Preserve status code so the caller can distinguish 401 / 402.
      const err = new Error(tokenData.error ?? `Session token request failed (${tokenRes.status})`)
      ;(err as Error & { status?: number; secondsRemaining?: number }).status = tokenRes.status
      ;(err as Error & { status?: number; secondsRemaining?: number }).secondsRemaining =
        tokenData.secondsRemaining
      throw err
    }
    const ephemeralKey = tokenData?.client_secret?.value
    if (!ephemeralKey) {
      throw new Error(`Malformed session response: ${JSON.stringify(tokenData)}`)
    }

    const pc = new RTCPeerConnection()
    this.pc = pc

    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    // iOS Safari (especially in installed-PWA / standalone mode) is finicky
    // about playing audio from elements that aren't both attached to the DOM
    // and marked playsInline. Set both before attaching the stream.
    audioEl.setAttribute('playsinline', 'true')
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)
    this.audioEl = audioEl
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0]
    }

    // Explicit audio constraints — without these, mic echo of Natalia's voice
    // can be misread as the learner speaking and cut her off mid-sentence.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    this.localStream = stream

    // Full-duplex with hard-uninterruptible Natalia: we keep the WebRTC mic
    // track muted permanently (track.enabled = false), so the server never
    // receives audio over the media stream. Input flows through a separate
    // path: a Web Audio capture pipeline encodes mic audio as PCM16 and
    // sends it to the server via `input_audio_buffer.append` events on the
    // data channel.
    //
    // During Natalia's turn (response.created → response.done), captured
    // frames are buffered locally and NOT sent. The server hears nothing,
    // so it can't be tempted to interrupt her — there's no input to react
    // to. After response.done we flush the buffer and switch to live mode,
    // where new frames go straight through. Server VAD operates on the
    // appended audio and naturally handles turn detection from there.
    const audioTracks = stream.getAudioTracks()
    audioTracks.forEach((track) => {
      track.enabled = false
      pc.addTrack(track, stream)
    })

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    let initialResponseFired = false
    // Audio gating state. Frames captured while `responseInFlight` is true
    // go into the buffer; frames captured otherwise go straight to the wire.
    let responseInFlight = false
    let bufferedFrames: PcmFrame[] = []
    // Small post-response delay before we start flushing — gives the audio
    // element a beat to drain Natalia's last syllable before the server
    // potentially produces a new response. Mirrors the old half-duplex
    // unmute padding (1500ms first response, 800ms after).
    let firstResponseCompleted = false
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const sendFrame = (frame: PcmFrame) => {
      this.send({
        type: 'input_audio_buffer.append',
        audio: pcmFrameToBase64(frame),
      })
    }

    const flushBuffer = () => {
      const queued = bufferedFrames
      bufferedFrames = []
      for (const frame of queued) sendFrame(frame)
    }

    const capture = new AudioCapture((frame) => {
      if (responseInFlight) {
        bufferedFrames.push(frame)
      } else {
        sendFrame(frame)
      }
    })
    this.capture = capture

    dc.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        if (event.type === 'session.updated' && !initialResponseFired) {
          initialResponseFired = true
          this.send({ type: 'response.create' })
        }
        // Switch to buffering mode the moment a response starts. Anything
        // the learner says from here on is held locally until she's done.
        if (event.type === 'response.created') {
          if (flushTimer) {
            clearTimeout(flushTimer)
            flushTimer = null
          }
          responseInFlight = true
        }
        // Once she's done, schedule the buffer flush + return to live mode.
        // First-response gets longer padding so the opener fully clears the
        // speaker on a slow phone before any learner audio hits the server.
        if (event.type === 'response.done') {
          const delay = firstResponseCompleted ? 800 : 1500
          firstResponseCompleted = true
          if (flushTimer) clearTimeout(flushTimer)
          flushTimer = setTimeout(() => {
            flushTimer = null
            responseInFlight = false
            flushBuffer()
          }, delay)
        }
        this.handlers.forEach((h) => h(event))
      } catch {
        // non-JSON message; ignore
      }
    })
    dc.addEventListener('open', () => {
      this.send({
        type: 'session.update',
        session: {
          instructions,
          // gpt-4o-transcribe is significantly more resistant than whisper-1
          // to hallucinating filler phrases ("I'm just a cat", "thanks for
          // watching") from silent or low-energy audio. Pinning `language`
          // (when known) stops the worst failure mode: with no hint, the
          // transcriber auto-detects per turn and will happily render room
          // tone as Japanese / Korean / Hindi gibberish in the YOU bubble.
          // We omit the field during the level-discovery session — we don't
          // know yet whether the learner will reply in EN or PT, and forcing
          // either pin would mangle the wrong half of the population.
          input_audio_transcription: {
            model: 'gpt-4o-transcribe',
            ...(options.transcriptionLanguage
              ? { language: options.transcriptionLanguage }
              : {}),
          },
          // server_vad operates on whatever audio reaches input_audio_buffer
          // — in our setup that's audio we explicitly append via events,
          // which only happens between Natalia's turns. Threshold 0.6 is
          // stricter than the 0.5 default to avoid phantom turns from room
          // tone; silence_duration_ms 600 lets beginners pause without
          // their turn getting cut off.
          turn_detection: {
            type: 'server_vad',
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            // Belt-and-suspenders: even though we don't send audio during
            // her turn, tell the server not to cancel the in-flight
            // response if it somehow detects input.
            interrupt_response: false,
          },
        },
      })
      // We deliberately don't send response.create here — the message
      // handler above does it after `session.updated` arrives.
    })

    // Start capturing. Frames will buffer locally until the data channel
    // opens and session.updated arrives; that's fine — the user generally
    // isn't speaking during the connection handshake anyway.
    await capture.start(stream)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const sdpRes = await fetch(`${REALTIME_BASE_URL}?model=${REALTIME_MODEL}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
    })
    if (!sdpRes.ok) {
      throw new Error(`Realtime SDP exchange failed: ${await sdpRes.text()}`)
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })

    return {
      subscribed: tokenData.subscribed ?? false,
      secondsRemaining: tokenData.secondsRemaining ?? 0,
    }
  }

  send(event: object) {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(event))
    }
  }

  disconnect() {
    try {
      this.dc?.close()
    } catch {
      /* noop */
    }
    this.capture?.stop()
    this.pc?.getSenders().forEach((s) => s.track?.stop())
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.audioEl?.remove()
    this.pc = null
    this.dc = null
    this.localStream = null
    this.audioEl = null
    this.capture = null
    this.handlers.clear()
  }
}
