import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'
import { createDemoState, dateLabel } from './adminModel'

const AdminContext = createContext(null)
const STORE_KEY = 'infinity-administration-demo-v3'

export function AdminProvider({ children }) {
  const { user } = useAdminAuth()
  const actor = user?.displayName || 'Authenticated administrator'
  const [state, setState] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORE_KEY)); return saved?.version === 3 ? saved : createDemoState() } catch { return createDemoState() }
  })
  const [toasts, setToasts] = useState([])
  const timers = useRef([])
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* Demo remains usable if storage is unavailable. */ } }, [state])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const addToast = useCallback((title, message = '') => {
    const id = crypto.randomUUID()
    setToasts((items) => [...items.slice(-3), { id, title, message }])
    timers.current.push(setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500))
  }, [])
  const log = useCallback((action, entity, objectType = 'Administration', sensitivity = 'Standard') => {
    setState((current) => ({ ...current, activities: [{ id: crypto.randomUUID(), at: new Date().toISOString(), action, title: action, entity, subject: entity, objectType, actor, sensitivity }, ...current.activities] }))
  }, [actor])
  const update = useCallback((collection, ids, changes, action, reason = '') => {
    const targets = Array.isArray(ids) ? ids : [ids]
    const at = new Date().toISOString()
    setState((current) => {
      const affected = current[collection].filter((record) => targets.includes(record.id))
      const next = { ...current, [collection]: current[collection].map((record) => {
        if (!targets.includes(record.id)) return record
        const patch = typeof changes === 'function' ? changes(record) : changes
        const checklist = patch.checklist || record.checklist
        return { ...record, ...patch, ...(collection === 'teams' ? { updated: dateLabel(at), completeness: Math.round(checklist.filter(Boolean).length / checklist.length * 100) } : {}), history: [...(record.history || []), { title: action, actor, at, kind: 'Administration', note: reason }] }
      }), activities: [{ id: crypto.randomUUID(), at, action, title: action, entity: affected.map((r) => r.name).join(', '), subject: affected.map((r) => r.name).join(', '), objectType: collection === 'teams' ? 'AIVEX' : collection === 'applications' ? 'Application' : collection === 'members' ? 'Member' : 'Staff', actor, sensitivity: 'Standard', note: reason }, ...current.activities] }
      if (collection === 'applications' && changes.status === 'Accepted') {
        for (const record of affected) {
          const destination = record.type === 'Staff' ? 'staff' : 'members'
          if (next[destination].some((item) => item.applicationId === record.id)) continue
          next[destination] = [...next[destination], { ...record, id: `${destination === 'staff' ? 'STF' : 'MEM'}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, applicationId: record.id, status: 'Active', joined: dateLabel(at), cohort: '2026/27', last: 'Not yet active', pole: record.track, requested: record.track, department: record.track, role: 'Unassigned', projects: 0, assignedProjects: [], events: [], history: [] }]
        }
      }
      return next
    })
    addToast(action, reason || 'The demo record and its activity history have been updated.')
  }, [actor, addToast])
  const addRecord = useCallback((collection, record) => {
    setState((current) => ({ ...current, [collection]: [{ ...record, id: crypto.randomUUID(), history: [] }, ...current[collection]] }))
    log('Record created', record.name, collection)
    addToast('Record created', `${record.name} is now in the directory.`)
  }, [addToast, log])
  return <AdminContext.Provider value={{ state, setState, toasts, addToast, update, addRecord, log, reset: () => { setState(createDemoState()); addToast('Demo reset', 'The original fictional records have been restored.') } }}>{children}</AdminContext.Provider>
}

// Shared local prototype state; no remote service is called.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdmin() { return useContext(AdminContext) }
