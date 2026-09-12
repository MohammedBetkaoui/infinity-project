import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:5173/'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const targets = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json())
const page = targets.find(target => target.type === 'page')
assert(page, 'Start Chrome with --remote-debugging-port=9222 first')
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
const errors = []
let sequence = 0
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id)
    pending.delete(message.id)
    clearTimeout(timer)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '))
}
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const capture = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`.browser-motion-audit/${name}.png`, Buffer.from(data, 'base64'))
}
const navigate = async (hash = '') => {
  const navigation = await send('Page.navigate', { url: `${url.split('#')[0]}${hash}` })
  // A changed hash alone is same-document navigation, not a fresh deep-link load.
  if (!navigation.loaderId) await send('Page.reload')
  for (let i = 0; i < 40; i++) {
    if (await evaluate('Boolean(document.querySelector(".nav-active-line"))')) break
    await pause(150)
  }
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(2000)
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const geometry = () => evaluate(`(() => {
  const nav = document.querySelector('.site-nav')
  const children = [...nav.children].filter(node => node.getClientRects().length).map(node => {
    const rect = node.getBoundingClientRect(); return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom}
  })
  const active = document.querySelector('.nav-links [aria-current]')
  const line = document.querySelector('.nav-active-line').getBoundingClientRect()
  const rect = active.getBoundingClientRect()
  return {
    active: active.getAttribute('href'), count: document.querySelectorAll('.nav-links [aria-current]').length,
    markerError: Math.abs(line.left - rect.left - 9) + Math.abs(line.width - rect.width + 18),
    overlap: children.some((node, i) => i > 0 && node.left < children[i - 1].right),
    clipped: children.some(node => node.left < nav.getBoundingClientRect().left || node.right > nav.getBoundingClientRect().right),
    overflow: document.documentElement.scrollWidth > innerWidth,
    compact: document.querySelector('.site-header').classList.contains('is-scrolled'),
  }
})()`)
const report = { desktop: [], mobile: [] }

try {
  await mkdir('.browser-motion-audit', { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  for (const width of [1440, 1024]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Emulation.setTouchEmulationEnabled', { enabled: false })
    await navigate()
    for (const href of ['#accueil', '#a-propos', '#poles', '#communaute', '#evenements', '#contact', '#accueil']) {
      await click(`.nav-links a[href="${href}"]`)
      await pause(850)
      const state = await geometry()
      report.desktop.push({ width, href, ...state })
      assert.equal(state.active, href, 'Active location follows the actual section, not the menu order')
      assert.equal(state.count, 1)
      assert(!state.overlap && !state.clipped && !state.overflow, `Navbar fits at ${width}px`)
      assert(state.markerError < 2, 'The sliding underline lands precisely under the active label')
      if (width === 1440 && href === '#a-propos') await capture('navbar-on-paper')
    }
    await navigate('#evenements')
    assert.equal((await geometry()).active, '#evenements', 'Native deep links select the destination')
  }
  for (const [width, height] of [[768, 900], [390, 844], [320, 568]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true })
    await navigate()
    const state = await geometry()
    assert(!state.overlap && !state.clipped && !state.overflow)
    await click('.menu-toggle')
    await pause(500)
    assert(await evaluate('document.querySelector("main").inert && document.querySelector(".site-header").inert'))
    assert(await evaluate('document.querySelector(".mobile-links [aria-current]").getAttribute("href") === "#accueil"'))
    assert(await evaluate('document.querySelector("#mobile-menu").scrollWidth <= innerWidth'))
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', modifiers: 8 })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', modifiers: 8 })
    assert(await evaluate('document.activeElement.matches(".menu-social-row a")'), 'Tab wraps inside the menu')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' })
    await pause(350)
    assert(await evaluate('document.activeElement.matches(".menu-toggle") && !document.querySelector("main").inert'))
    await click('.menu-toggle')
    await pause(350)
    if (width === 320) {
      await evaluate('document.querySelector(".menu-join").scrollIntoView({block:"center"})')
      assert(await evaluate('document.querySelector(".menu-join").getBoundingClientRect().bottom <= innerHeight'), 'Short screens can reach the join button')
    }
    await click('.mobile-links a[href="#communaute"]')
    await pause(400)
    assert(await evaluate('document.activeElement.id === "communaute" && !document.querySelector("#mobile-menu")'))
    await click('.menu-toggle')
    await pause(350)
    assert(await evaluate('document.querySelector(".mobile-links [aria-current]").getAttribute("href") === "#communaute"'))
    if (width === 390) await capture('navbar-mobile-current')
    await click('.menu-top button')
    await pause(350)
    report.mobile.push({ width, height, ...state })
  }
  await click('.menu-toggle')
  await pause(350)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await pause(600)
  assert(await evaluate('!document.querySelector("#mobile-menu") && !document.querySelector("main").inert && document.activeElement.matches(".site-nav > a")'), 'Resizing an open menu restores a visible focus target')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(600)
  await navigate('#poles')
  report.reduced = await geometry()
  assert.equal(report.reduced.active, '#poles')
  assert(report.reduced.markerError < 2)
  assert(await evaluate('!document.documentElement.classList.contains("lenis")'))
  assert.deepEqual(errors, [])
  console.log('PASS: active sections, precise indicator, 1024-1440px desktop, 320-768px mobile, deep links, focus trap, short screens, reduced motion')
} finally {
  console.log(JSON.stringify({ ...report, errors }, null, 2))
  socket.close()
}
