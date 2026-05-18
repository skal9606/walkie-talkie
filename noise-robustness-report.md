# Noise-robustness report
Generated: 2026-05-18T06:25:55.263Z

Tests Natalia's response to 8 common voice-pipeline noise artifacts (silence, coughs, Whisper hallucinations, tutor-echo, etc.). A robust tutor pauses / asks for repeat rather than treating noise as meaningful speech.
## Rollup

| Noise case | Score | Verdict |
|---|---|---|
| empty | 4/5 | robust |
| single-uh | 5/5 | robust |
| cough | 4/5 | robust |
| random-okay | 2/5 | failed |
| tv-hallucination | 5/5 | robust |
| tutor-echo | 5/5 | robust |
| pure-punctuation | 4/5 | robust |
| cross-language-hallucination | 3/5 | guessing |


## empty — score 4/5 (robust)

**Noise:** Pure silence — Whisper sent an empty string.
**Whisper sent:** `(empty string)`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Tudo bem por aí?

**Judge:** The tutor asked for clarification in a gentle way but could have been slightly more explicit about the lack of input.

## single-uh — score 5/5 (robust)

**Noise:** User cleared their throat — Whisper transcribed "uh".
**Whisper sent:** `uh`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Hmm, não ouvi direito — pode dizer de novo?

**Judge:** The tutor correctly recognized the noise and asked the learner to repeat without fabricating context.

## cough — score 4/5 (robust)

**Noise:** Cough fragment transcribed.
**Whisper sent:** `ahem`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Hmm, não ouvi direito — pode dizer de novo?

**Judge:** The tutor asked for clarification in a slightly clumsy way but did not treat the noise as a meaningful contribution.

## random-okay — score 2/5 (failed)

**Noise:** Background TV transcribed as "okay okay yes".
**Whisper sent:** `okay okay yes`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Entendi! Tudo bem, me conta — o que te trouxe pro português?

**Judge:** The tutor treated the noise as meaningful and built a response on it, rather than asking for clarification.

## tv-hallucination — score 5/5 (robust)

**Noise:** Background news transcribed.
**Whisper sent:** `and that is the news at ten thirty please subscribe`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Hmm, não captei — pode repetir?

**Judge:** The tutor correctly recognized the noise as off-context and asked the learner to repeat, without fabricating a response.

## tutor-echo — score 5/5 (robust)

**Noise:** Mic picked up Natalia's OWN opener, Whisper transcribed it as user input.
**Whisper sent:** `__TUTOR_OPENER__`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Ah, parece que você ouviu minha voz! Como foi seu dia, Sam?

**Judge:** The tutor recognized the noise as an echo of its own opener and gently re-anchored the conversation without fabricating context.

## pure-punctuation — score 4/5 (robust)

**Noise:** Audio-detection artifact — Whisper sent only punctuation.
**Whisper sent:** `...`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Hmm, não ouvi direito — pode dizer de novo?

**Judge:** The tutor asked for clarification in a slightly clumsy way but did not fabricate context.

## cross-language-hallucination — score 3/5 (guessing)

**Noise:** Whisper hallucinated Korean from background noise.
**Whisper sent:** `안녕하세요 잘 부탁드립니다`

**Tutor opener:** Oi Sam, eu sou a Natalia! Como foi seu dia?
**Tutor response to noise:** Oi Sam, tudo bem? Parece que você falou coreano aí! Vamos focar no português, certo? Como foi seu dia?

**Judge:** The tutor partially recognized the noise as Korean but still attempted to engage with it instead of asking for a repeat or clarification.
