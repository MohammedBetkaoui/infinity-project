import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || process.env.AUDIT_URL || 'http://127.0.0.1:5173/'
const output = '.browser-motion-audit'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const targets = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json())
const page = targets.find((entry) => entry.type === 'page')
assert(page, 'Launch a local Chrome instance with --remote-debugging-port=9222 first')
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
const errors = []
let sequence = 0
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id)
    clearTimeout(timer)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value || arg.description).join(' '))
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const capture = async (name, full = false) => {
  const params = { format: 'png', captureBeyondViewport: full }
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics')
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 }
  }
  const { data } = await send('Page.captureScreenshot', params)
  await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'))
}
const viewport = async (width, height, touch = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch })
  await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 })
}
const navigate = async () => {
  await send('Page.navigate', { url })
  for (let i = 0; i < 40; i++) {
    if (await evaluate('Boolean(document.querySelector("#contact h2"))')) break
    await pause(250)
  }
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(1800)
  assert(await evaluate('Boolean(document.querySelector("#accueil h1"))'), 'Homepage renders')
}
const geometry = () => evaluate(`(() => {
  const sections = [...document.querySelectorAll('main > section')].map((node) => {
    const rect = node.getBoundingClientRect()
    return { id: node.id, top: Math.round(rect.top + scrollY), height: Math.round(rect.height) }
  })
  return {
    width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
    sections, gaps: sections.slice(1).map((node, i) => node.top - sections[i].top - sections[i].height),
    titleSize: getComputedStyle(document.querySelector('h1')).fontSize,
    aboutColor: getComputedStyle(document.querySelector('#a-propos')).backgroundColor,
    aboutText: getComputedStyle(document.querySelector('#a-propos h2')).color,
    lenis: document.documentElement.classList.contains('lenis'),
    errorOverlay: Boolean(document.querySelector('vite-error-overlay')),
  }
})()`)
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const key = (key, modifiers = 0) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers })
const report = {}

try {
  await mkdir(output, { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  await viewport(1440, 1000)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await navigate()
  report.desktop = await geometry()
  await capture('design-desktop-hero')
  assert(!report.desktop.overflow && !report.desktop.errorOverlay)
  assert(parseFloat(report.desktop.titleSize) >= 100)

  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 650, y: 470, deltaX: 0, deltaY: 620 })
  await pause(100)
  const early = await evaluate('scrollY')
  await pause(650)
  const settled = await evaluate('scrollY')
  report.wheel = { requested: 620, early, settled }
  console.log('Wheel:', JSON.stringify(report.wheel))
  assert(Math.abs(settled - 620) < 15, `Wheel must travel 620px, got ${settled}`)

  await click('.hero-actions a[href="#poles"]')
  await pause(850)
  report.anchor = await evaluate('({hash: location.hash, top: document.querySelector("#poles").getBoundingClientRect().top, focus: document.activeElement.id})')
  assert(Math.abs(report.anchor.top - 88) < 3)
  await click('#pole-tab-4')
  await pause(300)
  assert(await evaluate('!document.querySelector("#pole-panel-4").hidden'))
  await evaluate('document.querySelector("#pole-tab-4").focus()')
  await key('ArrowDown')
  assert(await evaluate('document.querySelector("#pole-tab-5").getAttribute("aria-selected") === "true"'))
  report.keyboard = await evaluate('({focused: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle})')
  assert(report.keyboard.outline !== 'none')
  await capture('design-desktop-poles')

  await click('a[href="#communaute"]')
  await pause(2200)
  report.counts = await evaluate('[...document.querySelectorAll(".community-numbers dd > span[aria-hidden]")].map(n => n.textContent)')
  await capture('design-desktop-community')
  await click('a[href="#evenements"]')
  await pause(2200)
  await capture('design-desktop-events')
  report.network = await evaluate('[...document.querySelectorAll(".event-network-path")].map(n => parseFloat(getComputedStyle(n).strokeDashoffset))')
  assert(report.network.every((value) => value === 0))
  await evaluate('document.querySelector("#faq").scrollIntoView()')
  await click('#faq-question-1')
  await pause(800)
  assert(await evaluate('document.querySelector("#faq-question-1").getAttribute("aria-expanded") === "true"'))
  await click('a[href="#contact"]')
  await pause(800)
  await capture('design-desktop-contact')
  await click('a[href="#accueil"]')
  await pause(800)
  await capture('design-desktop-full', true)

  report.responsive = []
  for (const width of [768, 390, 360, 320]) {
    await viewport(width, 844, true)
    await navigate()
    const layout = await geometry()
    assert(!layout.overflow, `No horizontal overflow at ${width}px`)
    assert(layout.gaps.every((gap) => Math.abs(gap) <= 1), `No section gaps at ${width}px`)
    assert(!layout.lenis, 'Touch uses native scrolling')
    assert(await evaluate('[...document.querySelectorAll(".hero-word")].every(n => n.getBoundingClientRect().width <= n.parentElement.clientWidth + 1)'), `Hero title is not clipped at ${width}px`)
    await evaluate('document.querySelector("#communaute").scrollIntoView()')
    await pause(2000)
    assert(await evaluate('[...document.querySelectorAll(".community-numbers dd")].every(n => n.querySelector("[aria-hidden]").getBoundingClientRect().width <= n.clientWidth + 1)'), `Counters fit their columns at ${width}px`)
    await evaluate('window.scrollTo(0, 0)')
    await pause(200)
    report.responsive.push(layout)
    if (width === 768) await capture('design-tablet-hero')
    if (width !== 390) continue
    await capture('design-mobile-hero')
    await click('a[href="#a-propos"]')
    await pause(350)
    await capture('design-mobile-about')
    await click('.menu-toggle')
    await pause(500)
    assert(await evaluate('document.querySelector("main").inert'))
    await key('Tab', 8)
    await key('Tab', 8)
    assert(await evaluate('document.activeElement.matches(".mobile-menu-footer a")'))
    await key('Tab')
    assert(await evaluate('document.activeElement.matches(".menu-top > a")'))
    assert(await evaluate('document.activeElement.closest("#mobile-menu") !== null'))
    await key('Escape')
    await pause(300)
    assert(await evaluate('document.activeElement.classList.contains("menu-toggle")'))
    await click('.menu-toggle')
    await pause(400)
    await capture('design-mobile-menu')
    await click('.mobile-links a[href="#poles"]')
    await pause(400)
    assert(await evaluate('!document.querySelector("main").inert && document.activeElement.id === "poles"'))
    await click('#pole-tab-0')
    await pause(300)
    assert(await evaluate('!document.querySelector("#pole-panel-0").hidden'))
    await capture('design-mobile-poles')
    await evaluate('document.querySelector("#communaute").scrollIntoView()')
    await pause(1800)
    await evaluate('document.querySelector("#evenements").scrollIntoView()')
    await pause(1500)
    await evaluate('window.scrollTo(0, 0)')
    await capture('design-mobile-full', true)
  }

  await viewport(1440, 1000)
  await navigate()
  // Changing the preference while open must tear down Lenis and ambient motion.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  for (let i = 0; i < 20; i++) {
    await pause(100)
    report.reduced = await evaluate(`({media: matchMedia('(prefers-reduced-motion: reduce)').matches, lenis: document.documentElement.classList.contains('lenis'), titleAtRest: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.hero-word')).transform).isIdentity, cursor: getComputedStyle(document.querySelector('.cursor-ring')).display, orbit: getComputedStyle(document.querySelector('.art-orbit')).transform, orbitAtRest: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.art-orbit')).transform).isIdentity})`)
    if (report.reduced.media && !report.reduced.lenis && report.reduced.titleAtRest && report.reduced.cursor === 'none' && report.reduced.orbitAtRest) break
  }
  assert(!report.reduced.lenis && report.reduced.titleAtRest && report.reduced.cursor === 'none' && report.reduced.orbitAtRest, JSON.stringify(report.reduced))
  await pause(500)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".art-orbit")).transform'), report.reduced.orbit, 'Ambient orbit stops for reduced motion')
  report.errors = errors
  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
  console.log('PASS: rendering, wheel, anchors, tabs, FAQ, mobile menu, keyboard, reduced motion')
} finally {
  socket.close()
}
