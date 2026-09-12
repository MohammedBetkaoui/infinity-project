import { useRef } from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import InfinityArtwork from '../components/InfinityArtwork'
import useHeroMotion from '../hooks/useHeroMotion'

function TitleLine({ children }) {
  return (
    <span className="hero-line" aria-hidden="true">
      {children.split(' ').map((word, index) => (
        <span key={`${word}-${index}`} className="hero-word">{index > 0 && '\u00a0'}{word}</span>
      ))}
    </span>
  )
}

export default function Hero() {
  const sectionRef = useRef(null)
  useHeroMotion(sectionRef)

  return (
    <section id="accueil" ref={sectionRef} className="hero-section">
      <div className="hero-stage">
        <div className="hero-surface">
          <div className="page-container">
            <div className="hero-topline hero-detail">
              <span><i aria-hidden="true" /> Le club scientifique de la Faculté MI</span>
              <span>Université de Bordj Bou Arréridj</span>
            </div>
            <div className="hero-layout">
              <div className="hero-editorial">
                <p className="hero-prelude hero-detail">La suite commence avec toi.</p>
                <h1 aria-label="Repousse tes limites.">
                  <TitleLine>Repousse</TitleLine>
                  <TitleLine>tes limites.</TitleLine>
                </h1>
                <p className="hero-description hero-detail">Du premier « comment ça marche ? » au projet qu’on construit ensemble. Infinity réunit les étudiants qui ont envie d’essayer.</p>
                <div className="hero-actions hero-detail">
                  <a href="#contact" data-magnetic data-ripple className="button-primary">Rejoindre le club</a>
                  <a href="#poles" className="text-link">Trouver mon pôle</a>
                </div>
              </div>
              <InfinityArtwork />
            </div>
            <div className="hero-footnote">
              <p className="official-motto">No Limits For Infiniters<span>Une devise. Un état d’esprit.</span></p>
              <div className="hero-event-depth">
                <a href="#evenements" className="hero-event-link">
                  <span className="event-mini-mark" aria-hidden="true">AI</span>
                  <span><strong>AIVEX</strong><small>Explorer l’intelligence artificielle, ensemble.</small></span>
                  <span className="event-link-action">Découvrir</span>
                </a>
              </div>
              <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" className="hero-social" aria-label="Infinity Club sur Instagram">
                <ArrowUpRight size={20} />
              </a>
            </div>
            <a href="#a-propos" className="hero-scroll-link"><ArrowDown size={14} /> Fais connaissance avec le club</a>
          </div>
          <div className="hero-shade" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
