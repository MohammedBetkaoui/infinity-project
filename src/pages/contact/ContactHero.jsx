import PageHero from '../../components/PageHero'

const contactFacts = [
  { value: '02', label: 'Direct channels' },
  { value: '03', label: 'Ways to connect' },
  { value: 'BBA', label: 'Our home' },
]

export default function ContactHero() {
  return (
    <PageHero
      className="contact-page-hero page-hero-editorial"
      title="Contact"
      titleId="contact-page-title"
      shaderVariant="contact"
      eyebrow="A conversation can start something"
      railLabel="Infinity Club / Contact"
      railMeta="Open to ideas · Open to people"
      lead="Talk to the club."
      summary="Join the team, ask about an event or share an idea. The conversation starts here."
      href="#contact-directory"
      linkLabel="Start a conversation"
      facts={contactFacts}
      signature="Ask · Share · Connect"
    />
  )
}
