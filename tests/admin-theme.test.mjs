import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the theme preference is local, defaults to the system and follows it live', async () => {
  const store = await read('src/admin/adminTheme.js')
  assert.match(store, /STORAGE_KEY = 'infinity-admin-theme-v1'/)
  assert.match(store, /DEFAULT_THEME = 'system'/)
  assert.match(store, /\{ key: 'light'[\s\S]*\{ key: 'dark'[\s\S]*\{ key: 'system'/)
  assert.match(store, /\(prefers-color-scheme: dark\)/)
  assert.match(store, /addEventListener\('change', listener\)/)
  assert.match(store, /addEventListener\('storage', onStorage\)/)
  // Blocked storage falls back to the choice made in this tab.
  assert.match(store, /catch \{ \/\* Kept for this tab only\. \*\/ \}/)
  assert.match(store, /useSyncExternalStore\(subscribe, readSnapshot/)
  assert.doesNotMatch(store, /\/api\/admin\/settings\/preferences/)
})

test('every administration root carries the theme, and the site is left alone', async () => {
  const [app, utility, html] = await Promise.all([read('src/admin/AdminApp.jsx'), read('src/admin/AdminUtilityPages.jsx'), read('index.html')])
  assert.equal(app.match(/data-accent=\{accent\} data-theme=\{theme\}/g)?.length, 2, 'AdminShell and AivexOnlyShell roots')
  assert.match(app, /className="adm-auth-loading adm-app" data-theme=\{theme\}/)
  assert.match(utility, /className="adm-login adm-app" data-theme=\{theme\}/)
  assert.doesNotMatch(app + utility, /document\.documentElement\.(dataset|classList|setAttribute)/)
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline script (CSP script-src self)')
})

test('theme controls are labelled, pressed-state aware and respect reduced motion', async () => {
  const [ui, utility, i18n, store] = await Promise.all([read('src/admin/AdminUI.jsx'), read('src/admin/AdminUtilityPages.jsx'), read('src/admin/AivexI18n.js'), read('src/admin/adminTheme.js')])
  assert.match(ui, /aria-pressed=\{dark\}/)
  assert.match(ui, /aria-label=\{label\}/)
  assert.equal(ui.match(/<ThemeToggle /g)?.length, 2, 'Topbar and AIVEX access bar')
  assert.match(i18n, /'Dark theme': '/)
  assert.match(utility, /Saved on this browser only/)
  assert.match(utility, /ADMIN_THEMES\.map/)
  assert.match(store, /if \(reducedMotion \|\| typeof document\.startViewTransition !== 'function'\)/)
})
