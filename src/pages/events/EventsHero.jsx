import PageHero from '../../components/PageHero'

export default function EventsHero() {
  return (
    <PageHero
      className="events-page-hero"
      title="Events"
      titleId="events-page-title"
      lead="Good things happen when we meet."
      summary="Competitions and shared experiments, brought to life by the students of Infinity Club."
      href="#current-programme"
      linkLabel="Discover the programme"
    />
  )
}
