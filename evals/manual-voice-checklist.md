# Manual voice edge-case checklist

The automated eval suite tests prompt behavior in text mode. The items below
need a human ear to evaluate reliably — they're about *timing*, *interruption
handling*, and *natural-ness of pauses*, which the model's text output can't
reveal.

Time required: ~10 minutes per language. Do at least pt-BR before any
significant prompt change ships.

## Setup

1. Open walkietalkie.so (or the iOS app) in a quiet room with headphones.
2. Sign in as a fresh test account (or use incognito).
3. Pick the language to test. Start a free conversation.

## Tests

### 1. Mid-sentence interruption
- Wait for Natalia/tutor to start a sentence.
- Interrupt her **after the third word** by speaking over her.
- **Pass** if: she stops within ~1 second, listens, then responds to what you said.
- **Fail** if: she keeps talking over you, ignores your interruption, or freezes.

### 2. Long silence after her question
- Let the tutor ask you a question.
- Stay completely silent for **8 seconds**.
- **Pass** if: she gracefully nudges ("Still there?", "Want me to repeat?", or rephrases the question simpler).
- **Fail** if: she sits in awkward silence forever, OR she immediately re-asks 1 second after the question (too eager).

### 3. Mid-word cutoff
- Start a reply, say "I think I want to learn... uhh..." and **stop mid-sentence** for 4 seconds.
- **Pass** if: she waits a beat, then gently prompts ("...what were you going to say?", "Take your time").
- **Fail** if: she jumps in immediately after "uhh" OR she answers as if your fragment was complete.

### 4. Filler words
- Use lots of "ummm", "uhhh", "like, you know..." between actual content.
- **Pass** if: she ignores the fillers and responds to the substantive part.
- **Fail** if: she responds to each "ummm" as if it were a real turn.

### 5. Repeated attempt
- Try to say a target-language word, get it wrong, immediately retry: "casa... no... uhh... casa... casa!"
- **Pass** if: she affirms the final attempt and moves on.
- **Fail** if: she corrects you on the first wrong attempt before you finished.

### 6. Background noise / cough
- Cough loudly into the mic, then continue your sentence.
- **Pass** if: she ignores the cough and processes your full sentence.
- **Fail** if: the cough triggered a response.

### 7. Latency check (tap-to-first-audio)
- End the previous conversation cleanly.
- Tap "Start conversation" and **count** until you hear Natalia speak.
- **Pass** if: < 3 seconds cold-start, < 1 second on a pre-warmed (2nd+ time today).
- **Fail** if: > 5 seconds.

## Reporting

Run the seven tests above on pt-BR first. If anything fails, note:
- Which test
- What level you're declared as (first-timer / intermediate / etc.)
- What the tutor did (one sentence)

Save notes under `evals/results/<date>-voice-manual.md` for future regression checks.
