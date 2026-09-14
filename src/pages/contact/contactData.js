import { CalendarDays, Handshake, Users } from 'lucide-react'

export const contactInstagram = 'https://www.instagram.com/club_.infinity/'

export const contactReasons = [
  {
    title: 'Join the club',
    label: 'For future Infiniters',
    description: 'Ask about the next recruitment campaign, the fields you can explore and how active membership works.',
    Icon: Users,
  },
  {
    title: 'Build a collaboration',
    label: 'For clubs and organisations',
    description: 'Introduce your organisation, the idea, the format and the period you have in mind for a shared initiative.',
    Icon: Handshake,
  },
  {
    title: 'Ask about an event',
    label: 'For participants and guests',
    description: 'Mention the event name and edition so the team can understand your question from the first message.',
    Icon: CalendarDays,
  },
]

export const messageSteps = [
  { title: 'Introduce yourself.', note: 'Your name and where you are reaching us from.' },
  { title: 'Add the context.', note: 'Membership, an event, a project or a collaboration.' },
  { title: 'Make the next step clear.', note: 'Tell us what you would like to know or build together.' },
]
