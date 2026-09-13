import PageHero from '../../components/PageHero'

export default function AboutHero() {
  return (
    <PageHero
      className="about-page-hero"
      title="About"
      titleId="about-page-title"
      lead="A student club should feel like an open door."
      summary="Infinity brings students together to explore technology, practise in public and turn early ideas into shared projects."
      href="#about-story"
      linkLabel="Step inside the club"
    />
  )
}
