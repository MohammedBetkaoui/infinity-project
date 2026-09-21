import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, LayoutGrid, List, SlidersHorizontal } from 'lucide-react'
import { Button, BulkBar, Drawer, EmptyState, Modal, Pagination, SearchField, StatusBadge } from './AdminUI'

export function RecordTable({ records, columns, selected = [], onSelect, onBulk, onOpen, pageSize = 6, defaultSort = '', cards = false, emptyTitle, className = '', rowClassName }) {
  const [sort, setSort] = useState({ key: defaultSort, asc: true })
  const [page, setPage] = useState(1)
  const sorted = [...records].sort((a, b) => !sort.key ? 0 : String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'en', { numeric: true }) * (sort.asc ? 1 : -1))
  const current = Math.min(page, Math.max(1, Math.ceil(records.length / pageSize)))
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize)
  const selectAll = visible.length > 0 && visible.every((r) => selected.includes(r.id))
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  return <>
    <BulkBar count={selected.length} onClear={() => onSelect([])} onStatus={onBulk}/>
    <div className={`adm-table-wrap ${cards ? 'is-card-view' : ''} ${className}`}>
      <table className="adm-table">
        <thead><tr>{onSelect && <th className="is-checkbox"><input type="checkbox" checked={selectAll} onChange={() => onSelect(selectAll ? selected.filter((id) => !visible.some((r) => r.id === id)) : [...new Set([...selected, ...visible.map((r) => r.id)])])} aria-label="Select visible records"/></th>}{columns.map((column) => <th key={column.key} className={column.secondary ? 'adm-secondary-column' : ''} aria-sort={sort.key === column.key ? sort.asc ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort({ key: column.key, asc: sort.key === column.key ? !sort.asc : true })}>{column.label}{sort.key === column.key ? sort.asc ? <ArrowUp size={12}/> : <ArrowDown size={12}/> : <ArrowUpDown size={12}/>}</button></th>)}{onOpen && <th aria-label="Open record"/>}</tr></thead>
        <tbody>{visible.map((record) => <tr key={record.id} className={`${selected.includes(record.id) ? 'is-selected' : ''} ${record.status === 'New' ? 'is-new' : ''} ${rowClassName?.(record) || ''}`}>
          {onSelect && <td className="is-checkbox"><input type="checkbox" checked={selected.includes(record.id)} onChange={() => toggle(record.id)} aria-label={`Select ${record.name}`}/></td>}
          {columns.map((column, index) => <td key={column.key} data-label={column.label} className={column.secondary ? 'adm-secondary-column' : ''}>{index === 0 && onOpen ? <button className="adm-record-link" onClick={() => onOpen(record)}>{column.render ? column.render(record) : record[column.key]}</button> : column.render ? column.render(record) : record[column.key] || '—'}</td>)}
          {onOpen && <td className="adm-row-action"><button onClick={() => onOpen(record)} aria-label={`Open ${record.name || record.entity || 'record'}`}><ChevronRight size={17}/><span>Open file</span></button></td>}
        </tr>)}</tbody>
      </table>
      {!records.length && <EmptyState title={emptyTitle || 'No matching records'} />}
    </div>
    <Pagination current={current} count={records.length} pageSize={pageSize} onChange={setPage}/>
  </>
}

export function RecordToolbar({ search, onSearch, placeholder, filters = {}, onFilters, definitions = [], quickDefinitions = [], resultCount, filterLabel = 'Filters', view, onView, extra }) {
  const [open, setOpen] = useState(false)
  const activeFilters = Object.entries(filters).filter(([, value]) => value)
  const count = activeFilters.length
  const hasResultCount = Number.isFinite(resultCount)
  return <>
    <div className="adm-toolbar">
      <SearchField value={search} onChange={onSearch} placeholder={placeholder}/>
      <div className="adm-toolbar__filters">
        {quickDefinitions.map((definition) => <label className="adm-quick-filter" key={definition.key}><span>{definition.shortLabel || definition.label}</span><select aria-label={definition.label} value={filters[definition.key] || ''} onChange={(event) => onFilters({ ...filters, [definition.key]: event.target.value })}><option value="">{definition.allLabel || 'All'}</option>{definition.options.map((value) => <option key={value}>{value}</option>)}</select></label>)}
        {extra}
        <Button variant="secondary" onClick={() => setOpen(true)} icon={<SlidersHorizontal size={15}/>}>{filterLabel} {count ? <span className="adm-filter-count">{count}</span> : null}</Button>
        {onView && <div className="adm-view-toggle" aria-label="Record view"><button aria-label="Table view" aria-pressed={view === 'table'} className={view === 'table' ? 'is-active' : ''} onClick={() => onView('table')}><List size={17}/></button><button aria-label="Card view" aria-pressed={view === 'cards'} className={view === 'cards' ? 'is-active' : ''} onClick={() => onView('cards')}><LayoutGrid size={17}/></button></div>}
      </div>
    </div>
    {(count > 0 || hasResultCount) && <div className="adm-active-filters">
      {hasResultCount && <p><i/><span>Live scope</span><b>{resultCount} matching record{resultCount !== 1 ? 's' : ''}</b></p>}
      {count > 0 ? <div className="adm-filter-chips">{activeFilters.map(([key, value]) => <button key={key} aria-label={`Remove ${definitions.find((definition) => definition.key === key)?.label || key} filter`} onClick={() => onFilters({ ...filters, [key]: '' })}><span>{definitions.find((definition) => definition.key === key)?.shortLabel || definitions.find((definition) => definition.key === key)?.label || key}</span><b>{value}</b><i aria-hidden="true">×</i></button>)}</div> : <span className="adm-filter-scope__idle">All records included</span>}
      {count > 0 && <button className="adm-clear-filters" onClick={() => onFilters({})}>Clear all</button>}
    </div>}
    {open && <Drawer title="Refine records" eyebrow="Search & filters" onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => onFilters({})}>Reset filters</Button><Button onClick={() => setOpen(false)}>Show {hasResultCount ? resultCount : ''} results</Button></>}>
      {hasResultCount && <div className="adm-filter-drawer-summary"><b>{resultCount}</b><span>records match the current criteria. Changes are reflected immediately.</span></div>}
      <div className="adm-filter-fields">{definitions.map((definition) => <label className="adm-form-field" key={definition.key}><span>{definition.label}</span>{definition.type === 'date' ? <input type="date" value={filters[definition.key] || ''} onChange={(event) => onFilters({ ...filters, [definition.key]: event.target.value })}/> : <select value={filters[definition.key] || ''} onChange={(event) => onFilters({ ...filters, [definition.key]: event.target.value })}><option value="">All</option>{definition.options.map((value) => <option key={value}>{value}</option>)}</select>}</label>)}</div>
    </Drawer>}
  </>
}

export function ActionDialog({ action, onClose, onSubmit }) {
  const formId = useId()
  const [error, setError] = useState('')
  if (!action) return null
  const submit = (event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    if (action.reason !== false && !values.reason?.trim()) { setError('Add an internal reason before confirming.'); return }
    const issue = onSubmit(values)
    if (issue) { setError(issue); return }
    onClose()
  }
  return <Modal open onClose={onClose} title={action.title} eyebrow={action.eyebrow || 'Administrative action'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form={formId} variant={action.danger ? 'danger' : 'primary'}>{action.submit || 'Confirm action'}</Button></>}>
    <p>{action.description || 'This decision will update the local demo record and be recorded in the activity log.'}</p>
    <form id={formId} onSubmit={submit} className="adm-action-form">{action.fields?.map((field) => <label className="adm-form-field" key={field.name}><span>{field.label}{field.required && <em>Required</em>}</span>{field.options ? <select name={field.name} required={field.required} defaultValue={field.value || field.options[0]}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea name={field.name} defaultValue={field.value} required={field.required}/> : <input name={field.name} type={field.type || 'text'} defaultValue={field.value} required={field.required} min={field.min} max={field.max} placeholder={field.placeholder}/>}</label>)}{action.reason !== false && <label className="adm-form-field"><span>Internal reason <em>Required</em></span><textarea name="reason" required placeholder="Explain the decision for your colleagues…"/></label>}{error && <p role="alert" className="adm-form-error">{error}</p>}</form>
  </Modal>
}

export function Facts({ items }) {
  return <dl className="adm-detail-grid">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
}

export function History({ items = [] }) {
  return <div className="adm-history">{items.length ? [...items].reverse().map((item, index) => <article key={`${item.at}-${index}`}><i/><div><b>{item.title}</b>{item.note && <p>{item.note}</p>}<small>{item.actor} · {new Date(item.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><StatusBadge tone="neutral">{item.kind || 'Update'}</StatusBadge></article>) : <div className="adm-history-incomplete"><p>Historical data incomplete</p><small>No earlier actions were imported for this demonstration record. New actions will appear here.</small></div>}</div>
}

export function SummaryStrip({ items }) {
  return <div className="adm-people-summary">{items.map((item, i) => <article key={item.label}><span>0{i + 1}</span><div><strong>{String(item.value).padStart(2, '0')}</strong><p>{item.label}</p></div>{item.meta && <em>{item.meta}</em>}</article>)}</div>
}
