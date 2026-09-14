import { useRef } from 'react'
import { Link } from 'react-router-dom'
import InfinityArtwork from '../components/InfinityArtwork'
import useHeroMotion from '../hooks/useHeroMotion'
import './hero.css'

export default function Hero() {
  const sectionRef = useRef(null)
  useHeroMotion(sectionRef)

  return (
    <section id="accueil" ref={sectionRef} className="home-hero" aria-labelledby="home-hero-title">
      <div className="page-container home-hero-inner">
        <div className="home-hero-scene">
          <InfinityArtwork />
          <div className="home-hero-copy">
            <p className="home-hero-brand">Infinity Club</p>
            <h1 id="home-hero-title" aria-label="No Limits For Infiniters">
              <span className="home-hero-line" aria-hidden="true"><span>No Limits</span></span>
              <span className="home-hero-line" aria-hidden="true"><span>For Infiniters.</span></span>
            </h1>
            <p className="home-hero-description">A place for curious minds.<br />To learn, build and go further together.</p>
            <div className="home-hero-actions">
              <Link to="/contact" className="home-hero-join" data-ripple>Join the club</Link>
              <Link to="/about" className="text-link">Discover Infinity</Link>
            </div>
          </div>
        </div>
        <div className="home-hero-foot">
          <span>MI Faculty, Bordj Bou Arreridj</span>
          <a href="#poles"><i aria-hidden="true" />Explore what we do</a>
        </div>
      </div>
    </section>
  )
}
