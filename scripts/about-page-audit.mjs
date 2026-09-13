import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = process.argv[2] || 'http://127.0.0.1:5173'
const output = '.browser-motion-audit'
const targets = await fetch('http://127.0.0.1:9222/json/list').then(response => response.json())
const target = targets.find(entry => entry.type === 'page')
assert(target, 'Start a dedicated Chrome headless session on port 9222')
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
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '))
}
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(method)) }, 15000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async expression => {
  for (let i = 0; i < 70; i++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Timed out: ${expression}`)
}
const capture = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'))
}
const navigate = async () => {
  await send('Page.navigate', { url: `${origin}/about` })
  await until('document.querySelector(".about-page")?.dataset.motion')
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(1500)
}
const scroll = async top => {
  await evaluate(`window.scrollTo({ top: ${top}, behavior: 'instant' })`)
  await pause(140)
}
const sample = () => evaluate(`(() => {
  const path = document.querySelector('.about-process-ink')
  const progress = 1 - parseFloat(getComputedStyle(path).strokeDashoffset) / path.getTotalLength()
  const point = path.getPointAtLength(progress * path.getTotalLength())
  const matrix = document.querySelector('.about-process-head').transform.baseVal.consolidate()?.matrix
  return {
    progress,
    error: matrix ? Math.hypot(matrix.e - point.x, matrix.f - point.y) : null,
    sketch: +getComputedStyle(document.querySelector('.about-scene-sketch')).opacity,
    prototype: +getComputedStyle(document.querySelector('.about-scene-prototype')).opacity,
    shared: +getComputedStyle(document.querySelector('.about-scene-shared')).opacity,
    overflow: document.documentElement.scrollWidth > innerWidth,
    height: document.documentElement.scrollHeight,
    pin: Boolean(document.querySelector('.about-page .pin-spacer')),
  }
})()`)
const report = []

try {
  await mkdir(output, { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  for (const [width, height] of [[1440,900], [1280,720], [768,1024], [390,844], [320,740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 })
    await navigate()
    assert.equal(await evaluate('document.querySelector(".about-page").dataset.motion'), 'active')
    assert.equal(await evaluate('document.querySelectorAll("main h1").length'), 1)
    assert.equal(await evaluate('Boolean(document.querySelector("vite-error-overlay"))'), false)
    assert(!await evaluate('document.documentElement.scrollWidth > innerWidth'), `${width}: no horizontal overflow`)
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".about-hero-route")).strokeDashoffset'), '0px')
    await capture(`about-page-hero-${width}`)
    const range = await evaluate(`(() => {
      const compact = innerWidth < 768
      const box = document.querySelector(compact ? '.about-process-scene' : '.about-process-track').getBoundingClientRect()
      return { start: box.top + scrollY - innerHeight * (compact ? .82 : .65), end: box.bottom + scrollY - innerHeight * (compact ? .35 : .65) }
    })()`)
    const states = []
    for (const progress of [0, .5, 1, .5, 0]) {
      await scroll(range.start + (range.end - range.start) * progress)
      const state = await sample()
      assert(!state.overflow && !state.pin, `${width}: stable reading flow`)
      assert(Math.abs(state.progress - progress) < .02, `${width}: path follows scroll (${state.progress} vs ${progress})`)
      assert(state.error < 1, `${width}: the particle remains on the SVG path`)
      if (progress === .5) assert(state.prototype > .98 && state.sketch < .02 && state.shared < .02, 'The prototype is visible at the middle stage')
      if (progress === 1) assert(state.shared > .98, 'The shared project completes the sequence')
      if (states.length) assert.equal(state.height, states[0].height, 'Animation does not change document height')
      states.push(state)
      if (progress === .5 && states.length === 2) await capture(`about-page-process-${width}`)
    }
    assert(Math.abs(states[1].progress - states[3].progress) < .002, 'Scroll reversal returns to the same frame')
    await evaluate('document.querySelector(".about-fields").scrollIntoView()')
    await pause(160)
    await evaluate('document.querySelector(".about-field button").focus()')
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await pause(650)
    assert.equal(await evaluate('document.querySelector(".about-field button").getAttribute("aria-expanded")'), 'true')
    assert(await evaluate('document.querySelector(".about-field-detail").getBoundingClientRect().height > 20'))
    await capture(`about-page-fields-${width}`)
    report.push({ width, height, states })
    console.log(`PASS ${width}x${height}: motion, reversal, stable layout, keyboard accordion`)
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(300)
  assert.equal(await evaluate('document.querySelector(".about-page").dataset.motion'), 'reduced')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".about-scene-shared")).opacity'), '1')
  await scroll(0)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".about-title-line")).transform'), 'none')
  assert.equal(await evaluate('document.documentElement.classList.contains("lenis")'), false)
  await evaluate('document.querySelector(".menu-toggle").click()')
  await pause(300)
  assert.equal(await evaluate('document.querySelector(".menu-join").getAttribute("href")'), '/#contact')
  await evaluate('document.querySelector(".menu-join").click()')
  await until('location.pathname === "/" && document.querySelector("#contact") && !document.querySelector(".infinity-loader")')
  await pause(350)
  assert.equal(await evaluate('location.hash'), '#contact')
  assert(await evaluate('Math.abs(document.querySelector("#contact").getBoundingClientRect().top - 88) < 5'), 'Cross-page join link reaches Contact')
  await evaluate('document.querySelector("footer a[href=\"/about\"]").click()')
  await until('location.pathname === "/about" && document.querySelector(".about-page")')
  await pause(350)
  assert(await evaluate('scrollY < 2'), 'Returning to About starts at the top')
  assert.deepEqual(errors, [])
  console.log('PASS: reduced motion, Home/About round trip, Contact navigation, no console errors')
} finally {
  await writeFile(`${output}/about-page-report.json`, JSON.stringify({ report, errors }, null, 2))
  socket.close()
}
