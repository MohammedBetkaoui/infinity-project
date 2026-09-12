import { ArrowUpRight, MapPin } from 'lucide-react'
import AivexWordmark from './AivexWordmark'
import AivexScene from './AivexScene'
import { INSTAGRAM_URL } from './aivexData'

export default function AivexHero() {
  return (
    <section className="ax-hero" id="competition" aria-labelledby="ax-title" tabIndex={-1}>
      <div className="ax-container">
        <div className="ax-hero-topline ax-intro-detail">
          <p>Compétition nationale de programmation d’applications IA</p>
          <span>Imaginée ici. Ouverte sur demain.</span>
        </div>
        <div className="ax-hero-layout">
          <div className="ax-hero-copy">
            <h1 id="ax-title"><span className="sr-only">AIVEX. L’intelligence en application.</span><span aria-hidden="true"><AivexWordmark large data-aivex-logo-target /></span></h1>
            <p className="ax-hero-statement" aria-hidden="true">
              <span><span className="ax-title-line">L’intelligence.</span></span>
              <span><span className="ax-title-line">En application.</span></span>
            </p>
            <p className="ax-hero-description ax-intro-detail">Les idées ne manquent pas.<br />Ce qui compte, c’est ce qu’on en fait.</p>
            <div className="ax-hero-actions ax-intro-detail">
              <a className="ax-button ax-button-amber" href="#participer">Découvrir la 2e édition</a>
              <a className="ax-text-link" href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Suivre les annonces <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
          <AivexScene />
        </div>
        <div className="ax-hero-rail ax-intro-detail">
          <div><span>Porté par</span><strong>Infinity Club</strong></div>
          <div><span>À l’université</span><strong>Faculté des Mathématiques et Informatique</strong></div>
          <p><MapPin size={16} aria-hidden="true" /> Bordj Bou Arréridj, Algérie</p>
        </div>
      </div>
    </section>
  )
}
