import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ACCENTS, THEMES, auditAll, formatReport, themeTokens } from './support/admin-theme-contrast.mjs'

const css = await readFile(new URL('../src/admin/admin.css', import.meta.url), 'utf8')

test('every theme and accent resolves the full set of colour roles', () => {
  for (const theme of THEMES) {
    for (const accent of ACCENTS) assert.ok(themeTokens(css, { theme, accent }), `${theme}/${accent} has no token block`)
  }
})

test('the eight theme and accent combinations meet WCAG contrast', () => {
  const report = auditAll(css)
  assert.equal(report.filter(({ results }) => results?.length).length, THEMES.length * (ACCENTS.length + 1), 'a combination was not audited')
  const failing = formatReport(report).filter((line) => line.startsWith('✗'))
  assert.deepEqual(failing, [], `\n${failing.join('\n')}`)
})

test('the dark theme recolours roles, not components', () => {
  // Component rules scoped to the dark theme are exceptions; each one must be
  // listed here and justified by a comment in admin.css.
  const allowed = []
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const scoped = [...source.matchAll(/^([^{}\n]*\[data-theme="dark"\][^{}\n]*)\{([^}]*)\}/gm)]
    .filter(([, , body]) => body.split(';').some((declaration) => declaration.trim() && !declaration.trim().startsWith('--')))
    .map(([, selector]) => selector.trim())
  assert.deepEqual(scoped, allowed)
  assert.doesNotMatch(css, /filter:\s*invert\(/)
})
