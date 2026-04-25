// Web Audio capture pipeline that feeds the OpenAI Realtime API via
// `input_audio_buffer.append` events on the data channel — independent of
// WebRTC media-stream input.
//
// We use this so the WebRTC mic track can stay muted (track.enabled = false)
// for the entire session: the server never receives audio over the media
// stream, which gives us a hard guarantee that nothing the learner says can
// interrupt Natalia mid-response. During her turn, captured frames sit in a
// local buffer; on response.done we flush them, and from there frames flow
// live until the next response starts.
//
// Format expected by the API: PCM16, mono, little-endian, 24kHz. Devices
// usually deliver 48kHz, so we decimate (or linearly interpolate for
// non-integer ratios) before encoding. ScriptProcessorNode is deprecated
// but universally supported and runs fine for mono voice — upgrade to
// AudioWorklet later if main-thread jitter becomes a problem.

const TARGET_SAMPLE_RATE = 24000
// 4096 frames at 48kHz ≈ 85ms per onaudioprocess tick. Lower buffer sizes
// would reduce latency but risk underruns on iOS Safari.
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096

export type PcmFrame = Int16Array
export type PcmFrameHandler = (frame: PcmFrame) => void

export class AudioCapture {
  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentSink: GainNode | null = null
  private handler: PcmFrameHandler

  constructor(handler: PcmFrameHandler) {
    this.handler = handler
  }

  async start(stream: MediaStream): Promise<void> {
    // We don't pass sampleRate here — iOS Safari ignores it and forces the
    // device rate anyway, so we just resample manually.
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    this.ctx = ctx

    // Some platforms (Safari) start the context suspended until a user
    // gesture. The connect() flow is gesture-driven (mic-button tap), so
    // resuming here should always succeed.
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const source = ctx.createMediaStreamSource(stream)
    this.source = source

    const processor = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
    this.processor = processor

    const sourceRate = ctx.sampleRate
    const ratio = sourceRate / TARGET_SAMPLE_RATE

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const outLen = Math.floor(input.length / ratio)
      if (outLen === 0) return
      const out = new Int16Array(outLen)
      for (let i = 0; i < outLen; i++) {
        // Linear pick — for 48k→24k this is exact decimation; for odd
        // ratios it's a cheap nearest-neighbor that's still voice-grade.
        const sample = input[Math.floor(i * ratio)]
        const clamped = Math.max(-1, Math.min(1, sample))
        out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      }
      this.handler(out)
    }

    // ScriptProcessorNode requires its output to be connected somewhere or
    // it stops firing onaudioprocess on some browsers. Route through a
    // muted GainNode so we don't echo the mic into the speakers.
    const silent = ctx.createGain()
    silent.gain.value = 0
    this.silentSink = silent

    source.connect(processor)
    processor.connect(silent)
    silent.connect(ctx.destination)
  }

  stop(): void {
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
      this.silentSink?.disconnect()
      this.ctx?.close()
    } catch {
      // noop — disconnect can throw if already torn down.
    }
    this.processor = null
    this.source = null
    this.silentSink = null
    this.ctx = null
  }
}

/** Encode a PCM16 frame as base64 for `input_audio_buffer.append`. */
export function pcmFrameToBase64(frame: PcmFrame): string {
  const bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength)
  let binary = ''
  // Build the binary string in chunks — String.fromCharCode rejects very
  // long argument lists on some engines.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
