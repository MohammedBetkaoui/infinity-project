import { ArrowDown, ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../../components/InfinityClubMark'
import { aiAutomationPhotos } from './aiAutomationMedia'
import WorkshopPhoto from './WorkshopPhoto'

export default function AIAutomationHero() {
  return <section className="ai-hero" aria-labelledby="ai-title">
    <div className="ai-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <div className="ai-shell">
      <div className="ai-topline ai-mono"><Link to="/events"><ArrowLeft size={14} aria-hidden="true" /> Events archive</Link><span>Deck of intelligence <span aria-hidden="true">↗</span></span></div>
      <div className="ai-hero-layout">
        <div className="ai-hero-copy">
          <p className="ai-mono ai-eyebrow">Infinity Club / Workshop experience</p>
          <h1 id="ai-title"><span className="ai-title-mask"><span className="ai-title-word ai-title-ai">AI</span></span><span className="ai-title-mask"><span className="ai-title-word">AUTOMATION<span className="ai-title-dot">.</span></span></span></h1>
          <p className="ai-hero-lead">Beyond the prompt.<br /><span>Into the workflow.</span></p>
          <p className="ai-hero-description">A look inside our AI Automation workshop — where ideas, technology and hands-on learning came together.</p>
          <div className="ai-actions"><a className="ai-button" href="#ai-story">Explore the experience <ArrowDown size={16} aria-hidden="true" /></a><a className="ai-link" href="#ai-gallery">View the gallery <ArrowUpRight size={16} aria-hidden="true" /></a></div>
        </div>
        <div className="ai-deck-stage">
          <div className="ai-deck-shadow" aria-hidden="true" />
          <div className="ai-deck-ghost ai-deck-ghost--one" aria-hidden="true" />
          <div className="ai-deck-ghost ai-deck-ghost--two" aria-hidden="true" />
          <div className="ai-deck-drift"><div className="ai-deck-tilt">
            <div className="ai-deck-flip">
              <div className="ai-card-back" aria-hidden="true"><img src="/assets/workshops/infinity-deck-card.webp" width="560" height="868" alt="" /><InfinityClubMark title="" /></div>
              <figure className="ai-card-front">
                <div className="ai-card-register ai-mono"><span>01 / The experience</span><InfinityClubMark title="" /></div>
                <WorkshopPhoto photo={aiAutomationPhotos['in-the-room']} priority sizes="(max-width: 767px) 78vw, (max-width: 1100px) 38vw, 420px" />
                <figcaption className="ai-mono"><span>Real people. Shared curiosity.</span><span>∞</span></figcaption>
              </figure>
              <span className="ai-card-sheen" aria-hidden="true" />
            </div>
          </div></div>
          <p className="ai-deck-caption ai-mono">A new perspective, in every hand.</p>
        </div>
      </div>
      <div className="ai-hero-bottom ai-mono"><span><i /> Ideas → Intelligence → Action</span><span>Scroll to unfold <ArrowDown size={13} aria-hidden="true" /></span></div>
    </div>
  </section>
}
