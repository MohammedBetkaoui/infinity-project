// Mock rows shaped exactly like public.membership_applications so the
// pages can switch to Supabase without touching the components.

const rows = [
  ['Amine Belkacem', 'amine.belkacem@univ-bba.dz', '+213 555 21 40 18', 'L3', 'Informatique', 'Développement', 'building', 'weekly', 'pending', '2026-09-14T09:12:00Z',
    "Je code depuis deux ans en autodidacte et je cherche un endroit pour construire des projets avec d'autres gens sérieux plutôt que seul dans ma chambre."],
  ['Lina Hamdani', 'lina.hamdani@univ-bba.dz', '+213 661 03 77 52', 'M1', 'Mathématiques', 'Data & IA', 'learning', 'flexible', 'pending', '2026-09-14T15:48:00Z',
    "Mon mémoire porte sur l'apprentissage statistique et je voudrais confronter la théorie que j'apprends à des applications réelles avec le club."],
  ['Yacine Mokrani', 'yacine.mokrani@univ-bba.dz', '', 'L2', 'Informatique', 'Cybersécurité', 'starting', 'events', 'pending', '2026-09-13T11:05:00Z',
    "Je débute vraiment mais la sécurité m'intéresse depuis le lycée. Je veux apprendre avec des gens qui savent, et participer aux CTF du club."],
  ['Meriem Saidi', 'meriem.saidi@univ-bba.dz', '+213 770 88 12 36', 'L3', 'Informatique', 'Design & UI', 'building', 'weekly', 'accepted', '2026-09-11T08:30:00Z',
    "Je fais du design d'interface depuis un an sur Figma et j'aimerais travailler sur des projets qui sortent vraiment, pas juste des maquettes d'exercice."],
  ['Oussama Berrah', 'oussama.berrah@univ-bba.dz', '+213 550 42 90 11', 'M2', 'Informatique', 'Développement', 'building', 'flexible', 'accepted', '2026-09-10T17:22:00Z',
    "J'ai déjà encadré un petit groupe sur un projet web et je voudrais contribuer côté transmission autant que côté technique."],
  ['Nour Elhouda Cherif', 'nour.cherif@univ-bba.dz', '+213 662 17 45 83', 'L1', 'Mathématiques', 'Not sure yet', 'starting', 'events', 'pending', '2026-09-15T07:55:00Z',
    "Je viens d'arriver en L1 et je ne sais pas encore quelle direction prendre. Je voudrais découvrir plusieurs domaines avant de choisir."],
  ['Ilyes Zerrouki', 'ilyes.zerrouki@univ-bba.dz', '+213 559 64 23 07', 'L2', 'Informatique', 'Data & IA', 'learning', 'weekly', 'rejected', '2026-09-08T13:40:00Z',
    "Je suis un cours en ligne sur le machine learning et je cherche un cadre pour pratiquer sur des données réelles."],
  ['Sara Boudjelal', 'sara.boudjelal@univ-bba.dz', '', 'M1', 'Informatique', 'Cybersécurité', 'learning', 'flexible', 'accepted', '2026-09-09T10:18:00Z',
    "J'ai fait un stage en administration réseau cet été et je veux continuer à progresser sur la partie sécurité offensive."],
  ['Rayane Mebarki', 'rayane.mebarki@univ-bba.dz', '+213 771 35 62 94', 'L3', 'Mathématiques', 'Développement', 'building', 'weekly', 'pending', '2026-09-15T14:02:00Z',
    "Je construis une petite application de gestion pour l'association de mon quartier et j'aimerais des retours de gens plus expérimentés."],
  ['Katia Amrani', 'katia.amrani@univ-bba.dz', '+213 553 09 81 27', 'L1', 'Informatique', 'Design & UI', 'starting', 'events', 'pending', '2026-09-12T16:37:00Z',
    "Je dessine beaucoup et je découvre que ça peut servir dans le numérique. Je voudrais comprendre comment on passe du dessin à une interface."],
  ['Bilal Ouaret', 'bilal.ouaret@univ-bba.dz', '+213 660 74 15 38', 'M2', 'Mathématiques', 'Data & IA', 'building', 'flexible', 'accepted', '2026-09-07T09:44:00Z',
    "Je travaille sur de l'optimisation combinatoire et je cherche des projets où ces méthodes servent concrètement à quelque chose."],
  ['Hiba Larbaoui', 'hiba.larbaoui@univ-bba.dz', '', 'L2', 'Informatique', 'Not sure yet', 'starting', 'weekly', 'pending', '2026-09-15T18:20:00Z',
    "Une amie m'a parlé du club et de l'ambiance. Je veux voir de près comment on construit un projet du début à la fin."],
  ['Adel Ferhat', 'adel.ferhat@univ-bba.dz', '+213 556 28 47 69', 'L3', 'Informatique', 'Développement', 'learning', 'events', 'rejected', '2026-09-06T12:15:00Z',
    "Je suis en train de finir une formation web et je voudrais un endroit pour pratiquer en équipe régulièrement."],
  ['Wissam Taleb', 'wissam.taleb@univ-bba.dz', '+213 673 51 90 42', 'M1', 'Informatique', 'Cybersécurité', 'building', 'weekly', 'pending', '2026-09-16T08:05:00Z',
    "J'ai participé à deux CTF nationaux et je voudrais aider à monter une équipe régulière au sein de la faculté."],
  ['Roumaissa Benali', 'roumaissa.benali@univ-bba.dz', '+213 552 63 18 75', 'L1', 'Mathématiques', 'Data & IA', 'starting', 'flexible', 'accepted', '2026-09-05T15:30:00Z',
    "Les statistiques me plaisent beaucoup en cours et je voudrais voir à quoi elles servent en dehors des exercices du module."],
  ['Farouk Slimani', 'farouk.slimani@univ-bba.dz', '', 'L2', 'Informatique', 'Design & UI', 'learning', 'events', 'pending', '2026-09-13T19:48:00Z',
    "Je m'occupe des affiches pour une autre association et je voudrais passer au design d'interface pour de vrais produits."],
  ['Imene Kaci', 'imene.kaci@univ-bba.dz', '+213 559 82 36 14', 'M2', 'Informatique', 'Développement', 'building', 'weekly', 'accepted', '2026-09-04T11:26:00Z',
    "Je développe en React depuis un an et demi et je voudrais encadrer les plus jeunes tout en continuant à apprendre."],
  ['Zakaria Hadjadj', 'zakaria.hadjadj@univ-bba.dz', '+213 668 40 57 23', 'L3', 'Mathématiques', 'Not sure yet', 'learning', 'flexible', 'pending', '2026-09-16T06:40:00Z',
    "Je suis entre les maths pures et l'informatique appliquée, et je n'arrive pas à trancher. Le club m'aiderait sûrement à y voir clair."],
]

const FIELD_TO_POLE = {
  'Développement': 'Développement',
  'Data & IA': 'Data & IA',
  'Cybersécurité': 'Cybersécurité',
  'Design & UI': 'Design & UI',
  'Not sure yet': 'À orienter',
}

export const joinRequests = rows.map(([
  fullName, email, phone, studyYear, department, primaryField, experience, availability, status, submittedAt, motivation,
], index) => ({
  id: `req_${String(index + 1).padStart(3, '0')}`,
  reference: `INF-26-${(4096 + index * 787).toString(16).toUpperCase().padStart(6, '0')}`,
  fullName,
  email,
  phone,
  studyYear,
  department,
  primaryField: FIELD_TO_POLE[primaryField] || primaryField,
  experience,
  availability,
  motivation,
  status,
  submittedAt,
}))

export const STUDY_YEAR_LABELS = {
  L1: 'Licence 1', L2: 'Licence 2', L3: 'Licence 3', M1: 'Master 1', M2: 'Master 2', other: 'Autre',
}

export const EXPERIENCE_LABELS = {
  starting: 'Débutant', learning: 'En apprentissage', building: 'Déjà autonome',
}

export const AVAILABILITY_LABELS = {
  weekly: 'Quelques heures par semaine', events: 'Autour des événements', flexible: 'Variable selon le semestre',
}

export const STATUS_LABELS = {
  pending: 'En attente', accepted: 'Acceptée', rejected: 'Refusée',
}
