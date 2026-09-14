import { CalendarDays, Handshake, Users } from 'lucide-react'

export const contactInstagram = 'https://www.instagram.com/club_.infinity/'

export const contactReasons = [
  {
    title: 'Join the club',
    label: 'For future Infiniters',
    description: 'Curious about membership? Ask about recruitment and find a field you would like to explore.',
    Icon: Users,
  },
  {
    title: 'Build a collaboration',
    label: 'For clubs and organisations',
    description: 'Tell us who you are and what you would like to build with the team.',
    Icon: Handshake,
  },
  {
    title: 'Ask about an event',
    label: 'For participants and guests',
    description: 'Include the event name and edition so we can point you in the right direction.',
    Icon: CalendarDays,
  },
]

export const messageSteps = [
  { title: 'Introduce yourself.', note: 'Your name and where you are reaching us from.' },
  { title: 'Add the context.', note: 'Membership, an event, a project or a collaboration.' },
  { title: 'Make the next step clear.', note: 'Tell us what you would like to know or build together.' },
]
