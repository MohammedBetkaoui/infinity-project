import { ArrowDown } from 'lucide-react'
import { useRef } from 'react'
import InfinityLiquidMetal from './InfinityLiquidMetal'
import usePageHeroMotion from '../hooks/usePageHeroMotion'
import './page-hero.css'

const emptyFacts = []

export default function PageHero({
  title,
  titleId,
  lead,
  summary,
  href,
  linkLabel,
  eyebrow,
  railLabel = 'Infinity Club',
  railMeta = 'MI Faculty, Bordj Bou Arreridj',
  facts = emptyFacts,
  signature,
  shaderVariant,
  className = '',
}) {
  const heroRef = useRef(null)
  usePageHeroMotion(heroRef)

  return (
    <section ref={heroRef} className={`page-hero ${className}`} aria-labelledby={titleId}>
      {shaderVariant ? <InfinityLiquidMetal variant={shaderVariant} /> : null}
      {shaderVariant ? <div className={`page-hero-shader-overlay page-hero-shader-overlay--${shaderVariant}`} aria-hidden="true" /> : null}
      <div className="page-container">
        <div className="page-hero-rail">
          <span>{railLabel}</span>
          <span>{railMeta}</span>
        </div>
        <div className="page-hero-layout">
          <div className="page-hero-heading">
            {eyebrow ? <p className="page-hero-eyebrow">{eyebrow}</p> : null}
            <h1 id={titleId} aria-label={`${title}.`}>
              <span className="page-hero-title-mask" aria-hidden="true">
                {title}<span className="page-hero-title-stop">.</span>
              </span>
            </h1>
          </div>
          <div className="page-hero-note">
            <p className="page-hero-lead">{lead}</p>
            <p className="page-hero-summary">{summary}</p>
            <a className="page-hero-jump" href={href}>
              {linkLabel}<ArrowDown size={14} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </div>
        </div>
        {facts.length > 0 ? (
          <dl className="page-hero-facts" aria-label={`${title} overview`}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.value}</dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
            {signature ? <div className="page-hero-signature"><dt>{signature}</dt><dd>Infinity Club</dd></div> : null}
          </dl>
        ) : null}
        <div className="page-hero-rule" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
