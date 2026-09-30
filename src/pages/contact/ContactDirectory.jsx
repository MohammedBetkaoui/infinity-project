import { ArrowUpRight, AtSign, Mail } from 'lucide-react'
import { contactEmail, contactInstagram, contactReasons } from './contactData'

export default function ContactDirectory() {
  return (
    <section id="contact-directory" className="contact-directory" aria-labelledby="contact-directory-title">
      <div className="page-container">
        <p className="contact-section-index" data-animated-text=""><span>01 / Reach us</span><span>Instagram · Email</span></p>
        <div className="contact-directory-layout">
          <div className="contact-directory-intro">
            <p className="contact-overline" data-animated-text="">One clear way in</p>
            <h2 id="contact-directory-title">Start with<br />a hello.</h2>
            <p>You do not need a finished idea or a perfect introduction. Give us the context and tell us what you would like to explore.</p>

            <div className="contact-channel-stack" aria-label="Infinity Club contact channels">
              <a className="contact-primary-channel" href={contactInstagram} target="_blank" rel="noopener noreferrer" aria-label="Open Infinity Club on Instagram (opens in a new tab)">
                <span className="contact-channel-icon"><AtSign size={17} strokeWidth={1.5} aria-hidden="true" /></span>
                <span><small>Primary channel · New tab</small><strong>@club_.infinity</strong></span>
                <ArrowUpRight size={21} strokeWidth={1.35} aria-hidden="true" />
              </a>
              <a className="contact-secondary-channel" href={`mailto:${contactEmail}`}>
                <span className="contact-channel-icon"><Mail size={16} strokeWidth={1.5} aria-hidden="true" /></span>
                <span><small>Email</small><strong>{contactEmail}</strong></span>
                <ArrowUpRight size={18} strokeWidth={1.4} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="contact-reasons" aria-label="What to contact Infinity Club about">
            <div className="contact-reasons-heading">
              <span>What can we talk about?</span>
              <span>{String(contactReasons.length).padStart(2, '0')} paths</span>
            </div>
            {contactReasons.map(({ title, label, description, Icon }, index) => (
              <article key={title} className="contact-reason">
                <span className="contact-reason-number" aria-hidden="true">0{index + 1}</span>
                <div className="contact-reason-copy">
                  <span className="contact-reason-label"><Icon size={15} strokeWidth={1.4} aria-hidden="true" />{label}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="contact-directory-note">
          <span>Good to know</span>
          <p>For recruitment dates and event announcements, Instagram is the fastest place to follow the club.</p>
        </div>
      </div>
    </section>
  )
}
