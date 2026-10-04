import { useRef } from 'react'
import { Link } from 'react-router-dom'
import HomeHeroLines from '../components/HomeHeroLines'
import InfinityClubMark, { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX } from '../components/InfinityClubMark'
import useHeroLogoScroll from '../hooks/useHeroLogoScroll'
import useHeroMotion from '../hooks/useHeroMotion'
import './hero.css'

// introHeld: the home loader still covers the Hero, so its currents and title
// light wait for the handoff instead of playing out underneath.
export default function Hero({ introHeld = false }) {
  const stageRef = useRef(null)
  const heroRef = useRef(null)
  useHeroMotion(heroRef)
  useHeroLogoScroll(stageRef)

  return (
    // The section is the scroll stage of the logo sequence: the Hero stays
    // pinned while the runway scrolls by. #accueil anchors land on this static
    // box; measured on the pinned Hero, they would never leave its position.
    <section id="accueil" ref={stageRef} className="home-hero-stage" aria-labelledby="home-hero-title">
      <div ref={heroRef} className="home-hero">
        <HomeHeroLines held={introHeld} />
        <div className="page-container home-hero-inner">
          <div className="home-hero-scene">
            <div className="home-hero-copy">
              <p className="home-hero-brand">Infinity Club</p>
              <h1 id="home-hero-title" aria-label="No Limits For Infiniters">
                <span className="home-hero-line" aria-hidden="true"><span>No Limits</span></span>
                <span className="home-hero-line" aria-hidden="true"><span>For Infiniters.</span></span>
              </h1>
              <p className="home-hero-description">A student tech community at MI Faculty, BBA.<br />Learn, build and explore AI, development and design together.</p>
              <div className="home-hero-actions">
                <Link to="/join" className="home-hero-join" data-ripple>Join the club</Link>
                <Link to="/about" className="text-link">Discover Infinity</Link>
              </div>
              {/* Landing slot of the home loader's emblem (see HomeLoader), and
                  start of the scroll sequence: the filled mark and its hollow
                  twin are stacked, the twin carries the zoom. */}
              <span className="home-hero-mark" data-home-logo-target aria-hidden="true">
                <InfinityClubMark />
                <svg className="home-hero-mark-outline" viewBox={INFINITY_CLUB_VIEWBOX} focusable="false">
                  <g><path d={INFINITY_CLUB_PATH} /></g>
                </svg>
              </span>
            </div>
          </div>
          <div className="home-hero-foot">
            <span>MI Faculty, Bordj Bou Arreridj</span>
            <a href="#poles"><i aria-hidden="true" />Explore what we do</a>
          </div>
        </div>
      </div>
      <div className="home-hero-runway" aria-hidden="true" />
    </section>
  )
}
