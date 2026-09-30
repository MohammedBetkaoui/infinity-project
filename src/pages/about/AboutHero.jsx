import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { useRef } from 'react'
import InfinityMark from '../../components/InfinityMark'
import '../../components/page-hero.css'
import usePageHeroMotion from '../../hooks/usePageHeroMotion'
import { poles } from '../../data/siteData'

const principles = ['Learn by making', 'Grow by sharing', 'Build together']

export default function AboutHero() {
  const heroRef = useRef(null)
  usePageHeroMotion(heroRef)

  return (
    <section ref={heroRef} className="page-hero about-page-hero" aria-labelledby="about-page-title">
      <div className="page-container">
        <div className="page-hero-rail">
          <span>Infinity Club / Our identity</span>
          <span>Scientific &amp; technology club · BBA</span>
        </div>

        <div className="page-hero-layout about-hero-layout">
          <div className="about-hero-copy">
            <p className="about-hero-kicker">People first. Technology with purpose.</p>
            <h1 id="about-page-title" aria-label="About.">
              <span className="page-hero-title-mask" aria-hidden="true">
                About<span className="page-hero-title-stop">.</span>
              </span>
            </h1>
            <div className="about-hero-intro">
              <p className="page-hero-lead">A student club should feel like an open door.</p>
              <div>
                <p className="page-hero-summary">Infinity brings students together to explore technology, practise in public and turn early ideas into shared projects.</p>
                <a className="page-hero-jump" href="#about-story">
                  Step inside the club <ArrowDown size={14} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          <article className="about-hero-card" aria-label="Infinity Club identity card" data-animated-text="">
            <div className="about-hero-card-head">
              <span>Club profile</span><span>IF / BBA</span>
            </div>
            <div className="about-hero-emblem" aria-hidden="true">
              <span className="about-hero-orbit" />
              <InfinityMark />
              <span className="about-hero-crosshair" />
            </div>
            <div className="about-hero-card-title">
              <span>Infinity</span>
              <small>Student-led community</small>
            </div>
            <dl className="about-hero-card-data">
              <div><dt>Focus</dt><dd>Technology &amp; creation</dd></div>
              <div><dt>Home</dt><dd>MI Faculty · BBA</dd></div>
            </dl>
            <div className="about-hero-card-foot">
              <span><i /> Open to curious minds</span>
              <ArrowUpRight size={17} strokeWidth={1.6} aria-hidden="true" />
            </div>
          </article>
        </div>

        <dl className="about-hero-metrics" aria-label="Infinity Club overview" data-animated-text="">
          <div><dt>{String(poles.length).padStart(2, '0')}</dt><dd>Fields to explore</dd></div>
          <div><dt>{String(principles.length).padStart(2, '0')}</dt><dd>Guiding principles</dd></div>
          <div><dt>01</dt><dd>Shared community</dd></div>
          <div className="about-hero-principles"><dt>{principles.join(' · ')}</dt><dd>Our way of moving forward</dd></div>
        </dl>

        <div className="page-hero-rule" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
