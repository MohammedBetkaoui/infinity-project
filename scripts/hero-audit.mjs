import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:5173/'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const target = targets.find((entry) => entry.type === 'page')
assert(target, 'Start Chrome with --remote-debugging-port=9222 first')
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
const errors = []
let sequence = 0
socket.onmessage = ({ data }) => {
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
}
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
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
const capture = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`.browser-motion-audit/${name}.png`, Buffer.from(data, 'base64'))
}
const viewport = async (width, height, touch = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch })
  await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 })
}
const navigate = async () => {
  await send('Page.navigate', { url })
  for (let i = 0; i < 40; i++) {
    if (await evaluate('Boolean(document.querySelector(".ribbon-trace"))')) break
    await pause(200)
  }
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(2100)
}
const sample = () => evaluate(`(() => {
  const hero = document.querySelector('#accueil')
  const stage = document.querySelector('.hero-stage')
  const path = document.querySelector('.ribbon-trace')
  const head = document.querySelector('.infinity-head')
  const length = path.getTotalLength()
  const dash = parseFloat(getComputedStyle(path).strokeDashoffset)
  const progress = 1 - dash / length
  const point = path.getPointAtLength(progress * length)
  const expected = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM())
  const actual = new DOMPoint(0, 0).matrixTransform(head.getScreenCTM())
  const about = document.querySelector('#a-propos').getBoundingClientRect()
  return {
    y: scrollY, mode: hero.dataset.heroMode, progress,
    pointError: Math.hypot(actual.x - expected.x, actual.y - expected.y),
    stageTop: stage.getBoundingClientRect().top, stageHeight: stage.offsetHeight,
    aboutTop: about.top, shade: parseFloat(getComputedStyle(document.querySelector('.hero-shade')).opacity),
    scale: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.hero-surface')).transform).a,
    logoTransform: getComputedStyle(document.querySelector('.site-header .brand-symbol')).transform,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }
})()`)
const scrollTo = async (y) => {
  await evaluate(`window.scrollTo({ top: ${y}, behavior: 'instant' })`)
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  return sample()
}
const signatureSample = () => evaluate(`(() => {
  const path = document.querySelector('.brand-journey-ink')
  const head = document.querySelector('.brand-journey-head')
  const length = path.getTotalLength()
  const progress = 1 - parseFloat(getComputedStyle(path).strokeDashoffset) / length
  const point = path.getPointAtLength(progress * length)
  const expected = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM())
  const actual = new DOMPoint(0, 0).matrixTransform(head.getScreenCTM())
  return {
    progress, y: scrollY, maximum: document.documentElement.scrollHeight - innerHeight,
    error: Math.hypot(actual.x - expected.x, actual.y - expected.y),
    opacity: Number(getComputedStyle(document.querySelector('.brand-journey')).opacity),
    mark: Number(getComputedStyle(document.querySelector('.site-header .brand-mark')).opacity),
    bar: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-scroll-progress]')).transform).a,
  }
})()`)
const report = { samples: [], mobile: [] }

try {
  await mkdir('.browser-motion-audit', { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  await viewport(1440, 1000)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await navigate()
  report.initial = await sample()
  console.log('Initial:', report.initial)
  assert.equal(report.initial.mode, 'pinned')
  assert(Math.abs(report.initial.progress) < .001, 'Infinity must wait for scroll, not draw during the intro')
  await capture('hero-scroll-initial')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1250, y: 540 })
  await pause(550)
  report.parallax = await evaluate(`({ art: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.art-depth')).transform).e, event: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.hero-event-depth')).transform).e })`)
  assert(Math.abs(report.parallax.event) > Math.abs(report.parallax.art) && Math.abs(report.parallax.event) < 5)
  assert((await sample()).pointError < .15, 'Parallax preserves path alignment')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 40, y: 20 })
  await pause(500)
  const pinStart = Math.max(0, report.initial.stageHeight - 1000)
  const travel = 340
  for (const progress of [.12, .37, .62, .82, 1, .37, 0]) {
    const state = await scrollTo(pinStart + progress * travel)
    report.samples.push({ requested: progress, ...state })
    console.log('Scrub:', progress, state.progress, 'point error', state.pointError, 'about top', state.aboutTop)
    assert(Math.abs(state.progress - Math.min(1, progress / .62)) < .006, 'Draw follows actual scroll in either direction')
    assert(state.pointError < .15, 'Light stays exactly on the SVG path')
    if (progress > 0 && progress < 1) assert(Math.abs(state.stageTop + pinStart) < 2, 'The stage stays pinned')
    if (progress === .37) await capture('hero-scroll-drawing')
    if (progress === .62) {
      assert(Math.abs(state.aboutTop - 1000) < 3, 'About enters exactly when the infinity finishes')
      assert(state.shade < .005)
    }
    if (progress === .82) {
      assert(state.scale < .99 && state.shade > .07)
      await capture('hero-scroll-handoff')
    }
  }

  report.journey = []
  const drawEnd = pinStart + travel * .62
  const maximum = await evaluate('document.documentElement.scrollHeight - innerHeight')
  for (const progress of [.2, .48, .83, 1, .48, 0]) {
    await scrollTo(drawEnd + progress * (maximum - drawEnd))
    const state = await signatureSample()
    report.journey.push(state)
    assert(Math.abs(state.progress - progress) < .003, 'The logo frame follows the entire document, in both directions')
    assert(state.error < .15, 'Navbar light stays on the frame path')
    assert(Math.abs(state.bar - state.y / state.maximum) < .003, 'Page bar and emblem share one scroll source')
    if (progress >= .2) assert(state.opacity === 1 && state.mark === 1, 'The reading frame never replaces the official emblem')
    if (progress === .48) await capture('hero-page-journey')
  }
  await scrollTo(0)
  assert.equal((await signatureSample()).mark, 1, 'Returning home restores the original club logo')

  await evaluate(`window.__heroFrames = []; window.__heroTasks = []; window.__heroStop = false;
    new PerformanceObserver(list => window.__heroTasks.push(...list.getEntries().map(e => e.duration))).observe({type:'longtask'});
    let previous = performance.now(); const tick = now => { window.__heroFrames.push(now - previous); previous = now; if (!window.__heroStop) requestAnimationFrame(tick) }; requestAnimationFrame(tick);`)
  for (const delta of [760, -680, 1450, -1300, 470, -700]) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 620, y: 460, deltaX: 0, deltaY: delta })
    await pause(85)
  }
  await pause(800)
  report.fastScroll = await evaluate('window.__heroStop = true; ({frames: window.__heroFrames.length, framesOver34ms: window.__heroFrames.filter(t => t > 34).length, longTasks: window.__heroTasks})')
  report.afterFastScroll = await sample()
  assert(report.afterFastScroll.pointError < .15)
  await evaluate(`document.querySelector('a[href="#poles"]').click()`)
  await pause(800)
  assert(await evaluate('Math.abs(document.querySelector("#poles").getBoundingClientRect().top - 88) < 3'), 'Anchors account for pin spacing')
  await send('Page.navigate', { url: `${url.split('#')[0]}#evenements` })
  await pause(2300)
  report.deepLink = await evaluate('({hash: location.hash, top: document.querySelector("#evenements").getBoundingClientRect().top})')
  assert(report.deepLink.top >= 0 && report.deepLink.top <= 200, 'A direct event anchor survives pin initialization')

  for (const [width, height] of [[1280, 720], [768, 844], [390, 844], [320, 740]]) {
    const touch = width < 1024
    await viewport(width, height, touch)
    await navigate()
    const start = await sample()
    report.mobile.push({ width, height, ...start })
    assert(!start.overflow)
    assert(await evaluate('[...document.querySelectorAll(".hero-line")].every(n => n.scrollWidth <= n.clientWidth + 1)'), 'Title never clips')
    if (touch) {
      assert.equal(start.mode, 'flow')
      assert(await evaluate('!document.querySelector("#accueil .pin-spacer")'), 'No mobile pin')
      const position = await evaluate(`(() => { const rect = document.querySelector('.infinity-art').getBoundingClientRect(); const start = Math.max(0, rect.top + scrollY - innerHeight * .74); const end = Math.max(start + 186, rect.bottom + scrollY - innerHeight * .28); return (start + end) / 2 })()`)
      const state = await scrollTo(position)
      assert(state.progress > .05 && state.progress <= 1)
      assert(state.pointError < .15)
      if (width === 390) await capture('hero-scroll-mobile')
    }
  }

  await viewport(1440, 1000)
  await navigate()
  await scrollTo(260)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(600)
  report.reduced = await evaluate(`({mode: document.querySelector('#accueil').dataset.heroMode, pinned: Boolean(document.querySelector('#accueil .pin-spacer')), dash: getComputedStyle(document.querySelector('.ribbon-trace')).strokeDashoffset, head: getComputedStyle(document.querySelector('.infinity-head')).display, logo: getComputedStyle(document.querySelector('.site-header .brand-symbol')).transform, lenis: document.documentElement.classList.contains('lenis')})`)
  assert.equal(report.reduced.mode, 'reduced')
  assert(!report.reduced.pinned && !report.reduced.lenis)
  assert.equal(parseFloat(report.reduced.dash), 0)
  assert.equal(report.reduced.head, 'none')
  assert(await evaluate('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".site-header .brand-symbol")).transform).isIdentity'))
  assert(await evaluate('getComputedStyle(document.querySelector(".brand-journey")).display === "none" && getComputedStyle(document.querySelector(".site-header .brand-mark")).opacity === "1"'))
  await scrollTo(await evaluate('(document.documentElement.scrollHeight - innerHeight) * .64'))
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await pause(650)
  report.reenabled = await signatureSample()
  assert(report.reenabled.progress > .5 && report.reenabled.error < .15, 'Re-enabling motion resumes at the current reading position')
  await evaluate('document.querySelector("#faq-question-1").click()')
  await pause(1000)
  await scrollTo(await evaluate('document.documentElement.scrollHeight - innerHeight'))
  assert(Math.abs((await signatureSample()).progress - 1) < .003, 'The journey adapts to FAQ height changes')
  assert.deepEqual(errors, [])
  console.log('PASS: infinity drawing, full-page relay, exact path following, reversal, pin handoff, rapid wheel, responsive layout, reduced motion')
} finally {
  console.log(JSON.stringify({ ...report, errors }, null, 2))
  socket.close()
}
