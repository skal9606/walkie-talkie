import type { BeginnerTopic } from '../types'

// Themed beginner topics for German — mirrors the other tutors. cardWords
// must exist in DE_DE_BEGINNER_CARDS.
export const DE_DE_TOPICS: BeginnerTopic[] = [
  {
    id: 'cafe',
    title: 'Order at a cafe',
    blurb: 'Coffee, bread, drinks, basic ordering politeness.',
    cardWords: ['kaffee', 'brot', 'milch', 'wasser', 'danke'],
    matchHint:
      'learner works in a cafe / restaurant / hospitality, mentions coffee, food, eating out',
  },
  {
    id: 'greet',
    title: 'Greet and say goodbye',
    blurb: 'Hello, goodbye, thanks, yes/no — the social opener kit.',
    cardWords: ['hallo', 'tschüss', 'danke', 'ja', 'nein'],
    matchHint:
      'no specific context, just curious / wants the basics / total beginner with no story yet',
  },
  {
    id: 'where-from',
    title: 'Talk about where you\'re from',
    blurb: 'Cities, home, names — placing yourself in the world.',
    cardWords: ['haus', 'stadt', 'name', 'ja', 'nein'],
    matchHint:
      'learner mentions where they live, where they\'re visiting, travel destinations, their hometown',
  },
  {
    id: 'family',
    title: 'Identify family members',
    blurb: 'Family, friends, love — the people closest to you.',
    cardWords: ['familie', 'liebe', 'freund', 'haus'],
    matchHint:
      'learner mentions a partner, parents, kids, in-laws, family in Germany, friends',
  },
  {
    id: 'pets',
    title: 'Pets and animals at home',
    blurb: 'Cat, dog, the loved ones with fur.',
    cardWords: ['katze', 'hund', 'haus', 'liebe'],
    matchHint:
      'learner mentions a pet, a cat, a dog, animals at home',
  },
  {
    id: 'belongings',
    title: 'Locate your belongings',
    blurb: 'Books, cars, things around the house.',
    cardWords: ['buch', 'auto', 'haus'],
    matchHint:
      'learner mentions reading, driving, things they own, day-to-day stuff at home',
  },
  {
    id: 'city',
    title: 'Find places in the city',
    blurb: 'Beaches, schools, cafes — getting around.',
    cardWords: ['stadt', 'strand', 'schule', 'kaffee', 'haus'],
    matchHint:
      'learner mentions traveling, sightseeing, exploring a German city, beaches, neighborhoods',
  },
  {
    id: 'work-school',
    title: 'Talk about work and school',
    blurb: 'Job, classes, daily activities.',
    cardWords: ['arbeit', 'schule', 'haus', 'essen'],
    matchHint:
      'learner mentions their job, studying, school, what they do day-to-day',
  },
  {
    id: 'beach-weather',
    title: 'Beach and weather',
    blurb: 'Sun, beach, the outdoor scene.',
    cardWords: ['sonne', 'strand', 'wasser'],
    matchHint:
      'learner mentions German coast, beaches, sun, the weather, outdoor plans',
  },
  {
    id: 'groceries',
    title: 'Shop for groceries',
    blurb: 'Food shopping — bread, fruit, basics.',
    cardWords: ['essen', 'brot', 'apfel', 'milch', 'reis', 'käse'],
    matchHint:
      'learner mentions cooking, shopping, supermarkets, recipes, eating in',
  },
  {
    id: 'home',
    title: 'Describe your home',
    blurb: 'Where you live — house, books, food, the daily setup.',
    cardWords: ['haus', 'stadt', 'buch', 'essen', 'katze', 'hund'],
    matchHint:
      'learner describes their living situation, what their home is like, who they live with',
  },
  {
    id: 'travel',
    title: 'Plan a trip',
    blurb: 'Travel, cars, planes — getting from A to B.',
    cardWords: ['reise', 'auto', 'flugzeug', 'strand', 'stadt'],
    matchHint:
      'learner mentions an upcoming trip, planning travel, visiting Germany, flights',
  },
]
