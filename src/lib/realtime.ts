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

    // Half-duplex tutoring with REPLACE-TRACK muting.
    //
    // Previously we used `track.enabled = false` to silence the mic during
    // Natalia's turn. The spec says a disabled track outputs silence, but
    // in practice — especially on iOS Safari standalone / PWA mode —
    // disabled tracks have been observed to still emit non-silent audio,
    // which the server then treats as a learner turn and uses to truncate
    // Natalia's response.
    //
    // The bulletproof fix is to swap the WebRTC sender's track entirely.
    // We create a Web Audio "silent track" (a ConstantSourceNode at zero
    // amplitude piped through a MediaStreamAudioDestinationNode) and add
    // THAT to the peer connection initially. When we want the learner to
    // be heard, we replaceTrack with the real mic. When Natalia is
    // speaking, we replaceTrack back to silent. There's no application-
    // level "enabled" flag for Safari to ignore — the data flowing into
    // the WebRTC pipeline is genuinely silent samples.
    const realMicTrack = stream.getAudioTracks()[0]

    const silentAudioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (silentAudioCtx.state === 'suspended') {
      await silentAudioCtx.resume()
    }
    this.silentAudioCtx = silentAudioCtx
    const silentDest = silentAudioCtx.createMediaStreamDestination()
    const silentSource = silentAudioCtx.createConstantSource()
    silentSource.offset.value = 0
    silentSource.connect(silentDest)
    silentSource.start()
    const silentTrack = silentDest.stream.getAudioTracks()[0]

    // Initially add the SILENT track. Mic is effectively muted from t=0
    // through the end of Natalia's first response.
    const sender = pc.addTrack(silentTrack, silentDest.stream)

    // ---- Client-side VAD ---------------------------------------------------
    // Server-side VAD (turn_detection) is disabled — the server now never
    // tries to detect speech or auto-pause Natalia's audio output. We take
    // over turn-end detection in the browser by tapping the real mic stream
    // through a Web Audio AnalyserNode and computing rolling RMS energy.
    // When the learner speaks and then stays quiet for SILENCE_DURATION_MS,
    // we manually fire input_audio_buffer.commit + response.create.
    const vadSource = silentAudioCtx.createMediaStreamSource(stream)
    const vadAnalyser = silentAudioCtx.createAnalyser()
    vadAnalyser.fftSize = 1024
    vadSource.connect(vadAnalyser)
    const vadBuf = new Float32Array(vadAnalyser.fftSize)

    // How often the diagnostic analyzer samples the mic. The analyzer is
    // no longer used to drive any behavior (server VAD does that now) —
    // it just logs peak-RMS-per-second so we have visibility into what
    // the mic is producing if barge-in misbehaves.
    const VAD_TICK_INTERVAL_MS = 80

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    // Initial response.create is gated on session.updated so the model
    // doesn't start generating before our instructions are in effect.
    let initialResponseFired = false
    let unmuteTimer: ReturnType<typeof setTimeout> | null = null
    // Gates the diagnostic analyzer. Off during the opener (mic is on
    // the silent track, nothing useful to measure); on otherwise.
    let vadEnabled = false
    // Tracks whether the upcoming/current response is the very first
    // one of the session (the opener). The opener is non-interruptible
    // — mic stays on the silent track for its duration so server VAD
    // can't detect anything. Every response after that is barge-in-able.
    let isFirstResponse = true
    // True between response.created and response.done. Used to mute
    // playing audio when a barge-in is detected by the server.
    let nataliaIsSpeaking = false
    // Diagnostic-only peak-RMS-per-second tracker.
    let diagPeakRms = 0
    let diagLastLogAt = 0
    // Audio drain delay between Natalia finishing and the mic coming back
    // online. Originally 1500ms because shorter values let server-side VAD
    // pick up Natalia's tail audio as user input and truncate her next
    // response. That failure mode is gone now that turn_detection is null
    // (server no longer listens for turns at all). The remaining risk is
    // purely client-side: our own VAD analyzer firing a spurious commit on
    // self-echo. Worst case is Natalia responding to nothing — survivable.
    // Tuned down to cut the inter-turn gap that was making the conversation
    // feel sluggish. If iOS PWAs start firing phantom commits, raise back.
    const MIC_UNMUTE_DELAY_MS = 600

    // Diagnostic-only client-side VAD. With server VAD enabled, the
    // server handles turn detection, auto-commit, and interrupt-response.
    // We keep this analyzer purely to log peak mic energy so we can see
    // what the mic is producing if barge-in misbehaves. No actions
    // (sendCommit, response.cancel, audio mute) are taken from here.
    this.vadTimer = setInterval(() => {
      if (!vadEnabled) return
      vadAnalyser.getFloatTimeDomainData(vadBuf)
      let sumSquares = 0
      for (let i = 0; i < vadBuf.length; i++) {
        sumSquares += vadBuf[i] * vadBuf[i]
      }
      const rms = Math.sqrt(sumSquares / vadBuf.length)
      const now = Date.now()

      if (nataliaIsSpeaking) {
        diagPeakRms = Math.max(diagPeakRms, rms)
        if (now - diagLastLogAt > 1000) {
          console.log(`[VAD] peak rms in last 1s: ${diagPeakRms.toFixed(3)} (server-VAD active)`)
          diagPeakRms = 0
          diagLastLogAt = now
        }
      }
    }, VAD_TICK_INTERVAL_MS)

    async function muteMic() {
      if (unmuteTimer) {
        clearTimeout(unmuteTimer)
        unmuteTimer = null
      }
      // Suppress diagnostic logging while the silent track is active.
      vadEnabled = false
      if (sender.track !== silentTrack) {
        try {
          await sender.replaceTrack(silentTrack)
        } catch {
          // replaceTrack can throw if the connection is tearing down;
          // safe to swallow.
        }
      }
    }

    function scheduleUnmute(delayMs: number) {
      if (unmuteTimer) clearTimeout(unmuteTimer)
      unmuteTimer = setTimeout(async () => {
        unmuteTimer = null
        if (sender.track !== realMicTrack) {
          try {
            await sender.replaceTrack(realMicTrack)
          } catch {
            // ditto
          }
        }
        // Re-arm diagnostic logging now that the real mic is sending.
        vadEnabled = true
      }, delayMs)
    }

    dc.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        if (event.type === 'session.updated' && !initialResponseFired) {
          initialResponseFired = true
          this.send({ type: 'response.create' })
        }

        // Server VAD detected the user started speaking. If Natalia is
        // mid-response, this is a barge-in — the server will auto-cancel
        // her response, but her tail audio is still in the browser's
        // jitter buffer playing through the speaker. Mute it so the
        // learner doesn't hear her while talking.
        if (event.type === 'input_audio_buffer.speech_started') {
          console.log('[VAD] server detected speech_started')
          if (nataliaIsSpeaking) {
            console.log('[VAD] BARGE-IN — muting audio playback')
            audioEl.muted = true
            audioEl.pause()
          }
        }

        if (event.type === 'response.created') {
          console.log('[VAD] response.created — un-muting audio for new turn')
          nataliaIsSpeaking = true
          // If the previous turn was an interrupt, we muted audioEl to
          // kill her tail audio. New response means new audio coming
          // — un-mute so the learner can actually hear her.
          audioEl.muted = false
          audioEl.play().catch(() => {})
          if (isFirstResponse) {
            // Opener: keep the mic on the silent track. The opener is
            // explicitly non-interruptible — server VAD can't detect
            // speech in pure silence, so no auto-commit fires.
            muteMic()
          } else {
            // Subsequent responses: mic stays open. Server VAD watches
            // the incoming audio and will auto-commit + interrupt
            // Natalia's response if it detects user speech.
            vadEnabled = true
          }
        }

        if (event.type === 'response.done') {
          const status = (event.response as { status?: string } | undefined)?.status
          console.log('[VAD] response.done — status:', status)
          nataliaIsSpeaking = false
          if (isFirstResponse) {
            // One-time opener handoff: swap the silent track for the
            // real mic with a drain delay so her tail audio doesn't
            // bleed into the learner's first turn. After this fires,
            // the mic stays open for the rest of the session.
            scheduleUnmute(MIC_UNMUTE_DELAY_MS)
            isFirstResponse = false
          }
          // Non-opener path: mic was open the whole time and stays open.
          // VAD threshold automatically drops to the LOW value via the
          // tick (nataliaIsSpeaking is now false), ready to catch the
          // learner's next turn even if they speak quietly.
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
          // Server-side VAD with auto-commit + interrupt_response. OpenAI's
          // tuned VAD model is more reliable than our client-side RMS
          // analyzer, which was getting suppressed by browser AEC during
          // double-talk (and so couldn't detect barge-ins on speakers OR
          // sometimes even on AirPods). The server:
          //   - detects user speech start/stop on the audio it receives
          //   - auto-commits the input buffer at end-of-turn
          //   - auto-fires response.create for the new turn
          //   - cancels Natalia's in-flight response if user interrupts
          // The opener stays non-interruptible because the mic is on the
          // silent track during it — server VAD can't detect anything in
          // pure silence, so no auto-commit fires.
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
            interrupt_response: true,
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
