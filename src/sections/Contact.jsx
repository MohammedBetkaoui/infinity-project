import { ArrowUpRight, MapPin } from 'lucide-react'

export default function Contact() {
  return (
    <section id="contact" className="contact-section section-space">
      <div className="page-container contact-layout">
        <div>
          <p className="contact-prelude">There is room for your ideas.</p>
          <h2>What could we<br />build <span>together?
            <svg viewBox="0 0 390 22" aria-hidden="true"><path d="M4 15Q157 -2 382 8M54 20Q230 8 355 17" /></svg>
          </span></h2>
        </div>
        <div className="contact-invitation">
          <p>Bring a skill, a question or just a willingness to learn. You do not need to have it all figured out.</p>
          <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" data-magnetic data-ripple className="contact-button">
            Let’s talk on Instagram <ArrowUpRight size={18} />
          </a>
          <span>@club_.infinity</span>
        </div>
        <div className="contact-bottom"><span>No Limits For Infiniters</span><span><MapPin size={14} /> Bordj Bou Arréridj, Algeria</span></div>
      </div>
    </section>
  )
}
