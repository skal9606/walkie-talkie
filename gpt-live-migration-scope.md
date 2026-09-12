# GPT-Live migration scope (2026-09-12)

Scope for moving the tutor from the OpenAI Realtime API (`gpt-realtime-2`) to the GPT-Live API (`gpt-live-1`).
Everything below was verified against the production OpenAI key with a Node/werift WebRTC probe, not just read from docs.
Production is unaffected: the one-line model swap (b9e6bdd) was reverted (9471938) because Realtime rejects `gpt-live-1`.

## Verified facts about GPT-Live

- Endpoint: `POST https://api.openai.com/v1/live/sessions` with JSON `{ transport: { type: 'webrtc', sdp }, session: {...} }`.
  Returns `{ session: { id }, transport: { type: 'webrtc', sdp: <answer> } }`. Only the `webrtc` transport is accepted via HTTP;
  `GET` on the same path requires a WebSocket upgrade (server-side audio only).
- No ephemeral / client-secret path. A Realtime `ek_` key is rejected. The server must broker the SDP offer.
- Session config accepts exactly: `model`, `instructions` (≤16,384 tokens, immutable), `input[]` (prior messages, roles
  developer/user/assistant, content `input_text`), `audio.output.voice`, `delegation` (`{type:'client'}` default, or
  `{type:'responses', responses:{model, instructions, tools, tool_choice, reasoning, max_output_tokens, text}}`), `store`.
  Every Realtime field (`type`, `turn_detection`, `transcription`, `output_modalities`, `tools`, `temperature`, ...) is rejected.
- Voices accepted on this account: coral, shimmer, marin, cedar, sage, ballad, alloy, echo, verse, ash, plus new pt-BR voices **bossa** (F) and **tempo** (M).
- Data channel label `oai-events`. Client events: `session.update` (only `delegation.responses.*` mutable), `session.input_audio.mute`/`unmute`,
  `session.instructions.append` / `session.thinking.append` / `session.commentary.append` (`{delegation_id: null|id, content: string}`, ≤500 tokens),
  `response.item.create` + `response.create` (Responses delegation only), `session.close`.
- Server events observed: `session.started`, `session.updated`, `session.input_transcript.delta` and `session.output_transcript.delta`
  (`{delta, start_ms, end_ms}`, no item ids, no "done" events), `session.usage.updated` (`usage.seconds` cumulative every 15s,
  `context_window.usage_ratio`), `session.input_audio.muted/unmuted`, `session.closed` (`reason`, `usage.seconds`), `error`.
  There is no turn-boundary, response.created/done, or speech_started event.
- Behaviour observed: tutor greets on connect with no trigger; interruption mid-sentence works (transcripts overlap ~2s, model yields and answers).
- Pricing: $0.05/min billed per second, 15s charged at session creation. Roughly a wash vs Realtime token billing (~$0.45–0.60 per 10-min session today).
- Natalia's longest assembled prompt ≈ 11,200 tokens (limit 16,384).

## Code impact

Rewrite: `lib/api-handlers.ts` mintSessionToken → SDP broker; `api/session.ts` → POST with offer; `src/lib/realtime.ts` → new live client
(drop mic gating, unmute poller, VAD session.updates, watchdog, opener trigger; keep the analyser for the speaking indicator);
`src/pages/Tutor.tsx` event switch → transcript-delta segmenter behind a delegate-style interface; hints → server route using gpt-4o-mini;
iOS `RealtimeClient.swift` same treatment (SessionViewModel untouched via delegate protocol; prewarmer must change since sessions bill from creation).
Untouched: prompts/scenarios/lessons, gating/heartbeat, Stripe, Supabase, translate/review/TTS, evals, CSP (`api.openai.com` already allowed).

## Risks

Echo with open mic on speakerphone (high) · pt-BR quality untested (high) · bubble segmentation heuristic (medium) ·
instructions immutable + ~5k tokens headroom (medium) · extra hop on session start (low) · undocumented session max length (low) · API is 2 days old (low).

## Plan

0. Listening spike: hidden web page with the real prompt, compare coral vs bossa. Go/no-go. (1 session)
1. Web client behind a feature flag; Realtime path kept. Tests for segmenter + hint route. (2–3 sessions)
2. Vercel preview + manual voice checklist on laptop/AirPods/phone; enable for Samit, then all web users. (1 session + a week of use)
3. iOS client rewrite + TestFlight. (2 sessions)
4. Cleanup: remove Realtime path, vadEagerness plumbing, debug logging, token-envelope shim. (<1 session)

Decisions needed: voice (coral vs bossa), web-first vs simultaneous iOS, rollback window (suggest 1 month).

Probe scripts used for verification live in the session scratchpad (`liveprobe/probe*.js`, werift + opusscript); re-creatable in ~20 minutes.
