import InfinityClubMark from '../../../components/InfinityClubMark'
import { aiAutomationEvent as workshop } from './aiAutomationMedia'

const [talks, lab] = workshop.days
const hand = [
  { rank: 'A', kicker: talks.label, title: talks.title, copy: talks.summary },
  { rank: 'K', kicker: lab.label, title: lab.title, copy: lab.summary },
  { rank: 'Q', kicker: 'Venue', title: workshop.venue, copy: 'Hosted by Infinity Club, the science and technology club of the University of Bordj Bou Arreridj.' },
  { rank: 'J', kicker: 'Dates', title: '08 — 09', copy: 'November 2026. Two days, one deck, the same curiosity on both sides of the screen.' },
]

// Pointer-driven tilt and glare, written as CSS variables: no React render.
function tilt(event) {
  if (event.pointerType !== 'mouse') return
  const card = event.currentTarget
  const box = card.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width
  const y = (event.clientY - box.top) / box.height
  card.style.setProperty('--rx', `${(.5 - y) * 12}deg`)
  card.style.setProperty('--ry', `${(x - .5) * 14}deg`)
  card.style.setProperty('--mx', `${x * 100}%`)
  card.style.setProperty('--my', `${y * 100}%`)
}
function untilt(event) {
  const card = event.currentTarget
  for (const name of ['--rx', '--ry', '--mx', '--my']) card.style.removeProperty(name)
}

export default function EventDeal() {
  return (
    <section id="ai-deal" className="ai-deal ai-section" aria-labelledby="ai-deal-title">
      <div className="ai-shell">
        <div className="ai-section-rail ai-mono"><span>01 / The deal</span><span>{workshop.dates}</span></div>
        <header className="ai-deal-heading">
          <h2 id="ai-deal-title" data-ai-heading>Two days.<br />One deck.<br /><em>No limits.</em></h2>
          <div className="ai-deal-intro">
            <p>The AI Automation workshop played its hand in two moves: talks to understand the ideas, then a lab to try them with your own hands.</p>
            <p className="ai-mono">Hover a card to look closer</p>
          </div>
        </header>
        <ol className="ai-hand" data-ai-hand>
          {hand.map((card, index) => (
            <li key={card.rank} className="ai-hand-slot" style={{ '--fan': index - (hand.length - 1) / 2 }}>
              <article className="ai-play-card" onPointerMove={tilt} onPointerLeave={untilt}>
                <div className="ai-play-turn">
                  <div className="ai-play-face">
                    <span className="ai-corner" aria-hidden="true"><b>{card.rank}</b><InfinityClubMark title="" /></span>
                    <span className="ai-play-pip" aria-hidden="true"><InfinityClubMark title="" /></span>
                    <div className="ai-play-body">
                      <p className="ai-play-kicker ai-mono">{card.kicker}</p>
                      <h3>{card.title}</h3>
                      <p>{card.copy}</p>
                    </div>
                    <span className="ai-corner is-bottom" aria-hidden="true"><b>{card.rank}</b><InfinityClubMark title="" /></span>
                    <span className="ai-play-glare" aria-hidden="true" />
                  </div>
                  <div className="ai-play-back" aria-hidden="true"><InfinityClubMark title="" /></div>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
