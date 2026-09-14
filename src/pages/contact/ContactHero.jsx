import PageHero from '../../components/PageHero'

export default function ContactHero() {
  return (
    <PageHero
      className="contact-page-hero"
      title="Contact"
      titleId="contact-page-title"
      lead="Talk to the club."
      summary="Join the team, ask about an event or share an idea. The conversation starts here."
      href="#contact-directory"
      linkLabel="Start a conversation"
    />
  )
}
