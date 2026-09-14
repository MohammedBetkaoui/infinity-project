import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import useGalleryPosition from './useGalleryPosition'

function Thumbnail({ photo, index, activeIndex, position, reduced, onSelect, targetId }) {
  const thumbnailRef = useRef(null)
  useGalleryPosition(thumbnailRef, position, (node) => {
    gsap.set(node, { opacity: 1, scale: 1 })
    const opacity = gsap.quickSetter(node, 'opacity')
    const scale = gsap.quickSetter(node, 'scale')
    return (value) => {
      opacity(Math.max(.34, 1 - Math.abs(value - index) * .33))
      scale(reduced ? 1 : 1 - Math.min(Math.abs(value - index), 2) * .045)
    }
  }, reduced)
  const nearby = Math.abs(index - activeIndex) <= 2
  return (
    <button ref={thumbnailRef}
      type="button"
      className="ax-gallery-thumbnail relative shrink-0"
      aria-label={`View photograph ${index + 1}: ${photo.caption}`}
      aria-current={index === activeIndex ? 'true' : undefined}
      aria-controls={targetId}
      tabIndex={index === activeIndex ? 0 : -1}
      data-photo-index={index}
      onClick={() => onSelect(index)}
    >
      {nearby && <img src={photo.src} alt="" width={photo.width} height={photo.height} loading="lazy" decoding="async" draggable="false" />}
      <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    </button>
  )
}

export default function GalleryThumbnailRail({ photos, gallery, targetId }) {
  const railRef = useRef(null)
  const trackRef = useRef(null)
  useGalleryPosition(trackRef, gallery.position, (track) => {
    gsap.set(track, { x: 0, y: 0 })
    const translate = gsap.quickSetter(track, gallery.mobile ? 'x' : 'y', 'px')
    // Fixed thumbnail pitch avoids layout reads while the visitor scrolls.
    return (value) => translate((gallery.mobile ? 100 : 104) - value * (gallery.mobile ? 58 : 96))
  }, gallery.mobile)

  useEffect(() => {
    if (railRef.current.contains(document.activeElement)) {
      railRef.current.querySelector(`[data-photo-index="${gallery.activeIndex}"]`)?.focus({ preventScroll: true })
    }
  }, [gallery.activeIndex])

  return (
    <aside className="ax-gallery-rail min-w-0" aria-label="Choose a photograph" ref={railRef}>
      <p className="ax-gallery-rail-label">Coming into view</p>
      <div className="ax-gallery-rail-window relative overflow-hidden">
        <div ref={trackRef}
          className="ax-gallery-rail-track flex"
        >
          {photos.map((photo, index) => (
            <Thumbnail key={photo.src} photo={photo} index={index} activeIndex={gallery.activeIndex} position={gallery.position} reduced={gallery.reduced} onSelect={gallery.showPhoto} targetId={targetId} />
          ))}
        </div>
      </div>
    </aside>
  )
}
