import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
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
              <span><i aria-hidden="true" /> The scientific club of the MI Faculty</span>
              <span>University of Bordj Bou Arreridj</span>
            </div>
            <div className="hero-layout">
              <div className="hero-editorial">
                <p className="hero-prelude hero-detail">What comes next starts with you.</p>
                <h1 aria-label="Push past your limits.">
                  <TitleLine>Push past</TitleLine>
                  <TitleLine>your limits.</TitleLine>
                </h1>
                <p className="hero-description hero-detail">From the first “how does this work?” to the project we build together. Infinity brings together students who want to give it a go.</p>
                <div className="hero-actions hero-detail">
                  <a href="#contact" data-magnetic data-ripple className="button-primary">Join the club</a>
                  <a href="#poles" className="text-link">Find my field</a>
                </div>
              </div>
              <InfinityArtwork />
            </div>
            <div className="hero-footnote">
              <p className="official-motto">No Limits For Infiniters<span>More than a motto. A mindset.</span></p>
              <div className="hero-event-depth">
                <Link to="/aivex" className="hero-event-link">
                  <span className="event-mini-mark" aria-hidden="true">AI</span>
                  <span><strong>AIVEX</strong><small>National AI application competition. Second edition.</small></span>
                  <span className="event-link-action">Explore</span>
                </Link>
              </div>
              <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" className="hero-social" aria-label="Infinity Club on Instagram">
                <ArrowUpRight size={20} />
              </a>
            </div>
            <Link to="/about" className="hero-scroll-link">Get to know the club</Link>
          </div>
          <div className="hero-shade" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
