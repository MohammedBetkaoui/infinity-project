import { ArrowUpRight, Mail, MessageCircle } from 'lucide-react'
import { contactEmail, contactInstagram, contactReasons } from './contactData'

export default function ContactDirectory() {
  return (
    <section id="contact-directory" className="contact-directory" aria-labelledby="contact-directory-title">
      <div className="page-container">
        <div className="contact-directory-layout">
          <div className="contact-channel">
            <span className="contact-channel-caption"><MessageCircle size={18} strokeWidth={1.5} aria-hidden="true" /> A direct line to Infinity</span>
            <h2 id="contact-directory-title">Say hello.</h2>
            <p>You do not need a finished idea to get in touch. Send a message and tell us what you have in mind.</p>
            <a className="contact-primary-channel" href={contactInstagram} target="_blank" rel="noreferrer">
              <span>@club_.infinity</span><ArrowUpRight size={27} strokeWidth={1.25} />
            </a>
            <span className="contact-channel-note">Find the club on Instagram</span>
            <a className="contact-secondary-channel" href={`mailto:${contactEmail}`}>
              <Mail size={15} strokeWidth={1.5} aria-hidden="true" /><span>{contactEmail}</span>
            </a>
          </div>
          <div className="contact-reasons" aria-label="What to contact the club about">
            {contactReasons.map(({ title, description, Icon }) => (
              <article key={title} className="contact-reason">
                <Icon size={20} strokeWidth={1.35} aria-hidden="true" />
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
        <div className="contact-directory-rule" aria-hidden="true"><i /></div>
        <p className="contact-directory-note">For recruitment dates and event announcements, follow the club on Instagram.</p>
      </div>
    </section>
  )
}
