import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createListCache } from '../src/admin/adminListCache.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the admin list cache returns a fresh entry, expires it, bounds its size and can be emptied', () => {
  let clock = 1_000
  const cache = createListCache({ ttlMs: 60_000, maxEntries: 2, now: () => clock })
  assert.equal(cache.get('page=1'), null)

  cache.set('page=1', { records: ['a'] })
  clock += 59_999
  assert.deepEqual(cache.get('page=1'), { records: ['a'] })
  clock += 1
  assert.equal(cache.get('page=1'), null, 'an entry is not served once its lifetime is over')
  assert.equal(cache.size, 0, 'an expired entry is dropped')

  cache.set('page=1', 1)
  cache.set('page=2', 2)
  cache.set('page=3', 3)
  assert.equal(cache.size, 2)
  assert.equal(cache.get('page=1'), null, 'the oldest entry goes first')
  assert.equal(cache.get('page=3'), 3)

  cache.clear()
  assert.equal(cache.size, 0)
})

test('the admin list cache is memory-only', async () => {
  const source = await read('src/admin/adminListCache.js')
  assert.doesNotMatch(source.replace(/^\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB|document\.cookie/)
})

test('the AIVEX list debounces searches, reuses a recent page and forgets it after any change', async () => {
  const hook = await read('src/admin/useAdminAivex.js')
  assert.match(hook, /SEARCH_DEBOUNCE_MS = 350/)
  assert.match(hook, /LIST_CACHE_TTL_MS = 60 \* 1000/)
  assert.match(hook, /searchChanged && search \? SEARCH_DEBOUNCE_MS : 0/)
  assert.match(hook, /const cached = listCache\.get\(query\)\s+if \(cached\) \{/, 'a cached page is served before any request')
  assert.match(hook, /listCache\.set\(query, value\)/)
  assert.match(hook, /window\.clearTimeout\(timer\)/, 'a search superseded while typing is never sent')
  assert.match(hook, /const refresh = useCallback\(\(\) => \{\s+clearListCache\(\)/, 'Refresh always asks the server')

  const actions = hook.slice(hook.indexOf('export function useAdminAivexActions'))
  assert.equal(actions.match(/clearListCache\(\)/g)?.length, 3, 'action, identity replacement and purge each empty the cache')
  assert.match(actions, /if \(!response\.ok\) return \{ ok: false[^\n]*\n\s+clearListCache\(\)\n\s+return \{ ok: true, team: body\.team \}/)
})

test('a team file is re-read on focus only when stale, and once after a viewer decision', async () => {
  const page = await read('src/admin/AivexPages.jsx')
  assert.match(page, /DETAIL_AUTO_SYNC_MIN_INTERVAL_MS = 5 \* 60 \* 1000/)
  assert.match(page, /useEffect\(\(\) => \{ if \(team\) teamLoadedAt\.current = Date\.now\(\) \}, \[team\]\)/)
  assert.match(page, /const syncVerification = async \(\) => \{[\s\S]{0,200}Date\.now\(\) - teamLoadedAt\.current < DETAIL_AUTO_SYNC_MIN_INTERVAL_MS\) return/)
  assert.match(page, /if \(!alreadyCurrent\) refreshDetail\(\)/)
  assert.match(page, /onUpdated=\{updateFromViewer\}/)
  assert.doesNotMatch(page, /const closeViewer = \(\) => \{ setViewerId\(null\); refreshDetail\(\) \}/)
})

test('admin session checks skip window switches and reuse successful API answers', async () => {
  const auth = await read('src/admin/AdminAuth.jsx')
  assert.match(auth, /FOCUS_SESSION_CHECK_MIN_MS = 60 \* 1000/)
  assert.match(auth, /if \(Date\.now\(\) - lastSessionCheck\.current >= FOCUS_SESSION_CHECK_MIN_MS\) refreshSession\(\)/)
  assert.match(auth, /if \(result\.response\.ok\) lastSessionCheck\.current = Date\.now\(\)/)
  assert.match(auth, /if \(response\.ok\) lastSessionCheck\.current = Date\.now\(\)/)
  assert.match(auth, /timestamp - lastSessionCheck\.current >= SESSION_TOUCH_MS/, 'active use still keeps the session alive')
})
