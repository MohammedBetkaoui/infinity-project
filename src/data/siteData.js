import {
  Bot,
  Braces,
  Clapperboard,
  Fingerprint,
  Palette,
  PenTool,
  Smartphone,
} from 'lucide-react'

export const navigation = [
  { label: 'Accueil', href: '#accueil' },
  { label: 'À propos', href: '#a-propos' },
  { label: 'Communauté', href: '#communaute' },
  { label: 'Événements', href: '#evenements' },
  { label: 'Pôles', href: '#poles' },
  { label: 'Contact', href: '#contact' },
]

export const poles = [
  {
    title: 'Personal Branding',
    focus: 'Image, réseau et prise de parole',
    icon: PenTool,
    description: 'Construire une présence claire, crédible et mémorable dans l’écosystème tech.',
  },
  {
    title: 'Design & Business of Design',
    focus: 'Identité visuelle et valeur',
    icon: Palette,
    description: 'Transformer les idées en identités fortes et en expériences qui créent de la valeur.',
  },
  {
    title: 'Intro to Coding',
    focus: 'Fondamentaux et premiers projets',
    icon: Braces,
    description: 'Apprendre les fondamentaux du code à travers des ateliers concrets et progressifs.',
  },
  {
    title: 'Mobile Development',
    focus: 'Applications et prototypes',
    icon: Smartphone,
    description: 'Imaginer, prototyper et développer des applications mobiles utiles au quotidien.',
  },
  {
    title: 'IA & Automatisation',
    focus: 'n8n, agents et stratégies IA',
    icon: Bot,
    description: 'Explorer les stratégies IA, les agents et les workflows automatisés avec n8n.',
  },
  {
    title: 'Video Editing',
    focus: 'Montage, rythme et motion',
    icon: Clapperboard,
    description: 'Raconter des histoires dynamiques avec le montage, le rythme et le motion design.',
  },
  {
    title: 'Cybersécurité',
    focus: 'Systèmes et sécurité numérique',
    icon: Fingerprint,
    description: 'Comprendre les menaces, sécuriser les systèmes et cultiver les bons réflexes.',
  },
]

export const stats = [
  { value: 3000, suffix: '+', label: 'abonnés sur Instagram' },
  { value: 130, suffix: '+', label: 'publications partagées' },
  { value: 7, suffix: '', label: 'pôles à explorer' },
  { value: 4, suffix: '', label: 'rendez-vous présentés' },
]

export const events = [
  {
    year: '2026',
    name: 'AIVEX',
    type: 'Intelligence artificielle',
    description: 'La compétition nationale de programmation d’applications d’intelligence artificielle. Découvrez la deuxième édition.',
    href: '/aivex',
    accent: '#B7F397',
    code: 'AI/VX',
    visual: 'ai',
  },
  {
    year: '2026',
    name: 'DesignLab v2',
    type: 'Atelier de design',
    description: 'Un laboratoire intensif pour passer du concept à une expérience visuelle cohérente.',
    accent: '#F3F3E8',
    code: 'D/L02',
    visual: 'design',
  },
  {
    year: '2025',
    name: 'Ramadan Conferences',
    type: 'Cycle de conférences',
    description: 'Des rencontres inspirantes qui font dialoguer technologie, parcours et communauté.',
    accent: '#8FD96B',
    code: 'RMDN',
    visual: 'ramadan',
  },
  {
    year: '2025',
    name: 'ACCESS0',
    type: 'Programme de découverte',
    description: 'Le point d’entrée vers les métiers numériques, pensé pour apprendre en construisant.',
    accent: '#73C95B',
    code: 'ACC/0',
    visual: 'access',
  },
]

export const faqs = [
  {
    question: 'Qui peut rejoindre Infinity Club ?',
    answer:
      'Tout étudiant motivé de l’Université de Bordj Bou Arréridj peut suivre nos activités. Les campagnes de recrutement précisent chaque année les conditions d’adhésion active.',
  },
  {
    question: 'Comment devenir membre ?',
    answer:
      'Surveille nos annonces sur Instagram. Pendant la période de recrutement, il suffit de remplir le formulaire puis de participer à un échange avec notre équipe.',
  },
  {
    question: 'Faut-il déjà savoir coder pour rejoindre ?',
    answer:
      'Non. La curiosité, l’envie d’apprendre et l’engagement comptent davantage que le niveau de départ. Plusieurs pôles sont justement conçus pour débuter.',
  },
  {
    question: 'Quels types d’événements organisez-vous ?',
    answer:
      'Des conférences, ateliers pratiques, challenges, formations et rencontres autour du développement, de l’IA, du design, du business et de la cybersécurité.',
  },
  {
    question: 'Y a-t-il des opportunités de leadership ?',
    answer:
      'Oui. Les membres peuvent piloter des projets, coordonner une équipe, animer un atelier ou prendre des responsabilités dans l’organisation des événements.',
  },
]
