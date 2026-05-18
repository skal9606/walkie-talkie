# Research notes: evidence-backed principles for adult voice-AI language tutoring

Source for the rubric used in `scripts/test-conversation-quality.ts`. Compiled from SLA literature scan + practitioner consensus.

## Top 12 evidence-backed principles

**1. Provide comprehensible input slightly above current level (i+1).** (Krashen 1985, *The Input Hypothesis*)
*Observable:* Tutor introduces 1-2 new lexical items per turn, scaffolded by known vocabulary or context — not a flood of unknown words.

**2. Push output beyond comfortable reformulation.** (Swain 1985, 1995, *Output Hypothesis*)
*Observable:* Tutor asks open-ended follow-ups ("por quê?", "me conta mais") that force the learner to stretch syntax, not just answer yes/no.

**3. Negotiate meaning when breakdowns occur.** (Long 1996, *Interaction Hypothesis*; Mackey 1999)
*Observable:* When learner says something ambiguous, tutor confirms ("você quis dizer X ou Y?") rather than guessing or moving on.

**4. Prefer recasts over explicit correction for fluency-oriented sessions.** (Lyster & Ranta 1997; Loewen & Philp 2006)
*Observable:* Tutor repeats the learner's utterance correctly inside a natural response ("Ah, você FOI ao mercado ontem? Legal!") instead of stopping to lecture.

**5. Use task-based interaction with real outcomes, not drills.** (Long 2015, *TBLT*; Ellis 2003)
*Observable:* Session has a goal — plan a trip, order food, debate a topic — and language emerges from solving it.

**6. Operate in the Zone of Proximal Development with calibrated scaffolding.** (Vygotsky 1978; Aljaafreh & Lantolf 1994)
*Observable:* Tutor offers help in graduated steps (pause → prompt → partial word → translation) only when learner stalls.

**7. Limit correction frequency to preserve motivation.** (MacIntyre et al. 1998; Truscott 1996)
*Observable:* Tutor corrects roughly 1 in 3-4 errors, prioritizing errors that block meaning.

**8. Strategic, sparse L1 use for abstract grammar and affect.** (Cook 2001; Macaro 2005)
*Observable:* Tutor stays in target for 90%+ at intermediate+ but switches to native briefly to unblock a stuck concept.

**9. Space vocabulary retrieval across sessions.** (Bahrick 1979; Cepeda et al. 2008)
*Observable:* Tutor reintroduces a word from 2 sessions ago in a new context — not drilling 10 reps of a new word in one sitting.

**10. Maximize learner talk-time (target 65-70%).** (Walsh 2002; italki tutor consensus)
*Observable:* Tutor's turns are shorter than the learner's on average; uses silence/wait-time instead of filling gaps.

**11. Personalize content to learner's life, goals, and prior turns.** (Dörnyei 2009, *L2 Motivational Self System*)
*Observable:* Tutor references something learner said earlier ("Last week you mentioned your sister in São Paulo — did you call her?").

**12. Provide noticing prompts on form after recasts.** (Schmidt 1990, *Noticing Hypothesis*)
*Observable:* After a recast, tutor occasionally pauses and asks "ouviu a diferença?" — drawing attention to form.

## What skilled human tutors do that AI typically doesn't

- Remember the learner across sessions — name, job, last week's vacation, the grammar point they keep missing (italki top-rated tutor pattern).
- Read affective state — back off when frustrated, push when energized; AI plows ahead regardless of sighs or hesitation.
- Strategic silence and wait-time — humans tolerate 5+ second pauses; voice AI typically interrupts or fills.
- Pick the *one* error worth addressing out of five in an utterance; AI tends toward either ignoring all or addressing too many.
- Negotiate session goals — "what do you want to work on today?" — vs AI following a fixed script.
- Use prosody and humor to mark corrections as gentle; AI corrections often read as flat or clinical.
- Cultural texture — a Carioca tutor brings slang, regionalisms, and current events.

## Dangerous patterns to avoid

- **Over-correction cascade** — correcting every error destroys willingness to communicate (MacIntyre 1998).
- **Tutor monologue** — AI explaining grammar for 30 seconds while learner waits silently inverts the learning ratio.
- **Premature topic switching** — abandoning a topic before learner has produced extended output on it kills the pushed-output benefit.
- **L2-only fundamentalism for absolute beginners** — leaves adult learners cognitively overloaded.
- **Generic praise inflation** ("Muito bem!" after every utterance) — lowers signal-to-noise on real corrections.
- **Drill-mode disguised as conversation** — "Now use the verb FALAR in a sentence" is not communicative.
- **Ignoring learner-initiated repair requests** — when learner says "how do you say X?", AI must answer cleanly.
- **Correcting meaning-clear errors mid-flow** during fluency tasks — violates the form/fluency separation (Skehan 1998).
- **Fixed difficulty** — not adapting i+1 upward leads to plateau; not adapting downward triggers shutdown.
- **Voice-AI-specific: aggressive barge-in** — cutting off learner mid-thought (Speak / ChatGPT-voice complaint) destroys the safe space to formulate.

## Sources

Krashen 1985; Swain 1985, 1995; Long 1996, 2015; Lyster & Ranta 1997; Mackey 1999; Schmidt 1990; Vygotsky 1978; Aljaafreh & Lantolf 1994; MacIntyre et al. 1998; Cepeda et al. 2008; Macaro 2005; Dörnyei 2009; Ellis 2003; Walsh 2002; Skehan 1998.
