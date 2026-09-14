import { useRef } from 'react'
import usePageHeroMotion from '../hooks/usePageHeroMotion'
import './page-hero.css'

export default function PageHero({ title, titleId, lead, summary, href, linkLabel, className = '' }) {
  const heroRef = useRef(null)
  usePageHeroMotion(heroRef)

  return (
    <section ref={heroRef} className={`page-hero ${className}`} aria-labelledby={titleId}>
      <div className="page-container">
        <div className="page-hero-rail">
          <span>Infinity Club</span>
          <span>MI Faculty, Bordj Bou Arreridj</span>
        </div>
        <div className="page-hero-layout">
          <h1 id={titleId} aria-label={`${title}.`}>
            <span className="page-hero-title-mask" aria-hidden="true">
              {title}<span className="page-hero-title-stop">.</span>
            </span>
          </h1>
          <div className="page-hero-note">
            <p className="page-hero-lead">{lead}</p>
            <p className="page-hero-summary">{summary}</p>
            <a className="page-hero-jump" href={href}>{linkLabel}</a>
          </div>
        </div>
        <div className="page-hero-rule" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
