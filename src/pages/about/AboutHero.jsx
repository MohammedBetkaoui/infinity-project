import PageHero from '../../components/PageHero'
import { poles } from '../../data/siteData'

const principles = ['Learn by making', 'Grow by sharing', 'Build together']
const aboutFacts = [
  { value: String(poles.length).padStart(2, '0'), label: 'Fields to explore' },
  { value: String(principles.length).padStart(2, '0'), label: 'Guiding principles' },
  { value: 'BBA', label: 'Our home' },
]

export default function AboutHero() {
  return (
    <PageHero
      className="about-page-hero page-hero-editorial"
      title="About"
      titleId="about-page-title"
      shaderVariant="about"
      eyebrow="People first. Technology with purpose."
      railLabel="Infinity Club / About"
      railMeta="Student-led · Bordj Bou Arreridj"
      lead="A student club should feel like an open door."
      summary="Infinity brings students together to explore technology and turn early ideas into shared projects."
      href="#about-story"
      linkLabel="Discover our story"
      facts={aboutFacts}
      signature="Learn · Share · Build"
    />
  )
}
