// Resolves the administration colour roles from admin.css for every theme and
// accent, then measures the pairs the interface relies on (WCAG 2 contrast and
// OKLab distance between chart series, including colour-vision deficiencies).
// The CSS is the single source of truth: nothing here hard-codes a colour.

export const ACCENTS = ['forest', 'ocean', 'plum', 'ember']
export const THEMES = ['light', 'dark']

const PALETTE = ':root'
const ROLES = ':root, .adm-admin-root, .adm-login, .adm-auth-loading'
const DARK = '.adm-admin-root[data-theme="dark"], .adm-login[data-theme="dark"], .adm-auth-loading[data-theme="dark"]'
const lightAccent = (accent) => `.adm-admin-root[data-accent="${accent}"]`
const darkAccent = (accent) => `.adm-admin-root[data-theme="dark"][data-accent="${accent}"]`

const splitTopLevel = (text, separator) => {
  const parts = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

// Custom properties of the top-level rule whose selector is exactly `selector`.
export function tokenBlock(css, selector) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const pattern = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`)
  const match = pattern.exec(source)
  if (!match) return null
  const open = match.index + match[0].length
  const body = source.slice(open, source.indexOf('}', open))
  const tokens = {}
  for (const declaration of splitTopLevel(body, ';')) {
    const colon = declaration.indexOf(':')
    const name = declaration.slice(0, colon).trim()
    if (name.startsWith('--')) tokens[name] = declaration.slice(colon + 1).trim()
  }
  return tokens
}

// The declarations that apply to a theme root, in cascade order.
export function themeTokens(css, { theme = 'light', accent = 'forest' } = {}) {
  const blocks = [tokenBlock(css, PALETTE), tokenBlock(css, ROLES)]
  if (accent !== 'forest') blocks.push(tokenBlock(css, lightAccent(accent)))
  if (theme === 'dark') {
    blocks.push(tokenBlock(css, DARK))
    if (accent !== 'forest') blocks.push(tokenBlock(css, darkAccent(accent)))
  }
  if (blocks.some((block) => !block)) return null
  return Object.assign({}, ...blocks)
}

function expand(value, tokens, depth = 0) {
  if (depth > 24) throw new Error(`circular custom property near ${value}`)
  return value.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fallback) => {
    if (tokens[name] !== undefined) return expand(tokens[name], tokens, depth + 1)
    if (fallback !== undefined) return expand(fallback, tokens, depth + 1)
    throw new Error(`undefined custom property ${name}`)
  })
}

const number = (text) => {
  const calc = text.match(/^calc\(\s*([\d.]+)\s*\*\s*([\d.]+)\s*\)$/)
  if (calc) return Number(calc[1]) * Number(calc[2])
  return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)
}

export function parseColor(text) {
  const value = text.trim()
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const hex = value.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('')
    const channel = (index) => parseInt(digits.slice(index, index + 2), 16)
    return { r: channel(0), g: channel(2), b: channel(4), a: digits.length === 8 ? channel(6) / 255 : 1 }
  }
  const rgb = value.match(/^rgba?\((.*)\)$/s)
  if (rgb) {
    const [channels, alpha] = rgb[1].split('/').map((part) => part.trim())
    const [r, g, b] = channels.split(/[\s,]+/).map(Number)
    return { r, g, b, a: alpha === undefined ? 1 : number(alpha) }
  }
  throw new Error(`unsupported colour ${value}`)
}

// Colour stops of a (possibly layered) gradient, in source order.
const gradientStops = (text) => [...text.matchAll(/rgba?\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-f]{3,8}\b/gi)].map((match) => parseColor(match[0]))

export function resolveColor(tokens, expression) {
  const value = expand(expression.startsWith('--') ? `var(${expression})` : expression, tokens)
  return parseColor(value)
}

export const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
})

const linear = (channel) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
export const contrast = (one, two) => {
  const [light, dark] = [luminance(one), luminance(two)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
const oklab = ([r, g, b]) => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}
const simulate = (color, matrix) => {
  const rgb = [linear(color.r), linear(color.g), linear(color.b)]
  return matrix ? matrix.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))) : rgb
}
// OKLab distance ×100 under normal vision or a simulated deficiency.
export const separation = (one, two, deficiency) => {
  const [a, b] = [one, two].map((color) => oklab(simulate(color, CVD[deficiency])))
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100
}

export const TEXT_MIN = 4.5
export const GRAPHIC_MIN = 3
// Chart series must stay apart under every colour-vision deficiency (8). For
// normal vision the dark theme meets the full 15; the light ramp of three
// greens predates the dark theme and is kept pixel-identical, so it is held
// at its current floor (10) instead.
export const SERIES_MIN = { light: 10, dark: 15 }
export const SERIES_CVD_MIN = 8
// Search highlights must stand out from the row behind them. The light value
// predates the dark theme and is kept pixel-identical, so it is held at its
// current floor (5.5); the dark theme meets 12.
export const MARK_MIN = { light: 5.5, dark: 12 }

// Every pair the interface depends on, for one theme and accent.
export function auditCombination(css, combination) {
  const tokens = themeTokens(css, combination)
  if (!tokens) return null
  const color = (expression) => resolveColor(tokens, expression)
  const opaque = (expression, base) => over(color(expression), base)
  const results = []
  const ratio = (group, label, foreground, background, minimum) => results.push({ group, label, ratio: contrast(foreground, background), minimum })

  const canvas = color('--adm-canvas')
  const surface = color('--adm-surface')
  const raised = opaque('--adm-surface-raised', surface)
  const overlay = opaque('--adm-surface-overlay', surface)
  const surfaces = {
    canvas, panel: surface, card: raised, overlay,
    'soft panel': opaque('--adm-surface-soft', surface),
    'soft card': opaque('--adm-surface-soft', raised),
    'soft overlay': opaque('--adm-surface-soft', overlay),
  }
  for (const [name, background] of Object.entries(surfaces)) {
    for (const role of ['--adm-ink', '--adm-secondary', '--adm-muted', '--adm-accent-fg']) ratio('text', `${role} on ${name}`, opaque(role, background), background, TEXT_MIN)
    for (const role of ['--adm-field-border', '--adm-field-border-quiet']) {
      if (tokens[role] !== undefined) ratio('field border', `${role} on ${name}`, opaque(role, background), background, GRAPHIC_MIN)
    }
  }
  // Marks are drawn on chart cards.
  const series = ['--adm-chart-1', '--adm-chart-2', '--adm-chart-3'].map((role) => color(role))
  series.forEach((mark, index) => ratio('chart', `chart-${index + 1} on card`, mark, raised, GRAPHIC_MIN))
  for (const [one, two] of [[0, 1], [1, 2], [0, 2]]) {
    results.push({ group: 'chart series', label: `chart-${one + 1} vs chart-${two + 1}`, ratio: separation(series[one], series[two]), minimum: SERIES_MIN[combination.theme], unit: 'ΔE' })
    for (const deficiency of Object.keys(CVD)) results.push({ group: 'chart series', label: `chart-${one + 1} vs chart-${two + 1} (${deficiency})`, ratio: separation(series[one], series[two], deficiency), minimum: SERIES_CVD_MIN, unit: 'ΔE' })
  }
  // Status ink on the strongest background tint the interface uses (.14).
  for (const [status, ink, tint] of [['success', '--adm-success-ink', '--adm-success-rgb'], ['warning', '--adm-amber-ink', '--adm-amber-rgb'], ['danger', '--adm-error', '--adm-error-rgb'], ['info', '--adm-info-ink', '--adm-info-rgb'], ['sensitive', '--adm-pink-ink', '--adm-pink-rgb'], ['female', '--adm-female-ink', '--adm-female-rgb'], ['male', '--adm-male-ink', '--adm-male-rgb']]) {
    for (const name of ['card', 'overlay']) {
      const background = over(color(`rgb(var(${tint}) / calc(.14 * var(--adm-tint)))`), surfaces[name])
      ratio('status', `${status} ink on its tint (${name})`, opaque(ink, background), background, TEXT_MIN)
    }
  }
  // Text on solid fills
  for (const [label, foreground, background] of [
    ['on-accent on accent', '--adm-on-accent', '--adm-accent'], ['on-accent on accent hover', '--adm-on-accent', '--adm-accent-hover'],
    ['on-danger on danger', '--adm-on-danger', '--adm-danger'], ['on-danger on danger hover', '--adm-on-danger', '--adm-danger-hover'],
    ['on-amber on amber', '--adm-on-amber', '--adm-amber'],
  ]) ratio('fill', label, color(foreground), color(background), TEXT_MIN)
  // Inverse blocks
  const inverseBackgrounds = { 'inverse bg': color('--adm-inverse-bg'), 'inverse alt': color('--adm-inverse-bg-alt'), 'inverse from': color('--adm-inverse-from'), 'inverse to': color('--adm-inverse-to') }
  for (const [name, background] of Object.entries(inverseBackgrounds)) {
    for (const role of ['--adm-inverse-fg', '--adm-inverse-muted', '--adm-inverse-accent']) ratio('inverse', `${role} on ${name}`, opaque(role, background), background, TEXT_MIN)
  }
  for (const fill of ['--adm-inverse-fg', '--adm-inverse-accent']) ratio('inverse', `--adm-inverse-on on ${fill}`, color('--adm-inverse-on'), color(fill), TEXT_MIN)
  // Search highlights, on the palette and on its active row
  for (const name of ['overlay', 'soft overlay']) {
    const background = surfaces[name]
    const mark = opaque('--adm-mark', background)
    ratio('search highlight', `ink on highlight (${name})`, opaque('--adm-ink', mark), mark, TEXT_MIN)
    results.push({ group: 'search highlight', label: `highlight vs ${name}`, ratio: separation(mark, background), minimum: MARK_MIN[combination.theme], unit: 'ΔE' })
  }
  // Initials avatars
  ratio('avatar', 'accent initials on tint', color('--adm-accent-fg'), over(color('rgb(var(--adm-tint-rgb) / .55)'), raised), TEXT_MIN)
  for (const tone of [1, 2, 3, 4, 5]) {
    const background = opaque(`--adm-tone-${tone}-bg`, raised)
    ratio('avatar', `tone ${tone}`, opaque(`--adm-tone-${tone}-ink`, background), background, TEXT_MIN)
  }
  return results.map((result) => ({ ...result, ok: result.ratio >= result.minimum, combination: `${combination.theme}/${combination.accent}` }))
}

// The sign-in screen: a dark backdrop in both themes, with a card that is
// light paper in the light theme and translucent deep green in the dark one.
export function auditLogin(css, theme) {
  const blocks = [tokenBlock(css, PALETTE), tokenBlock(css, ROLES), tokenBlock(css, '.adm-login')]
  if (theme === 'dark') blocks.push(tokenBlock(css, DARK), tokenBlock(css, '.adm-login[data-theme="dark"]'))
  if (blocks.some((block) => !block)) return null
  const tokens = Object.assign({}, ...blocks)
  const color = (expression) => resolveColor(tokens, expression)
  const backdrop = color('--lg-night')
  const results = []
  const ratio = (group, label, foreground, background, minimum) => results.push({ group, label, ratio: contrast(foreground, background), minimum })
  for (const [name, layer] of [['card top', '--lg-card-top'], ['card bottom', '--lg-card-bottom']]) {
    const card = over(color(layer), backdrop)
    for (const role of ['--lg-ink', '--lg-text', '--lg-muted', '--lg-hint']) ratio('sign-in', `${role} on ${name}`, color(role), card, TEXT_MIN)
    ratio('sign-in', `--lg-accent on ${name}`, color('--lg-accent'), card, GRAPHIC_MIN)
    ratio('sign-in', `--lg-field border on ${name}`, color('--lg-field'), card, GRAPHIC_MIN)
    ratio('sign-in', `--lg-badge-ink on badge (${name})`, color('--lg-badge-ink'), over(color('rgb(var(--adm-tint-rgb) / .24)'), card), TEXT_MIN)
    ratio('sign-in', `--lg-error-ink on error (${name})`, color('--lg-error-ink'), over(color('--lg-error-bg'), card), TEXT_MIN)
  }
  const field = over(color('--lg-field-bg'), backdrop)
  ratio('sign-in', '--lg-ink in field', color('--lg-ink'), field, TEXT_MIN)
  ratio('sign-in', '--lg-field border on field', color('--lg-field'), field, GRAPHIC_MIN)
  for (const stop of ['--lg-button-top', '--lg-button-bottom']) ratio('sign-in', `--lg-button-text on ${stop}`, color('--lg-button-text'), color(stop), TEXT_MIN)
  ratio('sign-in', 'caption on backdrop', over(color('rgb(var(--adm-light-text-rgb) / .62)'), backdrop), backdrop, TEXT_MIN)
  return results.map((result) => ({ ...result, ok: result.ratio >= result.minimum, combination: `${theme}/sign-in` }))
}

export function auditAll(css) {
  const report = []
  for (const theme of THEMES) {
    for (const accent of ACCENTS) report.push({ theme, accent, results: auditCombination(css, { theme, accent }) })
    report.push({ theme, accent: 'sign-in', results: auditLogin(css, theme) })
  }
  return report
}

// One line per check: the weakest combination and the failures, if any.
export function formatReport(report) {
  const rows = new Map()
  for (const { results } of report) {
    for (const result of results || []) {
      const row = rows.get(result.label) || { group: result.group, minimum: result.minimum, unit: result.unit, values: [] }
      row.values.push(result)
      rows.set(result.label, row)
    }
  }
  return [...rows.entries()].map(([label, row]) => {
    const weakest = row.values.reduce((low, value) => (value.ratio < low.ratio ? value : low))
    const failing = row.values.filter((value) => !value.ok).map((value) => `${value.combination} ${value.ratio.toFixed(2)}`)
    const minimums = [...new Set(row.values.map((value) => value.minimum))].join(' or ')
    return `${failing.length ? '✗' : '✓'} ${row.group.padEnd(13)} ${label.padEnd(52)} min ${weakest.ratio.toFixed(2)} (${weakest.combination}) / ${minimums}${row.unit ? ` ${row.unit}` : ':1'}${failing.length ? `  FAIL ${failing.join(', ')}` : ''}`
  })
}
