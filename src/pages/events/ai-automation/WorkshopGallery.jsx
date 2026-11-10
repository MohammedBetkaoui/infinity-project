import { useCallback, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { aiAutomationGallery } from './aiAutomationMedia'
import WorkshopPhoto from './WorkshopPhoto'
import WorkshopLightbox from './WorkshopLightbox'

export default function WorkshopGallery() {
  const sheetRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(null)
  const originOf = useCallback((index) => sheetRef.current?.querySelectorAll('.ai-gallery-frame img')[index] ?? null, [])
  return <section id="ai-gallery" className="ai-gallery ai-section" aria-labelledby="ai-gallery-title">
    <div className="ai-shell">
      <div className="ai-section-rail ai-mono"><span>04 / Digital memory archive</span><span>08 selected frames</span></div>
      <header className="ai-gallery-heading"><h2 id="ai-gallery-title" data-ai-heading>The moments<br /><em>we keep.</em></h2><div><p>A workshop, captured in frames.</p><p className="ai-mono">Select a photograph to look closer.</p></div></header>
      <div ref={sheetRef} className="ai-contact-sheet">{aiAutomationGallery.map((photo, index) => <figure className={`ai-gallery-frame ai-gallery-frame--${index + 1}`} key={photo.id}>
        <div className="ai-gallery-register ai-mono"><span>FRAME / {String(index + 1).padStart(2, '0')}</span><span>{photo.category}</span></div>
        <button type="button" aria-haspopup="dialog" aria-label={`Enlarge photograph ${index + 1}: ${photo.alt}`} onClick={() => setActiveIndex(index)}><WorkshopPhoto photo={photo} sizes="(max-width: 540px) 90vw, (max-width: 900px) 44vw, 33vw" /><span className="ai-gallery-expand" aria-hidden="true"><ArrowUpRight size={20} /></span></button>
        <figcaption>{photo.caption}</figcaption>
      </figure>)}</div>
      <div className="ai-gallery-end ai-mono"><span>End of the contact sheet</span><span>The ideas stay open. ↗</span></div>
    </div>
    {activeIndex !== null && <WorkshopLightbox photos={aiAutomationGallery} index={activeIndex} onChange={setActiveIndex} onClose={() => setActiveIndex(null)} originOf={originOf} />}
  </section>
}
