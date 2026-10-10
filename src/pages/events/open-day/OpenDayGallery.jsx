import { Expand } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import OpenDayFrameChrome from './OpenDayFrameChrome.jsx'
import { openDayGallery } from './openDayGallery.js'
import OpenDayLightbox from './OpenDayLightbox'

export default function OpenDayGallery() {
  const sheetRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(null)
  // The viewer flies each photo out of, and back into, its print on the sheet.
  const originOf = useCallback((index) => sheetRef.current?.querySelectorAll('.od-sheet-image img')[index] ?? null, [])
  return (
    <section id="open-day-gallery" className="od-gallery od-paper" aria-labelledby="od-gallery-title">
      <div className="page-container">
        <header className="od-gallery-heading">
          <div><p className="od-label">Moment 04 / Connect</p><h2 id="od-gallery-title">A day, kept<br />in frames.</h2></div>
          <div className="od-gallery-note"><p>Students at the stands, thoughts across a table, a pause for a picture. The people make the day.</p><p className="od-label">Contact sheet / 05 OCT 2026</p><p className="od-gallery-help">Select any image to take a closer look.</p></div>
        </header>
        <div ref={sheetRef} className="od-contact-sheet">
          <span className="od-sheet-edge od-label" aria-hidden="true">Infinity ◆ 05·10·26 ◆ Frames 01–{String(openDayGallery.length).padStart(2, '0')}</span>
          {openDayGallery.map((photo, index) => (
            <figure key={photo.id} className={`od-sheet-image od-sheet-image--${photo.id}`}>
              <button type="button" onClick={() => setActiveIndex(index)} aria-label={`Enlarge image ${index + 1}: ${photo.alt}`} aria-haspopup="dialog">
                <span className="od-photo-lens"><img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async" /></span>
                <OpenDayFrameChrome frame={index + 1} />
                <span className="od-image-hover-label od-label" aria-hidden="true">View frame</span>
                <span className="od-image-expand" aria-hidden="true"><Expand size={18} /></span>
              </button>
              <figcaption><span className="od-image-number">{String(index + 1).padStart(2, '0')}</span><span>{photo.caption}</span><span className="od-label">{photo.kind === 'activity' ? 'Activity' : 'Open Day'}</span></figcaption>
            </figure>
          ))}
        </div>
        <div className="od-sheet-end od-label" aria-hidden="true"><span>End of contact sheet</span><span>Infinity / 05 · OCT · 26</span></div>
      </div>
      {activeIndex !== null && <OpenDayLightbox photos={openDayGallery} index={activeIndex} onChange={setActiveIndex} onClose={() => setActiveIndex(null)} originOf={originOf} />}
    </section>
  )
}
