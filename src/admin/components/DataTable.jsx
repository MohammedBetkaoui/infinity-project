import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

function SelectAll({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return <input ref={ref} type="checkbox" className="ad-check" checked={checked} onChange={onChange} aria-label={label} />
}

export default function DataTable({
  columns,
  rows,
  rowKey,
  selectable = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
  sort,
  onSort,
  onRowClick,
  renderActions,
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((row) => selectedIds.has(rowKey(row)))
  const someSelected = selectable && rows.some((row) => selectedIds.has(rowKey(row)))

  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 44 }}>
                <SelectAll checked={allSelected} indeterminate={someSelected && !allSelected}
                  onChange={onToggleAll} label="Tout sélectionner" />
              </th>
            )}
            {columns.map(({ key, label, sortable, width, align }) => (
              <th key={key} style={{ width, textAlign: align }}>
                {sortable ? (
                  <button type="button" className="ad-th-sort" data-active={sort?.key === key || undefined}
                    onClick={() => onSort(key)}>
                    {label}
                    {sort?.key !== key && <ChevronsUpDown size={12} aria-hidden="true" />}
                    {sort?.key === key && (sort.dir === 'asc'
                      ? <ArrowUp size={12} aria-hidden="true" />
                      : <ArrowDown size={12} aria-hidden="true" />)}
                  </button>
                ) : label}
              </th>
            ))}
            {renderActions && <th style={{ width: 108, textAlign: 'right' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = rowKey(row)
            const selected = selectable && selectedIds.has(id)
            return (
              <tr key={id} data-selected={selected || undefined}
                style={{ '--i': index, cursor: onRowClick ? 'pointer' : undefined }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {selectable && (
                  <td onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" className="ad-check" checked={selected}
                      onChange={() => onToggleRow(id)}
                      aria-label={`Sélectionner ${row.fullName || row.title || id}`} />
                  </td>
                )}
                {columns.map(({ key, render, align }) => (
                  <td key={key} style={{ textAlign: align }}>{render(row)}</td>
                ))}
                {renderActions && (
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="ad-row-actions">{renderActions(row)}</div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
