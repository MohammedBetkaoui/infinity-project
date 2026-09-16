import { Link } from 'react-router-dom'
import { ArrowUpRight, MoveUp } from 'lucide-react'
import InfinityMark from '../../components/InfinityMark'
import MiFacultyMark from '../../components/MiFacultyMark'
import AivexLogoMark from './AivexLogoMark'
import { INSTAGRAM_URL } from './aivexData'

export default function AivexFooter() {
  return (
    <footer className="ax-footer">
      <div className="ax-container">
        <div className="ax-footer-callout">
          <div><p>A question about AIVEX?</p><h2>Let’s talk<br />about what’s next.</h2></div>
          <div className="ax-footer-contact"><p>Behind the event are students who are building things, just like you.</p><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="ax-button ax-button-cream">Message Infinity Club <ArrowUpRight size={17} aria-hidden="true" /></a><span>@club_.infinity</span></div>
          <span className="ax-footer-cross" aria-hidden="true">×</span>
        </div>
        <div className="ax-footer-bottom">
          <Link to="/" className="ax-footer-home" aria-label="Infinity Club home">
            <span className="ax-footer-club-brand">
              <InfinityMark className="ax-footer-infinity-mark" />
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
