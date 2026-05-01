import type { BeginnerTopic } from '../types'

// Themed beginner topics for French — mirrors PT_BR_TOPICS / IT_IT_TOPICS,
// with French vocabulary. cardWords must exist in FR_FR_BEGINNER_CARDS.
export const FR_FR_TOPICS: BeginnerTopic[] = [
  {
    id: 'cafe',
    title: 'Order at a cafe',
    blurb: 'Coffee, bread, drinks, basic ordering politeness.',
    cardWords: ['café', 'pain', 'lait', 'eau', 'merci'],
    matchHint:
      'learner works in a cafe / restaurant / hospitality, mentions coffee, food, eating out',
  },
  {
    id: 'greet',
    title: 'Greet and say goodbye',
    blurb: 'Hello, goodbye, thanks, yes/no — the social opener kit.',
    cardWords: ['salut', 'merci', 'oui', 'non'],
    matchHint:
      'no specific context, just curious / wants the basics / total beginner with no story yet',
  },
  {
    id: 'where-from',
    title: 'Talk about where you\'re from',
    blurb: 'Cities, home, names — placing yourself in the world.',
    cardWords: ['maison', 'ville', 'nom', 'oui', 'non'],
    matchHint:
      'learner mentions where they live, where they\'re visiting, travel destinations, their hometown',
  },
  {
    id: 'family',
    title: 'Identify family members',
    blurb: 'Family, friends, love — the people closest to you.',
    cardWords: ['famille', 'amour', 'ami', 'maison'],
    matchHint:
      'learner mentions a partner, parents, kids, in-laws, family in France, friends',
  },
  {
    id: 'pets',
    title: 'Pets and animals at home',
    blurb: 'Cat, dog, the loved ones with fur.',
    cardWords: ['chat', 'chien', 'maison', 'amour'],
    matchHint:
      'learner mentions a pet, a cat, a dog, animals at home',
  },
  {
    id: 'belongings',
    title: 'Locate your belongings',
    blurb: 'Books, cars, things around the house.',
    cardWords: ['livre', 'voiture', 'maison'],
    matchHint:
      'learner mentions reading, driving, things they own, day-to-day stuff at home',
  },
  {
    id: 'city',
    title: 'Find places in the city',
    blurb: 'Beaches, schools, cafes — getting around.',
    cardWords: ['ville', 'plage', 'école', 'café', 'maison'],
    matchHint:
      'learner mentions traveling, sightseeing, exploring a French city, beaches, neighborhoods',
  },
  {
    id: 'work-school',
    title: 'Talk about work and school',
    blurb: 'Job, classes, daily activities.',
    cardWords: ['travail', 'école', 'maison', 'nourriture'],
    matchHint:
      'learner mentions their job, studying, school, what they do day-to-day',
  },
  {
    id: 'beach-weather',
    title: 'Beach and weather',
    blurb: 'Sun, beach, the outdoor scene.',
    cardWords: ['soleil', 'plage', 'eau'],
    matchHint:
      'learner mentions French coast, beaches, sun, the weather, outdoor plans',
  },
  {
    id: 'groceries',
    title: 'Shop for groceries',
    blurb: 'Food shopping — bread, fruit, basics.',
    cardWords: ['nourriture', 'pain', 'pomme', 'lait', 'riz', 'fromage'],
    matchHint:
      'learner mentions cooking, shopping, supermarkets, recipes, eating in',
  },
  {
    id: 'home',
    title: 'Describe your home',
    blurb: 'Where you live — house, books, food, the daily setup.',
    cardWords: ['maison', 'ville', 'livre', 'nourriture', 'chat', 'chien'],
    matchHint:
      'learner describes their living situation, what their home is like, who they live with',
  },
  {
    id: 'travel',
    title: 'Plan a trip',
    blurb: 'Travel, cars, planes — getting from A to B.',
    cardWords: ['voyage', 'voiture', 'avion', 'plage', 'ville'],
    matchHint:
      'learner mentions an upcoming trip, planning travel, visiting France, flights',
  },
]
