import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = process.argv[2] || 'http://127.0.0.1:5173'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const tabs = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json())
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
const pending = new Map()
const errors = []
const warnings = []
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
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = message.params.args.map(arg => arg.value || arg.description).join(' ')
    if (message.params.type === 'error') errors.push(text)
    if (message.params.type === 'warning') warnings.push(text)
  }
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
const click = selector => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus({preventScroll:true}); element.click() })()`)
const navigate = async (path = '/aivex') => {
  const result = await send('Page.navigate', { url: `${origin}${path}` })
  if (!result.loaderId) await send('Page.reload')
  await pause(350)
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate('!!document.querySelector(".aivex-page") && !document.querySelector(".aivex-loader")')) break
    await pause(100)
  }
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(1400)
}
const resize = async (width, height = 960, mobile = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile })
}
const capture = async (name, full = false) => {
  let clip
  if (full) {
    const metrics = await send('Page.getLayoutMetrics')
    clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 }
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip && { clip }) })
  await writeFile(`.browser-motion-audit/${name}.png`, Buffer.from(data, 'base64'))
}
const style = selector => evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).transform`)
const sceneState = () => evaluate(`(() => {
  const scene = document.querySelector('.ax-scene')
  return { enabled: scene.dataset.sceneEnabled, active: scene.dataset.sceneActive, paused: scene.dataset.scenePaused,
    depth: getComputedStyle(scene.querySelector('.ax-scene-scroll')).transform,
    orbit: getComputedStyle(scene.querySelector('.ax-orbit-turn-front')).transform,
    pointer: getComputedStyle(scene.querySelector('.ax-scene-pointer')).transform }
})()`)
const report = { viewports: [], motion: {}, navigation: {} }

try {
  await mkdir('.browser-motion-audit', { recursive: true })
  await send('Runtime.enable')
  await send('Runtime.discardConsoleEntries')
  await send('Page.enable')
  await send('Page.navigate', { url: 'about:blank' })
  await pause(100)
  errors.length = 0
  warnings.length = 0
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await resize(1440)
  await navigate()
  assert(await evaluate(`document.querySelector('h1') && document.querySelector('img').naturalWidth === 1122 && !document.querySelector('vite-error-overlay')`))
  assert.equal((await sceneState()).enabled, 'true')
  assert.equal((await sceneState()).active, 'true')
  const orbit = await style('.ax-orbit-turn-front')
  await pause(240)
  assert.notEqual(await style('.ax-orbit-turn-front'), orbit, 'Orbital satellites move')
  const rect = await evaluate(`(() => { const r = document.querySelector('.ax-scene-viewport').getBoundingClientRect(); return {x:r.left+r.width*.84,y:r.top+r.height*.25} })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rect })
  await pause(550)
  assert.notEqual(await style('.ax-scene-pointer'), 'none', 'Pointer changes the 3D viewpoint')
  await capture('aivex-3d-desktop')
  await click('.ax-scene-pause')
  await pause(100)
  const paused = await sceneState()
  await pause(250)
  assert.deepEqual(await sceneState(), paused, 'Pause freezes the scene')
  await click('.ax-scene-pause')
  await pause(180)
  assert.equal((await sceneState()).active, 'true')
  const initialDepth = await style('.ax-scene-scroll')
  await evaluate('scrollTo({top:360,behavior:"instant"})')
  await pause(130)
  assert.notEqual(await style('.ax-scene-scroll'), initialDepth, 'Depth follows native scroll')
  await evaluate('scrollTo({top:0,behavior:"instant"})')
  await pause(120)
  assert(await evaluate('new DOMMatrix(getComputedStyle(document.querySelector(".ax-scene-scroll")).transform).isIdentity'), 'Scrub reverses to the exact initial viewpoint')
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 500, deltaX: 0, deltaY: 620 })
  await pause(400)
  report.motion.wheelDistance = await evaluate('scrollY')
  assert(Math.abs(report.motion.wheelDistance - 620) < 2, 'No extra wheel inertia or pin distance')
  await evaluate('scrollTo({top:1600,behavior:"instant"})')
  await pause(250)
  const offscreen = await sceneState()
  assert.equal(offscreen.active, 'false')
  await pause(220)
  assert.equal((await sceneState()).orbit, offscreen.orbit, 'Orbit clock stops offscreen')

  await click('.ax-desktop-nav a[href="#approche"]')
  await pause(250)
  assert(await evaluate('document.activeElement.id === "approche"'))
  await click('#ax-tab-prototype')
  await pause(500)
  assert(await evaluate('document.querySelector(".ax-process-copy h4").textContent === "Donner forme à l’idée."'))
  assert.notEqual(await style('.ax-code-stack'), 'none', 'The code layers respond to the chosen step')
  await evaluate('document.querySelector("#ax-tab-prototype").focus()')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' })
  await pause(450)
  assert(await evaluate('document.activeElement.id === "ax-tab-application" && document.querySelector("#ax-tab-application").getAttribute("aria-selected") === "true"'))
  assert(await evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'))
  await capture('aivex-approach')
  await click('.ax-challenge-heading a')
  for (let index = 1; index <= 5; index++) await click(`.ax-preparation-item:nth-of-type(${index}) input`)
  await pause(400)
  assert.equal(await evaluate('document.querySelectorAll(".ax-preparation-input:checked").length'), 5)
  assert(await evaluate('document.querySelector(".ax-preparation-tracker [role=status]").textContent.startsWith("Tes repères")'))
  await capture('aivex-preparation')
  await click('.ax-tracker-reset')
  assert.equal(await evaluate('document.querySelectorAll(".ax-preparation-input:checked").length'), 0)
  assert(await evaluate('document.querySelector(".ax-tracker-reset").disabled'))
  await evaluate('document.querySelector(".ax-preparation-input").focus()')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  assert.equal(await evaluate('document.querySelectorAll(".ax-preparation-input:checked").length'), 1)
  assert(await evaluate('getComputedStyle(document.querySelector(".ax-preparation-check")).outlineStyle === "solid"'))
  await click('.ax-desktop-nav a[href="#questions"]')
  for (const id of ['format', 'eligibility', 'topics', 'registration', 'evaluation', 'contact']) {
    if (await evaluate(`document.querySelector('#ax-question-${id}').getAttribute('aria-expanded') === 'false'`)) await click(`#ax-question-${id}`)
    assert(await evaluate(`!document.querySelector('#ax-answer-${id}').hidden`))
    assert.equal(await evaluate('document.querySelectorAll(".ax-faq [role=region]:not([hidden])").length'), 1)
  }
  await capture('aivex-faq')
  await evaluate('document.getElementById("defi").scrollIntoView({behavior:"instant"})')
  await pause(200)
  await capture('aivex-challenge')
  await capture('aivex-page-full', true)

  await click('.ax-back')
  await pause(1500)
  report.navigation.backToClub = await evaluate('({path:location.pathname, hash:location.hash, top:document.querySelector("#evenements").getBoundingClientRect().top, theme:document.documentElement.dataset.page, title:document.title})')
  assert.equal(report.navigation.backToClub.path, '/')
  assert(Math.abs(report.navigation.backToClub.top - 88) < 3, 'Return to the correct Infinity section')
  assert.equal(report.navigation.backToClub.theme, undefined)
  await click('.event-page-link')
  await pause(4200)
  assert(await evaluate('location.pathname === "/aivex" && scrollY === 0 && !document.documentElement.classList.contains("lenis")'))
  await evaluate('scrollTo({top:document.body.scrollHeight,behavior:"instant"})')
  await pause(100)
  await click('.ax-footer-home')
  await pause(1400)
  report.navigation.homeTop = await evaluate('scrollY')
  assert(report.navigation.homeTop < 2, 'Club home route starts at the Hero')

  for (const [width, height, mobile] of [[1024, 900, false], [800, 900, false], [768, 900, true], [390, 844, true], [320, 568, true]]) {
    await resize(width, height, mobile)
    await navigate()
    const layout = await evaluate(`(() => {
      const header = [...document.querySelector('.ax-header-inner').children].filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect())
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        overlap: header.some((r,i) => i > 0 && r.left < header[i-1].right),
        titleOverflow: document.querySelector('.ax-wordmark-large').getBoundingClientRect().right > innerWidth - 16,
        enabled: document.querySelector('.ax-scene').dataset.sceneEnabled }
    })()`)
    report.viewports.push({ width, height, ...layout })
    assert(!layout.overflow && !layout.overlap && !layout.titleOverflow, `Content fits at ${width}px`)
    if (mobile) {
      assert.equal(layout.enabled, 'false')
      assert.equal(await evaluate('document.querySelector(".ax-scene-pause")'), null)
      await click('.ax-menu-toggle')
      await pause(250)
      await click('#ax-mobile-nav a[href="#participer"]')
      await pause(350)
      assert(await evaluate('document.activeElement.id === "participer" && !document.querySelector("#ax-mobile-nav")'))
      assert(await evaluate('document.querySelector("#participer").getBoundingClientRect().top >= 68'))
      await click('.ax-menu-toggle')
      await pause(150)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' })
      await pause(250)
      assert(await evaluate('document.activeElement.matches(".ax-menu-toggle") && !document.querySelector("#ax-mobile-nav")'))
      for (const id of ['question', 'prototype', 'application']) {
        await click(`#ax-tab-${id}`)
        await pause(350)
        assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      }
      await click('.ax-preparation-item input')
      assert.equal(await evaluate('document.querySelectorAll(".ax-preparation-input:checked").length'), 1)
      await click('#ax-question-registration')
      assert(await evaluate('!document.querySelector("#ax-answer-registration").hidden'))
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      if (width === 320) {
        await evaluate('document.getElementById("defi").scrollIntoView({behavior:"instant"})')
        await capture('aivex-challenge-mobile')
        await evaluate('document.getElementById("preparation").scrollIntoView({behavior:"instant"})')
        await capture('aivex-preparation-mobile')
      }
      await evaluate('scrollTo({top:0,behavior:"instant"})')
      if (width === 390) await capture('aivex-mobile')
    }
  }
  await resize(1440)
  await navigate('/aivex#participer')
  assert(Math.abs(await evaluate('document.querySelector("#participer").getBoundingClientRect().top') - 94) < 3, 'Direct links align after fonts load')
  const beforeReduced = await evaluate('scrollY')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(400)
  report.motion.reducedScrollDelta = await evaluate('scrollY') - beforeReduced
  assert(Math.abs(await evaluate('scrollY') - beforeReduced) < 3, 'Changing motion preference does not move the reader')
  await evaluate('scrollTo({top:0,behavior:"instant"})')
  const reducedState = await sceneState()
  assert.equal(reducedState.enabled, 'false')
  assert.equal(reducedState.depth, 'none')
  assert.equal(reducedState.pointer, 'none')
  assert(await evaluate('!document.querySelector(".ax-scene-pause") && getComputedStyle(document.querySelector(".ax-ink-line")).strokeDashoffset === "0px"'))
  await pause(250)
  assert.deepEqual(await sceneState(), reducedState)
  await capture('aivex-reduced-motion')
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings.filter(w => /GSAP|target .*not found/i.test(w)), [])
  console.log('PASS: scene depth, pointer, reversible scroll, pause, offscreen stop, tabs, routes, anchors, responsive layout and reduced motion')
} finally {
  console.log(JSON.stringify({ ...report, errors, warnings }, null, 2))
  await writeFile('.browser-motion-audit/aivex-report.json', JSON.stringify({ ...report, errors, warnings }, null, 2))
  socket.close()
}
