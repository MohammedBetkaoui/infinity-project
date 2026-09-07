import { writeFile } from 'node:fs/promises'

const appUrl = 'http://localhost:5173/'
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration))
const targets = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json())
const target = targets.find((entry) => entry.type === 'page')

if (!target) throw new Error('No Chrome page target found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
const browserErrors = []
let sequence = 0

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
    return
  }

  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails
    const appFrame = details.stackTrace?.callFrames?.find((frame) => frame.url.includes('localhost:5173'))
    if (appFrame) browserErrors.push(details.exception?.description || details.text)
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    browserErrors.push(message.params.args.map((argument) => argument.value || argument.description).join(' '))
  }
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
}

const screenshot = async (path) => {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setTouchEmulationEnabled', { enabled: false })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
await send('Page.navigate', { url: appUrl })
await sleep(5200)

const desktop = await evaluate(`(() => {
  const style = (selector) => getComputedStyle(document.querySelector(selector))
  const sections = [...document.querySelectorAll('main > section')].map((section) => ({
    id: section.id,
    top: section.offsetTop,
    height: section.offsetHeight,
  }))
  return {
    title: document.title,
    lenis: document.documentElement.classList.contains('lenis-smooth'),
    lenisVersion: window.lenisVersion,
    aboutColor: style('#a-propos').backgroundColor,
    contactColor: style('#contact > div').backgroundColor,
    sectionType: style('#a-propos h2').fontSize,
    heroBadgeVisible: Number(style('.hero-badge').opacity) > 0.95,
    heroCopyVisible: Number(style('.hero-copy').opacity) > 0.95,
    orbitDrawn: parseFloat(style('.hero-orbit-line').strokeDashoffset) === 0,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    errorOverlay: Boolean(document.querySelector('vite-error-overlay, .vite-error-overlay, [data-nextjs-dialog]')),
    sections,
  }
})()`)

await screenshot('motion-audit-hero.png')

const parallaxBefore = await evaluate(`getComputedStyle(document.querySelector('[data-parallax-depth="1.05"]')).transform`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1180, y: 240 })
await sleep(1050)
const parallaxAfter = await evaluate(`getComputedStyle(document.querySelector('[data-parallax-depth="1.05"]')).transform`)

await evaluate(`document.querySelector('a[href="#accueil"]').click()`)
await sleep(1300)
const wheelGesture = send('Input.synthesizeScrollGesture', {
  x: 700,
  y: 520,
  yDistance: -620,
  speed: 2200,
  gestureSourceType: 'mouse',
})
await sleep(70)
const wheelEarly = await evaluate('window.scrollY')
await wheelGesture
await sleep(420)
const wheelLate = await evaluate('window.scrollY')

await evaluate(`window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } })); window.scrollTo(0, 360)`)
await sleep(140)
const pinned = await evaluate(`(() => {
  const hero = document.querySelector('#accueil')
  const stage = hero.firstElementChild
  const about = document.querySelector('#a-propos')
  return {
    scrollY: window.scrollY,
    heroTop: Math.round(hero.getBoundingClientRect().top),
    aboutTop: Math.round(about.getBoundingClientRect().top),
    stageTransform: getComputedStyle(stage).transform,
    stageOpacity: getComputedStyle(stage).opacity,
  }
})()`)
await evaluate(`window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))`)
await screenshot('motion-audit-pin.png')

await evaluate(`document.querySelector('a[href="#poles"]').click()`)
await sleep(520)
const poleNetworkDuring = await evaluate(`(() => {
  const path = document.querySelector('.pole-connection')
  return { opacity: getComputedStyle(path).opacity, dash: getComputedStyle(path).strokeDashoffset }
})()`)
await sleep(1900)
const poleNetworkAfter = await evaluate(`getComputedStyle(document.querySelector('.pole-connection')).opacity`)

const firstPoleRect = await evaluate(`(() => {
  const rect = document.querySelector('[data-pole-card]').getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
})()`)
await send('Input.dispatchMouseEvent', {
  type: 'mouseMoved',
  x: firstPoleRect.left + firstPoleRect.width * 0.82,
  y: firstPoleRect.top + firstPoleRect.height * 0.28,
})
await sleep(520)
const poleTilt = await evaluate(`getComputedStyle(document.querySelector('[data-pole-card]')).transform`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 })
await sleep(760)
const poleSettled = await evaluate(`getComputedStyle(document.querySelector('[data-pole-card]')).transform`)

await evaluate(`document.querySelector('a[href="#evenements"]').click()`)
await sleep(520)
const eventNetworkDuring = await evaluate(`(() => ({
  dash: [...document.querySelectorAll('.event-network-path')].map((path) => getComputedStyle(path).strokeDashoffset),
  nodeTransforms: [...document.querySelectorAll('.event-network-node')].slice(0, 3).map((node) => getComputedStyle(node).transform),
}))()`)
await sleep(1400)
const eventNetworkAfter = await evaluate(`[...document.querySelectorAll('.event-network-path')].map((path) => getComputedStyle(path).strokeDashoffset)`)

await evaluate(`(() => { const anchor = document.createElement('a'); anchor.href = '#faq'; document.body.append(anchor); anchor.click(); anchor.remove() })()`)
await sleep(1300)
await evaluate(`document.querySelectorAll('#faq button')[1].click()`)
await sleep(140)
const faqDuring = await evaluate(`(() => {
  const button = document.querySelectorAll('#faq button')[1]
  return {
    expanded: button.getAttribute('aria-expanded'),
    iconTransform: getComputedStyle(button.querySelector('span:last-child')).transform,
    panelHeight: document.querySelector('#faq-panel-1')?.getBoundingClientRect().height || 0,
  }
})()`)
await sleep(850)
const faqAfter = await evaluate(`document.querySelector('#faq-panel-1')?.getBoundingClientRect().height || 0`)

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Page.navigate', { url: appUrl })
await sleep(1800)
const reduced = await evaluate(`(() => ({
  mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
  lenis: document.documentElement.classList.contains('lenis-smooth'),
  badgeOpacity: getComputedStyle(document.querySelector('.hero-badge')).opacity,
  wordTransform: getComputedStyle(document.querySelector('.hero-word')).transform,
  orbitDash: getComputedStyle(document.querySelector('.hero-orbit-line')).strokeDashoffset,
  particleDuration: getComputedStyle(document.querySelector('.particle')).animationDuration,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}))()`)

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url: appUrl })
await sleep(4200)
await evaluate(`window.scrollTo(0, 360)`)
await sleep(180)
const mobile = await evaluate(`(() => {
  const hero = document.querySelector('#accueil')
  return {
    width: innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    heroFound: Boolean(hero),
    heroTopAtScroll: hero ? Math.round(hero.getBoundingClientRect().top) : null,
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
    menuButtonVisible: Boolean(document.querySelector('button[aria-label*="menu"]')),
    bodyTextLength: document.body.innerText.trim().length,
    bodyText: document.body.innerText.trim().slice(0, 500),
  }
})()`)
await screenshot('motion-audit-mobile.png')

console.log(JSON.stringify({
  desktop,
  parallax: { before: parallaxBefore, after: parallaxAfter, changed: parallaxBefore !== parallaxAfter },
  smoothWheel: { early: wheelEarly, late: wheelLate, inertial: wheelEarly > 0 && wheelLate > wheelEarly },
  pinned,
  poleNetwork: { during: poleNetworkDuring, afterOpacity: poleNetworkAfter },
  poleTilt: { active: poleTilt, settled: poleSettled },
  eventNetwork: { during: eventNetworkDuring, after: eventNetworkAfter },
  faq: { during: faqDuring, settledHeight: faqAfter },
  reduced,
  mobile,
  browserErrors,
}, null, 2))

socket.close()
