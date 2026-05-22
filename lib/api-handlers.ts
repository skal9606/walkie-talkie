// Shared handlers used by both the Vite dev middleware and the Vercel
// serverless functions under api/. Pure functions — no request/response
// coupling, so each runtime can wrap them however it likes.

export type HandlerResult = {
  status: number
  body: unknown
}

// -- OpenAI Realtime session token ------------------------------------------

export async function mintSessionToken(apiKey: string | undefined): Promise<HandlerResult> {
  if (!apiKey) {
    return {
      status: 500,
      body: {
        error:
          'OPENAI_API_KEY not set. Add it to .env.local (dev) or the deployment environment (prod).',
      },
    }
  }
  try {
    // GA API (Aug 2025). The old beta endpoint /v1/realtime/sessions returns
    // 400 beta_api_shape_disabled as of 2026-05-20. New endpoint nests config
    // under a session{} object and returns the ephemeral token at the top-
    // level `value` field (was `client_secret.value` in beta).
    // Set the full audio config at mint time. The existing client code
    // (web src/lib/realtime.ts and iOS RealtimeClient.swift) sends a
    // session.update event AFTER connecting that uses the old beta field
    // layout (turn_detection and input_audio_transcription at the top
    // level of session). The GA API moved those under audio.input.*, so
    // those updates are likely being silently rejected — leaving the
    // server with no turn detection, which is why the model never
    // responds to the user. Setting these here gives the session usable
    // defaults regardless of whether the client's session.update lands.
    const reqBody = {
      session: {
        type: 'realtime',
        // Retrying gpt-realtime-2 (2026-05-21). Earlier v2 attempt was
        // reverted when the second conversation showed an opener-loop +
        // English regression on iOS. We've since shipped the mic-gate
        // fix (mute mic while Natalia speaks → kills the echo-driven
        // phantom turns that triggered the loop) and the audio-session
        // disconnect fix (prewarmed 2nd convo audio now works). With
        // those baselines in place, the earlier "v2 regression" may
        // actually have been echo-driven. Worth re-testing.
        model: 'gpt-realtime-2',
        audio: {
          input: {
            turn_detection: {
              type: 'server_vad',
              threshold: 0.82,
              prefix_padding_ms: 300,
              silence_duration_ms: 1200,
              create_response: true,
              interrupt_response: false,
            },
            transcription: { model: 'gpt-4o-transcribe' },
          },
          output: { voice: 'coral' },
        },
      },
    }
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    })
    const data = await response.json()
    // TEMP DEBUG LOGGING — remove after diagnosing the silent-after-start bug.
    // Logs request body, response status, and (redacted) response so we can
    // see what OpenAI is actually returning post-GA-migration.
    const dataPreview = JSON.stringify(data).slice(0, 800)
    console.log(
      `[mintSessionToken] OpenAI status=${response.status} ` +
        `reqBody=${JSON.stringify(reqBody)} respBody=${dataPreview}`,
    )
    if (response.status !== 200) {
      return { status: response.status, body: data }
    }
    // Re-shape to the legacy { client_secret: { value } } envelope that
    // existing clients (web src/lib/realtime.ts + iOS) still parse, so we can
    // ship the backend fix without simultaneously redeploying the web client
    // and iOS app. Drop this re-shape once both clients read `value` directly.
    return {
      status: 200,
      body: {
        client_secret: { value: data.value, expires_at: data.expires_at },
        ...data,
      },
    }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Translate a target-language utterance to English ----------------------

/** Display label shown in the system prompt for each supported language. */
const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'Brazilian Portuguese',
  'es-MX': 'Mexican Spanish',
  'it-IT': 'Italian',
  'fr-FR': 'French',
  'de-DE': 'German',
  // Future: 'es-ES': 'Castilian Spanish', 'es-AR': 'Rioplatense Spanish', etc.
}

function languageLabel(code: string | undefined): string {
  if (!code) return 'Brazilian Portuguese'
  return LANGUAGE_LABELS[code] ?? code
}

/// OpenAI TTS via /v1/audio/speech. Used by the /review surface so
/// review cards play in the same warm voice as live tutor sessions
/// instead of the robotic Web Speech API default. Returns base64-
/// encoded audio so we can keep the call inside the JSON response of
/// /api/translate (consolidating endpoints is how we stay under the
/// Vercel Hobby 12-function limit).
///
/// `voice` defaults to 'coral' to match the Realtime voice in
/// mintGatedSession. `model` defaults to the higher-quality
/// gpt-4o-mini-tts — meaningfully warmer than `tts-1`.
export async function synthesizeSpeech(
  apiKey: string | undefined,
  text: string | undefined,
  voice = 'coral',
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { status: 400, body: { error: 'No text provided.' } }
  }
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: trimmed,
        response_format: 'mp3',
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      return { status: response.status, body: { error: text.slice(0, 500) } }
    }
    const buf = Buffer.from(await response.arrayBuffer())
    return {
      status: 200,
      body: { audioBase64: buf.toString('base64'), mimeType: 'audio/mpeg' },
    }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

/// Search Unsplash for a single representative photo matching the query.
/// Used by the iOS Review deck to give First Timer + Basic vocab cards
/// a visual cue (Duolingo-style). Returns null imageUrl when the query
/// has no good match — caller skips the visual and falls back to text-
/// only. Attribution metadata is included so the client can render the
/// "Photo by X on Unsplash" credit per Unsplash's API terms.
export async function unsplashImageLookup(
  accessKey: string | undefined,
  query: string | undefined,
): Promise<HandlerResult> {
  if (!accessKey) {
    return { status: 500, body: { error: 'UNSPLASH_ACCESS_KEY not set.' } }
  }
  const q = (query ?? '').trim()
  if (!q) {
    return { status: 400, body: { error: 'No query provided.' } }
  }
  try {
    const url = new URL('https://api.unsplash.com/search/photos')
    url.searchParams.set('query', q)
    url.searchParams.set('per_page', '1')
    url.searchParams.set('content_filter', 'high')
    url.searchParams.set('orientation', 'squarish')
    const r = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!r.ok) {
      return { status: r.status, body: { imageUrl: null, error: `Unsplash ${r.status}` } }
    }
    const data = (await r.json()) as {
      results?: Array<{
        urls?: { regular?: string; small?: string }
        user?: { name?: string; links?: { html?: string } }
      }>
    }
    const top = data.results?.[0]
    if (!top?.urls?.regular) {
      return { status: 200, body: { imageUrl: null } }
    }
    return {
      status: 200,
      body: {
        imageUrl: top.urls.regular,
        photographer: top.user?.name ?? null,
        photographerUrl: top.user?.links?.html ?? null,
      },
    }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

export async function translate(
  apiKey: string | undefined,
  text: string | undefined,
  language?: string,
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { status: 400, body: { error: 'No text provided.' } }
  }
  const langLabel = languageLabel(language)
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Translate the user's ${langLabel} to natural, conversational English. If parts are already in English, leave them as-is. Return only the translation — no quotes, no explanation, no prefixes.`,
          },
          { role: 'user', content: trimmed },
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    })
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error) {
      return { status: 500, body: { error: data.error.message } }
    }
    const translation = data.choices?.[0]?.message?.content?.trim() ?? ''
    return { status: 200, body: { translation } }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- CEFR assessment --------------------------------------------------------

export type CefrLevel =
  | 'A1'
  | 'A2'
  | 'B1'
  | 'B2'
  | 'C1'
  | 'C2'
  | 'INSUFFICIENT_DATA'

export type CefrAssessment = {
  level: CefrLevel
  /** 1-2 sentence encouraging summary, in English. Shown on the paywall. */
  note: string
  /** Language code that was assessed (e.g. "pt-BR"). */
  language: string
  /** ISO timestamp. */
  assessedAt: string
}

/// Grade a trial conversation against the CEFR rubric. Called from the web
/// client right after the trial timer expires — the result lands on the
/// paywall ("You're at B1 in Spanish") as a personalized hook that
/// outperforms generic conversion copy. INSUFFICIENT_DATA when the learner
/// produced too little target-language speech to assess (e.g. the
/// conversation was entirely in English).
export async function assessCefr(
  apiKey: string | undefined,
  params: {
    transcript?: TranscriptEntry[]
    language?: string
  },
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const transcript = params.transcript ?? []
  if (transcript.length === 0) {
    return { status: 400, body: { error: 'Empty transcript.' } }
  }
  const languageCode = params.language ?? 'pt-BR'
  const languageName = languageLabel(languageCode)

  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.text}`)
    .join('\n')

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are a CEFR-trained ${languageName} language assessor. Read the transcript and score the LEARNER's spoken ${languageName} against the CEFR rubric. Only judge what the LEARNER said — the Tutor's lines are context.

Evaluate:
- Vocabulary range and accuracy
- Grammar complexity and correctness
- Fluency (turn length, hesitations, connectives)
- Comprehension (responsiveness to the tutor's questions in ${languageName})
- Pragmatic competence (register, idioms, social moves)

CEFR rubric (apply strictly):
- A1: Stock phrases, single words. Only present tense, very limited vocabulary. Greetings, names, numbers.
- A2: Simple sentences about familiar topics. Past/present, basic vocabulary, often mistakes.
- B1: Connected discourse on familiar topics. Opinions, descriptions, past experiences. Errors don't impede comprehension.
- B2: Fluent on most topics. Argues, explains causes, handles abstract subjects, some idiomatic phrasing.
- C1: Effortless, idiomatic. Complex sentences with cohesion devices. Subtle distinctions.
- C2: Near-native. Nuance, irony, register-switching at will.

If the learner produced fewer than 5 turns OR fewer than ~50 words in ${languageName} OR spoke almost entirely in English, return "INSUFFICIENT_DATA".

Return JSON with exactly these keys:
- "level": one of "A1", "A2", "B1", "B2", "C1", "C2", "INSUFFICIENT_DATA"
- "note": 1-2 sentences in ENGLISH. Frame ENCOURAGINGLY — mention one specific strength AND a concrete thing to push toward the next level. Never use words like "poor", "weak", "lacking". For INSUFFICIENT_DATA: invite them to come back for a longer chat.

Examples:
- "level": "A2", "note": "You handled greetings and past tense — push toward longer sentences and 'porque' to start hitting B1."
- "level": "B2", "note": "Strong fluency and you used 'embora' naturally — work on subjunctive in hypotheticals to reach C1."
- "level": "INSUFFICIENT_DATA", "note": "Stick around for a longer chat next time so we can place your level — even 5 minutes of speaking will do it."`,
          },
          { role: 'user', content: transcriptText },
        ],
      }),
    })

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error) {
      return { status: 500, body: { error: data.error.message } }
    }
    const content = data.choices?.[0]?.message?.content ?? '{}'
    let parsed: { level?: string; note?: string }
    try {
      parsed = JSON.parse(content)
    } catch {
      return { status: 500, body: { error: 'Invalid JSON from CEFR model.' } }
    }
    const validLevels = new Set<CefrLevel>([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
      'INSUFFICIENT_DATA',
    ])
    const level = (parsed.level ?? '') as CefrLevel
    if (!validLevels.has(level)) {
      return {
        status: 500,
        body: { error: `Model returned unknown level: ${parsed.level}` },
      }
    }
    const assessment: CefrAssessment = {
      level,
      note: (parsed.note ?? '').trim(),
      language: languageCode,
      assessedAt: new Date().toISOString(),
    }
    return { status: 200, body: assessment }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

/// Persist a fresh assessment to the user's profile. Best-effort — if the
/// upsert fails we still return the assessment to the caller so the
/// paywall can render it, but the result won't survive a page reload.
export async function persistCefrAssessment(
  userId: string,
  assessment: CefrAssessment,
): Promise<void> {
  const { supabaseAdmin } = await import('./supabase-admin.js')
  const { error } = await supabaseAdmin()
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        cefr_level: assessment.level,
        cefr_language: assessment.language,
        cefr_note: assessment.note,
        cefr_assessed_at: assessment.assessedAt,
      },
      { onConflict: 'user_id' },
    )
  if (error) {
    console.error('[assess-cefr] persist failed:', error.message)
  }
}

// -- Learner state (mistakes, memory, focus) -------------------------------

/// One persisted mistake the tutor should circle back to in future sessions.
/// `recordedAt` is an ISO timestamp; the array is application-capped at
/// MAX_LEARNER_STATE_ITEMS, newest first, so old mistakes age out naturally
/// without a separate "stale" sweep.
export type PersistedMistake = {
  original: string
  corrected: string
  explanation: string
  recordedAt: string
}

const MAX_LEARNER_STATE_ITEMS = 10

/// Pulls per-language learner state from the profile. Returns empty
/// containers (not nulls) so callers can spread them safely. Filtered by
/// `language` so PT facts don't bleed into an ES session.
export async function loadLearnerState(
  userId: string,
  language: string,
): Promise<{
  mistakes: PersistedMistake[]
  memory: string[]
  nextFocus: string | null
}> {
  const { supabaseAdmin } = await import('./supabase-admin.js')
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('recent_mistakes, recent_memory, next_focus')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) {
    return { mistakes: [], memory: [], nextFocus: null }
  }
  const mistakesByLang = (data.recent_mistakes ?? {}) as Record<string, PersistedMistake[]>
  const memoryByLang = (data.recent_memory ?? {}) as Record<string, string[]>
  const focusByLang = (data.next_focus ?? {}) as Record<string, string>
  return {
    mistakes: Array.isArray(mistakesByLang[language]) ? mistakesByLang[language] : [],
    memory: Array.isArray(memoryByLang[language]) ? memoryByLang[language] : [],
    nextFocus: typeof focusByLang[language] === 'string' ? focusByLang[language] : null,
  }
}

/// Merges fresh review output into the user's stored learner state for the
/// language they just practiced. Caps each array at MAX_LEARNER_STATE_ITEMS
/// with most-recent first; dedupes mistakes by the learner's `original`
/// utterance and memory items case-insensitively.
///
/// Best-effort — a failed write doesn't block the review response. The
/// learner can still see their CEFR card and transcript.
export async function persistLearnerState(
  userId: string,
  language: string,
  fresh: {
    corrections?: Array<{ original?: string; corrected?: string; explanation?: string }>
    memory?: string[]
    nextFocus?: string | null
  },
): Promise<void> {
  const { supabaseAdmin } = await import('./supabase-admin.js')
  const client = supabaseAdmin()
  const { data: row } = await client
    .from('profiles')
    .select('recent_mistakes, recent_memory, next_focus')
    .eq('user_id', userId)
    .maybeSingle()
  const prevMistakes = ((row?.recent_mistakes ?? {}) as Record<string, PersistedMistake[]>)
  const prevMemory = ((row?.recent_memory ?? {}) as Record<string, string[]>)
  const prevFocus = ((row?.next_focus ?? {}) as Record<string, string>)

  const now = new Date().toISOString()
  const incomingMistakes: PersistedMistake[] = (fresh.corrections ?? [])
    .map((c) => ({
      original: (c.original ?? '').trim(),
      corrected: (c.corrected ?? '').trim(),
      explanation: (c.explanation ?? '').trim(),
      recordedAt: now,
    }))
    .filter((m) => m.original.length > 0 && m.corrected.length > 0)

  const mergedMistakes = capByOriginal(
    [...incomingMistakes, ...(prevMistakes[language] ?? [])],
    MAX_LEARNER_STATE_ITEMS,
  )

  const incomingMemory = (fresh.memory ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const mergedMemory = capCaseInsensitive(
    [...incomingMemory, ...(prevMemory[language] ?? [])],
    MAX_LEARNER_STATE_ITEMS,
  )

  const nextMistakes = { ...prevMistakes, [language]: mergedMistakes }
  const nextMemory = { ...prevMemory, [language]: mergedMemory }
  const nextFocusByLang = { ...prevFocus }
  if (typeof fresh.nextFocus === 'string' && fresh.nextFocus.trim().length > 0) {
    nextFocusByLang[language] = fresh.nextFocus.trim()
  }

  const { error } = await client
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        recent_mistakes: nextMistakes,
        recent_memory: nextMemory,
        next_focus: nextFocusByLang,
      },
      { onConflict: 'user_id' },
    )
  if (error) {
    console.error('[learner-state] persist failed:', error.message)
  }
}

function capByOriginal(items: PersistedMistake[], max: number): PersistedMistake[] {
  const seen = new Set<string>()
  const out: PersistedMistake[] = []
  for (const m of items) {
    const key = m.original.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
    if (out.length >= max) break
  }
  return out
}

function capCaseInsensitive(items: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of items) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

// -- Streak (consecutive practice days) -------------------------------------

/// Server-side daily-practice streak. A day "counts" when the learner has a
/// conversation of >= 60s that day. The server is the single source of truth
/// so iOS and web share the same number — talking on web today and iOS
/// tomorrow extends one continuous streak.
///
/// `streak_last_day` is stored as a DATE in the learner's local timezone
/// (the client sends YYYY-MM-DD with each tick). Server is timezone-
/// agnostic on purpose: it just compares strings.
export type StreakState = {
  streakCount: number
  /** YYYY-MM-DD in the learner's local timezone, or null if no streak yet. */
  streakLastDay: string | null
}

export async function loadStreak(userId: string): Promise<StreakState> {
  const { supabaseAdmin } = await import('./supabase-admin.js')
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('streak_count, streak_last_day')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) {
    return { streakCount: 0, streakLastDay: null }
  }
  return {
    streakCount: typeof data.streak_count === 'number' ? data.streak_count : 0,
    streakLastDay: typeof data.streak_last_day === 'string' ? data.streak_last_day : null,
  }
}

/// Increments the streak for `localDate` if it hasn't already been counted
/// today. Idempotent — calling multiple times on the same date is a no-op,
/// so the heartbeat can fire this on every tick once the session has crossed
/// the 60s threshold.
///
/// Rules:
///   - already counted today (last_day === localDate) → no change
///   - last_day === yesterday(localDate) → streak_count + 1
///   - older or null                     → streak_count = 1 (fresh start)
export async function tickStreak(userId: string, localDate: string): Promise<StreakState> {
  if (!isYyyyMmDd(localDate)) {
    return loadStreak(userId)
  }
  const current = await loadStreak(userId)
  if (current.streakLastDay === localDate) {
    return current
  }
  const yesterday = yyyyMmDdMinusOne(localDate)
  const nextCount = current.streakLastDay === yesterday ? current.streakCount + 1 : 1
  const { supabaseAdmin } = await import('./supabase-admin.js')
  const { error } = await supabaseAdmin()
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        streak_count: nextCount,
        streak_last_day: localDate,
      },
      { onConflict: 'user_id' },
    )
  if (error) {
    console.error('[streak] tick failed:', error.message)
    return current
  }
  return { streakCount: nextCount, streakLastDay: localDate }
}

function isYyyyMmDd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function yyyyMmDdMinusOne(s: string): string {
  // Construct as UTC to avoid DST edge cases — we just want N-1 calendar day.
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// -- Post-session review ----------------------------------------------------

export type TranscriptEntry = { role: 'user' | 'tutor'; text: string }

/// Bundles the optional CEFR result into the review response. Lets the
/// review endpoint do both LLM calls in one round-trip and stay inside
/// Vercel Hobby's 12-serverless-function limit.
export type ReviewWithOptionalCefr = {
  cefr?: CefrAssessment | null
  [key: string]: unknown
}

export async function reviewTranscript(
  apiKey: string | undefined,
  params: {
    transcript?: TranscriptEntry[]
    scenario?: string
    language?: string
    /**
     * Run a CEFR assessment in parallel with the review and include it in
     * the response under `cefr`. Used on trial-exhaust sessions so the
     * paywall can show "You're at B1". Skipped by default to keep the
     * non-trial review path cheap.
     */
    assessCefr?: boolean
  },
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const transcript = params.transcript ?? []
  if (transcript.length === 0) {
    return { status: 400, body: { error: 'Empty transcript.' } }
  }
  const langLabel = languageLabel(params.language)
  try {
    const scenarioLine = params.scenario ? `SCENARIO: ${params.scenario}\n\n` : ''
    const transcriptText = transcript
      .map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.text}`)
      .join('\n')

    // Kick off the review and CEFR HTTP calls in parallel. Previously
    // CEFR waited for review to complete before starting, doubling the
    // wall-clock latency the learner sees as a blank space above the
    // paywall benefits. Both calls hit OpenAI independently — no shared
    // state, no reason to serialize. Cuts paywall-to-CEFR from ~10s to
    // ~5s in practice.
    const reviewFetch = fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are reviewing a ${langLabel} language-learning conversation between a tutor and an English-speaking learner. Produce a JSON object with these exact keys:

- "summary": string. One or two sentences on what was practiced.
- "corrections": array of { "original": string, "corrected": string, "explanation": string }. Only include meaningful mistakes the learner made — skip tiny slips. Use the learner's exact words for "original". Keep "explanation" brief (one line), in English.
- "newVocabulary": array of { "word": string, "translation": string, "example": string }. Portuguese words/phrases the tutor introduced that are worth reviewing. Use a natural example sentence in Portuguese.
- "practiceNextTime": array of 2-4 short strings suggesting what to focus on next time.
- "memory": array of 2-4 short third-person factual bullets about the LEARNER that would be useful to recall in a future session. Examples: "Has a daughter named Lucy who is 7", "Works as a venture capitalist", "Lives in San Francisco but visits Brazil yearly", "Recently started reading Clarice Lispector". ONLY include facts the learner actually shared (people, places, work, hobbies, life events). Skip language-mechanics observations and anything trivial. Use empty array if the learner shared nothing personal.
- "name": string or null. The learner's first name if they explicitly told the tutor in this session (e.g. "I'm Steve" or "My name is Steve"). DO NOT guess from a transcription artifact. Null if they never said it.
- "inferredLevel": one of "complete-beginner", "novice", "intermediate", "advanced", or null. Your best estimate of their actual proficiency based on what they produced — NOT what they claimed. Use these markers: complete-beginner = no Portuguese produced, only English; novice = a few words/phrases like "olá", "obrigado", numbers; intermediate = full sentences with present + past tense, occasional errors; advanced = fluent and idiomatic. Null if you don't have enough signal.
- "nextFocus": string or null. ONE short sentence (max 25 words) telling the tutor what to silently bias the NEXT session toward. Combine the most useful grammar/vocab gap from this session with a personal-thread reference to keep continuity. Examples: "Lean on past tense — they kept defaulting to present when describing the weekend; reuse 'sogra' and 'Salvador'.", "Push them to use 'porque' and give reasons; revisit their daughter's school." Null if the session was too short to extract anything useful.

All eight keys must be present. Use empty arrays / null if there is genuinely nothing to report. Be concise.`,
          },
          { role: 'user', content: scenarioLine + transcriptText },
        ],
      }),
    })

    // CEFR runs concurrently when requested; resolves to null otherwise
    // so the destructure below is uniform.
    const cefrPromise: Promise<HandlerResult | null> = params.assessCefr
      ? assessCefr(apiKey, { transcript, language: params.language })
      : Promise.resolve(null)

    const [response, cefrHandlerResult] = await Promise.all([
      reviewFetch,
      cefrPromise,
    ])

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error) {
      return { status: 500, body: { error: data.error.message } }
    }
    const content = data.choices?.[0]?.message?.content ?? '{}'
    let reviewParsed: Record<string, unknown>
    try {
      reviewParsed = JSON.parse(content) as Record<string, unknown>
    } catch {
      return { status: 500, body: { error: 'Invalid JSON from review model.' } }
    }

    // CEFR is best-effort: a failed grader doesn't block the review
    // payload. Status 200 from assessCefr → use it; anything else →
    // null and the paywall just doesn't show the block.
    let cefr: CefrAssessment | null = null
    if (cefrHandlerResult && cefrHandlerResult.status === 200) {
      cefr = cefrHandlerResult.body as CefrAssessment
    }
    const body: ReviewWithOptionalCefr = { ...reviewParsed, cefr }
    return { status: 200, body }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Stripe Checkout session -----------------------------------------------

export type StripeEnv = {
  stripeSecretKey?: string
  monthlyPriceId?: string
  yearlyPriceId?: string
}

// Hosts we accept as success/cancel URLs when starting a Stripe checkout.
// Prevents an attacker with a valid JWT from routing a user's post-payment
// redirect (which contains the session_id) to a phishing site.
const ALLOWED_REDIRECT_HOSTS = new Set([
  'walkietalkie.so',
  'www.walkietalkie.so',
  'localhost:5173',
  'localhost:5174',
  'localhost:5175',
])

function isAllowedRedirectUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (ALLOWED_REDIRECT_HOSTS.has(parsed.host)) return true
    // Vercel preview deploys (e.g. walkie-talkie-abc.vercel.app) are allowed.
    if (parsed.host.endsWith('.vercel.app')) return true
    return false
  } catch {
    return false
  }
}

export async function createCheckoutSession(
  env: StripeEnv,
  params: {
    plan?: string
    successUrl?: string
    cancelUrl?: string
    /** Supabase user id — stored on the Stripe session so the webhook can
     *  link subscription events back to the right user. */
    userId?: string
  },
): Promise<HandlerResult> {
  if (!env.stripeSecretKey) {
    return {
      status: 500,
      body: {
        error:
          'Stripe is not configured. Set STRIPE_SECRET_KEY, STRIPE_MONTHLY_PRICE_ID, and STRIPE_YEARLY_PRICE_ID.',
      },
    }
  }
  const { plan, successUrl, cancelUrl } = params
  if (plan !== 'monthly' && plan !== 'yearly') {
    return { status: 400, body: { error: 'Invalid plan.' } }
  }
  const priceId = plan === 'yearly' ? env.yearlyPriceId : env.monthlyPriceId
  if (!priceId) {
    return {
      status: 500,
      body: { error: `Missing price id for ${plan}.` },
    }
  }
  if (!successUrl || !cancelUrl) {
    return { status: 400, body: { error: 'successUrl and cancelUrl required.' } }
  }
  if (!isAllowedRedirectUrl(successUrl) || !isAllowedRedirectUrl(cancelUrl)) {
    return {
      status: 400,
      body: { error: 'successUrl and cancelUrl must point to an allowed host.' },
    }
  }

  try {
    const form = new URLSearchParams()
    form.set('mode', 'subscription')
    form.set('line_items[0][price]', priceId)
    form.set('line_items[0][quantity]', '1')
    form.set('success_url', successUrl)
    form.set('cancel_url', cancelUrl)
    form.set('allow_promotion_codes', 'true')
    if (params.userId) {
      form.set('client_reference_id', params.userId)
      form.set('metadata[user_id]', params.userId)
      // On the Subscription itself too, so later webhooks (renewal, cancel)
      // still know which user this belongs to.
      form.set('subscription_data[metadata][user_id]', params.userId)
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const data = (await response.json()) as {
      url?: string
      error?: { message?: string }
    }
    if (!response.ok || !data.url) {
      return {
        status: response.status || 500,
        body: { error: data.error?.message ?? 'Stripe checkout creation failed.' },
      }
    }
    return { status: 200, body: { url: data.url } }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Subscription detail (settings panel) ---------------------------------

import { supabaseAdmin } from './supabase-admin.js'
import { FREE_TIER_SECONDS } from './constants.js'

// -- Admin dashboard stats ------------------------------------------------

export type AdminStats = {
  /** Total auth users (incl. anonymous). */
  totalUsers: number
  /** Auth users created in the last 7 / 30 days. */
  newUsers7d: number
  newUsers30d: number
  /** Auth users with last_sign_in_at in the last 7 / 30 days. */
  activeUsers7d: number
  activeUsers30d: number
  /** Subscribers currently in any active state. */
  activeSubscribers: number
  /** Active subscribers broken down by source (stripe vs apple). */
  subscribersBySource: Record<string, number>
  /** Cumulative trial seconds consumed across all free users (sum of `usage`). */
  totalTrialSeconds: number
  /** Profiles grouped by target_language ('pt-BR' etc.). */
  usersByLanguage: Record<string, number>
  /** Total conversations started across all users (one count per /api/session mint). */
  totalConversations: number
  /** Total practice seconds across all users (subscribers + free). */
  totalPracticeSeconds: number
  /** Average session length in seconds. 0 when totalConversations === 0. */
  avgSessionSeconds: number
  /** Subs that already cancelled (status='canceled'). */
  cancelledSubs: number
  /** Active subs set to cancel at period end — pending churn. */
  pendingCancellations: number
  /** Monthly Recurring Revenue in USD (sum of monthly equivalents for
   *  every active sub). Yearly plans count at price / 12. */
  mrrUsd: number
  /** 10 most recent signups. Email is null for anonymous accounts. */
  recentSignups: Array<{
    id: string
    email: string | null
    name: string | null
    createdAt: string
    isAnonymous: boolean
    /** First 8 chars of the SHA-256 IP hash. Null if not yet recorded. */
    ipHashShort: string | null
    /** How many profiles share this IP hash. 1 = unique, >1 = duplicate. */
    ipHashCount: number
  }>
}

/// Per-plan monthly $ value used in the MRR sum. Stripe price IDs come
/// from env vars (so they match whatever's configured in production);
/// Apple-side product IDs are matched on substring since the productId
/// space is namespaced and stable ("...monthly", "...yearly").
function monthlyValueForPlan(productId: string | null | undefined): number {
  if (!productId) return 0
  if (productId === process.env.STRIPE_MONTHLY_PRICE_ID) return 14.99
  if (productId === process.env.STRIPE_YEARLY_PRICE_ID) return 149.99 / 12
  const lower = productId.toLowerCase()
  if (lower.includes('monthly')) return 14.99
  if (lower.includes('yearly') || lower.includes('annual')) return 149.99 / 12
  return 0
}

/**
 * Aggregate snapshot for the internal dashboard. One round-trip per
 * table — small payload, fine for sub-1000-user MVP scale. If the
 * project grows past that, swap to a SQL view + single RPC.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const db = supabaseAdmin()
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

  // Fetch up to 1000 auth users. Past that, paginate or add a SQL
  // count(). The MVP dashboard is for early-stage usage signal.
  const { data: authData, error: authErr } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (authErr) {
    throw new Error(`auth.admin.listUsers failed: ${authErr.message}`)
  }
  const users = authData?.users ?? []

  const totalUsers = users.length
  const newUsers7d = users.filter((u) => new Date(u.created_at) > sevenDaysAgo).length
  const newUsers30d = users.filter((u) => new Date(u.created_at) > thirtyDaysAgo).length
  const activeUsers7d = users.filter(
    (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) > sevenDaysAgo,
  ).length
  const activeUsers30d = users.filter(
    (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) > thirtyDaysAgo,
  ).length

  // Active subscriptions + source breakdown + MRR + pending churn.
  const { data: subs } = await db
    .from('subscriptions')
    .select('source, status, product_id, cancel_at_period_end')
    .in('status', ['active', 'trialing', 'in_grace_period'])
  const activeSubscribers = subs?.length ?? 0
  const subscribersBySource: Record<string, number> = {}
  let mrrUsd = 0
  let pendingCancellations = 0
  for (const row of subs ?? []) {
    const src = (row.source as string) ?? 'unknown'
    subscribersBySource[src] = (subscribersBySource[src] ?? 0) + 1
    mrrUsd += monthlyValueForPlan(row.product_id as string | null | undefined)
    if (row.cancel_at_period_end === true) pendingCancellations += 1
  }

  // Already-cancelled subs — separate count, not subtracted from active.
  const { count: cancelledCount } = await db
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'canceled')
  const cancelledSubs = cancelledCount ?? 0

  // Total trial seconds burned (free users only — subscribed users
  // don't increment this counter).
  const { data: usageRows } = await db.from('usage').select('seconds_used')
  const totalTrialSeconds = (usageRows ?? []).reduce(
    (acc, row) => acc + ((row.seconds_used as number | undefined) ?? 0),
    0,
  )

  // Profiles by language + total counters. profiles.user_id is also the
  // join key into auth.users for recentSignups; we read name +
  // target_language + total_practice_seconds + total_conversations here.
  const { data: profileRows, error: profileErr } = await db
    .from('profiles')
    .select('user_id, name, target_language, total_practice_seconds, total_conversations, signup_ip_hash')
  // Without this log, a schema-cache mismatch (PostgREST not seeing a
  // newly-added column) silently returns null/empty and the dashboard
  // shows zeros everywhere instead of failing loudly. Vercel logs are
  // where to look when totals look wrong.
  if (profileErr) {
    console.error('[admin-stats] profiles SELECT failed:', profileErr.message)
  }
  const usersByLanguage: Record<string, number> = {}
  const profileByUserId = new Map<string, { name: string | null; ipHash: string | null }>()
  // Count how many profiles share each IP hash so we can flag duplicates
  // in the dashboard. Hashes that haven't been recorded yet (null) are
  // skipped — they don't count toward duplicate detection.
  const ipHashCounts = new Map<string, number>()
  let totalPracticeSeconds = 0
  let totalConversations = 0
  for (const row of profileRows ?? []) {
    const lang = (row.target_language as string) ?? 'unknown'
    usersByLanguage[lang] = (usersByLanguage[lang] ?? 0) + 1
    const ipHash = (row.signup_ip_hash as string | null) ?? null
    profileByUserId.set(row.user_id as string, {
      name: (row.name as string | null) ?? null,
      ipHash,
    })
    if (ipHash) {
      ipHashCounts.set(ipHash, (ipHashCounts.get(ipHash) ?? 0) + 1)
    }
    totalPracticeSeconds += (row.total_practice_seconds as number | undefined) ?? 0
    totalConversations += (row.total_conversations as number | undefined) ?? 0
  }
  const avgSessionSeconds =
    totalConversations > 0 ? Math.round(totalPracticeSeconds / totalConversations) : 0

  // Recent signups: newest 10 from the auth.users list, with their
  // profile name joined in. Email is null for anonymous accounts
  // (Supabase represents anon users with email = '').
  const recentSignups = users
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map((u) => {
      const profile = profileByUserId.get(u.id)
      const ipHash = profile?.ipHash ?? null
      return {
        id: u.id,
        email: u.email && u.email.length > 0 ? u.email : null,
        name: profile?.name ?? null,
        createdAt: u.created_at,
        isAnonymous: Boolean(u.is_anonymous),
        ipHashShort: ipHash ? ipHash.slice(0, 8) : null,
        ipHashCount: ipHash ? (ipHashCounts.get(ipHash) ?? 1) : 0,
      }
    })

  return {
    totalUsers,
    newUsers7d,
    newUsers30d,
    activeUsers7d,
    activeUsers30d,
    activeSubscribers,
    subscribersBySource,
    totalTrialSeconds,
    usersByLanguage,
    totalConversations,
    totalPracticeSeconds,
    avgSessionSeconds,
    cancelledSubs,
    pendingCancellations,
    mrrUsd,
    recentSignups,
  }
}

export async function getSubscriptionDetail(
  userId: string,
  _stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  // Pick the most recently-updated subscription row for this user. If they
  // have both a Stripe and an Apple sub (rare edge case), this returns
  // whichever was most recently activity-modified — usually the one they
  // care about.
  //
  // Also piggyback the per-language mistakes map. The Lessons home wants
  // to render a "What you're working on" card from this data, and we're
  // at the Vercel Hobby 12-function limit — bundling it here avoids a
  // new endpoint. The payload is small (≤5 langs × ≤10 mistakes).
  const [subRow, mistakesRow, usageRow] = await Promise.all([
    supabaseAdmin()
      .from('subscriptions')
      .select('source, product_id, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin()
      .from('profiles')
      .select('recent_mistakes')
      .eq('user_id', userId)
      .maybeSingle(),
    // Trial seconds — piggybacked so the lessons / review / etc.
    // headers can render "Free trial · X:XX left" without firing
    // /api/session (which mints an OpenAI token, expensive).
    supabaseAdmin()
      .from('usage')
      .select('seconds_used')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  const recentMistakes =
    (mistakesRow.data?.recent_mistakes ?? {}) as Record<string, PersistedMistake[]>
  const secondsUsed = (usageRow.data?.seconds_used as number | undefined) ?? 0
  const secondsRemaining = Math.max(0, FREE_TIER_SECONDS - secondsUsed)
  const row = subRow.data
  if (!row) {
    return {
      status: 200,
      body: {
        plan: null,
        status: 'trial',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        recentMistakes,
        secondsRemaining,
      },
    }
  }
  return {
    status: 200,
    body: {
      plan: row.product_id,
      status: row.status,
      source: row.source,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
      recentMistakes,
      secondsRemaining,
    },
  }
}

// -- Cancel subscription (sets cancel_at_period_end on Stripe) ------------

export async function cancelSubscription(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  if (!stripeSecretKey) {
    return { status: 500, body: { error: 'Stripe not configured.' } }
  }
  // Only Stripe subs are cancelable via this path. Apple subscribers are told
  // by the iOS app to manage their subscription in iOS Settings (Apple's rule).
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('external_id, current_period_end')
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .maybeSingle()
  if (!row?.external_id) {
    return { status: 400, body: { error: 'No active Stripe subscription to cancel.' } }
  }
  const form = new URLSearchParams()
  form.set('cancel_at_period_end', 'true')
  const r = await fetch(
    `https://api.stripe.com/v1/subscriptions/${row.external_id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    return {
      status: r.status,
      body: { error: body.error?.message ?? 'Stripe cancellation failed.' },
    }
  }
  return {
    status: 200,
    body: { ok: true, currentPeriodEnd: row.current_period_end },
  }
}

// -- Reactivate subscription (clears cancel_at_period_end on Stripe) ------

export async function reactivateSubscription(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  if (!stripeSecretKey) {
    return { status: 500, body: { error: 'Stripe not configured.' } }
  }
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('external_id, status')
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .maybeSingle()
  if (!row?.external_id) {
    return { status: 400, body: { error: 'No Stripe subscription to reactivate.' } }
  }
  // Only valid while the subscription is still active in Stripe (i.e. they
  // haven't yet hit currentPeriodEnd). After that the subscription is gone
  // and they'd need a fresh checkout instead.
  if (row.status === 'canceled') {
    return {
      status: 400,
      body: {
        error:
          'Your subscription has already ended. Start a new one from the home screen.',
      },
    }
  }
  const form = new URLSearchParams()
  form.set('cancel_at_period_end', 'false')
  const r = await fetch(
    `https://api.stripe.com/v1/subscriptions/${row.external_id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    return {
      status: r.status,
      body: { error: body.error?.message ?? 'Stripe reactivation failed.' },
    }
  }
  return { status: 200, body: { ok: true } }
}

// -- Delete account (immediate Stripe cancel + Supabase user delete) ------

export async function deleteAccount(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  // Cancel any active subscription IMMEDIATELY (no grace period — they're
  // deleting the account, they don't keep access). This is fire-and-forget:
  // even if Stripe call fails we still proceed with the delete so the user
  // doesn't get stuck.
  if (stripeSecretKey) {
    const { data: row } = await supabaseAdmin()
      .from('subscriptions')
      .select('external_id')
      .eq('user_id', userId)
      .eq('source', 'stripe')
      .maybeSingle()
    if (row?.external_id) {
      try {
        await fetch(
          `https://api.stripe.com/v1/subscriptions/${row.external_id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${stripeSecretKey}` },
          },
        )
      } catch {
        // continue with delete regardless
      }
    }
  }
  // Wipe their rows from our tables. Order matters — children first.
  // (Apple IAPs that survive the local row are intentional: Apple controls
  // those subscriptions and we can only mark our copy gone; the user must
  // cancel via iOS Settings.)
  const admin = supabaseAdmin()
  await admin.from('subscriptions').delete().eq('user_id', userId)
  await admin.from('profiles').delete().eq('user_id', userId)
  await admin.from('usage').delete().eq('user_id', userId)
  // Finally delete the Supabase auth user. Once this returns, their JWT
  // becomes invalid and refresh-tokens won't issue new ones.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    return { status: 500, body: { error: error.message } }
  }
  return { status: 200, body: { ok: true } }
}
