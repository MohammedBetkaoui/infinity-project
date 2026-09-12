export const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

// These are editorial principles, not a published competition schedule or rules.
export const approach = [
  {
    id: 'question', label: 'Une question', title: 'Partir du réel.',
    text: 'Un problème que l’on comprend, un usage que l’on observe. Avant de choisir un modèle, prendre le temps de formuler la bonne question.',
    code: ['const question = observer(leReel)', 'const idee = imaginer(question)'],
    caption: 'L’idée commence par un besoin.',
  },
  {
    id: 'prototype', label: 'Du code', title: 'Donner forme à l’idée.',
    text: 'Relier la logique, les données et une interface. Tester, se tromper, ajuster : c’est là qu’une intuition devient une application.',
    code: ['const prototype = construire(idee)', 'tester(prototype, usagesReels)'],
    caption: 'Le code transforme l’intuition.',
  },
  {
    id: 'application', label: 'Une application', title: 'Montrer ce qui change.',
    text: 'Une application se comprend aussi par ce qu’elle permet de faire. Rendre son utilité visible, expliquer ses choix et reconnaître ses limites.',
    code: ['const application = affiner(prototype)', 'partager(application, sesLimites)'],
    caption: 'L’usage donne du sens à la technique.',
  },
]

export const practicalDetails = [
  { label: 'Format', value: 'Compétition nationale', detail: 'Programmation d’applications d’intelligence artificielle' },
  { label: 'Édition', value: 'Deuxième édition', detail: 'AIVEX, par Infinity Club' },
  { label: 'Dates et lieu précis', value: 'À confirmer', pending: true, detail: 'Le calendrier et les espaces d’accueil seront annoncés par le club.' },
  { label: 'Inscriptions', value: 'Modalités à venir', pending: true, detail: 'Le lien officiel et les conditions de participation seront communiqués avec l’annonce.' },
  { label: 'Programme et règlement', value: 'À annoncer', pending: true, detail: 'Les étapes, les contraintes techniques et les critères officiels seront précisés par l’organisation.' },
]

export const projectDirections = [
  {
    id: 'documents', title: 'Faire parler les documents.',
    description: 'Retrouver une information dans un ensemble de textes, la rendre compréhensible et permettre de revenir à sa source.',
    question: 'Comment aider quelqu’un à trouver la bonne information, sans perdre le contexte ?',
    angle: 'Langage et recherche d’information',
  },
  {
    id: 'vision', title: 'Donner du sens aux images.',
    description: 'Organiser une collection visuelle ou repérer un élément dans une image. Un terrain pour réfléchir au lien entre perception et usage.',
    question: 'Que doit-on reconnaître, et dans quelles situations le système se trompe-t-il ?',
    angle: 'Vision par ordinateur',
  },
  {
    id: 'data', title: 'Rendre les données lisibles.',
    description: 'Explorer un jeu de données, faire émerger des tendances et les expliquer dans une interface que l’on comprend sans mode d’emploi.',
    question: 'Quelle information change réellement la compréhension de l’utilisateur ?',
    angle: 'Analyse et visualisation',
  },
]

export const preparationItems = [
  { id: 'need', title: 'Formuler un besoin précis', detail: 'Pour qui construis-tu ? Quel problème rencontres-tu ? Décris un usage concret en quelques phrases.' },
  { id: 'sources', title: 'Identifier les données et leurs limites', detail: 'Note tes sources, ce que tu peux utiliser et ce qui manque. Prévois des exemples sans informations personnelles sensibles.' },
  { id: 'demo', title: 'Esquisser une démonstration simple', detail: 'Une entrée, un traitement, un résultat visible. Commence par un parcours court qui montre l’utilité de ton idée.' },
  { id: 'choices', title: 'Savoir expliquer tes choix', detail: 'Pourquoi cette approche ? Quelle place occupe l’IA ? Garde aussi une trace des essais qui n’ont pas fonctionné.' },
  { id: 'limits', title: 'Préparer un regard critique', detail: 'Teste plusieurs cas, montre les limites du prototype et identifie ce que tu améliorerais ensuite.' },
]

export const aivexFaqs = [
  {
    id: 'format', question: 'AIVEX, c’est une conférence ou une compétition ?',
    answer: 'AIVEX est une compétition nationale de programmation d’applications d’intelligence artificielle. Cette page présente sa deuxième édition. Le programme détaillé et les éventuelles activités complémentaires seront précisés par l’organisation.',
  },
  {
    id: 'eligibility', question: 'Qui peut participer ? Seul ou en équipe ?',
    answer: 'Les conditions d’éligibilité, le format de participation et la taille éventuelle des équipes restent à annoncer. Le caractère national de la compétition ne remplace pas ces conditions : consulte le règlement officiel dès sa publication.',
  },
  {
    id: 'topics', question: 'Les exemples de projets sont-ils les sujets imposés ?',
    answer: 'Non. Les exemples de cette page sont des pistes pour réfléchir à un usage de l’IA. Ils ne constituent ni des catégories officielles, ni une liste de technologies autorisées. Seul le règlement définira les sujets et contraintes de la compétition.',
  },
  {
    id: 'registration', question: 'Comment et quand pourrai-je m’inscrire ?',
    answer: 'Les dates et modalités d’inscription seront annoncées sur les canaux officiels d’Infinity Club. Aucun formulaire d’inscription n’est ouvert sur cette page. Le carnet de préparation est un outil personnel, pas une candidature.',
  },
  {
    id: 'evaluation', question: 'Quels seront les critères, le jury et les récompenses ?',
    answer: 'Ces éléments ne sont pas encore confirmés sur cette page. La composition du jury, les critères d’évaluation et les éventuelles récompenses seront communiqués par l’organisation. Les conseils de préparation présentés ici ne sont pas une grille de notation.',
  },
  {
    id: 'contact', question: 'Où poser une question à l’équipe ?',
    answer: 'Écris directement à Infinity Club sur Instagram, via @club_.infinity. Précise que ta question concerne AIVEX et la deuxième édition pour faciliter l’échange avec l’équipe.',
  },
]
