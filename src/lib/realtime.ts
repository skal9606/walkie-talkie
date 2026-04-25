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

    // Start with the mic muted; we'll only enable it between Natalia's
    // turns, never while she's speaking. This is half-duplex tutoring —
    // the trade-off is that the learner can't interrupt mid-sentence,
    // but we eliminate the entire class of speaker-echo / hallucinated-
    // user-turn bugs that come from leaving the mic open while audio
    // plays out the speaker.
    const audioTracks = stream.getAudioTracks()
    audioTracks.forEach((track) => {
      track.enabled = false
      pc.addTrack(track, stream)
    })

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc

    // Initial response.create is gated on session.updated so the model
    // doesn't start generating before our instructions are in effect.
    let initialResponseFired = false
    let unmuteTimer: ReturnType<typeof setTimeout> | null = null

    function muteMic() {
      if (unmuteTimer) {
        clearTimeout(unmuteTimer)
        unmuteTimer = null
      }
      audioTracks.forEach((track) => {
        track.enabled = false
      })
    }

    function scheduleUnmute() {
      if (unmuteTimer) clearTimeout(unmuteTimer)
      // 800ms padding past response.done so the WebRTC playback buffer
      // drains before we open the mic — otherwise the speaker tail of
      // Natalia's voice leaks back in and the transcription model
      // hallucinates phantom user turns.
      unmuteTimer = setTimeout(() => {
        audioTracks.forEach((track) => {
          track.enabled = true
        })
        unmuteTimer = null
      }, 800)
    }

    dc.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        if (event.type === 'session.updated' && !initialResponseFired) {
          initialResponseFired = true
          this.send({ type: 'response.create' })
        }
        // Whenever the model starts streaming audio, hard-mute the mic so
        // its own speaker output can't loop back as input.
        if (event.type === 'response.audio.delta') {
          muteMic()
        }
        // After a response is fully done, schedule the mic to re-open with
        // a buffer-drain delay. Each response.done resets the timer, so a
        // long-streaming response stays muted until it's truly finished.
        if (event.type === 'response.done') {
          scheduleUnmute()
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
          // watching") from silent or low-energy audio.
          input_audio_transcription: { model: 'gpt-4o-transcribe' },
          // semantic_vad lets the model decide when the learner is done
          // speaking (vs. a silence threshold). Eagerness tunes how long it
          // waits: 'low' (default) for beginners who pause mid-sentence,
          // 'medium' or 'high' for more fluent speakers who don't.
          turn_detection: {
            type: 'semantic_vad',
            eagerness: options.vadEagerness ?? 'low',
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
