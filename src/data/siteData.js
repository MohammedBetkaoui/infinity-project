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
    detail: 'You’ll spend as much time reading error messages as writing code, and that’s the point: a layout that breaks on someone else’s screen, an API that returns the wrong shape of data, a query that’s fast until the table has real rows in it. We build across the stack — React and plain JavaScript on the front, Node or Django behind it, real databases — because a site that only runs on your laptop isn’t finished.',
    topics: ['Front-end', 'Back-end & APIs', 'Deployment'],
  },
  {
    title: 'Mobile Development',
    focus: 'Native and cross-platform apps',
    icon: Smartphone,
    description: 'Sketch, prototype and build mobile apps that are useful in everyday life, from the first screen to release.',
    detail: 'A phone is not a small website. Touch targets, offline states, battery, a review process that can reject your build for reasons that have nothing to do with your code — mobile asks for a different discipline. We build with Flutter and React Native, test on real devices because the simulator lies about performance, and take a build all the way to the store, which is its own lesson in patience.',
    topics: ['Cross-platform', 'Mobile UI', 'App release'],
  },
  {
    title: 'AI Engineering',
    focus: 'Models, data and intelligent products',
    icon: BrainCircuit,
    description: 'Train, evaluate and integrate machine learning models and LLMs into applications that solve real problems.',
    detail: 'Calling an API isn’t the hard part. The real work sits upstream and downstream of that call: cleaning a dataset that quietly lies to you, choosing between a model that’s accurate and one that’s fast enough to ship, watching it fail in ways the demo never showed. We train, fine-tune and evaluate models, then wire them into products that have to hold up outside a notebook.',
    topics: ['Machine learning', 'LLM apps', 'Model deployment'],
  },
  {
    title: 'AI & Automation',
    focus: 'n8n, agents and AI strategies',
    icon: Bot,
    description: 'Design AI agents and automated workflows with n8n that take repetitive work off your hands.',
    detail: 'The best automation is invisible — a form that used to take someone an afternoon now clears itself before lunch. We build agents and workflows in n8n that connect the tools a team already uses, write the prompts that keep an AI agent on task instead of improvising, and think through the strategy behind it, because automating a bad process just makes the mess move faster.',
    topics: ['n8n workflows', 'AI agents', 'Prompting'],
  },
  {
    title: 'Graphic Design',
    focus: 'Visual identity and communication',
    icon: Palette,
    description: 'Create logos, posters and visual identities that communicate clearly and leave a lasting impression.',
    detail: 'A logo is the easy part. The real work is a system — colour, type, spacing, tone — that still reads as the same club on a poster, a slide and a story shot at 11pm before an event. We design identities and layouts in Figma, defend a decision when someone asks to “just make it pop,” and learn that a constraint — a printer’s colour profile, a deadline — usually makes the work better, not worse.',
    topics: ['Branding', 'Posters & social', 'Typography'],
  },
  {
    title: 'Video Editing',
    focus: 'Editing, rhythm and motion',
    icon: Clapperboard,
    description: 'Tell stories through thoughtful editing, rhythm and motion design, from raw footage to the final cut.',
    detail: 'Editing is where an event actually becomes a story: which twelve seconds out of four hours of footage, where the cut lands on the beat, when to let a shot breathe instead of cutting away. We work in Premiere and After Effects, colour-correct footage shot in a lecture hall with terrible lighting, and build the recap that makes people who missed it wish they hadn’t.',
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
      'Everyone is welcome, whichever university you attend. Registration opens at the start of each academic year, so follow our announcements to be ready when it does.',
  },
  {
    question: 'What is the difference between a member and staff?',
    answer:
      'Members take part in our workshops, events and projects to learn and build. Staff help run the club: they plan activities, coordinate teams and host sessions. Even new students can join the staff, after a short interview with the team.',
  },
  {
    question: 'How do I become a member?',
    answer:
      'Complete the membership application on this site. During an active recruitment campaign, the team reviews it and continues with a short conversation.',
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
