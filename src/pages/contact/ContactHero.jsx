import PageHero from '../../components/PageHero'

export default function ContactHero() {
  return (
    <PageHero
      className="contact-page-hero"
      title="Contact"
      titleId="contact-page-title"
      lead="Good conversations start with a clear first line."
      summary="Whether you want to join, ask about an event or propose a collaboration, this is the place to reach Infinity Club."
      href="#contact-directory"
      linkLabel="Start a conversation"
    />
  )
}
