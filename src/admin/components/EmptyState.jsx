import InfinityMark from '../../components/InfinityMark'

export default function EmptyState({ title, message, action }) {
  return (
    <div className="ad-empty">
      <div className="ad-empty-mark" aria-hidden="true"><InfinityMark /></div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  )
}
