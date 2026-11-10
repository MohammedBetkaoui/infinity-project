import OpenDayLightbox from '../open-day/OpenDayLightbox'
// Reuse the existing viewer's flight, focus trap and shared Lenis lock.
import '../open-day/open-day.css'

export default function WorkshopLightbox(props) {
  return <OpenDayLightbox {...props} title="Infinity Club / AI Automation" className="ai-lightbox" showThumbnails />
}
