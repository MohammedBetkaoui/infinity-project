import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'
import { createListCache } from './adminListCache.js'
import { SEARCH_LIMIT, SEARCH_SOURCES, detectReference, parseInput, rankResults, sourcesFor, toSearchItem } from './adminSearchModel.js'
import { applicationsQueryString } from './useAdminApplications'
import { peopleQueryString } from './useAdminPeople'
import { acceptedStudentsQueryString, aivexQueryString } from './useAdminAivex'

// The global search asks the existing list endpoints, five rows each. Some of
// them are expensive (an AIVEX list re-evaluates the whole edition and an
// aborted request still runs on the server), so one salvo leaves only once
// typing pauses, and an answer seen in the last minute is reused.
export const SEARCH_DEBOUNCE_MS = 350
const cache = createListCache({ ttlMs: 60 * 1000, maxEntries: 60 })
// A source the server refuses or has switched off is hidden, not reported.
const HIDDEN_STATUSES = new Set([403, 404, 503])

const listQuery = {
  applications: (search) => applicationsQueryString({ page: 1, limit: SEARCH_LIMIT, status: '', search, filters: {}, sort: SEARCH_SOURCES.applications.sort }),
  members: (search) => peopleQueryString({ page: 1, limit: SEARCH_LIMIT, search, filters: {}, sort: SEARCH_SOURCES.members.sort }),
  staff: (search) => peopleQueryString({ page: 1, limit: SEARCH_LIMIT, search, filters: {}, sort: SEARCH_SOURCES.staff.sort }),
  aivex: (search) => aivexQueryString({ page: 1, limit: SEARCH_LIMIT, search, filters: {}, sort: SEARCH_SOURCES.aivex.sort }),
  students: (search) => acceptedStudentsQueryString({ page: 1, limit: SEARCH_LIMIT, search, filters: {}, sort: SEARCH_SOURCES.students.sort }),
}
const keyOf = (source, text) => `${source}\u0000${text}`

// Recent searches and opened results live in this tab's memory only: nothing
// is written to storage, a reload or a sign-out forgets them.
const memory = { owner: null, queries: [], opened: [] }
const RECENT_LIMIT = 5
export function clearSearchMemory() {
  memory.owner = null
  memory.queries = []
  memory.opened = []
  cache.clear()
}
export function rememberSearch(query) {
  const value = String(query || '').trim()
  if (!value) return
  memory.queries = [value, ...memory.queries.filter((item) => item !== value)].slice(0, RECENT_LIMIT)
}
export function rememberOpened(item) {
  if (!item?.path) return
  const { id, source, title, detail, path, initials, icon, status } = item
  memory.opened = [{ id, source, title, detail, path, initials, icon, status }, ...memory.opened.filter((entry) => entry.id !== id)].slice(0, RECENT_LIMIT)
}

export function useAdminSearch({ input, scope = 'all', shell = 'full', active = true }) {
  const { request, user } = useAdminAuth()
  const parsed = useMemo(() => parseInput(input), [input])
  const text = parsed.text
  const effectiveScope = parsed.scope || scope
  const reference = useMemo(() => detectReference(text), [text])
  const sources = useMemo(() => (active ? sourcesFor({ role: user.role, shell, scope: effectiveScope, text, reference }) : []), [active, effectiveScope, reference, shell, text, user.role])
  const sourceKey = sources.join(',')
  // Answers of this session (results, empty, errors, hidden), and a mirror the
  // effect reads so a settled source is not asked again.
  const [entries, setEntries] = useState(() => new Map())
  const settled = useRef(new Map())
  const [attempt, setAttempt] = useState(0)

  useLayoutEffect(() => {
    if (memory.owner !== user.username) {
      clearSearchMemory()
      memory.owner = user.username
    }
  }, [user.username])

  useEffect(() => {
    const pending = sourceKey ? sourceKey.split(',').filter((source) => !cache.get(keyOf(source, text)) && !settled.current.has(keyOf(source, text))) : []
    if (!pending.length) return undefined
    const controller = new AbortController()
    const record = (source, entry) => {
      if (controller.signal.aborted) return
      const key = keyOf(source, text)
      if (entry.status === 'results' || entry.status === 'empty') cache.set(key, entry)
      settled.current.set(key, entry)
      setEntries((current) => new Map(current).set(key, entry))
    }
    const timer = window.setTimeout(() => {
      for (const source of pending) {
        request(`${SEARCH_SOURCES[source].endpoint}?${listQuery[source](text)}`, { signal: controller.signal })
          .then(({ response, body }) => {
            if (HIDDEN_STATUSES.has(response.status)) return record(source, { status: 'hidden', items: [], total: 0 })
            if (!response.ok) return record(source, { status: 'error', items: [], total: 0, message: body?.message || 'This source could not be searched.' })
            const items = (Array.isArray(body?.data) ? body.data : []).map((row) => toSearchItem(source, row)).filter(Boolean)
            return record(source, { status: items.length ? 'results' : 'empty', items, total: Number(body?.pagination?.total) || items.length })
          })
          .catch((error) => {
            if (error.name !== 'AbortError') record(source, { status: 'error', items: [], total: 0, message: 'This source could not be searched.' })
          })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [attempt, request, sourceKey, text])

  const retry = useCallback((source) => {
    const key = keyOf(source, text)
    settled.current.delete(key)
    setEntries((current) => {
      const next = new Map(current)
      next.delete(key)
      return next
    })
    setAttempt((value) => value + 1)
  }, [text])

  const groups = sources
    .map((source) => {
      const entry = entries.get(keyOf(source, text)) || cache.get(keyOf(source, text))
      if (!entry) return { source, status: 'loading', items: [], total: 0 }
      return { source, ...entry, items: rankResults(entry.items, text, reference) }
    })
    .filter((group) => group.status !== 'hidden')

  return {
    text,
    prefix: parsed.prefix,
    scope: effectiveScope,
    reference,
    sources,
    groups,
    loading: groups.some((group) => group.status === 'loading'),
    retry,
    recentQueries: memory.queries,
    recentItems: memory.opened,
  }
}
