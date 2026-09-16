import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import AivexLogoMark from './AivexLogoMark'
import AivexScene from './AivexScene'
import { INSTAGRAM_URL } from './aivexData'

export default function AivexHero() {
  return (
    <section className="ax-hero" id="competition" aria-labelledby="ax-title" tabIndex={-1}>
      <div className="ax-container">
        <div className="ax-hero-topline ax-intro-detail">
          <p>National AI application programming competition</p>
          <span>Imagined here. Built for what’s next.</span>
        </div>
        <div className="ax-hero-layout">
          <div className="ax-hero-copy">
            <h1 id="ax-title"><span className="sr-only">AIVEX. Intelligence in action.</span><span aria-hidden="true"><AivexLogoMark large data-aivex-logo-target /></span></h1>
            <p className="ax-hero-statement" aria-hidden="true">
              <span><span className="ax-title-line">Intelligence.</span></span>
              <span><span className="ax-title-line">In action.</span></span>
            </p>
            <p className="ax-hero-description ax-intro-detail">Ideas are everywhere.<br />What matters is what we do with them.</p>
            <div className="ax-hero-actions ax-intro-detail">
              <Link className="ax-button ax-button-amber" to="/aivex/register">Register for AIVEX</Link>
              <a className="ax-text-link" href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Follow the announcements <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
          <AivexScene />
        </div>
        <div className="ax-hero-rail ax-intro-detail">
          <div><span>Organised by</span><strong>Infinity Club</strong></div>
          <div><span>At our university</span><strong>Faculty of Mathematics and Computer Science</strong></div>
          <p><MapPin size={16} aria-hidden="true" /> Bordj Bou Arréridj, Algeria</p>
        </div>
      </div>
    </section>
  )
}
