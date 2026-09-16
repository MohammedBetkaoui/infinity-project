export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div role="status" aria-label="Chargement des données">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '13px 14px',
          borderBottom: row === rows - 1 ? 'none' : '1px solid var(--ad-line)',
        }}>
          <span className="ad-sk" style={{ width: 16, height: 16, borderRadius: 5, flex: 'none' }} />
          <span className="ad-sk" style={{ width: 34, height: 34, borderRadius: 10, flex: 'none' }} />
          <span className="ad-sk" style={{ height: 11, flex: 2, maxWidth: 190, opacity: 1 - row * .08 }} />
          {Array.from({ length: columns - 2 }, (_, cell) => (
            <span key={cell} className="ad-sk" style={{ height: 11, flex: 1, maxWidth: 120, opacity: 1 - row * .08 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardGridSkeleton({ cards = 6 }) {
  return (
    <div className="ad-grid" role="status" aria-label="Chargement des événements">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="ad-event" style={{ animation: 'none' }}>
          <div className="ad-sk" style={{ aspectRatio: '16 / 9', borderRadius: 0 }} />
          <div className="ad-event-body" style={{ gap: 9 }}>
            <span className="ad-sk" style={{ height: 15, width: '76%' }} />
            <span className="ad-sk" style={{ height: 10, width: '52%' }} />
            <span className="ad-sk" style={{ height: 5, width: '100%', marginTop: 12 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function StatsSkeleton({ cards = 4 }) {
  return (
    <div className="ad-stats" role="status" aria-label="Chargement des indicateurs">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="ad-stat" style={{ animation: 'none' }}>
          <span className="ad-sk" style={{ height: 10, width: '46%', display: 'block' }} />
          <span className="ad-sk" style={{ height: 30, width: '34%', display: 'block', marginTop: 12 }} />
          <span className="ad-sk" style={{ height: 5, width: '100%', display: 'block', marginTop: 16 }} />
        </div>
      ))}
    </div>
  )
}
