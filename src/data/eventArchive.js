import { events as clubEvents } from './siteData.js'

// The Events page archive. One entry per event, in any order: the page groups
// and sorts by year itself.
//
// Shape:
//   id, title, year (number), category, edition?, description,
//   href? (internal route or https URL; omit when there is no detail page),
//   newTab?, status? ('upcoming' | 'past'), featured?,
//   image? { src, srcSet, width, height, alt }  -> photo or screenshot
//   artwork? EventArtwork variant                 -> existing typographic poster
//   mock? true                                    -> placeholder content, see below
// Without image or artwork, the card draws a branded placeholder.

const club = Object.fromEntries(clubEvents.map((event) => [event.name, event]))

// Real Infinity events reuse the copy already maintained in siteData.
const fromClub = (name, entry) => {
  const source = club[name]
  return {
    title: source.name,
    year: Number(source.year),
    category: source.type,
    edition: source.edition,
    description: source.description,
    href: source.href,
    newTab: source.newTab,
    artwork: source.visual,
    ...entry,
  }
}

const realEvents = [
  fromClub('AIVEX', {
    id: 'aivex-2026',
    description: 'A national artificial intelligence competition bringing students together around an intensive technical challenge.',
    status: 'upcoming',
    featured: true,
    artwork: undefined,
    image: {
      src: '/assets/events/aivex-2026-1280.webp',
      srcSet: '/assets/events/aivex-2026-720.webp 720w, /assets/events/aivex-2026-1280.webp 1280w',
      width: 1280,
      height: 667,
      alt: 'AIVEX event homepage with its wordmark and a brain above a processor.',
    },
  }),
  fromClub('DesignLab v2', { id: 'designlab-v2-2026', edition: 'Second edition' }),
  fromClub('Ramadan Conferences', { id: 'ramadan-conferences-2025' }),
  fromClub('ACCESS0', { id: 'access0-2025' }),
]

// ---------------------------------------------------------------------------
// TEMPORARY MOCK EVENTS — placeholder content to evaluate the archive layout.
// None of these happened. Replace or delete this block when real data lands;
// cards built from it show a small "Sample" marker.
// ---------------------------------------------------------------------------
const mockEvents = [
  {
    id: 'infinity-code-night-2026',
    title: 'Infinity Code Night',
    year: 2026,
    edition: 'First edition',
    category: 'Programming',
    description: 'An evening of coding challenges, collaboration and problem solving.',
  },
  {
    id: 'hackfinity-2025',
    title: 'Hackfinity',
    year: 2025,
    edition: '2025 edition',
    category: 'Hackathon',
    description: 'A collaborative hackathon focused on turning ideas into working prototypes.',
    featured: true,
  },
  {
    id: 'web-week-2025',
    title: 'Web Week',
    year: 2025,
    edition: '2025 edition',
    category: 'Development',
    description: 'A programme of sessions and workshops around modern web development.',
  },
  {
    id: 'design-day-2025',
    title: 'Design Day',
    year: 2025,
    edition: '2025 edition',
    category: 'Design / UI UX',
    description: 'A creative event exploring visual design, UI/UX and digital experiences.',
  },
  {
    id: 'tech-talks-2025',
    title: 'Infinity Tech Talks',
    year: 2025,
    edition: '2025 edition',
    category: 'Technology',
    description: 'A series of conversations and technical sessions led by students and guests.',
  },
  {
    id: 'coding-challenge-2024',
    title: 'Infinity Coding Challenge',
    year: 2024,
    edition: '2024 edition',
    category: 'Competitive Programming',
    description: 'A student programming challenge focused on algorithms and problem solving.',
  },
  {
    id: 'welcome-day-2024',
    title: 'Infinity Welcome Day',
    year: 2024,
    edition: '2024 edition',
    category: 'Community',
    description: 'An introduction to Infinity Club, its community and its activities.',
  },
].map((event) => ({ ...event, status: 'past', mock: true }))

export const eventArchive = [...realEvents, ...mockEvents]
