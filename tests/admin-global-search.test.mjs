import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  SEARCH_ACTIONS, SEARCH_PAGES, allowedSources, detectReference, foldForMatch, highlightSegments,
  normalizeQuery, parseInput, rankResults, searchStatic, sourcesFor, toSearchItem,
} from '../src/admin/adminSearchModel.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const marked = (segments) => segments.filter((segment) => segment.match).map((segment) => segment.text)

test('queries are cleaned exactly like the server safeSearch', () => {
  assert.equal(normalizeQuery('  Lina   <b>Bensaid</b>; DROP  '), 'Lina b Bensaid b DROP')
  assert.equal(normalizeQuery('ｌｉｎａ'), 'lina', 'NFKC folds full-width letters')
  assert.equal(normalizeQuery('a.b+c_d-e@univ'), 'a.b+c_d-e@univ')
  assert.equal(normalizeQuery('x'.repeat(140)).length, 100)
  assert.equal(normalizeQuery(null), '')
})

test('typed prefixes narrow the scope', () => {
  assert.deepEqual(parseInput('> dark'), { scope: 'actions', prefix: '>', text: 'dark' })
  assert.deepEqual(parseInput('/settings'), { scope: 'pages', prefix: '/', text: 'settings' })
  assert.equal(parseInput('APP: lina').scope, 'applications')
  assert.equal(parseInput('member:selma').scope, 'members')
  assert.equal(parseInput('staff: anis').scope, 'staff')
  assert.equal(parseInput('aivex:nova').scope, 'aivex')
  assert.equal(parseInput('student: amine').scope, 'students')
  assert.deepEqual(parseInput('lina'), { scope: null, prefix: '', text: 'lina' })
})

test('AIVEX and JOIN references are recognised in their public format only', () => {
  assert.deepEqual(detectReference('aivex2-7k9m2p4r'), { source: 'aivex', reference: 'AIVEX2-7K9M2P4R' })
  assert.deepEqual(detectReference(' AIVEX12-0123ABCD '), { source: 'aivex', reference: 'AIVEX12-0123ABCD' })
  assert.equal(detectReference('AIVEX2-7K9M2P4I'), null, 'Crockford base32 has no I, L, O or U')
  assert.equal(detectReference('AIVEX0-7K9M2P4R'), null)
  assert.deepEqual(detectReference('join-261040'), { source: 'applications', reference: 'JOIN-261040' })
  assert.equal(detectReference('JOIN-'), null)
  assert.equal(detectReference('Nova Circuit'), null)
})

test('a source the role may not read is never asked', () => {
  assert.deepEqual(allowedSources('super_admin'), ['applications', 'members', 'staff', 'aivex', 'students'])
  assert.deepEqual(allowedSources('administrator'), ['aivex', 'students'])
  assert.deepEqual(allowedSources('reviewer'), ['aivex', 'students'])
  assert.deepEqual(allowedSources('guest'), [])
  assert.deepEqual(allowedSources('super_admin', 'aivex'), ['aivex', 'students'])
  assert.deepEqual(sourcesFor({ role: 'reviewer', text: 'lina' }), ['aivex', 'students'])
  assert.deepEqual(sourcesFor({ role: 'reviewer', scope: 'applications', text: 'lina' }), [])
  assert.deepEqual(sourcesFor({ role: 'super_admin', text: 'l' }), [], 'two characters minimum')
  assert.deepEqual(sourcesFor({ role: 'super_admin', scope: 'pages', text: 'lina' }), [])
  assert.deepEqual(sourcesFor({ role: 'super_admin', text: 'AIVEX2-7K9M2P4R', reference: detectReference('AIVEX2-7K9M2P4R') }), ['aivex'])
  assert.deepEqual(sourcesFor({ role: 'reviewer', text: 'JOIN-261040', reference: detectReference('JOIN-261040') }), [])
})

test('results rank exact reference, then names starting with the query, then server order', () => {
  const items = [
    { title: 'Amina Lina', reference: 'JOIN-100001' },
    { title: 'Lina Bensaid', reference: 'JOIN-100002' },
    { title: 'Karim', reference: 'JOIN-261040' },
    { title: 'Linda Kaci', reference: 'JOIN-100003' },
  ]
  assert.deepEqual(rankResults(items, 'lin', null).map((item) => item.title), ['Lina Bensaid', 'Linda Kaci', 'Amina Lina', 'Karim'])
  assert.equal(rankResults(items, 'JOIN-261040', detectReference('JOIN-261040'))[0].title, 'Karim')
})

test('highlighting ignores case, accents and Arabic spelling variants, and never builds HTML', () => {
  assert.deepEqual(marked(highlightSegments('Élodie Benaïssa', 'elo aiss')), ['Élo', 'aïss'])
  assert.deepEqual(marked(highlightSegments('أحمد بن علي', 'احمد')), ['أحمد'])
  assert.deepEqual(marked(highlightSegments('مدرسة', 'مدرسه')), ['مدرسة'])
  assert.deepEqual(marked(highlightSegments('Eléonore', 'éléo')), ['Eléo'], 'combining marks stay inside the highlight')
  assert.deepEqual(marked(highlightSegments('a.b+c (team)', 'b+c')), ['b+c'])
  const html = highlightSegments('<img src=x onerror=alert(1)>', 'img')
  assert.equal(html.map((segment) => segment.text).join(''), '<img src=x onerror=alert(1)>')
  assert.deepEqual(highlightSegments('Nova', ''), [{ text: 'Nova', match: false }])
  assert.equal(foldForMatch('ÀÉÎÕÜ'), 'aeiou')
})

test('list rows never expose phone, RFID or identity details', () => {
  const student = toSearchItem('students', { id: 'AIVEX2-7K9M2P4R-1', reference: 'AIVEX2-7K9M2P4R', name: 'Amine Kaci', teamName: 'Nova Circuit', institutionName: 'University', phone: '+213 555', rfid: 'RF-77' })
  assert.doesNotMatch(JSON.stringify(student), /\+213|RF-77/)
  const application = toSearchItem('applications', { id: 'a1', ref: 'JOIN-261040', name: 'Lina', email: 'lina@x.dz', phone: '+213 666', status: 'New' })
  assert.doesNotMatch(JSON.stringify(application), /\+213|lina@x\.dz/)
  assert.equal(application.path, '/admin/applications?record=a1&stage=New')
})

test('pages and actions follow the role and the shell', () => {
  const reviewerPages = searchStatic(SEARCH_PAGES, '', { role: 'reviewer', shell: 'aivex', limit: 50 }).map((entry) => entry.id)
  assert.ok(reviewerPages.includes('page:aivex'))
  assert.ok(!reviewerPages.some((id) => /members|staff|applications|settings|activity|overview/.test(id)))
  assert.equal(searchStatic(SEARCH_PAGES, 'students', { role: 'super_admin' })[0].id, 'page:aivex:students')
  const fullActions = searchStatic(SEARCH_ACTIONS, '', { role: 'super_admin', limit: 50 }).map((entry) => entry.id)
  const aivexActions = searchStatic(SEARCH_ACTIONS, '', { role: 'reviewer', shell: 'aivex', limit: 50 }).map((entry) => entry.id)
  assert.ok(fullActions.includes('action:sidebar') && !aivexActions.includes('action:sidebar'))
  assert.ok(aivexActions.includes('action:theme-dark') && aivexActions.includes('action:sign-out'))
  assert.equal(searchStatic(SEARCH_ACTIONS, 'dark', { role: 'reviewer', shell: 'aivex' })[0].id, 'action:theme-dark')
})

test('the search keeps nothing in browser storage and logs nothing', async () => {
  for (const path of ['src/admin/adminSearchModel.js', 'src/admin/useAdminSearch.js']) {
    const source = await read(path)
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|console\./, path)
  }
  const hook = await read('src/admin/useAdminSearch.js')
  assert.match(hook, /SEARCH_DEBOUNCE_MS = 350/)
  assert.match(hook, /new AbortController\(\)/)
  assert.match(hook, /HIDDEN_STATUSES = new Set\(\[403, 404, 503\]\)/)
  assert.match(hook, /limit: SEARCH_LIMIT/)
})

test('the palette is an ARIA combobox whose results are real links handed over through router state', async () => {
  const [palette, ui, applications, directory, aivex] = await Promise.all([
    read('src/admin/GlobalSearch.jsx'), read('src/admin/AdminUI.jsx'), read('src/admin/ApplicationsPage.jsx'),
    read('src/admin/DirectoryPage.jsx'), read('src/admin/AivexPages.jsx'),
  ])
  for (const attribute of ['role="combobox"', 'aria-expanded={open}', 'aria-controls={listboxId}', 'aria-activedescendant=', 'role="listbox"', 'role="group"', "role: 'option'", 'aria-live="polite"']) assert.ok(palette.includes(attribute), attribute)
  assert.match(palette, /<a key=\{option\.key\} \{\.\.\.props\} href=\{option\.href\}/)
  assert.match(palette, /if \(isModified\(event\)\) return/, 'middle and Ctrl/⌘ clicks open a new tab')
  assert.match(palette, /navigate\(option\.href, option\.state \? \{ state:/)
  assert.doesNotMatch(palette, /localStorage|sessionStorage|console\.|dangerouslySetInnerHTML/)
  assert.equal(ui.match(/<GlobalSearch /g)?.length, 2, 'top bar and AIVEX access bar')
  for (const page of [applications, directory, aivex]) assert.match(page, /routeState\?\.globalSearch/)
})
