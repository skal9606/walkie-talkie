// Lesson metadata + units catalogue. Mirror of LessonCatalog.swift.
// Phrase content per language lives in ./content/<lang>.ts and is
// resolved via phrasesFor() / lessonPhrases().

import type { Lesson, LessonLevel, LessonPhrase, LessonUnit } from './types'
import { portuguesePhrases } from './content/pt-BR'
import { spanishPhrases } from './content/es'
import { italianPhrases } from './content/it'
import { frenchPhrases } from './content/fr-FR'
import { germanPhrases } from './content/de-DE'

/** Map of web LanguageCode → phrase content. Uses the web codes
 *  (es-MX, pt-BR, …) since callers pass tutor.language. iOS uses raw
 *  codes that mostly match — 'es' on iOS = 'es-MX' on web — bridged
 *  if/when we sync progress server-side. */
const CONTENT_BY_LANG: Record<string, Record<string, LessonPhrase[]>> = {
  'pt-BR': portuguesePhrases,
  'es-MX': spanishPhrases,
  'it-IT': italianPhrases,
  'fr-FR': frenchPhrases,
  'de-DE': germanPhrases,
}

/** Get the 5 target phrases for a lesson in a specific language.
 *  Returns [] when content for the language hasn't been authored yet —
 *  callers should surface this case rather than crash. */
export function lessonPhrases(lesson: Lesson, languageCode: string): LessonPhrase[] {
  return CONTENT_BY_LANG[languageCode]?.[lesson.id] ?? []
}

export function unitsForLevel(level: LessonLevel): LessonUnit[] {
  switch (level) {
    case 'first_timer':
      return FIRST_TIMER
    case 'basic':
      return BASIC
    case 'intermediate':
      return INTERMEDIATE
    case 'advanced':
      return ADVANCED
  }
}

export function lessonById(id: string): Lesson | undefined {
  for (const level of ['first_timer', 'basic', 'intermediate', 'advanced'] as LessonLevel[]) {
    for (const unit of unitsForLevel(level)) {
      const found = unit.lessons.find((l) => l.id === id)
      if (found) return found
    }
  }
  return undefined
}

// MARK: - First Timer (A1)

const FIRST_TIMER: LessonUnit[] = [
  {
    id: 'ft-1',
    title: 'Unit 1: Getting Started',
    lessons: [
      { id: 'ft-1-1', emoji: '👋', title: 'Say hello',
        summary: 'Learn 5 phrases · 5 min',
        scene: "You bump into your tutor at a café. Greet them warmly and ask how they're doing." },
      { id: 'ft-1-2', emoji: '🙋', title: 'Introduce yourself',
        summary: 'Learn 5 phrases · 7 min',
        scene: "Your tutor just introduced themselves. Now it's your turn — tell them your name, where you're from, and ask about them." },
      { id: 'ft-1-3', emoji: '🗺️', title: "Say where you're from",
        summary: 'Learn 5 phrases · 6 min',
        scene: "Your tutor asks where you live. Describe your city and ask if they've ever visited." },
    ],
  },
  {
    id: 'ft-2',
    title: 'Unit 2: Daily Survival',
    lessons: [
      { id: 'ft-2-1', emoji: '☕', title: 'Order a coffee',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'You walk into a local café. Order a coffee with milk to go, then pay.' },
      { id: 'ft-2-2', emoji: '💸', title: 'Ask "how much?"',
        summary: 'Learn 5 phrases · 6 min',
        scene: "You're at a market stall. Ask how much something costs, react to the price, and pay." },
      { id: 'ft-2-3', emoji: '🙏', title: 'Thanks and goodbye',
        summary: 'Learn 5 phrases · 5 min',
        scene: "You're wrapping up a chat with your tutor. Thank them warmly and say goodbye." },
    ],
  },
  {
    id: 'ft-3',
    title: 'Unit 3: Getting Around',
    lessons: [
      { id: 'ft-3-1', emoji: '🚕', title: 'Tell a taxi where to go',
        summary: 'Learn 5 phrases · 7 min',
        scene: 'You hop in a taxi. Tell the driver where to go, then ask the price when you arrive.' },
      { id: 'ft-3-2', emoji: '🧭', title: 'Ask for directions',
        summary: 'Learn 5 phrases · 7 min',
        scene: "You're lost in the city. Stop a friendly local and ask the way to the metro station." },
      { id: 'ft-3-3', emoji: '🤔', title: 'Say "I don\'t understand"',
        summary: 'Learn 5 phrases · 6 min',
        scene: 'A friendly stranger is talking fast. Ask them to slow down, repeat, or translate a word.' },
    ],
  },
  {
    id: 'ft-4',
    title: 'Unit 4: Connecting',
    lessons: [
      { id: 'ft-4-1', emoji: '👨‍👩‍👧', title: "Meet a friend's family",
        summary: 'Learn 5 phrases · 8 min',
        scene: 'Your tutor invites you to dinner with their parents. Greet them, compliment the home, and offer to help.' },
      { id: 'ft-4-2', emoji: '💬', title: 'Make small talk',
        summary: 'Learn 5 phrases · 7 min',
        scene: "You're at a casual party. Strike up a quick chat with someone new, then politely move on." },
      { id: 'ft-4-3', emoji: '💼', title: 'Say what you do for work',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'Your tutor asks what you do for work. Describe your job briefly and ask about theirs.' },
    ],
  },
]

// MARK: - Basic (A2)

const BASIC: LessonUnit[] = [
  {
    id: 'b-1',
    title: 'Unit 1: Shopping',
    lessons: [
      { id: 'b-1-1', emoji: '🎁', title: 'Buy a souvenir for a friend',
        summary: 'Learn 5 phrases · 8 min',
        scene: "You're in a souvenir shop. Ask for help picking a gift for a friend back home." },
      { id: 'b-1-2', emoji: '👕', title: 'Shop for clothes',
        summary: 'Learn 5 phrases · 8 min',
        scene: "You're trying on clothes. Ask for a different size, react to how it fits, and decide whether to buy." },
      { id: 'b-1-3', emoji: '🥭', title: 'Buy produce at the market',
        summary: 'Learn 5 phrases · 7 min',
        scene: "You're at a street market. Buy fruit and vegetables for the week from a friendly vendor." },
    ],
  },
  {
    id: 'b-2',
    title: 'Unit 2: Personal Interests',
    lessons: [
      { id: 'b-2-1', emoji: '🍝', title: 'Talk about food preferences',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'Your tutor is planning dinner. Tell them what you love, what you avoid, and ask about their favorites.' },
      { id: 'b-2-2', emoji: '🎬', title: 'Talk about your favorite movie',
        summary: 'Learn 5 phrases · 9 min',
        scene: 'You and your tutor are debating what to watch tonight. Pitch your favorite movie.' },
      { id: 'b-2-3', emoji: '🎨', title: 'Talk about your hobbies',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'Coffee with your tutor. Tell them about a hobby you love and ask what they do to unwind.' },
    ],
  },
  {
    id: 'b-3',
    title: 'Unit 3: Family',
    lessons: [
      { id: 'b-3-1', emoji: '🏡', title: 'Talk about where your family lives',
        summary: 'Learn 5 phrases · 7 min',
        scene: 'Your tutor asks about your family. Describe where they live and how often you visit.' },
      { id: 'b-3-2', emoji: '👶', title: 'Share details about your family',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'Your tutor wants to know more about your family. Describe each member briefly and ask about theirs.' },
      { id: 'b-3-3', emoji: '🎉', title: 'Talk about family activities',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'Tell your tutor about a family tradition or ritual that means a lot to you.' },
    ],
  },
  {
    id: 'b-4',
    title: 'Unit 4: Events',
    lessons: [
      { id: 'b-4-1', emoji: '✈️', title: 'Talk about your travel itinerary',
        summary: 'Learn 5 phrases · 8 min',
        scene: "You're planning a trip. Share your itinerary with your tutor and get their recommendations." },
      { id: 'b-4-2', emoji: '📅', title: 'Talk about your daily schedule',
        summary: 'Learn 5 phrases · 7 min',
        scene: 'Your tutor asks what your day looks like. Walk them through a typical weekday from morning to night.' },
      { id: 'b-4-3', emoji: '🎤', title: 'Make plans to go out',
        summary: 'Learn 5 phrases · 8 min',
        scene: 'You and your tutor are planning Friday night out. Suggest a place, pick a time, lock it in.' },
    ],
  },
]

// MARK: - Intermediate (B1)
// Less scaffolded — anchor phrases as touch points for real conversation
// rather than "produce these in order" mechanics.

const INTERMEDIATE: LessonUnit[] = [
  {
    id: 'i-1',
    title: 'Unit 1: Opinions & Stories',
    lessons: [
      { id: 'i-1-1', emoji: '📖', title: 'Tell a story about your day',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: 'Catch up with your tutor over coffee. Walk them through something interesting that happened today — a meeting, a near-miss, a small win. Use past tense throughout.' },
      { id: 'i-1-2', emoji: '💭', title: 'Share an opinion',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: 'Your tutor asks what you think about a hot topic (let them pick — remote work, social media, AI). Give your honest take and defend it.' },
      { id: 'i-1-3', emoji: '🤝', title: 'Disagree politely',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: 'Your tutor takes a position you disagree with. Push back respectfully — acknowledge their point, then explain why you see it differently.' },
    ],
  },
  {
    id: 'i-2',
    title: 'Unit 2: Real-World Challenges',
    lessons: [
      { id: 'i-2-1', emoji: '📣', title: 'Make a complaint',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: 'The food you ordered is cold. Politely but firmly explain the problem to the server and ask for it to be fixed.' },
      { id: 'i-2-2', emoji: '⏰', title: 'Apologize for being late',
        summary: 'Learn 5 anchor phrases · 8 min',
        scene: "You're 30 minutes late to meet your tutor. Apologize sincerely, explain what happened, and offer to make it up." },
      { id: 'i-2-3', emoji: '💰', title: 'Negotiate a price',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: "You're at a market and want to buy something, but the asking price is too high. Negotiate respectfully and try to reach a deal." },
    ],
  },
  {
    id: 'i-3',
    title: 'Unit 3: Connecting Deeper',
    lessons: [
      { id: 'i-3-1', emoji: '🔮', title: 'Talk about your future plans',
        summary: 'Learn 5 anchor phrases · 10 min',
        scene: 'Your tutor asks where you see yourself in five years. Talk about your goals, plans, and the steps you\'re taking — use future tense.' },
      { id: 'i-3-2', emoji: '💻', title: 'Discuss a work project',
        summary: 'Learn 5 anchor phrases · 10 min',
        scene: "Your tutor is curious about your work. Explain a current project — what it is, your role, what's hard about it, what you've learned." },
      { id: 'i-3-3', emoji: '🧭', title: 'Give advice to a friend',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: 'Your tutor describes a tough situation they\'re facing. Listen, ask one clarifying question, then offer thoughtful advice.' },
    ],
  },
  {
    id: 'i-4',
    title: 'Unit 4: Culture & Travel',
    lessons: [
      { id: 'i-4-1', emoji: '🌍', title: 'Compare your country to here',
        summary: 'Learn 5 anchor phrases · 10 min',
        scene: 'Your tutor wants to know how your home country compares to theirs. Pick two or three concrete differences and discuss what you\'ve learned from each.' },
      { id: 'i-4-2', emoji: '📸', title: 'Describe a memorable trip',
        summary: 'Learn 5 anchor phrases · 10 min',
        scene: 'Tell your tutor about a trip that changed how you see something. Set the scene, share what happened, explain what it meant.' },
      { id: 'i-4-3', emoji: '🍷', title: 'Recommend a place',
        summary: 'Learn 5 anchor phrases · 9 min',
        scene: 'Your tutor is visiting your city for a weekend. Recommend three places they should go — and explain why each one matters to you.' },
    ],
  },
]

// MARK: - Advanced (B2/C1)
// Open-ended discussion prompts. Phrases are advanced vocabulary the
// tutor can weave in if it fits — not a strict "produce these five"
// mandate. Scenes are topics to argue, narrate, or explain.

const ADVANCED: LessonUnit[] = [
  {
    id: 'a-1',
    title: 'Unit 1: Opinions in Depth',
    lessons: [
      { id: 'a-1-1', emoji: '💼', title: 'Debate: remote work or office?',
        summary: 'Discussion · 10 min',
        scene: 'The tutor sets up the topic: post-pandemic, companies are split on remote vs office work. The tutor will take the OPPOSITE side from you. Defend your stance with at least three reasons, respond to their counterpoints, and push back when you disagree.' },
      { id: 'a-1-2', emoji: '🌶️', title: 'Defend an unpopular opinion',
        summary: 'Discussion · 10 min',
        scene: 'The tutor asks you to share an opinion most people disagree with. Walk them through why you hold it, anticipate the standard objections, and address them. The tutor will play devil\'s advocate.' },
      { id: 'a-1-3', emoji: '🗞️', title: 'Discuss something controversial from home',
        summary: 'Discussion · 10 min',
        scene: 'The tutor asks about a debate happening in your country right now (politics, social issue, cultural shift). Explain what\'s at stake, where you stand, and why.' },
    ],
  },
  {
    id: 'a-2',
    title: 'Unit 2: Storytelling',
    lessons: [
      { id: 'a-2-1', emoji: '🎭', title: 'Tell a story with a twist',
        summary: 'Discussion · 10 min',
        scene: 'Walk the tutor through a memorable story from your life — set the scene, build tension, land the twist. Use past tenses naturally and pull them in with vivid details.' },
      { id: 'a-2-2', emoji: '🔀', title: 'Explain a turning point',
        summary: 'Discussion · 10 min',
        scene: 'Tell the tutor about a moment that changed how you see something — a job, a relationship, a place, an idea. What did you believe before, what changed it, what do you believe now?' },
      { id: 'a-2-3', emoji: '📖', title: 'A book or film that moved you',
        summary: 'Discussion · 10 min',
        scene: 'Pick something that genuinely moved you. Tell the tutor what it\'s about, what it made you feel, and what you took away. The tutor will ask probing follow-ups.' },
    ],
  },
  {
    id: 'a-3',
    title: 'Unit 3: Professional Discourse',
    lessons: [
      { id: 'a-3-1', emoji: '🧑‍💻', title: 'Explain your job to an outsider',
        summary: 'Discussion · 10 min',
        scene: 'The tutor knows nothing about your field. Make your work understandable in 2-3 minutes — what you do day-to-day, why it matters, what\'s hard about it. The tutor will interrupt with naive questions; lean into them.' },
      { id: 'a-3-2', emoji: '🎤', title: 'Pitch an idea you believe in',
        summary: 'Discussion · 10 min',
        scene: 'Sell the tutor on something — a project, a product, a side hustle, an idea you care about. Be persuasive. The tutor will be a skeptical audience asking "why now", "why you", "why this".' },
      { id: 'a-3-3', emoji: '🤔', title: 'Disagree constructively with a colleague',
        summary: 'Discussion · 10 min',
        scene: 'The tutor plays a colleague who states an opinion you disagree with about a work decision. Push back without being aggressive — acknowledge their point first, then make yours. Practice the art of professional dissent.' },
    ],
  },
  {
    id: 'a-4',
    title: 'Unit 4: Culture & Society',
    lessons: [
      { id: 'a-4-1', emoji: '🌐', title: 'Compare cultures meaningfully',
        summary: 'Discussion · 10 min',
        scene: 'Pick a meaningful difference between your culture and the target-language country\'s — not stereotypes, real observations. What does each get right? What\'s a fair critique of your own? Avoid easy generalizations.' },
      { id: 'a-4-2', emoji: '📈', title: 'A societal shift you\'ve noticed',
        summary: 'Discussion · 10 min',
        scene: 'Talk about something that\'s changed in your country or community over the past 5-10 years. What\'s different? Better or worse? What do you think it means? The tutor will push for specifics.' },
      { id: 'a-4-3', emoji: '🎧', title: 'The media you actually consume',
        summary: 'Discussion · 10 min',
        scene: 'Walk the tutor through what news, podcasts, books, or shows actually shape your worldview. Why these? What do you think they reveal about you? Be honest, not performative.' },
    ],
  },
]
