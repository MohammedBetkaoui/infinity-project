import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, GripVertical, MoreHorizontal } from 'lucide-react'
import { ActionDialog } from './AdminRecords'
import { Avatar, StatusBadge } from './AdminUI'
import { BOARD_STAGES, applicationActionPayload, applicationMove } from './applicationMoves'
import { useAdminApplicationActions, useAdminApplications } from './useAdminApplications'

const STATUS_KEYS = Object.freeze({
  New: 'new', 'In review': 'in_review', Interview: 'interview',
  Accepted: 'accepted', Declined: 'declined', Archived: 'archived',
})
const DRAG_THRESHOLD = 6
const submittedDay = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Africa/Algiers' })
const shortDate = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? submittedDay.format(date) : '—'
}

// One live query per stage, in a fixed order, sharing the page's search and filters.
function useBoardColumns(scope) {
  return [
    useAdminApplications({ ...scope, status: 'New' }),
    useAdminApplications({ ...scope, status: 'In review' }),
    useAdminApplications({ ...scope, status: 'Interview' }),
    useAdminApplications({ ...scope, status: 'Accepted' }),
    useAdminApplications({ ...scope, status: 'Declined' }),
    useAdminApplications({ ...scope, status: 'Archived' }),
  ]
}

function CardMenu({ record, onOpen, onMove }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef(null)
  const moves = BOARD_STAGES.map((stage) => ({ stage, move: applicationMove(record, stage) })).filter(({ move }) => move)
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const closeAndFocus = () => { setOpen(false); root.current?.querySelector('button')?.focus() }
  return <div className="adm-board-menu" ref={root} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); closeAndFocus() } }}>
    <button type="button" className="adm-board-menu__trigger" aria-expanded={open} aria-controls={menuId} aria-label={`Actions for ${record.name}`} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={18} aria-hidden="true"/></button>
    {open && <div className="adm-board-menu__list" id={menuId}>
      <button type="button" onClick={() => { setOpen(false); onOpen(record) }}>Open application<ArrowRight size={14} aria-hidden="true"/></button>
      {moves.length ? moves.map(({ stage, move }) => <button type="button" key={stage} className={move.danger ? 'is-danger' : ''} onClick={() => { setOpen(false); onMove(record, stage) }}><span className={`adm-board-dot is-${STATUS_KEYS[stage]}`} aria-hidden="true"/>{move.title}</button>)
        : <p>No stage change is available for this application.</p>}
    </div>}
  </div>
}

function BoardCard({ record, stage, hintId, onOpen, onMove, onDragStart, dragging, suppressClick }) {
  return <article className={`adm-board-card ${dragging ? 'is-dragging' : ''}`} data-flip-id={record.id} onPointerDown={(event) => onDragStart(event, record, stage)}>
    <button type="button" className="adm-board-card__open" aria-describedby={hintId} onClick={(event) => { if (suppressClick.current) { event.preventDefault(); return } onOpen(record) }}>
      <Avatar initials={record.initials} small/>
      <span><b>{record.name}</b><small>{record.level} · {record.speciality}</small></span>
    </button>
    <p className="adm-board-card__track">{record.track}</p>
    <footer>
      <StatusBadge tone={record.type === 'Staff' ? 'info' : 'neutral'}>{record.type}</StatusBadge>
      <time dateTime={record.submittedAt}>{shortDate(record.submittedAt)}</time>
      <span className="adm-board-card__handle" data-drag-handle aria-hidden="true"><GripVertical size={16}/></span>
      <CardMenu record={record} onOpen={onOpen} onMove={onMove}/>
    </footer>
  </article>
}

export default function ApplicationsBoard({ search, filters, sort, counts, onOpen, onChanged, onShowStage, addToast }) {
  const columns = useBoardColumns({ page: 1, search, filters, sort })
  const { act } = useAdminApplicationActions()
  const [pending, setPending] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const suppressClick = useRef(false)
  const hintId = useId()

  const requestMove = useCallback((record, stage) => {
    const move = applicationMove(record, stage)
    if (move) setPending({ record, stage, move })
  }, [])

  const finishDrag = useCallback((dropStage) => {
    const state = dragRef.current
    if (!state) return
    dragRef.current = null
    state.ghost?.remove()
    window.removeEventListener('pointermove', state.onMove)
    window.removeEventListener('pointerup', state.onUp)
    window.removeEventListener('pointercancel', state.onCancel)
    window.removeEventListener('keydown', state.onKey)
    setDrag(null)
    if (state.active) {
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      if (dropStage && dropStage !== state.stage) requestMove(state.record, dropStage)
    }
  }, [requestMove])

  const startDrag = useCallback((event, record, stage) => {
    if (event.button !== 0 || event.target.closest('.adm-board-menu')) return
    // Touch scrolls the page unless the move starts on the grip.
    if (event.pointerType === 'touch' && !event.target.closest('[data-drag-handle]')) return
    const card = event.currentTarget
    const allowed = new Set(BOARD_STAGES.filter((target) => applicationMove(record, target)))
    const state = { record, stage, allowed, card, active: false, startX: event.clientX, startY: event.clientY, over: null }
    const stageAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-board-stage]')?.getAttribute('data-board-stage') || null
    state.onMove = (moveEvent) => {
      const dx = moveEvent.clientX - state.startX
      const dy = moveEvent.clientY - state.startY
      if (!state.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        const rect = card.getBoundingClientRect()
        const ghost = card.cloneNode(true)
        ghost.classList.add('adm-board-ghost')
        ghost.setAttribute('aria-hidden', 'true')
        ghost.setAttribute('inert', '')
        Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` })
        // Outside the board's size container, so position: fixed follows the viewport.
        ;(card.closest('.adm-page') || document.body).appendChild(ghost)
        state.ghost = ghost
        state.active = true
        setDrag({ id: record.id, from: stage, allowed: [...allowed], over: null })
      }
      moveEvent.preventDefault()
      state.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(2deg)`
      const over = stageAt(moveEvent.clientX, moveEvent.clientY)
      if (over !== state.over) {
        state.over = over
        setDrag((current) => current && { ...current, over })
      }
      const edge = 72
      if (moveEvent.clientY < edge) window.scrollBy(0, -12)
      else if (moveEvent.clientY > window.innerHeight - edge) window.scrollBy(0, 12)
    }
    state.onUp = (upEvent) => {
      const over = state.active ? stageAt(upEvent.clientX, upEvent.clientY) : null
      finishDrag(over && state.allowed.has(over) ? over : null)
    }
    state.onCancel = () => finishDrag(null)
    state.onKey = (keyEvent) => { if (keyEvent.key === 'Escape') finishDrag(null) }
    dragRef.current = state
    window.addEventListener('pointermove', state.onMove, { passive: false })
    window.addEventListener('pointerup', state.onUp)
    window.addEventListener('pointercancel', state.onCancel)
    window.addEventListener('keydown', state.onKey)
  }, [finishDrag])

  useEffect(() => () => finishDrag(null), [finishDrag])

  const submit = async (values) => {
    const result = await act(pending.record.id, {
      action: pending.move.action,
      expectedUpdatedAt: pending.record.updatedAt,
      reason: '',
      payload: applicationActionPayload(pending.move.action, values),
    })
    if (!result.ok) return result.message
    columns.forEach((column) => column.refresh())
    onChanged()
    addToast(pending.move.title, 'The application and its administrative history were updated.')
    return undefined
  }

  return <div className="adm-board-wrap">
    <p className="sr-only" id={hintId}>Open the application, or move it with the actions menu. Pointer users can also drag the card to another stage.</p>
    <div className={`adm-board ${drag ? 'is-dragging' : ''}`}>
      {BOARD_STAGES.map((stage, index) => {
        const column = columns[index]
        const total = counts[stage] ?? column.pagination.total
        const state = !drag ? '' : drag.from === stage ? 'is-origin' : drag.allowed.includes(stage) ? (drag.over === stage ? 'is-target' : 'is-droppable') : 'is-blocked'
        return <section key={stage} className={`adm-board-column is-${STATUS_KEYS[stage]} ${state}`} data-board-stage={stage} aria-label={`${stage}: ${total} applications`}>
          <header><span className={`adm-board-dot is-${STATUS_KEYS[stage]}`} aria-hidden="true"/><h2>{stage}</h2><span className="adm-board-count">{total}</span></header>
          <div className="adm-board-column__cards">
            {column.error ? <p className="adm-board-note" role="alert">{column.error}</p>
              : column.loading && !column.records.length ? <div className="adm-board-skeleton" aria-hidden="true"><i/><i/></div>
                : column.records.length ? column.records.map((record) => <BoardCard key={record.id} record={record} stage={stage} hintId={hintId} onOpen={onOpen} onMove={requestMove} onDragStart={startDrag} dragging={drag?.id === record.id} suppressClick={suppressClick}/>)
                  : <p className="adm-board-note">No applications</p>}
          </div>
          {total > column.records.length && <button type="button" className="adm-board-more" onClick={() => onShowStage(stage)}>View all {total} in the list<ArrowRight size={14} aria-hidden="true"/></button>}
        </section>
      })}
    </div>
    {pending && <ActionDialog key={`${pending.record.id}-${pending.stage}`} action={{ title: pending.move.title, fields: pending.move.fields, danger: pending.move.danger, reason: false, description: false, eyebrow: pending.record.name }} onClose={() => setPending(null)} onSubmit={submit}/>}
  </div>
}
