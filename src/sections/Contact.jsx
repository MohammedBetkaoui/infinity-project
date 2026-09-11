import { ArrowUpRight, MapPin } from 'lucide-react'

export default function Contact() {
  return (
    <section id="contact" className="contact-section section-space">
      <div className="page-container contact-layout">
        <div>
          <p className="contact-prelude">Il reste une place pour tes idées.</p>
          <h2>Et si on faisait<br />la suite <span>ensemble ?
            <svg viewBox="0 0 390 22" aria-hidden="true"><path d="M4 15Q157 -2 382 8M54 20Q230 8 355 17" /></svg>
          </span></h2>
        </div>
        <div className="contact-invitation">
          <p>Viens avec une compétence, une question ou simplement l’envie d’apprendre. Pas besoin d’avoir déjà tout prévu.</p>
          <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" data-magnetic data-ripple className="contact-button">
            Parlons-en sur Instagram <ArrowUpRight size={18} />
          </a>
          <span>@club_.infinity</span>
        </div>
        <div className="contact-bottom"><span>No Limits For Infiniters</span><span><MapPin size={14} /> Bordj Bou Arréridj, Algérie</span></div>
      </div>
    </section>
  )
}
