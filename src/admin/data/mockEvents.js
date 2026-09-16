// Mock events. Covers reuse the club's real photo assets so the grid
// reads like production data rather than grey placeholders.

export const EVENT_COVERS = [
  '/assets/aivex/photo1.png',
  '/assets/aivex/photo2.jpg',
  '/assets/aivex/photo4.jpg',
  '/assets/aivex/photo6.jpg',
  '/assets/communty/photo_1_2026-09-13_23-30-36.jpg',
  '/assets/communty/photo_3_2026-09-13_23-30-36.jpg',
  '/assets/communty/photo_5_2026-09-13_23-30-36.jpg',
  '/assets/aivex-brain-chip.jpg',
]

export const EVENT_CATEGORIES = [
  'Compétition', 'Workshop', 'Conférence', 'Hackathon', 'Formation', 'Rencontre',
]

export const EVENT_STATUS_LABELS = {
  draft: 'Brouillon', published: 'Publié', archived: 'Archivé', done: 'Terminé',
}

export const events = [
  {
    id: 'evt_001',
    title: 'AIVEX 2026 — Seconde édition',
    description: "La compétition nationale d'intelligence artificielle du club. Deux jours pour passer d'une idée à une preuve technique, encadrés par des mentors de la faculté et des intervenants extérieurs.",
    category: 'Compétition',
    status: 'published',
    startsAt: '2026-11-12T08:00',
    venue: 'Amphithéâtre A — Faculté MI',
    capacity: 160,
    registered: 142,
    cover: EVENT_COVERS[0],
  },
  {
    id: 'evt_002',
    title: 'Workshop Python pour débutants',
    description: "Trois heures pour écrire son premier vrai script : variables, boucles, fichiers, et un mini projet à emporter. Aucun prérequis, machines fournies par le club.",
    category: 'Workshop',
    status: 'draft',
    startsAt: '2026-10-03T14:00',
    venue: 'Laboratoire 2 — Bloc informatique',
    capacity: 40,
    registered: 0,
    cover: EVENT_COVERS[1],
  },
  {
    id: 'evt_003',
    title: 'La Nuit du Code',
    description: "Douze heures de code non-stop, en équipes de trois, sur un sujet dévoilé au lancement. Repas et café offerts, jury composé d'enseignants et d'anciens membres.",
    category: 'Hackathon',
    status: 'done',
    startsAt: '2026-05-28T18:00',
    venue: 'Hall central — Faculté MI',
    capacity: 96,
    registered: 96,
    cover: EVENT_COVERS[3],
  },
  {
    id: 'evt_004',
    title: 'Introduction à la cybersécurité offensive',
    description: "Comprendre comment une application se fait attaquer pour apprendre à la défendre. Démonstrations en direct sur un environnement de test isolé, puis atelier pratique.",
    category: 'Formation',
    status: 'published',
    startsAt: '2026-09-25T13:30',
    venue: 'Salle 104 — Bloc informatique',
    capacity: 60,
    registered: 47,
    cover: EVENT_COVERS[2],
  },
  {
    id: 'evt_005',
    title: 'Rencontre des nouveaux membres',
    description: "La séance d'accueil du semestre : présentation des pôles, des projets en cours, et temps d'échange avec les membres actifs. Ouvert à tous les candidats retenus.",
    category: 'Rencontre',
    status: 'published',
    startsAt: '2026-10-05T16:00',
    venue: 'Salle de conférence — Bibliothèque',
    capacity: 120,
    registered: 88,
    cover: EVENT_COVERS[4],
  },
  {
    id: 'evt_006',
    title: 'Conférence : les maths derrière les modèles',
    description: "Une intervention d'une enseignante-chercheuse du département de mathématiques sur ce qui se passe réellement sous le capot des modèles d'apprentissage.",
    category: 'Conférence',
    status: 'published',
    startsAt: '2026-12-18T10:00',
    venue: 'Amphithéâtre B — Faculté MI',
    capacity: 200,
    registered: 63,
    cover: EVENT_COVERS[7],
  },
  {
    id: 'evt_007',
    title: 'Atelier Git et travail en équipe',
    description: "Branches, conflits, revue de code : les gestes qui font la différence quand on travaille à plusieurs sur le même dépôt. Format court et très pratique.",
    category: 'Workshop',
    status: 'archived',
    startsAt: '2026-01-20T14:00',
    venue: 'Laboratoire 1 — Bloc informatique',
    capacity: 35,
    registered: 31,
    cover: EVENT_COVERS[5],
  },
  {
    id: 'evt_008',
    title: 'Portes ouvertes du club',
    description: "Une journée pour découvrir les quatre pôles, voir les projets des membres exposés, et poser toutes les questions avant de candidater.",
    category: 'Rencontre',
    status: 'draft',
    startsAt: '2026-11-14T09:00',
    venue: 'Hall central — Faculté MI',
    capacity: 300,
    registered: 0,
    cover: EVENT_COVERS[6],
  },
]

// Attendee list shown from an event card.
const FIRST = ['Amine', 'Lina', 'Yacine', 'Meriem', 'Oussama', 'Nour', 'Ilyes', 'Sara', 'Rayane', 'Katia', 'Bilal', 'Hiba']
const LAST = ['Belkacem', 'Hamdani', 'Mokrani', 'Saidi', 'Berrah', 'Cherif', 'Zerrouki', 'Boudjelal', 'Mebarki', 'Amrani']

export const attendeesFor = (event) => Array.from({ length: Math.min(event.registered, 24) }, (_, index) => ({
  id: `${event.id}_att_${index}`,
  name: `${FIRST[(index * 5) % FIRST.length]} ${LAST[(index * 3) % LAST.length]}`,
  email: `${FIRST[(index * 5) % FIRST.length].toLowerCase()}.${LAST[(index * 3) % LAST.length].toLowerCase()}@univ-bba.dz`,
  studyYear: ['L1', 'L2', 'L3', 'M1', 'M2'][index % 5],
  checkedIn: index % 3 === 0,
}))
