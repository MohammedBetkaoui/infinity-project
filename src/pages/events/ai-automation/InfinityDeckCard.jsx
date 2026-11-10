import InfinityClubMark from '../../../components/InfinityClubMark'

// The ornate card at the heart of the film: sunburst, frame, glowing emblem.
// Four transform owners, never shared: root (scroll), float (CSS idle),
// tilt (pointer) and body (intro).
export default function InfinityDeckCard({ className = '', priority = false }) {
  return (
    <div className={`ai-icard ${className}`} aria-hidden="true">
      <div className="ai-icard-rays"><i /></div>
      <div className="ai-icard-halo" />
      <div className="ai-icard-float">
        <div className="ai-icard-tilt">
          <div className="ai-icard-body">
            <img src="/assets/workshops/infinity-deck-card.webp" width="560" height="868" alt="" decoding="async" fetchPriority={priority ? 'high' : undefined} />
            <span className="ai-icard-core"><span className="ai-icard-pulse" /><InfinityClubMark title="" /></span>
            <span className="ai-icard-sheen" />
          </div>
        </div>
      </div>
    </div>
  )
}
