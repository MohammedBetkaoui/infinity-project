import { ChevronLeft, ChevronRight } from 'lucide-react'

// Compact page list: first, last, current and its neighbours, with gaps
// collapsed so the control never wraps on a long dataset.
const pageList = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  return [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b)
    .flatMap((page, index, list) => (index > 0 && page - list[index - 1] > 1 ? ['gap', page] : [page]))
}

export default function Pagination({ page, pageCount, total, rangeStart, rangeEnd, onPage }) {
  if (pageCount <= 1) {
    return (
      <div className="ad-pagination">
        <span className="ad-pagination-info">{total} résultat{total > 1 ? 's' : ''}</span>
      </div>
    )
  }

  return (
    <nav className="ad-pagination" aria-label="Pagination">
      <span className="ad-pagination-info">{rangeStart}–{rangeEnd} sur {total}</span>
      <div className="ad-pagination-pages">
        <button type="button" className="ad-page-btn" onClick={() => onPage(page - 1)}
          disabled={page === 1} aria-label="Page précédente">
          <ChevronLeft size={14} />
        </button>
        {pageList(page, pageCount).map((entry, index) => (
          entry === 'gap'
            ? <span key={`gap-${index}`} className="ad-pagination-info" style={{ padding: '0 2px' }}>···</span>
            : (
              <button key={entry} type="button" className="ad-page-btn" data-on={entry === page || undefined}
                onClick={() => onPage(entry)} aria-current={entry === page ? 'page' : undefined}>
                {entry}
              </button>
            )
        ))}
        <button type="button" className="ad-page-btn" onClick={() => onPage(page + 1)}
          disabled={page === pageCount} aria-label="Page suivante">
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  )
}
