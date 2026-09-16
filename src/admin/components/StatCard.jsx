import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import InfinityMark from '../../components/InfinityMark'

const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }

// Intentionally not four identical tiles: `lead` fills the ground with the
// brand green and carries the ∞ watermark, and each tile gets its own
// micro-visual (bars, progress track, ring) so the row reads as a
// composition rather than a repeated template.
export default function StatCard({
  index = 0,
  label,
  icon: Icon,
  value,
  unit,
  lead = false,
  delta,
  deltaTone = 'flat',
  foot,
  spark,
  track,
  ring,
}) {
  const DeltaIcon = DELTA_ICON[deltaTone] || Minus
  const peak = Array.isArray(spark) ? Math.max(...spark) : 0
  const ringLength = 2 * Math.PI * 17

  return (
    <article className="ad-stat" data-lead={lead || undefined} style={{ '--i': index }}>
      {lead && <div className="ad-stat-mark" aria-hidden="true"><InfinityMark /></div>}

      {typeof ring === 'number' && (
        <div className="ad-ring" aria-hidden="true">
          <svg width="42" height="42" viewBox="0 0 42 42">
            <circle className="ad-ring-bg" cx="21" cy="21" r="17" />
            <circle className="ad-ring-fg" cx="21" cy="21" r="17"
              strokeDasharray={ringLength}
              strokeDashoffset={ringLength * (1 - Math.min(Math.max(ring, 0), 1))}
              style={{ '--dash': ringLength }} />
          </svg>
        </div>
      )}

      <p className="ad-stat-label">
        {Icon && <Icon size={13} strokeWidth={1.8} aria-hidden="true" />}
        {label}
      </p>

      <p className="ad-stat-value ad-display">
        {value}
        {unit && <span className="ad-stat-unit">{unit}</span>}
      </p>

      {Array.isArray(spark) && (
        <div className="ad-spark" aria-hidden="true">
          {spark.map((bar, barIndex) => (
            <i key={barIndex}
              data-peak={bar === peak || undefined}
              style={{ height: `${Math.max(8, (bar / (peak || 1)) * 100)}%`, '--b': barIndex }} />
          ))}
        </div>
      )}

      {typeof track === 'number' && (
        <div className="ad-track" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(Math.max(track, 0), 1) * 100)}%` }} />
        </div>
      )}

      {(delta || foot) && (
        <p className="ad-stat-foot">
          {delta && (
            <span className="ad-stat-delta" data-tone={deltaTone}>
              <DeltaIcon size={11} strokeWidth={2.2} aria-hidden="true" />{delta}
            </span>
          )}
          {foot}
        </p>
      )}
    </article>
  )
}
