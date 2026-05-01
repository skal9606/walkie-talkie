import type { BeginnerTopic } from '../types'

// Themed beginner topics for Brazilian Portuguese — modeled on Duolingo's
// Section 1 unit list. Each topic's `cardWords` must exist in
// PT_BR_BEGINNER_CARDS or the visual cards won't fire.
export const PT_BR_TOPICS: BeginnerTopic[] = [
  {
    id: 'cafe',
    title: 'Order at a cafe',
    blurb: 'Coffee, bread, drinks, basic ordering politeness.',
    cardWords: ['café', 'pão', 'leite', 'água', 'obrigado'],
    matchHint:
      'learner works in a cafe / restaurant / hospitality, mentions coffee, food, eating out',
  },
  {
    id: 'greet',
    title: 'Greet and say goodbye',
    blurb: 'Hello, goodbye, thanks, yes/no — the social opener kit.',
    cardWords: ['oi', 'olá', 'tchau', 'obrigado', 'sim', 'não'],
    matchHint:
      'no specific context, just curious / wants the basics / total beginner with no story yet',
  },
  {
    id: 'where-from',
    title: 'Talk about where you\'re from',
    blurb: 'Cities, home, names — placing yourself in the world.',
    cardWords: ['casa', 'cidade', 'nome', 'sim', 'não'],
    matchHint:
      'learner mentions where they live, where they\'re visiting, travel destinations, their hometown',
  },
  {
    id: 'family',
    title: 'Identify family members',
    blurb: 'Family, friends, love — the people closest to you.',
    cardWords: ['família', 'amor', 'amigo', 'casa'],
    matchHint:
      'learner mentions a partner, parents, kids, in-laws, family in Brazil, friends',
  },
  {
    id: 'pets',
    title: 'Pets and animals at home',
    blurb: 'Cat, dog, the loved ones with fur.',
    cardWords: ['gato', 'cachorro', 'casa', 'amor'],
    matchHint:
      'learner mentions a pet, a cat, a dog, animals at home',
  },
  {
    id: 'belongings',
    title: 'Locate your belongings',
    blurb: 'Books, cars, things around the house.',
    cardWords: ['livro', 'carro', 'casa'],
    matchHint:
      'learner mentions reading, driving, things they own, day-to-day stuff at home',
  },
  {
    id: 'city',
    title: 'Find places in the city',
    blurb: 'Beaches, schools, cafes — getting around.',
    cardWords: ['cidade', 'praia', 'escola', 'café', 'casa'],
    matchHint:
      'learner mentions traveling, sightseeing, exploring a Brazilian city, beaches, neighborhoods',
  },
  {
    id: 'work-school',
    title: 'Talk about work and school',
    blurb: 'Job, classes, daily activities.',
    cardWords: ['trabalho', 'escola', 'casa', 'comida'],
    matchHint:
      'learner mentions their job, studying, school, what they do day-to-day',
  },
  {
    id: 'beach-weather',
    title: 'Beach and weather',
    blurb: 'Sun, beach, the outdoor scene.',
    cardWords: ['sol', 'praia', 'água'],
    matchHint:
      'learner mentions Rio, Salvador, beaches, sun, the weather, outdoor plans',
  },
  {
    id: 'groceries',
    title: 'Shop for groceries',
    blurb: 'Food shopping — bread, fruit, basics.',
    cardWords: ['comida', 'pão', 'maçã', 'leite', 'arroz', 'feijão'],
    matchHint:
      'learner mentions cooking, shopping, supermarkets, recipes, eating in',
  },
  {
    id: 'home',
    title: 'Describe your home',
    blurb: 'Where you live — house, books, food, the daily setup.',
    cardWords: ['casa', 'cidade', 'livro', 'comida', 'gato', 'cachorro'],
    matchHint:
      'learner describes their living situation, what their home is like, who they live with',
  },
  {
    id: 'travel',
    title: 'Plan a trip',
    blurb: 'Travel, cars, planes — getting from A to B.',
    cardWords: ['viagem', 'carro', 'avião', 'praia', 'cidade'],
    matchHint:
      'learner mentions an upcoming trip, planning travel, visiting Brazil, flights',
  },
]
