import PageHero from '../../components/PageHero'
import { eventArchive } from '../../data/eventArchive'

const yearCount = new Set(eventArchive.map((event) => event.year)).size
const upcomingCount = eventArchive.filter((event) => event.status === 'upcoming').length
const eventFacts = [
  { value: String(eventArchive.length).padStart(2, '0'), label: 'Experiences' },
  { value: String(yearCount).padStart(2, '0'), label: 'Seasons archived' },
  { value: String(upcomingCount).padStart(2, '0'), label: 'Coming next' },
]

export default function EventsHero() {
  return (
    <PageHero
      className="events-page-hero page-hero-editorial"
      title="Events"
      titleId="events-page-title"
      eyebrow="Ideas become experiences"
      railLabel="Infinity Club / Events"
      railMeta="Programme & archive · BBA"
      lead="Good things happen when we meet."
      summary="Competitions, workshops and shared moments designed to move ambitious ideas forward."
      href="#event-archive"
      linkLabel="Explore the programme"
      facts={eventFacts}
      signature="Build · Meet · Grow"
    />
  )
}
