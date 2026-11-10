import { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import PhotoCard from './PhotoCard'
import { aiAutomationEvent, aiAutomationLabSpread as spread } from './aiAutomationMedia'

const lab = aiAutomationEvent.days[1]
const tilts = [-2.5, 1.8, -1.2, 2.6, -2, 1.4, -2.8, 1.6]
const pad = (value) => String(value).padStart(2, '0')

// Desktop: a pinned spread the page scroll moves sideways (see the motion
// hook). Elsewhere: a native, swipeable row with scroll snapping.
export default function WorkshopLab() {
  const viewportRef = useRef(null)
  const counterRef = useRef(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const max = viewport.scrollWidth - viewport.clientWidth
        if (max <= 0 || !counterRef.current) return
        counterRef.current.textContent = pad(Math.round((viewport.scrollLeft / max) * (spread.length - 1)) + 1)
      })
    }
    viewport.addEventListener('scroll', update, { passive: true })
    return () => { viewport.removeEventListener('scroll', update); cancelAnimationFrame(frame) }
  }, [])

  return (
    <section id="ai-lab" className="ai-lab" aria-labelledby="ai-lab-title">
      <div className="ai-lab-pin">
        <div className="ai-grain" aria-hidden="true" />
        <div className="ai-shell ai-lab-head">
          <div className="ai-section-rail ai-mono">
            <span>04 / {lab.label} — {lab.title}</span>
            <span className="ai-lab-count" aria-hidden="true"><b ref={counterRef} data-lab-counter>01</b> / {pad(spread.length)}</span>
          </div>
        </div>
        <div className="ai-lab-viewport" ref={viewportRef}>
          <ol className="ai-lab-track" style={{ '--span': spread.length + 1 }}>
            <li className="ai-lab-intro">
              <p className="ai-mono ai-lab-kicker"><i aria-hidden="true" /> {lab.label} / Hands-on</p>
              <h2 id="ai-lab-title" data-ai-heading>Hands on<br />the <em>keyboard.</em></h2>
              <p>{lab.summary}</p>
              <p className="ai-mono ai-lab-hint" aria-hidden="true"><span className="is-pinned">Keep scrolling</span><span className="is-free">Swipe the deck</span> <ArrowRight size={13} /></p>
            </li>
            {spread.map((photo, index) => (
              <li key={photo.id} className="ai-lab-slide" style={{ '--tilt': `${tilts[index % tilts.length]}deg` }}>
                <PhotoCard photo={photo} index={pad(index + 1)} sizes="(max-width: 767px) 72vw, 34vh" />
              </li>
            ))}
            <li className="ai-lab-end">
              <p className="ai-mono">{pad(aiAutomationEvent.days.length)} days / {pad(spread.length)} frames of the lab</p>
              <p className="ai-lab-end-title">From the slides<br />to the <em>keyboard.</em></p>
              <a className="ai-link" href="#ai-gallery">See the full deck <ArrowRight size={16} aria-hidden="true" /></a>
            </li>
          </ol>
        </div>
        <div className="ai-lab-progress" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
