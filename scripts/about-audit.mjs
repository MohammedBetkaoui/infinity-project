import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:5173/'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const pages = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json())
const page = pages.find((entry) => entry.type === 'page')
assert(page, 'Start Chrome with --remote-debugging-port=9222 first')
const socket = new WebSocket(page.webSocketDebuggerUrl)
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
const scroll = async (top) => {
  await evaluate(`window.scrollTo({ top: ${top}, behavior: 'instant' })`)
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}
const sample = () => evaluate(`(() => {
  const section = document.querySelector('#a-propos')
  const nodes = [...section.querySelectorAll('.notebook-title-ink, .notebook-route-ink, .notebook-sticky-ink')]
  const note = section.querySelector('.notebook-note').getBoundingClientRect()
  const sticky = section.querySelector('.workshop-sticky').getBoundingClientRect()
  const box = section.getBoundingClientRect()
  return {
    y: scrollY, mode: section.dataset.aboutMotion,
    ink: nodes.map(path => 1 - parseFloat(getComputedStyle(path).strokeDashoffset) / path.getTotalLength()),
    washes: [...section.querySelectorAll('.notebook-node-wash')].map(node => Number(getComputedStyle(node).opacity)),
    copy: Number(getComputedStyle(section.querySelector('.about-copy')).opacity),
    paper: getComputedStyle(section.querySelector('.notebook-sheet')).transform,
    note: getComputedStyle(section.querySelector('.workshop-sticky')).transform,
    height: box.height,
    gap: document.querySelector('#poles').getBoundingClientRect().top - box.bottom,
    overflow: document.documentElement.scrollWidth > innerWidth,
    collision: sticky.top < note.bottom && sticky.bottom > note.top && sticky.left < note.right && sticky.right > note.left,
    pin: Boolean(section.querySelector('.pin-spacer')),
  }
})()`)
const range = () => evaluate(`(() => {
  const rect = document.querySelector('.workshop-notes').getBoundingClientRect()
  return { start: rect.top + scrollY - innerHeight * (innerWidth < 768 ? .86 : .82), end: rect.bottom + scrollY - innerHeight * (innerWidth < 768 ? .36 : .47) }
})()`)
const report = { layouts: [] }

try {
  await mkdir('.browser-motion-audit', { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  for (const width of [1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 1024 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 1024 })
    await send('Page.navigate', { url })
    for (let i = 0; i < 40; i++) {
      if (await evaluate('Boolean(document.querySelector(".notebook-route-ink"))')) break
      await pause(150)
    }
    await evaluate('document.fonts.ready.then(() => true)')
    await pause(2100)
    const { start, end } = await range()
    const states = []
    for (const progress of [0, .25, .48, .74, 1, .48, 0]) {
      await scroll(start + (end - start) * progress)
      const state = await sample()
      states.push({ progress, ...state })
      assert(!state.overflow && !state.pin && !state.collision, `Layout remains readable at ${width}px, progress ${progress}`)
      assert.equal(state.copy, 1, 'The club presentation never disappears')
      assert(Math.abs(state.gap) < 1, 'No gap before the next section')
      assert(Math.abs(state.height - states[0].height) < 1, 'Motion must not change layout height')
      if (progress === 0) assert(state.ink.every((value) => value < .015), 'Ink waits for the notebook to enter')
      if (progress === 1) assert(state.ink.every((value) => value > .99), 'Every sketch completes while the notebook is visible')
      if (progress === .48) assert(state.ink[2] > .985 && state.ink[3] < .01, 'Connections draw in order, not all at once')
      if (progress === .74 && [1440, 390].includes(width)) await capture(`about-${width}-drawing`)
    }
    states[2].ink.forEach((value, index) => assert(Math.abs(value - states[5].ink[index]) < .003, 'Reversing scroll returns to the same ink position'))
    report.layouts.push({ width, range: { start, end }, states })
    if (width === 1440) {
      await evaluate('document.querySelector(".hero-scroll-link").click()')
      await pause(800)
      assert(await evaluate('Math.abs(document.querySelector("#a-propos").getBoundingClientRect().top - 88) < 3'))
      await capture('about-desktop-overview')
      await evaluate('document.querySelector(".about-copy > a").focus()')
      assert(await evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'))
      await evaluate('document.querySelector(".about-copy > a").click()')
      await pause(800)
      assert(await evaluate('document.activeElement.id === "communaute"'))
    }
  }

  await scroll((await range()).start + 120)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(600)
  report.reduced = await sample()
  assert.equal(report.reduced.mode, 'static')
  assert(report.reduced.ink.every(value => value > .99))
  const transforms = { paper: report.reduced.paper, note: report.reduced.note }
  await scroll((await range()).end)
  assert.deepEqual({ paper: (await sample()).paper, note: (await sample()).note }, transforms, 'Reduced motion keeps paper and note static')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await pause(600)
  assert.equal((await sample()).mode, 'scrub')
  assert.deepEqual(errors, [])
  console.log('PASS: notebook drawing, sequencing, reversal, anchors, focus, stable layout, 320-1440px, reduced motion')
} finally {
  console.log(JSON.stringify({ ...report, errors }, null, 2))
  socket.close()
}
