import { Link } from 'react-router-dom'
import { ArrowUpRight, MoveUp } from 'lucide-react'
import InfinityClubMark from '../../components/InfinityClubMark'
import MiFacultyMark from '../../components/MiFacultyMark'
import AivexLogoMark from './AivexLogoMark'
import { INSTAGRAM_URL } from './aivexData'

export default function AivexFooter() {
  // data-motion-trigger="viewport": the footer sits outside <main> (which
  // carries the viewport trigger), and it is the last block on the page —
  // a scrubbed reveal (top 93% → top 58%) can never complete down there, so
  // the logo row would stay at opacity 0 on desktop. Presence-based reveal
  // instead (see useAivexExperience: the whole footer is the trigger host,
  // as the logo row alone never clears the observer dead zone at max
  // scroll): enter once a little way into view, hide only when fully out.
  return (
    <footer className="ax-footer" data-motion-trigger="viewport">
      <div className="ax-container">
        <div className="ax-footer-callout">
          <div><p>A question about AIVEX?</p><h2>Let’s talk<br />about what’s next.</h2></div>
          <div className="ax-footer-contact"><p>Behind the event are students who are building things, just like you.</p><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="ax-button ax-button-cream">Message Infinity Club <ArrowUpRight size={17} aria-hidden="true" /></a><span>@club_.infinity</span></div>
          <span className="ax-footer-cross" aria-hidden="true">×</span>
        </div>
        <div className="ax-footer-bottom">
          <Link to="/" className="ax-footer-home" aria-label="Infinity Club home">
            <span className="ax-footer-club-brand">
              <InfinityClubMark className="ax-footer-infinity-mark" />
              <strong>INFINITY CLUB</strong>
            </span>
            <i className="ax-footer-brand-rule" aria-hidden="true" />
            <span className="ax-footer-event-brand">
              <AivexLogoMark />
            </span>
            <i className="ax-footer-brand-rule" aria-hidden="true" />
            <span className="ax-footer-mi-brand">
              <MiFacultyMark lockup className="ax-footer-mi-mark" />
            </span>
          </Link>
        
          <a className="ax-to-top" href="#competition" aria-label="Back to top"><MoveUp size={18} /></a>
        </div>
      </div>
    </footer>
  )
}
