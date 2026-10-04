// Run against an isolated Chrome instance with remote debugging enabled:
// node scripts/home-hero-audit.mjs http://127.0.0.1:5173/ 9225
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { HERO_ENERGY_DURATION } from '../src/lib/homeHeroLines.js'

const url = process.argv[2] || 'http://127.0.0.1:5173/'
const port = process.argv[3] || '9225'
const output = '.browser-home-hero'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())
const target = targets.find(entry => entry.type === 'page' && entry.url.startsWith(new URL(url).origin)) || targets.find(entry => entry.type === 'page')
assert(target, 'Start an isolated Chrome instance with remote debugging first')
const socket = new WebSocket(target.webSocketDebuggerUrl)
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
const waitFor = async expression => {
  for (let i = 0; i < 70; i++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Condition did not settle: ${expression}`)
}
const capture = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'))
}
const viewport = async (width, height, touch = false, dpr = 1) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch })
  await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 })
}
const navigate = async (destination = url, introPause = 850) => {
  await send('Page.navigate', { url: destination })
  await waitFor('document.readyState !== "loading" && !!document.querySelector(".home-hero-lines") && !!window.__homeHeroAudit')
  if (introPause) {
    await evaluate('document.fonts.ready.then(() => true)')
    await pause(introPause)
  }
}
const sample = () => evaluate(`(() => {
  const hero = document.querySelector('#accueil')
  const layer = document.querySelector('.home-hero-lines')
  const canvas = layer.querySelector('canvas')
  const rect = node => {
    const box = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom,
      visible: box.width > 0 && box.height > 0 && Number(style.opacity) > 0,
      withinViewport: box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight,
      hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('a') === node }
  }
  return {
    viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth,
    hero: rect(hero), title: rect(hero.querySelector('h1')),
    copyOpacity: getComputedStyle(hero.querySelector('.home-hero-copy')).opacity,
    titleLit: hero.dataset.titleLit,
    titleFronts: [...hero.querySelectorAll('.home-hero-line > span')].map(node => parseFloat(node.style.getPropertyValue('--title-light-front'))),
    titleDimColors: [...hero.querySelectorAll('.home-hero-line > span')].map(node => getComputedStyle(node).getPropertyValue('--title-dim').trim()),
    reflection: Number(hero.style.getPropertyValue('--hero-light-scroll')),
    actions: [...hero.querySelectorAll('a')].map(node => ({ text: node.textContent.trim(), ...rect(node) })),
    render: layer.dataset.render, motion: layer.dataset.motion, quality: layer.dataset.quality,
    canvas: [canvas.width, canvas.height], symbol: rect(canvas), audit: window.__homeHeroAudit,
    pin: !!hero.closest('.pin-spacer'), font: document.fonts.check('600 80px Rajdhani'),
  }
})()`)
const assertLayout = state => {
  assert.equal(state.overflow, false, 'No horizontal overflow')
  assert.equal(state.pin, false, 'Hero scrolls in native document flow')
  assert(state.title.visible && state.title.withinViewport, 'Title is visible')
  assert.equal(state.actions.length, 3)
  for (const action of state.actions) {
    assert(action.visible && action.withinViewport && action.hit, `${action.text} must be visible and clickable`)
    assert(action.height >= 44, `${action.text} has a 44px touch target`)
  }
}
const assertCompactSymbol = state => {
  assert.equal(state.quality, 'mobile')
  const { bounds } = state.audit
  assert(bounds.left >= -1 && bounds.right <= 1 && bounds.bottom >= -1 && bounds.top <= 1, 'Both loops, including their halos, fit inside the drawing frame')
  assert(Math.abs(state.symbol.y + state.symbol.height / 2 - state.title.y - state.title.height / 2) < 1, 'The crossing stays centred on the responsive title')
  assert(state.symbol.y >= state.hero.y && state.symbol.bottom <= state.hero.bottom, 'The compact symbol fits within the hero')
}

const report = { layouts: [], errors }
let fallbackScript = null
let auditScript = null
try {
  await mkdir(output, { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  auditScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__homeHeroAudit = { draws: 0, buffers: 0, programs: 0, shaders: 0, uploads: 0, lastGeometry: [], lastStart: [], phase: 0, wraps: [], uniforms: {} };
    const proto = WebGLRenderingContext.prototype;
    const belongs = gl => gl.canvas.parentElement?.classList.contains('home-hero-lines');
    for (const [create, remove, key] of [['createBuffer','deleteBuffer','buffers'], ['createProgram','deleteProgram','programs'], ['createShader','deleteShader','shaders']]) {
      const originalCreate = proto[create], originalRemove = proto[remove];
      proto[create] = function(...args) { const result = originalCreate.apply(this, args); if (result && belongs(this)) window.__homeHeroAudit[key]++; return result; };
      proto[remove] = function(...args) { if (args[0] && belongs(this)) window.__homeHeroAudit[key]--; return originalRemove.apply(this, args); };
    }
    const draw = proto.drawArrays;
    proto.drawArrays = function(...args) { if (belongs(this)) window.__homeHeroAudit.draws++; return draw.apply(this, args); };
    const upload = proto.bufferSubData;
    proto.bufferSubData = function(...args) {
      if (belongs(this)) {
        if (window.__homeHeroAudit.freezeGeometry) {
          window.__frozenHeroGeometry ||= args[2].slice();
          args[2] = window.__frozenHeroGeometry;
        }
        window.__homeHeroAudit.uploads++;
        window.__homeHeroAudit.lastGeometry = Array.from(args[2].slice(400,410));
        window.__homeHeroAudit.lastStart = Array.from(args[2].slice(0,10));
        const bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
        for (let index = 0; index < args[2].length; index += 6) {
          bounds.left = Math.min(bounds.left, args[2][index]);
          bounds.right = Math.max(bounds.right, args[2][index]);
          bounds.bottom = Math.min(bounds.bottom, args[2][index + 1]);
          bounds.top = Math.max(bounds.top, args[2][index + 1]);
        }
        window.__homeHeroAudit.bounds = bounds;
      }
      return upload.apply(this, args);
    };
    const uniformNames = new WeakMap(), findUniform = proto.getUniformLocation, uniform = proto.uniform1f;
    proto.getUniformLocation = function(...args) {
      const result = findUniform.apply(this,args); if(result) uniformNames.set(result,args[1]); return result;
    };
    proto.uniform1f = function(key,value) {
      if (belongs(this)) window.__homeHeroAudit.uniforms[uniformNames.get(key)] = value;
      if (belongs(this) && uniformNames.get(key) === 'uPhase') {
        const audit = window.__homeHeroAudit;
        if(audit.phase > .95 && value < .05) audit.wraps.push(performance.now());
        audit.phase = value; audit.phaseAt = performance.now();
        if(audit.forcePhase != null) value = audit.forcePhase;
      }
      return uniform.call(this,key,value);
    };
  })();` })).identifier
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })

  for (const [width, height, touch, dpr] of [[1440, 900, false, 1], [1366, 768, false, 1], [320, 568, true, 3], [360, 640, true, 3], [390, 844, true, 3], [430, 932, true, 3], [600, 960, true, 2], [768, 1024, true, 2], [820, 1180, true, 2], [1024, 768, true, 2], [1024, 600, false, 1]]) {
    await viewport(width, height, touch, dpr)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -10, y: -10 })
    const checkArrival = [1440, 360, 390, 768].includes(width)
    await navigate(url, checkArrival ? 0 : 850)
    await waitFor('document.querySelector(".home-hero-lines").dataset.render === "webgl"')
    if (checkArrival) {
      const initial = await sample()
      assert.equal(initial.titleLit, 'false', 'Initial title is dim and visible')
      assert.equal(initial.audit.uniforms.uHover, 0, 'The arrival does not need a mouse')
      await capture(`title-${width}-arrival`)
      await pause(850)
      const firstSecond = await sample()
      assert(firstSecond.titleFronts.some((front, index) => front > initial.titleFronts[index]), 'Letters begin illuminating within the first second')
      await capture(`title-${width}-1s`)
      await pause(1150)
      await capture(`title-${width}-2s`)
      await pause(850)
      assert.equal((await sample()).titleLit, 'true', 'Both lines are permanently lit within three seconds')
    } else await pause(2000)
    const state = await sample()
    assertLayout(state)
    assert(state.audit.uploads > 0, 'Animation draws')
    assert(state.audit.buffers === 1 && state.audit.programs === 1 && state.audit.shaders === 0, 'StrictMode leaves exactly one live buffer/program and no shader objects')
    if (touch) {
      assert(state.canvas[0] * state.canvas[1] < 422000, 'Mobile drawing resolution is bounded')
      assertCompactSymbol(state)
    }
    report.layouts.push(state)
    await capture(`hero-${width}`)
    console.log(`Layout ${width}x${height}: OK (${state.render}, ${state.canvas.join('x')})`)
  }

  // Rotate the same mounted hero: no page reload or replay of the title reveal.
  await viewport(390, 844, true, 3)
  await navigate()
  await waitFor('document.querySelector("#accueil").dataset.titleLit === "true"')
  await viewport(844, 390, true, 3)
  await pause(350)
  const landscape = await sample()
  assert.equal(landscape.overflow, false)
  assert.equal(landscape.titleLit, 'true')
  assertCompactSymbol(landscape)
  await capture('hero-mobile-landscape')
  // Short landscape screens use normal vertical scrolling to reach the actions.
  await evaluate('window.scrollTo({top: 180, behavior: "instant"})')
  await pause(350)
  const landscapeActions = (await sample()).actions
  assert(landscapeActions.every(action => action.withinViewport && action.hit), 'All landscape actions are reachable by scrolling')
  await capture('hero-mobile-landscape-actions')
  await viewport(390, 844, true, 3)
  await evaluate('window.scrollTo({top: 0, behavior: "instant"})')
  await pause(350)
  const portrait = await sample()
  assertLayout(portrait)
  assertCompactSymbol(portrait)
  assert.deepEqual(portrait.titleFronts, [110, 110], 'Orientation changes preserve acquired title colours')
  assert.equal(portrait.audit.buffers, 1)
  assert.equal(portrait.audit.programs, 1)
  report.orientation = { landscape, portrait, actionsReachable: true }
  console.log('Portrait / landscape / portrait: OK')

  await viewport(1440, 900)
  await navigate()
  const before = await sample()
  await pause(1000)
  const after = await sample()
  report.animation = { framesInOneSecond: after.audit.uploads - before.audit.uploads,
    geometryChanged: JSON.stringify(before.audit.lastGeometry) !== JSON.stringify(after.audit.lastGeometry) }
  assert(report.animation.geometryChanged, 'Ribbons move continuously')
  const phaseDelta = (after.audit.phase - before.audit.phase + 1) % 1
  const phaseSeconds = (after.audit.phaseAt - before.audit.phaseAt) / 1000
  report.energy = { secondsPerLap: phaseSeconds / phaseDelta }
  assert(Math.abs(report.energy.secondsPerLap - HERO_ENERGY_DURATION) < .35, 'The energy completes a lap at its configured constant speed')
  for (let step = 0; step < 36 && !(await sample()).audit.wraps.length; step++) await pause(450)
  assert((await sample()).audit.wraps.length > 0, 'A real complete lap crosses the loop seam')
  // Freeze only the test geometry, then inspect both loops and the identical
  // shader output at phases 0 and 1. Production has no test hooks.
  await evaluate('window.__homeHeroAudit.freezeGeometry = true')
  for (const phase of [.14, .36, .64, .86, 0, 1]) {
    await evaluate(`window.__homeHeroAudit.forcePhase = ${phase}`)
    await pause(100)
    await capture(`energy-desktop-phase-${phase}`)
  }
  await evaluate('delete window.__homeHeroAudit.freezeGeometry; delete window.__homeHeroAudit.forcePhase; delete window.__frozenHeroGeometry')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1300, y: 420 })
  await pause(750)
  const pointerState = await sample()
  report.pointerShiftPx = (pointerState.audit.lastStart[0] - after.audit.lastStart[0]) * pointerState.hero.width / 2
  assert(report.pointerShiftPx > 1 && report.pointerShiftPx < 7, 'Desktop pointer response is present and subtle')
  await capture('hero-desktop-pointer')

  await evaluate('window.scrollTo({top: 300, behavior: "instant"})')
  await pause(400)
  const down = await sample()
  await capture('title-scroll-down')
  await evaluate('window.scrollTo({top: 100, behavior: "instant"})')
  await pause(400)
  const up = await sample()
  await capture('title-scroll-up')
  assert(down.reflection > up.reflection + .12, 'The smoothed reflection follows scrolling in both directions')
  assert.deepEqual(down.titleFronts, up.titleFronts, 'Scrolling never dims the acquired title')
  assert(Math.abs(up.audit.uniforms.uScroll - up.reflection) < .001, 'Letters and wires share the reflection progress')
  report.scrollReflection = { down: down.reflection, up: up.reflection }

  await evaluate('window.scrollTo({top: 1100, behavior: "instant"})')
  await waitFor('document.querySelector(".home-hero-lines").dataset.motion === "paused"')
  const offscreen = await sample()
  await pause(400)
  assert.equal((await sample()).audit.draws, offscreen.audit.draws, 'No draws when offscreen')
  report.offscreenPaused = true
  await evaluate('window.scrollTo({top: 450, behavior: "instant"})')
  await pause(500)
  await capture('hero-section-transition')
  await evaluate('window.scrollTo({top: 0, behavior: "instant"})')
  await waitFor('document.querySelector(".home-hero-lines").dataset.motion === "animated"')
  assert.equal((await sample()).titleLit, 'true', 'Returning to the hero preserves the first illumination')
  assert.deepEqual((await sample()).titleFronts, [110, 110])

  // Dispatch the platform visibility event with a hidden document, without
  // disturbing the user's own browser tabs. This checks the handler and loop.
  await evaluate('Object.defineProperty(document, "hidden", {configurable: true, value: true}); document.dispatchEvent(new Event("visibilitychange"))')
  const hidden = await sample()
  await pause(400)
  assert.equal((await sample()).audit.draws, hidden.audit.draws, 'No draws in a hidden document')
  report.hiddenPaused = true
  await evaluate('delete document.hidden; document.dispatchEvent(new Event("visibilitychange"))')
  await waitFor('document.querySelector(".home-hero-lines").dataset.motion === "animated"')

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(300)
  const reduced = await sample()
  assertLayout(reduced)
  assert.equal(reduced.render, 'static')
  assert.equal(reduced.motion, 'reduced')
  assert.equal(reduced.titleLit, 'true')
  assert.equal(reduced.audit.buffers + reduced.audit.programs + reduced.audit.shaders, 0, 'Motion preference change releases GPU resources')
  await pause(350)
  assert.equal((await sample()).audit.draws, reduced.audit.draws)
  report.reducedMotion = reduced
  await capture('hero-reduced-motion')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await waitFor('document.querySelector(".home-hero-lines").dataset.render === "webgl"')

  await evaluate('window.__loseHeroContext = document.querySelector(".home-hero-lines canvas").getContext("webgl").getExtension("WEBGL_lose_context"); window.__loseHeroContext.loseContext()')
  await waitFor('document.querySelector(".home-hero-lines").dataset.render === "static"')
  await capture('hero-context-lost')
  await evaluate('window.__loseHeroContext.restoreContext()')
  await waitFor('document.querySelector(".home-hero-lines").dataset.render === "webgl"')
  report.contextRecovery = true

  // Fresh page for resource accounting after the intentional GPU loss.
  await navigate()
  await evaluate('document.querySelector(".home-hero-join").focus()')
  assert.equal(await evaluate('document.activeElement.className'), 'home-hero-join')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  assert.equal(await evaluate('document.activeElement.textContent'), 'Discover Infinity')
  await capture('hero-keyboard-focus')
  await evaluate('document.activeElement.click()')
  await waitFor('location.pathname === "/about" && !document.querySelector(".home-hero-lines")')
  const cleanup = await evaluate('window.__homeHeroAudit')
  assert.equal(cleanup.buffers + cleanup.programs + cleanup.shaders, 0, 'Unmount releases GPU resources')
  const draws = cleanup.draws
  await pause(350)
  assert.equal(await evaluate('window.__homeHeroAudit.draws'), draws)
  assert(await evaluate('!!document.querySelector(".infinity-liquid-metal--about")'), 'Shared About background is unchanged')
  report.navigationAndCleanup = true
  await navigate()
  await evaluate('document.querySelector(".home-hero-join").click()')
  await waitFor('location.pathname === "/join"')
  report.joinNavigation = true
  await navigate()
  await evaluate('document.querySelector(".home-hero-foot a").click()')
  await pause(1100)
  assert(await evaluate('scrollY > 0'), 'Scroll indication reaches next section')
  report.scrollLink = true

  fallbackScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/.test(type) ? null : getContext.call(this, type, ...args);
    };
  ` })).identifier
  for (const [width, height, touch] of [[1440, 900, false], [360, 640, true], [390, 844, true], [768, 1024, true]]) {
    await viewport(width, height, touch)
    await navigate()
    const state = await sample()
    assertLayout(state)
    assert.equal(state.render, 'static')
    assert.equal(state.audit.draws, 0)
    await capture(`hero-fallback-${width}`)
  }
  report.webglUnavailable = true
  assert.deepEqual(errors, [], 'No JavaScript/console errors during the hero flows')
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log('Lifecycle, fallback, keyboard, navigation and scrolling: OK')
} finally {
  if (fallbackScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: fallbackScript })
  if (auditScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: auditScript })
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  socket.close()
}
