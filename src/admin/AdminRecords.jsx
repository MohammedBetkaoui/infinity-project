import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, LayoutGrid, List, SlidersHorizontal } from 'lucide-react'
import { Button, BulkBar, Drawer, EmptyState, Modal, Pagination, SearchField, StatusBadge } from './AdminUI'

export function RecordTable({ records, columns, selected = [], onSelect, onBulk, onOpen, pageSize = 6, defaultSort = '', cards = false, emptyTitle, className = '', rowClassName, labels = {}, locale = 'en' }) {
  const [sort, setSort] = useState({ key: defaultSort, asc: true })
  const [page, setPage] = useState(1)
  const sorted = [...records].sort((a, b) => !sort.key ? 0 : String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), locale, { numeric: true }) * (sort.asc ? 1 : -1))
  const current = Math.min(page, Math.max(1, Math.ceil(records.length / pageSize)))
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize)
  const selectAll = visible.length > 0 && visible.every((r) => selected.includes(r.id))
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  return <>
    <BulkBar count={selected.length} onClear={() => onSelect([])} onStatus={onBulk}/>
    <div className={`adm-table-wrap ${cards ? 'is-card-view' : ''} ${className}`}>
      <table className="adm-table">
        <thead><tr>{onSelect && <th className="is-checkbox"><input type="checkbox" checked={selectAll} onChange={() => onSelect(selectAll ? selected.filter((id) => !visible.some((r) => r.id === id)) : [...new Set([...selected, ...visible.map((r) => r.id)])])} aria-label={labels.selectVisible || 'Select visible records'}/></th>}{columns.map((column) => <th key={column.key} className={column.secondary ? 'adm-secondary-column' : ''} aria-sort={sort.key === column.key ? sort.asc ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort({ key: column.key, asc: sort.key === column.key ? !sort.asc : true })}>{column.label}{sort.key === column.key ? sort.asc ? <ArrowUp size={12}/> : <ArrowDown size={12}/> : <ArrowUpDown size={12}/>}</button></th>)}{onOpen && <th aria-label={labels.openRecord || 'Open record'}/>}</tr></thead>
        <tbody>{visible.map((record) => <tr key={record.id} className={`${selected.includes(record.id) ? 'is-selected' : ''} ${record.status === 'New' ? 'is-new' : ''} ${rowClassName?.(record) || ''}`}>
          {onSelect && <td className="is-checkbox"><input type="checkbox" checked={selected.includes(record.id)} onChange={() => toggle(record.id)} aria-label={`Select ${record.name}`}/></td>}
          {columns.map((column, index) => <td key={column.key} data-column={column.key} data-label={column.label} className={column.secondary ? 'adm-secondary-column' : ''}>{index === 0 && onOpen ? <button className="adm-record-link" onClick={() => onOpen(record)}>{column.render ? column.render(record) : record[column.key]}</button> : column.render ? column.render(record) : record[column.key] || '—'}</td>)}
          {onOpen && <td className="adm-row-action"><button onClick={() => onOpen(record)} aria-label={`${labels.open || 'Open'} ${record.name || record.entity || labels.record || 'record'}`}><ChevronRight size={17}/><span>{labels.openFile || 'Open file'}</span></button></td>}
        </tr>)}</tbody>
      </table>
      {!records.length && <EmptyState title={emptyTitle || labels.empty || 'No matching records'} copy={labels.emptyCopy}/>} 
    </div>
    <Pagination current={current} count={records.length} pageSize={pageSize} onChange={setPage} labels={labels.pagination}/>
  </>
}

export function RecordToolbar({ search, onSearch, placeholder, filters = {}, onFilters, definitions = [], quickDefinitions = [], resultCount, filterLabel = 'Filters', view, onView, extra, labels = {}, getOptionLabel = (value) => value }) {
  const [open, setOpen] = useState(false)
  const activeFilters = Object.entries(filters).filter(([, value]) => value)
  const count = activeFilters.length
  const hasResultCount = Number.isFinite(resultCount)
  return <>
    <div className="adm-toolbar">
      <SearchField value={search} onChange={onSearch} placeholder={placeholder} label={labels.search || 'Search'} clearLabel={labels.clearSearch || 'Clear search'}/>
      <div className="adm-toolbar__filters">
        {quickDefinitions.map((definition) => <label className="adm-quick-filter" key={definition.key}><span>{definition.shortLabel || definition.label}</span><select aria-label={definition.label} value={filters[definition.key] || ''} onChange={(event) => onFilters({ ...filters, [definition.key]: event.target.value })}><option value="">{definition.allLabel || labels.all || 'All'}</option>{definition.options.map((value) => <option key={value} value={value}>{getOptionLabel(value)}</option>)}</select></label>)}
        {extra}
        <Button variant="secondary" onClick={() => setOpen(true)} icon={<SlidersHorizontal size={15}/>}>{filterLabel} {count ? <span className="adm-filter-count">{count}</span> : null}</Button>
        {onView && <div className="adm-view-toggle" aria-label={labels.recordView || 'Record view'}><button aria-label={labels.tableView || 'Table view'} aria-pressed={view === 'table'} className={view === 'table' ? 'is-active' : ''} onClick={() => onView('table')}><List size={17}/></button><button aria-label={labels.cardView || 'Card view'} aria-pressed={view === 'cards'} className={view === 'cards' ? 'is-active' : ''} onClick={() => onView('cards')}><LayoutGrid size={17}/></button></div>}
      </div>
    </div>
    {(count > 0 || hasResultCount) && <div className="adm-active-filters">
      {hasResultCount && <p><i/><span>{labels.liveScope || 'Live scope'}</span><b>{labels.matchingRecords ? labels.matchingRecords(resultCount) : <>{resultCount} matching record{resultCount !== 1 ? 's' : ''}</>}</b></p>}
      {count > 0 ? <div className="adm-filter-chips">{activeFilters.map(([key, value]) => <button key={key} aria-label={`${labels.removeFilter || 'Remove'} ${definitions.find((definition) => definition.key === key)?.label || key}`} onClick={() => onFilters({ ...filters, [key]: '' })}><span>{definitions.find((definition) => definition.key === key)?.shortLabel || definitions.find((definition) => definition.key === key)?.label || key}</span><b>{getOptionLabel(value)}</b><i aria-hidden="true">×</i></button>)}</div> : <span className="adm-filter-scope__idle">{labels.allIncluded || 'All records included'}</span>}
      {count > 0 && <button className="adm-clear-filters" onClick={() => onFilters({})}>{labels.clearAll || 'Clear all'}</button>}
    </div>}
    {open && <Drawer title={labels.drawerTitle || 'Refine records'} eyebrow={labels.drawerEyebrow || 'Search & filters'} closeLabel={labels.close || 'Close details'} onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => onFilters({})}>{labels.reset || 'Reset filters'}</Button><Button onClick={() => setOpen(false)}>{labels.showResults ? labels.showResults(hasResultCount ? resultCount : '') : <>Show {hasResultCount ? resultCount : ''} results</>}</Button></>}>
      {hasResultCount && <div className="adm-filter-drawer-summary"><b>{resultCount}</b><span>{labels.drawerSummary || 'records match the current criteria. Changes are reflected immediately.'}</span></div>}
      <div className="adm-filter-fields">{definitions.map((definition) => <label className="adm-form-field" key={definition.key}><span>{definition.label}</span>{definition.type === 'date' ? <input type="date" value={filters[definition.key] || ''} onChange={(event) => onFilters({ ...filters, [definition.key]: event.target.value })}/> : <select value={filters[definition.key] || ''} onChange={(event) => onFilters({ ...filters, [definition.key]: event.target.value })}><option value="">{labels.all || 'All'}</option>{definition.options.map((value) => <option key={value} value={value}>{getOptionLabel(value)}</option>)}</select>}</label>)}</div>
    </Drawer>}
  </>
}

export function ActionDialog({ action, onClose, onSubmit, labels = {}, getOptionLabel = (value) => value }) {
  const formId = useId()
  const [error, setError] = useState('')
  if (!action) return null
  const submit = (event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    if (action.reason !== false && !values.reason?.trim()) { setError(labels.reasonError || 'Add an internal reason before confirming.'); return }
    const issue = onSubmit(values)
    if (issue) { setError(issue); return }
    onClose()
  }
  return <Modal open onClose={onClose} closeLabel={labels.close || 'Close'} title={action.title} eyebrow={action.eyebrow || labels.eyebrow || 'Administrative action'} footer={<><Button variant="secondary" onClick={onClose}>{labels.cancel || 'Cancel'}</Button><Button type="submit" form={formId} variant={action.danger ? 'danger' : 'primary'}>{action.submit || labels.confirm || 'Confirm action'}</Button></>}>
    <p>{action.description || labels.description || 'This decision will update the local demo record and be recorded in the activity log.'}</p>
    <form id={formId} onSubmit={submit} className="adm-action-form">{action.fields?.map((field) => <label className="adm-form-field" key={field.name}><span>{field.label}{field.required && <em>{labels.required || 'Required'}</em>}</span>{field.options ? <select name={field.name} required={field.required} defaultValue={field.value || field.options[0]}>{field.options.map((option) => <option key={option} value={option}>{getOptionLabel(option)}</option>)}</select> : field.type === 'textarea' ? <textarea name={field.name} defaultValue={field.value} required={field.required}/> : <input name={field.name} type={field.type || 'text'} defaultValue={field.value} required={field.required} min={field.min} max={field.max} placeholder={field.placeholder}/>}</label>)}{action.reason !== false && <label className="adm-form-field"><span>{labels.internalReason || 'Internal reason'} <em>{labels.required || 'Required'}</em></span><textarea name="reason" required placeholder={labels.reasonPlaceholder || 'Explain the decision for your colleagues…'}/></label>}{error && <p role="alert" className="adm-form-error">{error}</p>}</form>
  </Modal>
}

export function Facts({ items, missingLabel = 'Not provided' }) {
  return <dl className="adm-detail-grid">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || missingLabel}</dd></div>)}</dl>
}

export function History({ items = [], translate = (value) => value, locale = 'en-GB', emptyTitle = 'Historical data incomplete', emptyCopy = 'No earlier actions were imported for this demonstration record. New actions will appear here.' }) {
  return <div className="adm-history">{items.length ? [...items].reverse().map((item, index) => <article key={`${item.at}-${index}`}><i/><div><b>{translate(item.title)}</b>{item.note && <p>{item.note}</p>}<small>{translate(item.actor)} · {new Date(item.at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</small></div><StatusBadge tone="neutral">{translate(item.kind || 'Update')}</StatusBadge></article>) : <div className="adm-history-incomplete"><p>{emptyTitle}</p><small>{emptyCopy}</small></div>}</div>
}

export function SummaryStrip({ items }) {
  return <div className="adm-people-summary">{items.map((item, i) => <article key={item.label}><span>0{i + 1}</span><div><strong>{String(item.value).padStart(2, '0')}</strong><p>{item.label}</p></div>{item.meta && <em>{item.meta}</em>}</article>)}</div>
}
