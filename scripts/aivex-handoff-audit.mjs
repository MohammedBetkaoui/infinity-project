import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const origin = process.argv[2] || 'http://127.0.0.1:5173'
const tabs = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json())
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
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
await new Promise(resolve => { socket.onopen = resolve })
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const report = []

try {
  await send('Runtime.enable')
  await send('Runtime.discardConsoleEntries')
  await send('Page.enable')
  await send('Page.navigate', { url: 'about:blank' })
  await pause(100)
  errors.length = 0
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__handoff = { firstSeen: null, started: null, ended: null, samples: [] }
    const sample = () => {
      const state = window.__handoff
      const loader = document.querySelector('.aivex-loader')
      const now = performance.now()
      if (loader && state.firstSeen === null) state.firstSeen = now
      if (loader?.dataset.handoff) {
        state.started ??= now
        state.mode = loader.dataset.handoff
        const target = document.querySelector('[data-aivex-logo-target]')
        const artwork = target.querySelector('svg')
        const rect = artwork.getBoundingClientRect()
        const art = artwork.viewBox.baseVal
        // Each loader tile must land on its own letter slot of the Hero artwork.
        const tiles = [...loader.querySelectorAll('.aivex-loader-tile')].map(tile => {
          const box = tile.getBoundingClientRect()
          const slot = tile.querySelector('svg').viewBox.baseVal
          return { x: box.x, y: box.y, width: box.width, height: box.height, target: {
            x: rect.x + (slot.x - art.x) * rect.width / art.width, y: rect.y + (slot.y - art.y) * rect.height / art.height,
            width: slot.width * rect.width / art.width, height: slot.height * rect.height / art.height } }
        })
        state.samples.push({ at: now, tiles, destinationHidden: getComputedStyle(target).visibility === 'hidden' })
      }
      if (!loader && state.firstSeen !== null) { state.ended = now; return }
      if (now < 10000) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  ` })
  for (const test of [
    { width: 1440, motion: 'no-preference' },
    { width: 390, motion: 'no-preference' },
    { width: 320, motion: 'no-preference' },
    { width: 1440, motion: 'reduce' },
    { width: 1440, motion: 'no-preference', hash: '#participer' },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: test.width, height: 900, deviceScaleFactor: 1, mobile: test.width < 800 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: test.width < 800 })
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: test.motion }] })
    // Always a fresh document: /aivex → /aivex#hash alone would stay in-page.
    await send('Page.navigate', { url: 'about:blank' })
    await pause(100)
    await send('Page.navigate', { url: `${origin}/aivex${test.hash || ''}` })
    let state
    for (let attempt = 0; attempt < 120; attempt++) {
      await pause(60)
      state = await evaluate('window.__handoff')
      if (state?.started && state.samples.length > 14 && !state.ended && test.width === 1440 && !test.hash && test.motion === 'no-preference') {
        const { data } = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile('.browser-motion-audit/aivex-logo-in-flight.png', Buffer.from(data, 'base64'))
      }
      if (state?.ended) break
    }
    assert(state?.ended, 'The loader always releases the page')
    const mode = test.motion === 'reduce' || test.hash ? 'fade' : 'travel'
    assert.equal(state.mode, mode)
    const hold = state.started - state.firstSeen
    assert(hold >= 2450, 'Preserve the configured 2.5-second minimum')
    let landingError = null
    if (mode === 'travel') {
      assert(state.samples.length > 10)
      assert(state.samples.every(sample => sample.destinationHidden), 'One visible logo during the flight')
      const error = tile => Math.abs(tile.x - tile.target.x) + Math.abs(tile.y - tile.target.y) + Math.abs(tile.width - tile.target.width) + Math.abs(tile.height - tile.target.height)
      landingError = Math.max(...state.samples.at(-1).tiles.map(error))
      assert(landingError < 3, 'Every moving letter lands on its exact slot of the Hero logo')
      // The row travels as one piece: gaps only ever close, tiles never overlap.
      const gaps = state.samples.map(sample => sample.tiles.slice(1).map((tile, i) => tile.x - (sample.tiles[i].x + sample.tiles[i].width)))
      assert(gaps.every(row => row.every(gap => gap > -1)), 'Letters never overlap during the flight')
      assert(gaps.every((row, s) => s === 0 || row.every((gap, i) => gap <= gaps[s - 1][i] + .5)), 'Gaps between letters close steadily')
    }
    assert(await evaluate('getComputedStyle(document.querySelector("[data-aivex-logo-target]")).visibility === "visible" && !document.querySelector("[inert]")'))
    report.push({ ...test, mode, hold: Math.round(hold), duration: Math.round(state.ended - state.started), landingError })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: minimum hold, precise logo handoff at 320/390/1440px, single visible logo, reduced motion and deep links')
} finally {
  console.log(JSON.stringify({ report, errors }, null, 2))
  await writeFile('.browser-motion-audit/aivex-handoff-report.json', JSON.stringify({ report, errors }, null, 2))
  socket.close()
}
