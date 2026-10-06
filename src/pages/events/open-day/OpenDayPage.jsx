import { ArrowUpRight } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import OpenDayHero from './OpenDayHero'
import OpenDayClubFilm from './OpenDayClubFilm.jsx'
import OpenDayStory from './OpenDayStory'
import OpenDayGallery from './OpenDayGallery.jsx'
import useOpenDayMotion from './useOpenDayMotion'
import './open-day.css'

export default function OpenDayPage() {
  const pageRef = useRef(null)
  useOpenDayMotion(pageRef)
  return (
    <article ref={pageRef} className="open-day-page">
      <OpenDayHero />
      <OpenDayClubFilm />
      <OpenDayStory />
      <OpenDayGallery />
      <section className="od-closing" aria-labelledby="od-closing-title">
        <div className="page-container">
          <p className="od-label od-mint">Field notes closed / Curiosity still open</p>
          <h2 id="od-closing-title">The day ends.<br /><span>The curiosity doesn’t.</span></h2>
          <div className="od-closing-bottom"><p>Open Day was one moment. The conversations, ideas and people behind it continue through Infinity.</p><div className="od-closing-links"><Link className="od-text-link" to="/events">Explore more events <ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="od-text-link" to="/community">Discover the community <ArrowUpRight size={18} aria-hidden="true" /></Link></div></div>
          <div className="od-closing-signoff od-label" aria-hidden="true"><span>05 / OCT / 26</span><span>Infinity Club · Bordj Bou Arreridj</span></div>
        </div>
      </section>
    </article>
  )
}
