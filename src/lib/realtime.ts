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
  private silentAudioCtx: AudioContext | null = null
  private vadTimer: ReturnType<typeof setInterval> | null = null
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
       * whether the learner will reply in English or the target language.
       */
      transcriptionLanguage?: 'pt' | 'en' | 'es' | 'fr' | 'it' | 'de'
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
    // Inbound-audio analyser. Set when Natalia's audio track arrives via
    // pc.ontrack. scheduleUnmute() polls this to detect when her voice
    // has actually finished playing in the speaker, so we can swap in
    // the real mic precisely at audio-silence rather than on a guessed
    // fixed timer.
    let inboundAnalyser: AnalyserNode | null = null
    const inboundBuf = new Float32Array(1024)

    pc.ontrack = (e) => {
      const stream = e.streams[0]
      audioEl.srcObject = stream
      // Prime the playback pipeline immediately. Relying on autoplay alone
      // can leave the decoder cold for the first ~150ms after a fresh
      // srcObject bind (especially Safari / iOS PWA), which clips the
      // first syllables of the opener. Calling play() explicitly here —
      // before any audio actually arrives — ensures the audio element is
      // hot the moment Natalia starts speaking.
      audioEl.play().catch(() => {})
      // Browser quirk: if we createMediaStreamSource on the same stream
      // that's bound to audioEl, the analyser reads near-silence because
      // the audio element consumed the stream first (especially Safari).
      // Clone the audio track and create the source from a fresh stream
      // wrapping the clone — gives the analyser its own independent
      // audio path.
      try {
        const originalTrack = stream.getAudioTracks()[0]
        if (!originalTrack) return
        const clonedTrack = originalTrack.clone()
        const cloneStream = new MediaStream([clonedTrack])
        const source = silentAudioCtx.createMediaStreamSource(cloneStream)
        const analyser = silentAudioCtx.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        inboundAnalyser = analyser
      } catch {
        // Track clone failed; scheduleUnmute uses the fixed fallback delay.
      }
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

    // Bulletproof opener-non-interruptibility: the WebRTC sender starts
    // with NO track at all (via addTransceiver). With sender.track ===
    // null, no media is encoded — there's literally nothing for any
    // codec or server VAD to act on during the opener. After the
    // opener's response.done arrives, scheduleUnmute() polls for both
    // audio drain (Natalia's voice has finished playing in the speaker)
    // and mic silence (the user has stopped talking), then swaps in
    // the real mic.
    const realMicTrack = stream.getAudioTracks()[0]

    const silentAudioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (silentAudioCtx.state === 'suspended') {
      await silentAudioCtx.resume()
    }
    this.silentAudioCtx = silentAudioCtx

    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' })
    const sender = transceiver.sender


    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    // Initial response.create is gated on session.updated so the model
    // doesn't start generating before our instructions are in effect.
    let initialResponseFired = false
    let unmuteTimer: ReturnType<typeof setTimeout> | null = null
    // Recovery watchdog: after VAD commits user audio, the server is
    // configured with create_response:true so response.created should
    // follow within ~1s. If it doesn't (occasional realtime API hiccup
    // — the user's turn lands but the model never responds), we send
    // response.create explicitly to unstick the conversation.
    let responseWatchdog: ReturnType<typeof setTimeout> | null = null
    const RESPONSE_RECOVERY_MS = 4000
    // Tracks whether the upcoming/current response is the very first
    // one of the session (the opener). The opener is non-interruptible
    // — mic stays on the silent track for its duration so server VAD
    // can't detect anything. Every response after that is barge-in-able.
    let isFirstResponse = true
    // True between response.created and response.done. Used to mute
    // playing audio when a barge-in is detected by the server.
    let nataliaIsSpeaking = false

    async function activateMic() {
      unmuteTimer = null
      if (sender.track !== realMicTrack) {
        try {
          await sender.replaceTrack(realMicTrack)
        } catch {
          // Connection torn down; ignore.
        }
      }
    }

    // Audio-silence-driven unmute. Activate the real mic as soon as
    // Natalia's audio has finished playing in the speaker (so we don't
    // pick up speaker→mic echo on the first user turn). Floor of
    // MIN_TOTAL_WAIT_MS covers the case where the inbound analyser sees
    // network silence before the audio has actually drained from the
    // browser jitter buffer. Mic state is intentionally NOT a gate — if
    // we wait for the user to stop talking first, the user's natural
    // immediate-reply gets dropped while the sender still has no track.
    function scheduleUnmute() {
      if (unmuteTimer) clearTimeout(unmuteTimer)

      const SILENCE_THRESHOLD = 0.005
      // 500ms of continuous low RMS — long enough to skip past natural
      // mid-sentence pauses (commas, brief breaths) without triggering
      // an early replaceTrack that would clip Natalia's tail audio.
      const SILENCE_DURATION_MS = 500
      const MIN_TOTAL_WAIT_MS = 800
      const SAFETY_MAX_MS = 6000
      const POLL_INTERVAL_MS = 50
      const FALLBACK_DELAY_MS = 1500

      if (!inboundAnalyser) {
        unmuteTimer = setTimeout(() => void activateMic(), FALLBACK_DELAY_MS)
        return
      }

      const startedAt = Date.now()
      let inboundSilentSince = 0

      const tick = () => {
        const analyser = inboundAnalyser
        if (!analyser) {
          void activateMic()
          return
        }
        analyser.getFloatTimeDomainData(inboundBuf)
        let inboundSumSquares = 0
        for (let i = 0; i < inboundBuf.length; i++) {
          inboundSumSquares += inboundBuf[i] * inboundBuf[i]
        }
        const inboundRms = Math.sqrt(inboundSumSquares / inboundBuf.length)
        const now = Date.now()
        const elapsedMs = now - startedAt

        if (inboundRms < SILENCE_THRESHOLD) {
          if (inboundSilentSince === 0) inboundSilentSince = now
          const silenceMet = now - inboundSilentSince >= SILENCE_DURATION_MS
          const minWaitMet = elapsedMs >= MIN_TOTAL_WAIT_MS
          if (silenceMet && minWaitMet) {
            void activateMic()
            return
          }
        } else {
          inboundSilentSince = 0
        }

        if (elapsedMs >= SAFETY_MAX_MS) {
          void activateMic()
          return
        }

        unmuteTimer = setTimeout(tick, POLL_INTERVAL_MS)
      }

      unmuteTimer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    dc.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        if (event.type === 'session.updated' && !initialResponseFired) {
          initialResponseFired = true
          this.send({ type: 'response.create' })
        }

        // Server VAD detected the user started speaking. Two cases:
        //   - Opener (isFirstResponse): interrupt_response is FALSE, so
        //     the server doesn't cancel the opener. Audio keeps playing.
        //     Don't mute — let the user hear the opener through.
        //   - Post-opener: interrupt_response is TRUE, server is
        //     cancelling the in-flight response, but her tail audio is
        //     still in the jitter buffer. Mute it so the learner
        //     doesn't hear her while they're talking.
        if (event.type === 'input_audio_buffer.speech_started') {
          if (nataliaIsSpeaking && !isFirstResponse) {
            audioEl.muted = true
            audioEl.pause()
          }
        }

        // VAD just committed the user's audio buffer. Arm the recovery
        // watchdog — if response.created doesn't follow within
        // RESPONSE_RECOVERY_MS, the model is stuck and we send
        // response.create ourselves.
        if (event.type === 'input_audio_buffer.committed') {
          if (responseWatchdog) clearTimeout(responseWatchdog)
          responseWatchdog = setTimeout(() => {
            responseWatchdog = null
            if (!nataliaIsSpeaking) {
              this.send({ type: 'response.create' })
            }
          }, RESPONSE_RECOVERY_MS)
        }

        if (event.type === 'response.created') {
          if (responseWatchdog) {
            clearTimeout(responseWatchdog)
            responseWatchdog = null
          }
          nataliaIsSpeaking = true
          // If the previous turn was an interrupt, we muted audioEl to
          // kill her tail audio. New response means new audio coming
          // — un-mute so the learner can actually hear her.
          audioEl.muted = false
          audioEl.play().catch(() => {})
        }

        // Server errors invalidate the in-flight commit — clear the
        // watchdog so we don't redundantly nudge for a turn the server
        // has already rejected.
        if (event.type === 'error') {
          if (responseWatchdog) {
            clearTimeout(responseWatchdog)
            responseWatchdog = null
          }
        }

        if (event.type === 'response.done') {
          nataliaIsSpeaking = false
          if (isFirstResponse) {
            // Opener is complete. Two things to do:
            //   1. Enable server VAD with interrupt_response: true so
            //      subsequent responses can be barged in on.
            //   2. Wait for audio to drain + user to be silent, THEN
            //      swap in the real mic. Until then, sender.track is
            //      still null and no audio reaches the server.
            this.send({
              type: 'session.update',
              session: {
                turn_detection: {
                  type: 'server_vad',
                  // High threshold + 700ms silence window so background
                  // noise / brief blips don't get committed as a user
                  // turn. If this starts dropping quiet speech, dial
                  // threshold back toward 0.75.
                  threshold: 0.82,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 700,
                  create_response: true,
                  interrupt_response: true,
                },
              },
            })
            scheduleUnmute()
            isFirstResponse = false
          }
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
          // Turn detection OFF during the opener so the server ignores
          // any incoming audio entirely. Combined with sender.track ===
          // null (set up via addTransceiver above), the opener is
          // guaranteed uninterruptible — there's no audio reaching the
          // server, and even if there were, the server isn't listening.
          //
          // After the opener's response.done fires, the message handler
          // sends a second session.update that switches turn_detection
          // to server_vad with interrupt_response: true, and
          // scheduleUnmute() swaps in the real mic when audio drain +
          // mic silence are both detected.
          turn_detection: null,
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
    if (this.vadTimer) {
      clearInterval(this.vadTimer)
      this.vadTimer = null
    }
    try {
      this.dc?.close()
    } catch {
      /* noop */
    }
    this.pc?.getSenders().forEach((s) => s.track?.stop())
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.audioEl?.remove()
    this.silentAudioCtx?.close().catch(() => {
      /* noop */
    })
    this.pc = null
    this.dc = null
    this.localStream = null
    this.audioEl = null
    this.silentAudioCtx = null
    this.handlers.clear()
  }
}
