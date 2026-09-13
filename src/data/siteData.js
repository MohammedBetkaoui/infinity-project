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
  { label: 'Home', href: '#accueil', section: 'accueil', to: '/' },
  { label: 'About', href: '/about', to: '/about' },
  { label: 'Community', href: '#communaute', section: 'communaute', to: '/#communaute' },
  { label: 'Events', href: '/events', to: '/events' },
  { label: 'Our fields', href: '#poles', section: 'poles', to: '/#poles' },
  { label: 'Contact', href: '#contact', section: 'contact', to: '/#contact' },
]

export const poles = [
  {
    title: 'Personal Branding',
    focus: 'Your voice, your network, your presence',
    icon: PenTool,
    description: 'Build a clear, credible presence and find your own voice in tech.',
  },
  {
    title: 'Design & Business of Design',
    focus: 'Visual identity and creative value',
    icon: Palette,
    description: 'Turn ideas into strong identities and experiences that make a difference.',
  },
  {
    title: 'Intro to Coding',
    focus: 'The basics and your first projects',
    icon: Braces,
    description: 'Learn the foundations of coding through hands-on workshops, one project at a time.',
  },
  {
    title: 'Mobile Development',
    focus: 'Apps and prototypes',
    icon: Smartphone,
    description: 'Sketch, prototype and build mobile apps that are useful in everyday life.',
  },
  {
    title: 'AI & Automation',
    focus: 'n8n, agents and AI strategies',
    icon: Bot,
    description: 'Explore AI strategies, agents and automated workflows with n8n.',
  },
  {
    title: 'Video Editing',
    focus: 'Editing, rhythm and motion',
    icon: Clapperboard,
    description: 'Tell stories through thoughtful editing, rhythm and motion design.',
  },
  {
    title: 'Cybersecurity',
    focus: 'Systems and digital security',
    icon: Fingerprint,
    description: 'Understand threats, secure systems and develop good security habits.',
  },
]

export const stats = [
  { value: 3000, suffix: '+', label: 'Instagram followers' },
  { value: 130, suffix: '+', label: 'posts shared' },
  { value: 7, suffix: '', label: 'fields to explore' },
  { value: 4, suffix: '', label: 'featured events' },
]

export const events = [
  {
    year: '2026',
    name: 'AIVEX',
    type: 'Artificial intelligence',
    description: 'The national AI application programming competition. Explore the second edition.',
    href: '/aivex',
    accent: '#9ed7c4',
    code: 'AI/VX',
    visual: 'ai',
  },
  {
    year: '2026',
    name: 'DesignLab v2',
    type: 'Design workshop',
    description: 'An intensive design lab, from the first concept to a coherent visual experience.',
    accent: '#F3F3E8',
    code: 'D/L02',
    visual: 'design',
  },
  {
    year: '2025',
    name: 'Ramadan Conferences',
    type: 'Conference series',
    description: 'Conversations that bring technology, personal journeys and our community together.',
    accent: '#094a36',
    code: 'RMDN',
    visual: 'ramadan',
  },
  {
    year: '2025',
    name: 'ACCESS0',
    type: 'Discovery programme',
    description: 'A first step into digital careers, built around learning by doing.',
    accent: '#77bda5',
    code: 'ACC/0',
    visual: 'access',
  },
]

export const faqs = [
  {
    question: 'Who can join Infinity Club?',
    answer:
      'Any motivated student at the University of Bordj Bou Arreridj can follow our activities. Each annual recruitment campaign sets out the requirements for active membership.',
  },
  {
    question: 'How do I become a member?',
    answer:
      'Watch for our announcements on Instagram. During recruitment, fill in the application form, then have a conversation with our team.',
  },
  {
    question: 'Do I need to know how to code?',
    answer:
      'No. Curiosity, a willingness to learn and commitment matter more than your starting level. Several of our fields are designed to welcome beginners.',
  },
  {
    question: 'What kinds of events do you organise?',
    answer:
      'Conferences, hands-on workshops, challenges and training sessions on development, AI, design, business and cybersecurity.',
  },
  {
    question: 'Are there opportunities to lead?',
    answer:
      'Yes. Members can lead projects, coordinate a team, host a workshop or help organise events.',
  },
]
