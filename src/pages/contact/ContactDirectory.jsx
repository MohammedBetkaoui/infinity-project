import { ArrowUpRight, MapPin } from 'lucide-react'
import { contactInstagram, contactReasons } from './contactData'

export default function ContactDirectory() {
  return (
    <section id="contact-directory" className="contact-directory" aria-labelledby="contact-directory-title">
      <div className="page-container">
        <header className="contact-directory-heading">
          <h2 id="contact-directory-title">Start with<br />the reason.</h2>
          <p>A short message with the right context is enough. Choose the subject that is closest to yours and talk directly with the club team.</p>
        </header>

        <a className="contact-primary-channel" href={contactInstagram} target="_blank" rel="noreferrer" data-magnetic data-ripple>
          <span className="contact-channel-index">Primary channel</span>
          <span className="contact-channel-handle">@club_.infinity</span>
          <span className="contact-channel-action">Open Instagram <ArrowUpRight size={20} strokeWidth={1.45} /></span>
        </a>

        <div className="contact-reason-grid">
          {contactReasons.map(({ title, label, description, Icon }) => (
            <article key={title} className="contact-reason">
              <div className="contact-reason-top"><Icon size={22} strokeWidth={1.25} /><span>{label}</span></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <div className="contact-campus-note">
          <p><MapPin size={15} strokeWidth={1.4} /> Faculty of Mathematics and Computer Science</p>
          <span>University of Bordj Bou Arreridj, Algeria</span>
        </div>
      </div>
    </section>
  )
}
