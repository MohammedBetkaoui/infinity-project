import PageHero from '../../components/PageHero'

export default function EventsHero() {
  return (
    <PageHero
      className="events-page-hero"
      title="Events"
      titleId="events-page-title"
      lead="Good things happen when we meet."
      summary="Competitions, workshops, challenges and experiences built by Infinity Club."
      href="#event-archive"
      linkLabel="Explore the programme ↓"
    />
  )
}
