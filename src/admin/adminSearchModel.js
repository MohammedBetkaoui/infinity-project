// Global search, the pure part: no React, no network, no storage.
// It decides what to ask, of which source, and how to show what comes back.
import { hasAivexWorkspace, hasFullAdminWorkspace } from './adminAccess.js'

export const SEARCH_MIN_LENGTH = 2
export const SEARCH_LIMIT = 5
export const SEARCH_MAX_LENGTH = 100

// Same rules as the server's safeSearch: NFKC, letters, digits, spaces and
// @ . + _ - only, spaces collapsed, 100 characters.
export function normalizeQuery(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s@.+_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_MAX_LENGTH)
}

// Matching ignores case, Latin accents and Arabic spelling variants (hamza on
// alef, alef maqsura, ta marbuta, short vowels, tatweel).
const ARABIC_FOLDS = Object.freeze({ 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه' })
const foldChar = (char) => (ARABIC_FOLDS[char] ?? char).normalize('NFKD').replace(/[\p{M}ـ]/gu, '').toLowerCase()

// Folded characters with, for each, the span of the original text it came from.
function fold(text) {
  const chars = []
  const starts = []
  const ends = []
  let index = 0
  for (const char of String(text ?? '')) {
    for (const folded of foldChar(char)) {
      chars.push(folded)
      starts.push(index)
      ends.push(index + char.length)
    }
    index += char.length
  }
  return { chars, starts, ends }
}

export const foldForMatch = (text) => fold(text).chars.join('')

const termsOf = (query) => [...new Set(foldForMatch(normalizeQuery(query)).split(' ').filter(Boolean))]

// Text split into plain and matching segments, rendered with <mark>: never HTML.
export function highlightSegments(text, query) {
  const source = String(text ?? '')
  const terms = termsOf(query)
  if (!source || !terms.length) return source ? [{ text: source, match: false }] : []
  const { chars, starts, ends } = fold(source)
  const ranges = []
  for (const term of terms) {
    const needle = [...term]
    for (let index = 0; index + needle.length <= chars.length; index++) {
      if (!needle.every((char, offset) => chars[index + offset] === char)) continue
      let end = ends[index + needle.length - 1]
      // Keep combining marks that follow a matched letter inside the highlight.
      while (end < source.length && foldChar(String.fromCodePoint(source.codePointAt(end))) === '') end += String.fromCodePoint(source.codePointAt(end)).length
      ranges.push([starts[index], end])
    }
  }
  if (!ranges.length) return [{ text: source, match: false }]
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged = []
  for (const [start, end] of ranges) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  const segments = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: source.slice(cursor, start), match: false })
    segments.push({ text: source.slice(start, end), match: true })
    cursor = end
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), match: false })
  return segments
}

export const matchesQuery = (text, query) => {
  const haystack = foldForMatch(text)
  return termsOf(query).every((term) => haystack.includes(term))
}

export const SCOPES = Object.freeze([
  { key: 'all', label: 'All' },
  { key: 'pages', label: 'Pages' },
  { key: 'actions', label: 'Actions' },
  { key: 'applications', label: 'Applications' },
  { key: 'members', label: 'Members' },
  { key: 'staff', label: 'Staff' },
  { key: 'aivex', label: 'AIVEX files' },
  { key: 'students', label: 'Students' },
])

export const SEARCH_PREFIXES = Object.freeze([
  { prefix: '>', scope: 'actions' },
  { prefix: '/', scope: 'pages' },
  { prefix: 'app:', scope: 'applications' },
  { prefix: 'member:', scope: 'members' },
  { prefix: 'staff:', scope: 'staff' },
  { prefix: 'aivex:', scope: 'aivex' },
  { prefix: 'student:', scope: 'students' },
])

// A typed prefix narrows the scope; the rest is the query.
export function parseInput(raw) {
  const value = String(raw ?? '').trimStart()
  const lower = value.toLowerCase()
  const match = SEARCH_PREFIXES.find(({ prefix }) => lower.startsWith(prefix))
  if (!match) return { scope: null, prefix: '', text: normalizeQuery(value) }
  return { scope: match.scope, prefix: match.prefix, text: normalizeQuery(value.slice(match.prefix.length)) }
}

// Public references: AIVEX{edition}-XXXXXXXX (api/_lib/aivex-reference.js) and
// JOIN-… (mapApplication: the stored reference or JOIN- and 8 id characters).
export const AIVEX_REFERENCE = /^AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8}$/
export const JOIN_REFERENCE = /^JOIN-[0-9A-Z]{4,12}$/
export function detectReference(text) {
  const value = normalizeQuery(text).toUpperCase()
  if (AIVEX_REFERENCE.test(value)) return { source: 'aivex', reference: value }
  if (JOIN_REFERENCE.test(value)) return { source: 'applications', reference: value }
  return null
}

const FULL = 'full'
const AIVEX = 'aivex'
const roleAllows = (access, role) => (access === FULL ? hasFullAdminWorkspace(role) : hasAivexWorkspace(role))

// The list endpoints the palette reads, each with its valid default sort.
export const SEARCH_SOURCES = Object.freeze({
  applications: { label: 'Applications', endpoint: '/api/admin/applications', sort: 'submitted_desc', access: FULL },
  members: { label: 'Members', endpoint: '/api/admin/members', sort: 'joined_desc', access: FULL },
  staff: { label: 'Staff', endpoint: '/api/admin/staff', sort: 'joined_desc', access: FULL },
  aivex: { label: 'AIVEX files', endpoint: '/api/admin/aivex', sort: 'attention_asc', access: AIVEX },
  students: { label: 'Students', endpoint: '/api/admin/aivex/students', sort: 'name_asc', access: AIVEX },
})
export const SOURCE_KEYS = Object.freeze(Object.keys(SEARCH_SOURCES))

export const allowedSources = (role, shell = 'full') => SOURCE_KEYS.filter((key) => roleAllows(SEARCH_SOURCES[key].access, role) && (shell === 'full' || SEARCH_SOURCES[key].access === AIVEX))

// Which sources one search asks. A refused source is never called; a typed
// reference asks only the source that owns it.
export function sourcesFor({ role, shell = 'full', scope = 'all', text = '', reference = null }) {
  const allowed = allowedSources(role, shell)
  if (normalizeQuery(text).length < SEARCH_MIN_LENGTH) return []
  if (scope === 'pages' || scope === 'actions') return []
  if (SOURCE_KEYS.includes(scope)) return allowed.filter((key) => key === scope)
  if (reference) return allowed.filter((key) => key === reference.source)
  return allowed
}

// Exact reference first, then names that start with the query, then the
// order the server returned.
export function rankScore(item, text, reference) {
  if (reference && String(item.reference || '').toUpperCase() === reference.reference) return 0
  const query = foldForMatch(normalizeQuery(text))
  if (query && foldForMatch(item.title).startsWith(query)) return 1
  return 2
}
export function rankResults(items, text, reference) {
  return items
    .map((item, index) => ({ item, index, score: rankScore(item, text, reference) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item)
}

// What a list row becomes in the palette. Phone, RFID and identity-document
// details are never read.
const initialsOf = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase()
export function toSearchItem(source, record) {
  if (source === 'applications') return { id: `applications:${record.id}`, source, title: record.name, reference: record.ref, initials: record.initials || initialsOf(record.name), detail: [record.ref, record.type, record.level, record.speciality].filter(Boolean).join(' · '), status: record.status, path: `/admin/applications?record=${encodeURIComponent(record.id)}${record.status ? `&stage=${encodeURIComponent(record.status)}` : ''}` }
  if (source === 'members') return { id: `members:${record.id}`, source, title: record.name, reference: record.ref, initials: record.initials || initialsOf(record.name), detail: [record.level, record.speciality, record.pole].filter(Boolean).join(' · '), status: record.status, path: `/admin/members?record=${encodeURIComponent(record.id)}` }
  if (source === 'staff') return { id: `staff:${record.id}`, source, title: record.name, reference: record.ref, initials: record.initials || initialsOf(record.name), detail: [record.role, record.department].filter(Boolean).join(' · '), status: record.status, path: `/admin/staff?record=${encodeURIComponent(record.id)}` }
  if (source === 'aivex') return { id: `aivex:${record.ref}`, source, title: record.name, reference: record.ref, icon: 'aivex', detail: [record.ref, record.institution].filter(Boolean).join(' · '), status: record.document, path: `/admin/aivex/${encodeURIComponent(record.ref)}` }
  if (source === 'students') return { id: `students:${record.id}`, source, title: record.name, reference: record.reference, initials: initialsOf(record.name), detail: [record.teamName, record.institutionName].filter(Boolean).join(' · '), path: `/admin/aivex/${encodeURIComponent(record.reference)}` }
  return null
}

// Where "See all results" goes; the query itself travels in router state.
export const sourceListPath = (source, items = []) => ({
  applications: `/admin/applications${items[0]?.status ? `?stage=${encodeURIComponent(items[0].status)}` : ''}`,
  members: '/admin/members',
  staff: '/admin/staff',
  aivex: '/admin/aivex',
  students: '/admin/aivex?view=students',
}[source])

const STAGES = ['New', 'In review', 'Interview', 'Accepted', 'Declined', 'Archived']
const AIVEX_QUEUES = [['Ready to review', 'Signed document received'], ['Under review', 'Under review'], ['Corrections requested', 'Corrections needed'], ['Team accepted', 'Validated']]
const SETTINGS_TABS = ['Workspace', 'AIVEX', 'Access & privacy', 'Appearance']

// Every page and sub-view the palette can open, with who may see it.
export const SEARCH_PAGES = Object.freeze([
  { id: 'page:overview', title: 'Overview', detail: 'Control room', path: '/admin/overview', icon: 'overview', access: FULL, keywords: 'dashboard home kpi' },
  { id: 'page:applications', title: 'Applications', detail: 'Join intake', path: '/admin/applications', icon: 'applications', access: FULL, keywords: 'join candidates' },
  ...STAGES.map((stage) => ({ id: `page:applications:${stage}`, title: `Applications · ${stage}`, detail: 'Application stage', path: `/admin/applications?stage=${encodeURIComponent(stage)}`, icon: 'applications', access: FULL, keywords: 'stage candidates' })),
  { id: 'page:members', title: 'Members', detail: 'Community directory', path: '/admin/members', icon: 'members', access: FULL, keywords: 'people directory' },
  { id: 'page:staff', title: 'Staff', detail: 'Operational roster', path: '/admin/staff', icon: 'staff', access: FULL, keywords: 'team departments' },
  { id: 'page:aivex', title: 'AIVEX files', detail: 'Administrative files', path: '/admin/aivex', icon: 'aivex', access: AIVEX, keywords: 'teams dossiers review' },
  { id: 'page:aivex:participation', title: 'AIVEX participation', detail: 'Attendance on the day', path: '/admin/aivex?view=participation', icon: 'aivex', access: AIVEX, keywords: 'attendance present absent' },
  { id: 'page:aivex:students', title: 'Accepted students', detail: 'Final accepted-team roster', path: '/admin/aivex?view=students', icon: 'students', access: AIVEX, keywords: 'aivex roster students' },
  ...AIVEX_QUEUES.map(([title, filter]) => ({ id: `page:aivex:queue:${filter}`, title: `AIVEX · ${title}`, detail: 'Files queue', path: `/admin/aivex?document=${encodeURIComponent(filter)}`, icon: 'aivex', access: AIVEX, keywords: `queue files ${filter}` })),
  { id: 'page:activity', title: 'Activity log', detail: 'Audit trail', path: '/admin/activity', icon: 'activity', access: FULL, keywords: 'history audit' },
  ...SETTINGS_TABS.map((tab) => ({ id: `page:settings:${tab}`, title: tab === 'Workspace' ? 'Settings' : `Settings · ${tab}`, detail: 'Workspace preferences', path: '/admin/settings', settingsTab: tab, icon: 'settings', access: FULL, keywords: 'preferences settings' })),
])

// Commands; the interface supplies what each one does.
export const SEARCH_ACTIONS = Object.freeze([
  { id: 'action:theme-light', title: 'Use the light theme', icon: 'light', keywords: 'theme appearance colour mode day' },
  { id: 'action:theme-dark', title: 'Use the dark theme', icon: 'dark', keywords: 'theme appearance colour mode night' },
  { id: 'action:theme-system', title: 'Follow the device theme', icon: 'system', keywords: 'theme appearance automatic system' },
  { id: 'action:accent-forest', title: 'Accent: Forest', icon: 'accent', keywords: 'colour green' },
  { id: 'action:accent-ocean', title: 'Accent: Ocean', icon: 'accent', keywords: 'colour blue' },
  { id: 'action:accent-plum', title: 'Accent: Plum', icon: 'accent', keywords: 'colour violet purple' },
  { id: 'action:accent-ember', title: 'Accent: Ember', icon: 'accent', keywords: 'colour orange' },
  { id: 'action:sidebar', title: 'Collapse or expand the sidebar', icon: 'sidebar', keywords: 'navigation menu', shell: 'full' },
  { id: 'action:notifications', title: 'Open notifications', icon: 'notifications', keywords: 'review queue alerts', shell: 'full' },
  { id: 'action:refresh', title: 'Reload the workspace', icon: 'refresh', keywords: 'refresh update data' },
  { id: 'action:aivex-arabic', title: 'Show AIVEX in Arabic', icon: 'language', keywords: 'arabic language rtl عربي' },
  { id: 'action:aivex-english', title: 'Show AIVEX in English', icon: 'language', keywords: 'english language ltr' },
  { id: 'action:sign-out', title: 'Sign out', icon: 'signout', keywords: 'logout leave session' },
])

const visibleTo = (entry, role, shell) => roleAllows(entry.access || AIVEX, role) && (!entry.shell || entry.shell === shell) && (shell === 'full' || (entry.access || AIVEX) === AIVEX)

// Pages or actions matching the query, best first. Empty query: the defaults.
export function searchStatic(entries, text, { role, shell = 'full', limit = 6 } = {}) {
  const visible = entries.filter((entry) => visibleTo(entry, role, shell))
  const query = normalizeQuery(text)
  if (!query) return visible.slice(0, limit)
  const folded = foldForMatch(query)
  return visible
    .filter((entry) => matchesQuery(`${entry.title} ${entry.detail || ''} ${entry.keywords || ''}`, query))
    .map((entry, index) => ({ entry, index, score: foldForMatch(entry.title).startsWith(folded) ? 0 : matchesQuery(entry.title, query) ? 1 : 2 }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry)
}
