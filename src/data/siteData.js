import {
  Bot,
  BrainCircuit,
  Clapperboard,
  CodeXml,
  Palette,
  Smartphone,
} from 'lucide-react'

export const navigation = [
  { label: 'Home', href: '#accueil', section: 'accueil', to: '/' },
  { label: 'About', href: '/about', to: '/about' },
  { label: 'Community', href: '/community', to: '/community' },
  { label: 'Events', href: '/events', to: '/events' },
  { label: 'Contact', href: '/contact', to: '/contact' },
]

export const joinCallToAction = { label: 'Join the club', href: '/join', to: '/join' }

export const poles = [
  {
    title: 'Web & App Development',
    focus: 'Websites, web apps and full-stack projects',
    icon: CodeXml,
    description: 'Build responsive websites and web applications, from the interface to the server, and put them online.',
    topics: ['Front-end', 'Back-end & APIs', 'Deployment'],
  },
  {
    title: 'Mobile Development',
    focus: 'Native and cross-platform apps',
    icon: Smartphone,
    description: 'Sketch, prototype and build mobile apps that are useful in everyday life, from the first screen to release.',
    topics: ['Cross-platform', 'Mobile UI', 'App release'],
  },
  {
    title: 'AI Engineering',
    focus: 'Models, data and intelligent products',
    icon: BrainCircuit,
    description: 'Train, evaluate and integrate machine learning models and LLMs into applications that solve real problems.',
    topics: ['Machine learning', 'LLM apps', 'Model deployment'],
  },
  {
    title: 'AI & Automation',
    focus: 'n8n, agents and AI strategies',
    icon: Bot,
    description: 'Design AI agents and automated workflows with n8n that take repetitive work off your hands.',
    topics: ['n8n workflows', 'AI agents', 'Prompting'],
  },
  {
    title: 'Graphic Design',
    focus: 'Visual identity and communication',
    icon: Palette,
    description: 'Create logos, posters and visual identities that communicate clearly and leave a lasting impression.',
    topics: ['Branding', 'Posters & social', 'Typography'],
  },
  {
    title: 'Video Editing',
    focus: 'Editing, rhythm and motion',
    icon: Clapperboard,
    description: 'Tell stories through thoughtful editing, rhythm and motion design, from raw footage to the final cut.',
    topics: ['Editing', 'Motion design', 'Storytelling'],
  },
]

export const stats = [
  { value: 3000, suffix: '+', label: 'Instagram followers' },
  { value: 130, suffix: '+', label: 'posts shared' },
  { value: 6, suffix: '', label: 'fields to explore' },
  { value: 4, suffix: '', label: 'featured events' },
]

export const events = [
  {
    year: '2026',
    name: 'AIVEX',
    featured: true,
    type: 'Artificial intelligence',
    description: 'The national AI application programming competition. Explore the second edition.',
    href: '/aivex',
    newTab: true,
    edition: 'Second edition',
    summary: 'National AI application programming competition.',
    preview: {
      src: '/assets/image.png',
      width: 1741,
      height: 907,
      alt: 'AIVEX event homepage with its wordmark and a brain above a processor.',
    },
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
      'Complete the membership application on this site. During an active recruitment campaign, the team reviews it and continues with a short conversation.',
  },
  {
    question: 'Do I need to know how to code?',
    answer:
      'No. Curiosity, a willingness to learn and commitment matter more than your starting level. Several of our fields are designed to welcome beginners.',
  },
  {
    question: 'What kinds of events do you organise?',
    answer:
      'Conferences, hands-on workshops, challenges and training sessions on web and mobile development, AI, graphic design and video editing.',
  },
  {
    question: 'Are there opportunities to lead?',
    answer:
      'Yes. Members can lead projects, coordinate a team, host a workshop or help organise events.',
  },
]
