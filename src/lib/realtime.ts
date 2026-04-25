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

    // Full-duplex tutoring (ISSEN model): the mic stays open the entire
    // session. The learner CAN speak while Natalia is speaking, and any
    // speech the server VAD detects gets buffered as a user turn. Natalia
    // never gets cut off mid-sentence — `interrupt_response: false` in the
    // session config below tells the server not to cancel her in-flight
    // response. After she finishes (response.done), the server consumes
    // the buffered learner audio and generates a new response to it.
    //
    // The bug class we're trading off against: speaker-to-mic acoustic
    // echo of Natalia's own voice can trip server VAD and produce a
    // phantom learner turn that Natalia then "responds to." Defenses:
    //   - browser-level echoCancellation/noiseSuppression on getUserMedia
    //   - server_vad threshold 0.6 (stricter than default 0.5)
    //   - language pin on the transcriber (no cross-language gibberish)
    // If feedback loops resurface in practice, the half-duplex mute/unmute
    // logic from before is recoverable from git history.
    const audioTracks = stream.getAudioTracks()
    audioTracks.forEach((track) => {
      track.enabled = true
      pc.addTrack(track, stream)
    })

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    // Initial response.create is gated on session.updated so the model
    // doesn't start generating before our instructions are in effect.
    let initialResponseFired = false

    dc.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        if (event.type === 'session.updated' && !initialResponseFired) {
          initialResponseFired = true
          this.send({ type: 'response.create' })
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
          // server_vad with a stricter-than-default threshold. We previously
          // used semantic_vad (smart turn-end detection), but it was too
          // permissive about *what counts as speech to begin with* — any
          // ambient noise during the post-Natalia unmute window would
          // trigger a phantom turn. Energy-based VAD with threshold 0.6
          // (default 0.5) is much harder to trip from room tone while still
          // catching real speech. silence_duration_ms 600 gives beginners
          // room to pause mid-sentence without their turn getting cut off.
          turn_detection: {
            type: 'server_vad',
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            // Tell the server NOT to cancel an in-flight response when it
            // detects mic input. Combined with our client-side mic mute
            // during model speech, this guarantees Natalia finishes every
            // sentence even if a stray noise bursts through. The trade-off
            // is the learner can't barge in mid-reply, which is the right
            // call for a tutor (and consistent with our half-duplex model).
            interrupt_response: false,
          },
        },
      })
      // We deliberately don't send response.create here — the message
      // handler above does it after `session.updated` arrives.
    })

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
    this.pc?.getSenders().forEach((s) => s.track?.stop())
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.audioEl?.remove()
    this.pc = null
    this.dc = null
    this.localStream = null
    this.audioEl = null
    this.handlers.clear()
  }
}
