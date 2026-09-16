const TONES = {
  pending: 'pending',
  accepted: 'accepted',
  rejected: 'rejected',
  draft: 'neutral',
  published: 'live',
  archived: 'neutral',
  done: 'accepted',
}

export default function StatusBadge({ status, label }) {
  return (
    <span className="ad-badge" data-tone={TONES[status] || 'neutral'}>
      <i aria-hidden="true" />
      {label}
    </span>
  )
}
