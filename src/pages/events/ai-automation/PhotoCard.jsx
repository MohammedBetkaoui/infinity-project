import InfinityClubMark from '../../../components/InfinityClubMark'
import WorkshopPhoto from './WorkshopPhoto'

// A workshop photograph dealt as a playing card: cream face, corner indices,
// the Infinity deck on its back. The whole 4:5 frame stays visible.
// Transform owners: .ai-pcard (layout tilt), .ai-pcard-turn (flip), .ai-pcard-lens (optics).
export default function PhotoCard({ photo, index, sizes, priority = false, eager = false, className = '', caption = true, ...props }) {
  return (
    <figure className={`ai-pcard ${className}`} {...props}>
      <div className="ai-pcard-turn">
        <div className="ai-pcard-face">
          <span className="ai-pcard-index" aria-hidden="true"><b>{index}</b><InfinityClubMark title="" /></span>
          <div className="ai-pcard-photo"><div className="ai-pcard-lens"><WorkshopPhoto photo={photo} sizes={sizes} priority={priority} eager={eager} /></div></div>
          <span className="ai-pcard-index is-bottom" aria-hidden="true"><b>{index}</b><InfinityClubMark title="" /></span>
        </div>
        <div className="ai-pcard-back" aria-hidden="true"><InfinityClubMark title="" /></div>
      </div>
      {caption && <figcaption><span className="ai-mono">{index} / Day {photo.day} / {photo.category}</span><span>{photo.caption}</span></figcaption>}
    </figure>
  )
}
