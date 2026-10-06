import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Bell, FileClock, FileText, GraduationCap, History, Languages, LayoutDashboard,
  LogOut, Monitor, Moon, Palette, PanelLeft, RefreshCw, RotateCcw, Search, SearchX, Settings, Sun, Trophy,
  UserCog, Users, X,
} from 'lucide-react'
import { useAdminAuth } from './AdminAuth'
import { useAdminAccent } from './adminAccent'
import { useCommandMotion, useCommandRows } from './adminMotion'
import { useEffectiveReducedMotion } from './AdminPreferences'
import { SCOPES, SEARCH_ACTIONS, SEARCH_PAGES, SEARCH_SOURCES, allowedSources, highlightSegments, rankScore, searchStatic, sourceListPath } from './adminSearchModel.js'
import { useThemeSwitch } from './adminTheme'
import { Avatar, StatusBadge } from './AdminUI'
import { aivexPath, translateAivex } from './AivexI18n'
import { clearSearchMemory, rememberOpened, rememberSearch, useAdminSearch } from './useAdminSearch'

const ICONS = Object.freeze({
  overview: LayoutDashboard, applications: FileText, members: Users, staff: UserCog, aivex: Trophy,
  students: GraduationCap, activity: FileClock, settings: Settings, light: Sun, dark: Moon, system: Monitor,
  accent: Palette, sidebar: PanelLeft, notifications: Bell, refresh: RefreshCw, language: Languages,
  signout: LogOut, recent: History,
})
const DEFAULT_PAGES = ['page:overview', 'page:applications', 'page:members', 'page:staff', 'page:aivex', 'page:aivex:students', 'page:activity', 'page:settings:Workspace']
const SEARCH_SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K'
const COMPACT_QUERY = '(max-width: 767px)'
const subscribeCompact = (listener) => {
  const query = window.matchMedia(COMPACT_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
const readCompact = () => window.matchMedia(COMPACT_QUERY).matches
const isEditable = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
// Each hand-over to a list page gets a fresh key, so the page remounts with it.
let handOver = 0
const nextHandOver = () => String(++handOver)
const isModified = (event) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

// Sentences with a number or a name, in the two interface languages.
const phrases = (language) => (language === 'ar'
  ? {
      seeAll: (total, label) => `عرض النتائج الـ${total} في ${label}`,
      results: (count) => `${count} نتيجة`,
      openFile: (reference) => `فتح الملف ${reference}`,
      noResults: (query) => `لا توجد نتائج لـ «${query}»`,
    }
  : {
      seeAll: (total, label) => `See all ${total} results in ${label}`,
      results: (count) => `${count} result${count === 1 ? '' : 's'}`,
      openFile: (reference) => `Open file ${reference}`,
      noResults: (query) => `No results for “${query}”`,
    })

function Highlight({ text, query }) {
  return highlightSegments(text, query).map((segment, index) => (segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>))
}

// The workspace-wide search: a combobox in the top bar (a full-screen sheet
// on small screens) that reads the real list endpoints, opens pages and runs
// actions. Ctrl/⌘ K or / opens it from anywhere.
export default function GlobalSearch({ shell = 'full', language = 'en', onToggleSidebar, onNotifications }) {
  const t = (value) => translateAivex(value, language)
  const title = (value) => String(value).split(' · ').map(t).join(' · ')
  const say = phrases(language)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAdminAuth()
  const reducedMotion = useEffectiveReducedMotion()
  const { theme, choose } = useThemeSwitch(reducedMotion)
  const [, setAccent] = useAdminAccent()
  const compact = useSyncExternalStore(subscribeCompact, readCompact, () => false)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [scope, setScope] = useState('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [layer, setLayer] = useState(null)
  const [position, setPosition] = useState(null)
  const baseId = useId()
  const listboxId = `${baseId}-results`
  const optionId = (index) => `${baseId}-option-${index}`
  const hostRef = useRef(null)
  const fieldRef = useRef(null)
  const inputRef = useRef(null)
  const layerRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const originRef = useRef(null)
  const search = useAdminSearch({ input, scope, shell, active: open })
  const role = user.role
  const text = search.text
  const hasQuery = Boolean(text || search.prefix)
  const currentScope = search.scope
  useCommandMotion(panelRef, open)

  // The panel sits in the theme root, outside the sticky top bar, so it can
  // cover the page; on wide screens it is placed under the field.
  const place = useCallback(() => {
    const field = fieldRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    const gutter = 16
    const width = Math.min(Math.max(rect.width, 600), 720, window.innerWidth - gutter * 2)
    const start = getComputedStyle(field).direction === 'rtl' ? rect.right - width : rect.left
    setPosition({ top: rect.bottom + 8, left: Math.min(Math.max(gutter, start), window.innerWidth - gutter - width), width })
  }, [])

  const openPalette = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    if (!originRef.current) originRef.current = document.activeElement
    setLayer(host.closest('.adm-admin-root') || document.body)
    place()
    setOpen(true)
    setActiveIndex(0)
    inputRef.current?.focus()
  }, [place])

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    const origin = originRef.current
    originRef.current = null
    if (restoreFocus && origin && origin !== inputRef.current && origin.isConnected) origin.focus()
  }, [])

  useLayoutEffect(() => {
    if (open && compact) inputRef.current?.focus()
  }, [compact, open])

  useEffect(() => {
    if (!open || compact) return undefined
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [compact, open, place])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) inputRef.current?.select()
        else openPalette()
      } else if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target)) {
        event.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, openPalette])

  const signOut = async () => {
    clearSearchMemory()
    await logout()
    navigate('/admin/login', { replace: true })
  }
  const aivexRoute = location.pathname.startsWith('/admin/aivex') ? location.pathname : '/admin/aivex'
  const runAction = (id) => {
    if (id.startsWith('action:theme-')) choose(id.slice('action:theme-'.length))
    else if (id.startsWith('action:accent-')) setAccent(id.slice('action:accent-'.length))
    else if (id === 'action:sidebar') onToggleSidebar?.()
    else if (id === 'action:notifications') onNotifications?.()
    else if (id === 'action:refresh') window.location.reload()
    else if (id === 'action:aivex-arabic') navigate(aivexPath(aivexRoute, 'ar'))
    else if (id === 'action:aivex-english') navigate(aivexRoute)
    else if (id === 'action:sign-out') signOut()
  }
  const localized = (path) => (language === 'ar' && path.startsWith('/admin/aivex') ? aivexPath(path, 'ar') : path)

  // Options, grouped, in the order the keyboard walks them.
  const pageOption = (page) => ({ key: page.id, kind: 'link', icon: page.icon, title: title(page.title), detail: t(page.detail), href: localized(page.path), state: page.settingsTab ? { settingsTab: page.settingsTab } : undefined })
  const actionOption = (action) => ({ key: action.id, kind: 'action', icon: action.icon, title: t(action.title), actionId: action.id })
  const resultOption = (item, prefix = '') => ({ key: `${prefix}${item.id}`, kind: 'link', item, icon: item.icon, initials: item.initials, title: item.title, detail: item.detail, status: item.status, href: localized(item.path) })
  const hiddenAction = (id) => id === (language === 'ar' ? 'action:aivex-arabic' : 'action:aivex-english') || id === `action:theme-${theme}`
  const actions = SEARCH_ACTIONS.filter((action) => !hiddenAction(action.id))
  const showStatic = (kind) => currentScope === 'all' || currentScope === kind
  const groups = []
  if (!hasQuery) {
    const recent = [
      ...search.recentItems.map((item) => resultOption(item, 'recent:')),
      ...search.recentQueries.map((query) => ({ key: `query:${query}`, kind: 'query', icon: 'recent', title: query, query })),
    ].slice(0, 6)
    if (recent.length) groups.push({ key: 'recent', label: t('Recent'), options: recent })
    const pages = searchStatic(SEARCH_PAGES, '', { role, shell, limit: 50 }).filter((page) => DEFAULT_PAGES.includes(page.id))
    groups.push({ key: 'pages', label: t('Go to'), options: pages.map(pageOption) })
    groups.push({ key: 'actions', label: t('Quick actions'), options: searchStatic(actions, '', { role, shell, limit: 5 }).map(actionOption) })
  } else {
    const remote = search.groups
    if (search.reference?.source === 'aivex' && search.sources.includes('aivex')) {
      groups.push({ key: 'reference', label: t('Reference'), options: [{ key: `open:${search.reference.reference}`, kind: 'link', icon: 'aivex', title: say.openFile(search.reference.reference), detail: t('AIVEX files'), href: localized(`/admin/aivex/${encodeURIComponent(search.reference.reference)}`) }] })
    }
    const best = remote.flatMap((group) => group.items).map((item) => ({ item, score: rankScore(item, text, search.reference) })).filter(({ score }) => score <= 1).sort((a, b) => a.score - b.score)[0]?.item
    if (best) groups.push({ key: 'best', label: t('Best match'), options: [resultOption(best, 'best:')] })
    if (showStatic('pages')) {
      const pages = searchStatic(SEARCH_PAGES, text, { role, shell, limit: currentScope === 'pages' ? 20 : 4 })
      if (pages.length) groups.push({ key: 'pages', label: t('Pages'), count: pages.length, options: pages.map(pageOption) })
    }
    if (showStatic('actions')) {
      const found = searchStatic(actions, text, { role, shell, limit: currentScope === 'actions' ? 20 : 3 })
      if (found.length) groups.push({ key: 'actions', label: t('Actions'), count: found.length, options: found.map(actionOption) })
    }
    for (const group of remote) {
      const label = t(SEARCH_SOURCES[group.source].label)
      if (group.status === 'loading') groups.push({ key: group.source, label, skeleton: 3, options: [] })
      else if (group.status === 'error') groups.push({ key: group.source, label, options: [{ key: `retry:${group.source}`, kind: 'retry', source: group.source, icon: 'refresh', title: t('Retry'), detail: t('This source could not be searched.'), tone: 'error' }] })
      else if (group.status === 'empty') {
        if (currentScope === group.source) groups.push({ key: group.source, label, count: 0, note: say.noResults(text), options: [] })
      } else {
        const items = group.items.filter((item) => item.id !== best?.id).map((item) => resultOption(item))
        const more = group.total > group.items.length ? [{ key: `more:${group.source}`, kind: 'link', more: true, title: say.seeAll(group.total, label), href: localized(sourceListPath(group.source, group.items)), state: { globalSearch: text } }] : []
        if (items.length || more.length) groups.push({ key: group.source, label, count: group.total, options: [...items, ...more] })
      }
    }
  }
  const options = groups.flatMap((group) => group.options)
  const active = options.length ? ((activeIndex % options.length) + options.length) % options.length : -1
  let cursor = 0
  const indexed = groups.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option, index: cursor++ })) }))
  const resultCount = options.filter((option) => option.item && !option.key.startsWith('best:')).length + (options.some((option) => option.key.startsWith('best:')) ? 1 : 0)
  const empty = hasQuery && !search.loading && !options.length
  const announcement = !open || !hasQuery ? '' : search.loading ? t('Searching…') : resultCount ? say.results(resultCount) : t('No results')
  const scopeKeys = ['all', 'pages', 'actions', ...allowedSources(role, shell)]
  const scopeCount = (key) => {
    if (key === 'pages') return searchStatic(SEARCH_PAGES, text, { role, shell, limit: 50 }).length
    if (key === 'actions') return searchStatic(actions, text, { role, shell, limit: 50 }).length
    if (key === 'all') return null
    return search.counts[key]
  }
  useCommandRows(listRef, open ? `${text}|${currentScope}|${groups.map((group) => `${group.key}:${group.options.length}:${group.skeleton || 0}`).join(',')}` : '')

  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  })

  const changeScope = (next) => {
    setScope(next)
    setActiveIndex(0)
    if (search.prefix) setInput(input.trimStart().slice(search.prefix.length).trimStart())
  }
  const select = (option) => {
    if (option.kind === 'query') {
      setInput(option.query)
      setActiveIndex(0)
      inputRef.current?.focus()
      return
    }
    if (option.kind === 'retry') {
      search.retry(option.source)
      return
    }
    close(false)
    if (option.kind === 'action') {
      runAction(option.actionId)
      return
    }
    if (text) rememberSearch(input.trim())
    if (option.item) rememberOpened({ ...option.item, path: option.href })
    navigate(option.href, option.state ? { state: { ...option.state, globalSearchKey: nextHandOver() } } : undefined)
  }
  const onKeyDown = (event) => {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      const step = (event.key === 'ArrowRight') === (getComputedStyle(event.currentTarget).direction !== 'rtl') ? 1 : -1
      changeScope(scopeKeys[(scopeKeys.indexOf(currentScope) + step + scopeKeys.length) % scopeKeys.length])
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openPalette()
      else if (options.length) setActiveIndex(active + (event.key === 'ArrowDown' ? 1 : -1))
    } else if ((event.key === 'Home' || event.key === 'End') && open && options.length) {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault()
      select(options[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (input) {
        setInput('')
        setActiveIndex(0)
      } else close()
    }
  }
  const onBlur = (event) => {
    const next = event.relatedTarget
    if (next && (layerRef.current?.contains(next) || hostRef.current?.contains(next))) return
    if (open) close(false)
  }

  const renderOption = (option) => {
    const Icon = ICONS[option.icon]
    const selected = option.index === active
    const props = {
      id: optionId(option.index), role: 'option', 'aria-selected': selected, tabIndex: -1,
      className: `adm-command__option${selected ? ' is-active' : ''}${option.more ? ' is-more' : ''}${option.tone ? ` is-${option.tone}` : ''}`,
      onMouseMove: () => { if (!selected) setActiveIndex(option.index) },
      onMouseDown: (event) => { if (event.button === 0) event.preventDefault() },
    }
    const body = <>
      {!option.more && <span className="adm-command__lead" aria-hidden="true">{option.initials ? <Avatar initials={option.initials} small/> : Icon ? <Icon size={18}/> : <ArrowUpRight size={18}/>}</span>}
      <span className="adm-command__text"><b><Highlight text={option.title} query={option.kind === 'query' ? '' : text}/></b>{option.detail && <small><bdi><Highlight text={option.detail} query={text}/></bdi></small>}</span>
      <span className="adm-command__trail">{option.status ? <StatusBadge tone={option.status}>{t(option.status)}</StatusBadge> : option.kind === 'retry' ? <RotateCcw size={16} aria-hidden="true"/> : <ArrowRight size={16} aria-hidden="true"/>}</span>
    </>
    if (option.kind !== 'link') return <div key={option.key} {...props} onClick={() => select(option)}>{body}</div>
    return <a key={option.key} {...props} href={option.href} onClick={(event) => {
      if (isModified(event)) return
      event.preventDefault()
      select(option)
    }}>{body}</a>
  }

  const field = <div ref={fieldRef} className={`adm-search adm-command__field${compact ? '' : ' adm-global-search'}`}>
    <Search size={17} aria-hidden="true"/>
    <input
      ref={inputRef}
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      aria-autocomplete="list"
      aria-label={t('Search the workspace')}
      aria-keyshortcuts="Control+K Meta+K /"
      placeholder={t('Search anything…')}
      autoComplete="off"
      spellCheck={false}
      value={input}
      onChange={(event) => {
        setInput(event.target.value)
        setActiveIndex(0)
        if (!open) openPalette()
      }}
      onFocus={() => { if (!open && !compact) openPalette() }}
      onClick={() => { if (!open) openPalette() }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
    {input
      ? <button type="button" className="adm-command__clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { setInput(''); setActiveIndex(0); inputRef.current?.focus() }} aria-label={t('Clear search')}><X size={14}/></button>
      : !compact && <kbd className="adm-search__hint" aria-hidden="true">{SEARCH_SHORTCUT}</kbd>}
    {compact && <button type="button" className="adm-command__close" onClick={() => close()} aria-label={t('Close search')}><X size={20}/></button>}
  </div>

  return <div ref={hostRef} className={`adm-command${open ? ' is-open' : ''}`}>
    {compact
      ? <button type="button" className="adm-icon-button adm-command__trigger" aria-label={t('Search the workspace')} aria-expanded={open} aria-keyshortcuts="Control+K Meta+K /" onClick={openPalette}><Search size={19}/></button>
      : field}
    {open && layer && createPortal(<div ref={layerRef} className={`adm-command-layer${compact ? ' is-sheet' : ''}`}>
      <div className="adm-command__scrim" aria-hidden="true" onMouseDown={(event) => { event.preventDefault(); close() }}/>
      <section ref={panelRef} className="adm-command__panel" aria-label={t('Search the workspace')} style={compact || !position ? undefined : { top: position.top, left: position.left, width: position.width }}>
        {compact && field}
        {hasQuery && <div className="adm-command__scopes" role="toolbar" aria-label={t('Search scope')}>
          {scopeKeys.map((key) => {
            const count = scopeCount(key)
            return <button key={key} type="button" aria-pressed={currentScope === key} onMouseDown={(event) => event.preventDefault()} onClick={() => { changeScope(key); inputRef.current?.focus() }}>{t(SCOPES.find((item) => item.key === key).label)}{count !== null && count !== undefined && <small>{count}</small>}</button>
          })}
        </div>}
        <div ref={listRef} id={listboxId} role="listbox" aria-label={t('Search results')} className="adm-command__list">
          {indexed.map((group) => <div key={group.key} role="group" aria-labelledby={`${baseId}-${group.key}`} className="adm-command__group">
            <div id={`${baseId}-${group.key}`} className="adm-command__label"><span>{group.label}</span>{typeof group.count === 'number' && <span>{group.count}</span>}</div>
            {Array.from({ length: group.skeleton || 0 }, (_, index) => <div key={index} className="adm-command__skeleton" aria-hidden="true"><i/><span><i/><i/></span></div>)}
            {group.note && <p className="adm-command__note">{group.note}</p>}
            {group.options.map(renderOption)}
          </div>)}
        </div>
        {empty && <div className="adm-command__empty"><SearchX size={26} aria-hidden="true"/><b>{say.noResults(text || search.prefix)}</b><p>{t('Try a reference, a name or an institution.')}</p></div>}
        <p className="sr-only" aria-live="polite">{announcement}</p>
        <footer className="adm-command__footer">
          <span className="adm-command__keys"><kbd>↑</kbd><kbd>↓</kbd> {t('move')} <kbd>↵</kbd> {t('open')} <kbd>Esc</kbd> {t('close')} <kbd>Alt</kbd><kbd>←</kbd><kbd>→</kbd> {t('scope')}</span>
          <span><code>&gt;</code> {t('Actions')} · <code>/</code> {t('Pages')}{shell === 'full' && <> · <code>app:</code> <code>member:</code> <code>staff:</code></>} · <code>aivex:</code> <code>student:</code></span>
        </footer>
      </section>
    </div>, layer)}
  </div>
}
