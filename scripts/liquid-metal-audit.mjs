import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = process.argv[2] || 'http://127.0.0.1:5173'
const output = '.browser-liquid-audit'
const routes = [
  { path: '/', name: 'home', heading: 'No Limits For Infiniters' },
  { path: '/about', name: 'about', heading: 'About.' },
  { path: '/community', name: 'community', heading: 'Community.' },
  { path: '/events', name: 'events', heading: 'Events.' },
  { path: '/contact', name: 'contact', heading: 'Contact.' },
]
const widths = [375, 430, 768, 1024, 1440, 1920]
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch('http://127.0.0.1:9222/json/list').then(response => response.json())
const target = targets.find(entry => entry.type === 'page')
assert(target, 'Start a dedicated Chrome session on port 9222')
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
const browserErrors = []
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
  if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    browserErrors.push(message.params.args.map(argument => argument.value || argument.description).join(' '))
  }
}

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(new Error(`Timed out: ${method}`))
  }, 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

const until = async expression => {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Timed out: ${expression}`)
}

const setViewport = (width, height) => send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 768,
})

const navigate = async route => {
  await send('Page.navigate', { url: `${origin}${route.path}` })
  await until(`document.querySelector('main h1')?.getAttribute('aria-label') === ${JSON.stringify(route.heading)}`)
  await until(`['ready', 'fallback'].includes(document.querySelector('.infinity-liquid-metal')?.dataset.webgl)`)
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(1500)
}

const capture = async name => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  try {
    await until("document.querySelector('.infinity-liquid-metal')?.dataset.motion === 'static' || document.querySelector('.infinity-liquid-metal')?.dataset.webgl === 'fallback'")
    await pause(650)
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'))
  } finally {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await pause(220)
  }
}

const sample = () => evaluate(`(() => {
  const hero = document.querySelector('.home-hero, .page-hero')
  const layer = hero.querySelector('.infinity-liquid-metal')
  const canvas = layer.querySelector('canvas')
  const canvasStyle = getComputedStyle(canvas)
  const heroStyle = getComputedStyle(hero)
  const navStyle = getComputedStyle(document.querySelector('.site-nav'))
  return {
    overflow: document.documentElement.scrollWidth > innerWidth,
    heading: document.querySelector('main h1').getAttribute('aria-label'),
    canvases: hero.querySelectorAll('.infinity-liquid-metal-canvas').length,
    webgl: layer.dataset.webgl,
    motion: layer.dataset.motion,
    quality: layer.dataset.quality || 'full',
    ariaHidden: canvas.getAttribute('aria-hidden'),
    canvasPosition: canvasStyle.position,
    pointerEvents: canvasStyle.pointerEvents,
    heroPosition: heroStyle.position,
    heroIsolation: heroStyle.isolation,
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    drawingWidth: canvas.width,
    drawingHeight: canvas.height,
    navBackground: navStyle.backgroundColor,
    titleColor: getComputedStyle(document.querySelector('main h1')).color,
  }
})()`)

const validateSample = (state, route, width) => {
  assert.equal(state.overflow, false, `${route.name} has no horizontal overflow at ${width}px`)
  assert.equal(state.heading, route.heading)
  assert.equal(state.canvases, 1)
  assert.equal(state.ariaHidden, 'true')
  assert.equal(state.canvasPosition, 'absolute')
  assert.equal(state.pointerEvents, 'none')
  assert.equal(state.heroPosition, 'relative')
  assert.equal(state.heroIsolation, 'isolate')
  assert.equal(state.webgl, 'ready')
  assert(state.drawingWidth > 0 && state.drawingHeight > 0)
  assert(state.drawingWidth <= Math.ceil(state.cssWidth * 1.36))
  assert(state.drawingHeight <= Math.ceil(state.cssHeight * 1.36))
}

const report = { layouts: [], performance: null, reducedMotion: null, contextRestore: null, fallback: null }

try {
  await mkdir(output, { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })

  for (const width of widths) {
    const height = width >= 1600 ? 1080 : width >= 768 ? 1000 : 844
    await setViewport(width, height)
    for (const route of routes) {
      await navigate(route)
      const state = await sample()
      validateSample(state, route, width)
      report.layouts.push({ route: route.name, width, height, ...state })
      if (width === 375 || width === 1440) await capture(`${route.name}-${width}`)
    }
  }

  await setViewport(1440, 1000)
  await navigate(routes[0])
  report.performance = await evaluate(`new Promise(resolve => {
    const intervals = []
    let previous = performance.now()
    let started = previous
    const measure = now => {
      intervals.push(now - previous)
      previous = now
      if (now - started < 2000) requestAnimationFrame(measure)
      else {
        const sorted = intervals.slice(1).sort((a, b) => a - b)
        resolve({
          frames: sorted.length,
          average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
          p95: sorted[Math.floor(sorted.length * .95)],
          over34ms: sorted.filter(value => value > 34).length,
          quality: document.querySelector('.infinity-liquid-metal').dataset.quality || 'full',
        })
      }
    }
    requestAnimationFrame(measure)
  })`)
  assert(report.performance.frames > 20, 'the live shader continues producing frames')

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await navigate(routes[1])
  report.reducedMotion = await sample()
  assert.equal(report.reducedMotion.motion, 'static')
  await pause(500)
  assert.equal((await sample()).motion, 'static')

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await navigate(routes[0])
  report.contextRestore = await evaluate(`(async () => {
    const layer = document.querySelector('.infinity-liquid-metal')
    const canvas = layer.querySelector('canvas')
    const context = canvas.getContext('webgl')
    const extension = context?.getExtension('WEBGL_lose_context')
    if (!extension) return { supported: false, state: layer.dataset.webgl }
    extension.loseContext()
    await new Promise(resolve => setTimeout(resolve, 180))
    const lost = layer.dataset.webgl
    extension.restoreContext()
    for (let attempt = 0; attempt < 30 && layer.dataset.webgl !== 'ready'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return { supported: true, lost, restored: layer.dataset.webgl }
  })()`)
  if (report.contextRestore.supported) {
    assert.equal(report.contextRestore.lost, 'context-lost')
    assert.equal(report.contextRestore.restored, 'ready')
  }

  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function(type, options) {
        if (type === 'webgl' || type === 'experimental-webgl') return null
        return original.call(this, type, options)
      }
    })()`,
  })
  await navigate(routes[4])
  report.fallback = await sample()
  assert.equal(report.fallback.webgl, 'fallback')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.infinity-liquid-metal')).backgroundColor"), 'rgb(0, 42, 30)')
  await capture('contact-fallback')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })

  assert.deepEqual(browserErrors, [])
  await writeFile(`${output}/report.json`, JSON.stringify({ ...report, browserErrors }, null, 2))
  console.log('PASS: five liquid-metal heroes, six responsive widths, reduced motion, fallback and context restoration')
} finally {
  socket.close()
}
