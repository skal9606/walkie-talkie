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

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    // Initial response.create is gated on session.updated so the model
    // doesn't start generating before our instructions are in effect.
    let initialResponseFired = false
    let unmuteTimer: ReturnType<typeof setTimeout> | null = null
    // Audio drain delay between Natalia finishing and the mic coming back
    // online. Set generously: shorter values were leaving audio playing out
    // the speaker while the mic was reactivated, which on iOS produces a
    // self-echo loop that the server treats as user input and uses to pause
    // Natalia's audio output.
    const MIC_UNMUTE_DELAY_MS = 1500

    async function muteMic() {
      if (unmuteTimer) {
        clearTimeout(unmuteTimer)
        unmuteTimer = null
      }
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
          // server_vad with a stricter-than-default threshold and a long
          // silence window. We previously used semantic_vad but it was too
          // permissive about what counts as speech (phantom turns from
          // room tone). Threshold 0.6 (default 0.5) tightens that.
          // silence_duration_ms 1800 is intentionally generous — closer to
          // ISSEN's feel, where there's a deliberate pause between the
          // learner finishing and the tutor replying. Shorter windows
          // triggered Natalia mid-thinking-pause and felt rushed.
          turn_detection: {
            type: 'server_vad',
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 1800,
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
