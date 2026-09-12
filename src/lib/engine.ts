/// Voice engine switch for the web client.
///
/// 'realtime' — OpenAI Realtime API (gpt-realtime-2), the production default.
/// 'live'     — OpenAI GPT-Live API (gpt-live-1), full duplex. Behind this
///              flag while it is being evaluated.
///
/// Set with a query param once, then it sticks in localStorage:
///   /chat?engine=live            switch this browser to GPT-Live
///   /chat?engine=realtime        switch back
///   /chat?voice=bossa            pick the GPT-Live voice (coral, bossa, tempo, …)
/// Both params are stripped from the URL by the Tutor page after reading.

export type VoiceEngine = 'realtime' | 'live'

const ENGINE_KEY = 'walkie.engine'
const VOICE_KEY = 'walkie.liveVoice'

export const LIVE_VOICE_OPTIONS = ['coral', 'bossa', 'tempo', 'marin', 'cedar', 'sage'] as const
export type LiveVoiceOption = (typeof LIVE_VOICE_OPTIONS)[number]

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode etc. — flag just doesn't stick */
  }
}

export function currentEngine(): VoiceEngine {
  return read(ENGINE_KEY) === 'live' ? 'live' : 'realtime'
}

export function setEngine(engine: VoiceEngine) {
  write(ENGINE_KEY, engine === 'live' ? 'live' : null)
}

export function currentLiveVoice(): LiveVoiceOption {
  const v = read(VOICE_KEY)
  return (LIVE_VOICE_OPTIONS as readonly string[]).includes(v ?? '')
    ? (v as LiveVoiceOption)
    : 'coral'
}

export function setLiveVoice(voice: string) {
  write(VOICE_KEY, (LIVE_VOICE_OPTIONS as readonly string[]).includes(voice) ? voice : null)
}

/// Apply `?engine=` / `?voice=` from a URL's search params. Returns true
/// when either was present so the caller can strip them from the URL.
export function applyEngineParams(params: URLSearchParams): boolean {
  let touched = false
  const engine = params.get('engine')
  if (engine === 'live' || engine === 'realtime') {
    setEngine(engine)
    touched = true
  }
  const voice = params.get('voice')
  if (voice) {
    setLiveVoice(voice)
    touched = true
  }
  return touched
}
