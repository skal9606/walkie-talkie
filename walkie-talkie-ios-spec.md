# Walkie Talkie iOS Spec (v0.5)

Native iOS companion to walkietalkie.so — a hands-free voice-AI Portuguese tutor (Brazilian, with Natalia). v0.5 ships intermediate-tier-only in ~5–7 days of focused work; beginner tier and broader features land in v1.1.

## Problem

Adult language learners who already know "some" Portuguese hit a wall: Duolingo gives them flashcards but no conversational pressure; human tutors cost $30–80/hour and demand calendar time. They want to *speak more freely with confidence* — to practice in the car, on a walk, or alone at home — without booking a tutor or feeling judged.

Today they cope with: Duolingo (visually-driven, doesn't force speaking), iTalki/Preply (expensive, scheduled), language meetups (rare, intimidating), or simply giving up and staying stuck at intermediate.

## Users

**Primary (v0.5 — David, tiebreaker persona):**
- 41, Toronto, English speaker learning Italian/Portuguese.
- Already knows ~30 verbs, ~50 nouns. Can do the basics. Stuck at "tourist Portuguese" and wants conversational confidence.
- Eager to improve fluency. Will use the app primarily in audio mode — walking, cooking, commuting. Reads transcript only when stuck.
- Technically comfortable; iPhone-native.

**Secondary (deferred to v1.1 — Maya):**
- 28, NYC, English→Portuguese beginner.
- Duolingo escapee. Realizes she needs to be forced to *speak*, not just look at flashcards.
- Will rely heavily on visual scaffolding (cards, EN-pinned transcript).
- Cut from v0.5 because the beginner card-stack UI is ~40% of build effort.

## Scope

**In v0.5:**
- iPhone-only (iOS 17+), portrait orientation.
- Single language: Portuguese (Brazilian) with one tutor: Natalia.
- Intermediate-tier conversation only. Chat-bubble UI (ISSEN-style).
- 5-step onboarding: welcome → name → native language → proficiency → goal → mic permission → start.
- 10-minute one-time free trial per device. Verbal "1 minute left, let's wrap up" warning from Natalia at 9:00.
- End-of-session recap: duration + replay-conversation CTA.
- Post-trial soft paywall: email capture (waitlist for paid plan) + read-only mode (browse past transcripts).
- TTS replay button on every Natalia turn.
- Audio waveform visualization during user speech.
- VAD-only interruption (no tap-to-interrupt, no push-to-talk).
- Always-on mic with mute as emergency override.
- AVAudioSession configured for Bluetooth/AirPods/CarPlay/lock-screen audio.
- Sentry crash reporting + analytics matching walkietalkie.so's existing tool.
- Per-device daily session cap (3/day) + one-trial-per-device-fingerprint as anti-abuse.

**Out of v0.5 (deferred to v1.1+):**
- Beginner tier + card-stack UI + EN-pinned transcript.
- Vocabulary view persisting saved cards across sessions.
- Practice hub with multiple modes (Grammar, Scenarios, Repeat-after-me, Flashcards, Translations).
- Streak counter.
- App Attest device attestation.
- Real StoreKit 2 IAP / paid subscriptions.
- Subscription state sync between Stripe (web) and Apple (iOS).
- Login / Apple Sign-In / cross-device sync.
- Other tutors (María/ES, Sofia/IT, Camille/FR, Lena/DE).
- "Find my level" placement test.
- Topic auto-extraction in end-of-session recap.
- Daily reminders / push notifications.
- Aspirational "what you'll achieve in 3 months" onboarding screen.
- iPad / Android.

**MVP slice:**
A user opens the app, completes 5-step onboarding, grants mic permission, and has a 10-minute conversation in Portuguese with Natalia over WebRTC. At trial end, Natalia wraps up verbally, the app shows a recap + email capture, and the user can replay the transcript in read-only mode.

## Inputs / data

- **Tutor system prompt + instructions:** bundled in the iOS binary as a Swift constant (or local JSON), copied from walkietalkie.so. Migration to a fetched `/api/content/natalia` endpoint deferred to v1.1.
- **User-provided onboarding inputs:** name, native language, self-reported proficiency (First timer / Basic / Intermediate / Advanced — UI rendered with bar-graph icons à la Duolingo), goal (multi-select). Stored locally in SwiftData; goal flows into Natalia's per-session prompt to steer conversation topics.
- **Session audio:** captured via `AVAudioEngine` + `AVAudioSession` (.playAndRecord, .voiceChat mode). Streamed bidirectionally over WebRTC to OpenAI Realtime API.
- **Transcripts:** received from OpenAI Realtime as text deltas alongside audio. Persisted to SwiftData per session.
- **Volume:** v0.5 is small. Single tutor, single user per device. Anonymous, local-only state.

## Core workflow

1. **Onboarding** (5 questions + permission). Welcome screen → name (flows into Natalia's prompt) → native language picker (English-only options at v0.5) → proficiency picker (4 levels) → goal multi-select (steers session topic) → mic permission prompt → "Start your free 10-minute conversation."
2. **Pre-session.** Natalia briefly greets the user by name in Portuguese, references their stated goal, and opens with a question.
3. **In-session.** Chat-bubble UI: Natalia on left in PT-BR, user on right in PT-BR. Each Natalia bubble has a TTS replay button. Long-press a Natalia bubble for an EN translation. Thin audio-waveform strip pinned above the bottom bar shows live levels. Bottom bar: end-session (red, prominent center) + mute mic toggle. Trial countdown pill top-right ("8:23 left in trial"). VAD handles all turn-taking — no buttons.
4. **Trial wrap warning.** At 9:00 elapsed, Natalia gives a verbal "we have about a minute left, let's wrap up" cue and steers toward a recap.
5. **End-of-session screen.** "Session complete · 12:43" + "Replay conversation" CTA + "Done."
6. **Trial-end paywall (one-time, only after the user's first 10-minute session).** Same recap, plus a soft card slides in: "Your free trial's done — paid plan launching soon. Drop your email and we'll let you in early." + "Keep practicing in read-only mode" link → unlocks transcript replay + (eventually) saved-vocab browsing.
7. **Returning user (post-trial, pre-paid).** Home screen shows email-capture state + "Read past conversations" CTA. No new sessions until paid plan launches (v1.1).

## Outputs

- **Live transcript** during session (in-app, bidirectional bubbles).
- **Persisted session record** in SwiftData per session: ISO timestamp, duration, full transcript, tutor ID, tier.
- **Replay view:** read-only scrollable transcript with TTS replay per tutor turn.
- **Email captured to waitlist:** posted to a 3rd-party form provider (Loops or ConvertKit) directly from the app.
- All user data is local to the device. No cross-device sync, no cloud backup at v0.5.

## Tech choices

- **Language:** Swift 5.9+
- **Framework:** SwiftUI (UIKit only as needed for AVAudioSession bridges)
- **Minimum deployment target:** iOS 17.0
- **Audio:** AVAudioEngine + AVAudioSession (.playAndRecord, .voiceChat), Bluetooth/AirPods/CarPlay/lock-screen audio handling
- **Realtime:** OpenAI Realtime API over WebRTC. Google's `WebRTC` Swift framework as the WebRTC client (LiveKit Swift SDK as a backup if direct WebRTC integration is too rough).
- **Storage:** SwiftData (transcripts, onboarding state, session history). UserDefaults for tiny flags (onboarding-completed, trial-used).
- **Auth:** none at v0.5. Anonymous device-fingerprint identity only.
- **Crash reporting:** Sentry (free tier).
- **Analytics:** match walkietalkie.so's existing tool (likely PostHog).
- **Email capture:** Loops or ConvertKit, direct API call.
- **Distribution:** App Store. Standalone bundle ID, category Education, age rating 4+, ITSAppUsesNonExemptEncryption=NO.

## Integrations

- **OpenAI Realtime API.** Audio I/O over WebRTC. Token minted by walkietalkie.so's existing token endpoint (reused — confirms callable from a non-cookie iOS client).
- **walkietalkie.so token endpoint.** Single dependency on the web side. iOS calls it with a device ID header to mint short-lived ephemeral tokens per session. (v1.1: extend this endpoint to also serve `/api/content/natalia`.)
- **Loops or ConvertKit.** Waitlist email capture. Single endpoint, anonymous POST.
- **Sentry.** Crash reporting + non-fatal error logging.
- **PostHog (or web's analytics tool).** Onboarding funnel events, trial-completion event, paywall-impression event, email-capture event.
- **Apple App Store Connect.** TestFlight + App Store distribution.

## Constraints

- **Timeline:** ~5–7 days of focused solo work + 1–3 day Apple review window. Day 1–2: project setup, onboarding, mic permission, scaffold. Day 3–4: WebRTC + OpenAI Realtime integration, transcript rendering. Day 5: trial timer, end-of-session screen, soft paywall + email capture. Day 6: read-only mode, polish, TestFlight build. Day 7+: App Store submission.
- **Team:** solo (Samit + Claude). No iOS engineer or designer.
- **Budget:** soft monthly OpenAI cap of $500/mo for first 2 months. Hard daily alert at $50/day. 10-min sessions cost ~$1–3 each in OpenAI charges, so 1000 free trials ≈ $1000–3000.
- **Apple App Store review risk (Guideline 4.2 — minimum functionality):** mitigated by post-trial read-only mode (transcripts remain browsable after the wall). Guideline 3.2.1 (paid app gating) is moot since v0.5 has no IAP.

## Success metric

**Trial completion rate ≥ 50%** — of users who finish onboarding + grant mic permission, at least half use ≥ 8 of the 10 trial minutes. Why this signal: it's the single fastest read on whether the conversational experience is actually working. If it's below 30%, the product isn't talking to the right people or the conversational quality isn't holding up. Above 50% is permission to push into v1.1 (beginner tier + paid IAP).

Secondary instrumentation (track but don't gate on): email-capture conversion at the paywall, read-only-mode usage post-paywall, onboarding drop-off by step, session-restart rate after trial.

## Open questions

- **Token endpoint reusability — confirm.** Does walkietalkie.so's existing token-mint endpoint accept a device-ID header (or anonymous request) from a non-cookie iOS client? If it requires a session cookie, v0.5 needs a small new serverless endpoint instead.
- **Web content portability for v1.1.** Is Natalia's system prompt + instructions cleanly separable into a JSON-able shape, or baked into web runtime code? Determines effort to migrate from bundled (v0.5) to fetched (v1.1).
- **Analytics tool.** Confirm what walkietalkie.so currently uses; lock the same on iOS for parity.
- **TTS replay source.** Is replay served from cached audio captured during the original WebRTC session, or re-synthesized via OpenAI's TTS endpoint? Cached is cheaper and lower latency; needs a SwiftData blob field for audio chunks.
- **iOS-specific Natalia prompt tweaks.** Does the system prompt need tweaks for the audio-first context (e.g., stronger conversational scaffolding when the user can't see the transcript)? Worth A/B testing post-launch.
- **App Store rejection risk on first submission.** Plan for: a rejection cycle is possible. Have a fallback message ready ("more features coming") and a TestFlight beta running in parallel.
- **Per-device fingerprint robustness.** `identifierForVendor` resets on app reinstall, so trial limits leak. Acceptable at v0.5; revisit with App Attest in v1.1.
