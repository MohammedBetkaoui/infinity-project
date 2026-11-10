import { useRef } from 'react'
import { ArrowDown, ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import CardVortex from './CardVortex'
import ChromeText from './ChromeText'
import InfinityDeckCard from './InfinityDeckCard'
import { aiAutomationEvent as event } from './aiAutomationMedia'

export default function AIAutomationHero() {
  const slotRef = useRef(null)
  return (
    <section className="ai-hero" aria-labelledby="ai-title">
      <div className="ai-hero-stage">
        <div className="ai-hero-backdrop" aria-hidden="true" />
        <CardVortex className="ai-hero-vortex" mode="tunnel" focusRef={slotRef} />
        <div className="ai-hero-shade" aria-hidden="true" />
        <div className="ai-grain" aria-hidden="true" />

        <div className="ai-hero-content ai-shell">
          <div className="ai-topline ai-mono">
            <Link to="/events"><ArrowLeft size={14} aria-hidden="true" /> Events archive</Link>
            <span>Workshop <i aria-hidden="true" /> Edition {event.edition}</span>
          </div>

          <div className="ai-hero-grid">
            <div className="ai-hero-copy">
              <p className="ai-eyebrow ai-mono"><i aria-hidden="true" /> {event.host} × {event.venue}</p>
              <h1 id="ai-title" className="ai-hero-title">
                <span className="sr-only">AI Automation</span>
                <ChromeText text="AI" className="ai-title-ai" />
                <ChromeText text="AUTOMATION" className="ai-title-main" />
              </h1>
              <p className="ai-hero-lead">Beyond the prompt. <span>Into the workflow.</span></p>
              <p className="ai-hero-description">Two days with Infinity Club: talks to understand artificial intelligence and automation, then a lab to put them in your own hands.</p>
              <div className="ai-actions">
                <a className="ai-button" href="#ai-deal"><span>Enter the deck</span><ArrowDown size={16} aria-hidden="true" /></a>
                <a className="ai-link" href="#ai-gallery">View the gallery <ArrowUpRight size={16} aria-hidden="true" /></a>
              </div>
            </div>

            <div className="ai-hero-card-slot" ref={slotRef}>
              <InfinityDeckCard priority />
              <p className="ai-tagline" aria-label={event.tagline}><ChromeText text={event.tagline.toUpperCase()} serif /></p>
            </div>
          </div>

          <div className="ai-hero-meta ai-mono">
            <dl>
              <div><dt>Dates</dt><dd>{event.dates}</dd></div>
              <div><dt>Venue</dt><dd>{event.venue}</dd></div>
              {event.days.map((day) => <div key={day.id}><dt>{day.label}</dt><dd>{day.title}</dd></div>)}
            </dl>
            <span className="ai-scroll-cue" aria-hidden="true"><i /> Scroll to shuffle</span>
          </div>
        </div>

        <div className="ai-flash" aria-hidden="true"><i /><b /></div>
      </div>
    </section>
  )
}
