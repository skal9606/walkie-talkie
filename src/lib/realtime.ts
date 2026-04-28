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

    // Energy threshold for "speech vs silence." With AGC + noise suppression
    // on the input stream, normal speech RMS sits in the 0.05–0.3 range and
    // background quiet is well under 0.01. 0.02 is a safe split. Tune up if
    // we see false positives from room tone.
    const VAD_SPEECH_THRESHOLD = 0.02
    // How much continuous silence after speech to count the turn done. Same
    // value we previously used for server VAD — generous, so mid-sentence
    // thinking pauses don't fire a commit.
    const VAD_SILENCE_DURATION_MS = 1800
    // How often to sample. Smaller = lower latency on turn-end; larger =
    // less main-thread work. 80ms is a fine default for voice.
    const VAD_TICK_INTERVAL_MS = 80

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    // Initial response.create is gated on session.updated so the model
    // doesn't start generating before our instructions are in effect.
    let initialResponseFired = false
    let unmuteTimer: ReturnType<typeof setTimeout> | null = null
    // VAD only listens between Natalia's turns. While she's speaking, or
    // during the post-response drain delay, this is false and the timer
    // body short-circuits.
    let vadEnabled = false
    let userIsSpeaking = false
    let lastSpeechAt = 0
    let speechSinceLastCommit = false
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

    const sendCommit = () => {
      this.send({ type: 'input_audio_buffer.commit' })
      this.send({ type: 'response.create' })
    }

    this.vadTimer = setInterval(() => {
      if (!vadEnabled) return
      vadAnalyser.getFloatTimeDomainData(vadBuf)
      let sumSquares = 0
      for (let i = 0; i < vadBuf.length; i++) {
        sumSquares += vadBuf[i] * vadBuf[i]
      }
      const rms = Math.sqrt(sumSquares / vadBuf.length)
      const now = Date.now()
      if (rms > VAD_SPEECH_THRESHOLD) {
        lastSpeechAt = now
        speechSinceLastCommit = true
        userIsSpeaking = true
      } else if (
        userIsSpeaking &&
        now - lastSpeechAt > VAD_SILENCE_DURATION_MS
      ) {
        userIsSpeaking = false
        if (speechSinceLastCommit) {
          // Lock VAD before firing — response.created will arrive shortly
          // after, the mic will mute, and we don't want to fire a second
          // commit if the learner makes any sound between now and then.
          vadEnabled = false
          speechSinceLastCommit = false
          sendCommit()
        }
      }
    }, VAD_TICK_INTERVAL_MS)

    async function muteMic() {
      if (unmuteTimer) {
        clearTimeout(unmuteTimer)
        unmuteTimer = null
      }
      // Lock client-side VAD while Natalia is speaking.
      vadEnabled = false
      userIsSpeaking = false
      speechSinceLastCommit = false
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
        // Re-arm client-side VAD. From here on, the periodic timer body
        // will start watching for speech → silence transitions.
        userIsSpeaking = false
        speechSinceLastCommit = false
        lastSpeechAt = Date.now()
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
        // Mute the mic as EARLY as possible. We fire on both events:
        //   - input_audio_buffer.committed: server has accepted the
        //     learner's turn. Anything they say from here is post-turn
        //     and we don't want it leaking into the response that's
        //     about to be generated. (Subsequent-response path.)
        //   - response.created: covers the opener path, where there's
        //     no preceding committed event because we manually fired
        //     response.create from session.updated.
        // muteMic is idempotent — calling it twice is fine.
        if (
          event.type === 'input_audio_buffer.committed' ||
          event.type === 'response.created'
        ) {
          muteMic()
        }
        // After a response is fully done, schedule the mic to re-open
        // with a generous drain delay. Shorter delays were leaving
        // Natalia's tail audio still playing out the speaker when the
        // mic came back online — on iOS that self-echo gets treated as
        // user input by the server and pauses subsequent responses.
        if (event.type === 'response.done') {
          scheduleUnmute(MIC_UNMUTE_DELAY_MS)
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
          // Server-side turn detection is OFF. Even with interrupt_response
          // false, server VAD was pausing Natalia's audio output whenever
          // it thought it heard learner input — leaving her transcript
          // complete but her audio truncated mid-sentence. With
          // turn_detection: null the server stops listening for turns
          // entirely, so it cannot pause her response on perceived input.
          // Turn-end detection is now done client-side (see VAD analyzer
          // setup above) which fires input_audio_buffer.commit +
          // response.create manually when the learner pauses.
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
