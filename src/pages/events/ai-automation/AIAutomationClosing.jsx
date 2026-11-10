import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../../components/InfinityClubMark'
import CardVortex from './CardVortex'
import ChromeText from './ChromeText'
import { aiAutomationEvent as event } from './aiAutomationMedia'

// The last frame of the film: the emblem bursts into light, the cards settle.
export default function AIAutomationClosing() {
  return (
    <section className="ai-finale" aria-labelledby="ai-finale-title">
      <CardVortex className="ai-finale-rain" mode="fall" interactive={false} intensity={.6} />
      <div className="ai-finale-rays" aria-hidden="true"><i /></div>
      <div className="ai-finale-shade" aria-hidden="true" />
      <div className="ai-grain" aria-hidden="true" />
      <div className="ai-shell ai-finale-inner">
        <div className="ai-finale-emblem" aria-hidden="true"><span className="ai-finale-ring" /><span className="ai-finale-ring is-outer" /><InfinityClubMark title="" /></div>
        <p className="ai-mono ai-finale-kicker">Keep the connection</p>
        <h2 id="ai-finale-title" className="ai-finale-title" data-ai-heading>The workshop ends.<br /><em>The learning continues.</em></h2>
        <p className="ai-finale-copy">One workshop is only the beginning. More ideas, more experiments, and more opportunities to build together.</p>
        <div className="ai-finale-links">
          <Link className="ai-button" to="/join"><span>Join Infinity Club</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link className="ai-link" to="/events">Explore more events <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link className="ai-link" to="/community">Meet the community <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
        <p className="ai-finale-tagline" aria-label={event.tagline}><ChromeText text={event.tagline.toUpperCase()} serif /></p>
      </div>
      <p className="ai-signature ai-mono"><span>Infinity Club</span><span>AI Automation / {event.dates}</span><span>{event.venue}</span></p>
    </section>
  )
}
