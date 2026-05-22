# Conversationality eval suite

Automated tests that exercise the production tutor prompts against simulated
learners, then score the resulting conversations with an LLM judge.

## What it tests

10 dimensions across 7 automated categories, plus a manual checklist for voice
edge cases (interruptions, partial utterances, long pauses) that don't reliably
test in text mode.

## How it runs

The tutor under test is called via OpenAI Chat Completions with the **exact same
prompt strings** the production app builds (imported from
`src/lib/tutors/<lang>/...`). This means results reflect the same prompt
engineering that ships to real users; the only difference from production is
audio is off (text-mode), which cuts cost ~50×.

Simulated learners are gpt-4o-mini playing personas (struggling beginner, fluent
intermediate, code-switcher, etc.). The judge is gpt-4o scoring transcripts on
category-specific rubrics.

## Usage

```bash
# Smoke test (~$0.50, 4 conversations)
npm run eval:smoke

# Full suite (~$7, ~45 conversations)
npm run eval

# Budget cap (stops early if cumulative spend would exceed)
EVAL_BUDGET=3 npm run eval

# Specific category
npm run eval -- --category=level-calibration
```

Set `OPENAI_API_KEY` in `.env.local` before running.

Results land under `evals/results/<timestamp>/`:
- `transcripts/*.json` — full conversation logs
- `scores.csv` — one row per test, scored on rubric dimensions
- `summary.md` — human-readable report
- `cost.json` — per-model spend breakdown

## Manual: voice edge cases

See `evals/manual-voice-checklist.md`. ~10 minutes of in-app testing covers
interruptions, silence handling, partial utterances, and filler-word behavior —
all of which require a real WebRTC client + ear to evaluate reliably.
