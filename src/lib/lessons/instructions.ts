// Lesson-scene prompt block. Mirror of TutorPrompt.lessonSceneBlock in
// the iOS app — same structure so the tutor behaves identically across
// platforms when running the same lesson.

import { lessonPhrases } from './catalog'
import type { Lesson } from './types'

/**
 * Build the LESSON SCENE block for a guided lesson. Returned text
 * should be appended at the END of the system instructions (highest
 * attention) so it overrides whatever scenario / first-meeting arc the
 * base tutor template established.
 *
 * If the lesson has no authored phrases for the language yet, returns
 * an empty string so the caller can fall back to free conversation
 * rather than ship a prompt with an empty target-phrase list.
 */
export function buildLessonInstructions(
  lesson: Lesson,
  languageCode: string,
  proficiency: string | undefined,
): string {
  const phrases = lessonPhrases(lesson, languageCode)
  if (phrases.length === 0) return ''

  const phraseLines = phrases
    .map((p) => `- "${p.target}" — ${p.native}`)
    .join('\n')
  const firstTarget = phrases[0]?.target ?? '…'
  const nativeScaffold =
    proficiency === 'complete-beginner' || proficiency === 'first_timer'
      ? 'Speak ~30% target language, ~70% native language scaffolding. The learner needs hand-holds.'
      : 'Speak ~75% target language, ~25% native language scaffolding only when they\'re visibly stuck.'

  return `LESSON SCENE (PRIMARY TASK — OVERRIDES every SCENARIO branch above)

The learner just tapped this lesson and is ready to start. You are running THIS lesson and only this lesson — you are NOT making first-meeting small talk, NOT asking what they want to talk about, NOT opening with your tutor introduction.

Title: ${lesson.title}
Scene: ${lesson.scene}

Target phrases the learner should produce in this scene:
${phraseLines}

LESSON ARC (~8 min target):
1. OPEN IN SCENE on turn 1. You ARE the character in the scene (barista, friend, taxi driver, family member — whatever the scene calls for). Greet them in-character in the target language. NO meta opener. NO "Hi, I'm your tutor."
2. Prompt naturally for the FIRST target phrase. If they produce it, react warmly in-character and move on. If they don't, gently model it ("Want to say: '${firstTarget}'?") then continue.
3. Work through the remaining target phrases the same way. Don't checklist them — let the scene flow. Order them naturally; some scenes call for phrase 3 before phrase 1.
4. After all phrases have been attempted at least once, wrap up the scene naturally in-character. Don't break character mid-lesson.
5. End with a quick out-of-character congrats line in the learner's native language ("Nice work — you nailed ${firstTarget} on the first try!") and signal the lesson is done.

SCENE DISCIPLINE
- STAY IN SCENE. You are the character, not a tutor explaining grammar.
- If the learner deviates (asks about culture, music, weather), give a ONE-line in-character reply and steer back to the scene.
- ${nativeScaffold}
- Don't enumerate the phrase list to them. They already saw it on the preview screen.
- If they nail all phrases in under 5 min, expand the scene with a natural follow-up. Don't end early.`
}

/** Shorter top-of-prompt cue that tells the model where to look for the
 *  lesson scene. Mirror of the SCENARIO line in iOS learnerContext. */
export const LESSON_SCENARIO_OVERRIDE =
  'SCENARIO: Guided lesson. IGNORE all FIRST-MEETING ARC / LESSON ARC / returning-learner instructions in the template above. Follow ONLY the LESSON SCENE block at the bottom of this prompt.'
