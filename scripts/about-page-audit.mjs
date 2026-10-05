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
const key = async (key, code, windowsVirtualKeyCode) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
}
const sample = () => evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.about-process-stages [role="tab"]')]
  const panels = [...document.querySelectorAll('.about-process-detail[role="tabpanel"]')]
  const active = tabs.find(tab => tab.getAttribute('aria-selected') === 'true')
  const panel = active && document.getElementById(active.getAttribute('aria-controls'))
  return {
    stage: tabs.indexOf(active),
    title: panel?.querySelector('h3')?.textContent.trim(),
    copy: panel?.querySelector('.about-method-description')?.textContent.trim(),
    opacity: panel ? +getComputedStyle(panel).opacity : 0,
    linked: !!panel && panel.getAttribute('aria-labelledby') === active.id,
    visibility: panels.length === 3 && panels.filter(item => !item.hidden).length === 1
      && panels.filter(item => item !== panel).every(item => item.hidden && getComputedStyle(item).display === 'none'),
    roving: tabs.length === 3 && active?.tabIndex === 0 && tabs.filter(tab => tab !== active).every(tab => tab.tabIndex === -1),
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
    assert.equal(await evaluate('document.querySelector(".page-hero h1").getAttribute("aria-label")'), 'About.')
    await capture(`about-page-hero-${width}`)
    const range = await evaluate(`(() => {
      const box = document.querySelector('.about-process-track').getBoundingClientRect()
      return { start: box.top + scrollY - innerHeight * .3, end: box.bottom + scrollY - innerHeight * .7 }
    })()`)
    assert.equal(await evaluate('document.querySelector(".about-process").id'), 'about-method')
    assert.equal(await evaluate('document.querySelector(".about-process-stages").getAttribute("role")'), 'tablist')
    assert.equal(await evaluate('document.querySelector(".about-process-stages").getAttribute("aria-orientation")'), 'vertical')
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".about-method-step-name")].map(element => element.textContent.trim())'), ['Question', 'Prototype', 'Shared project'])
    const titles = ['Question', 'Prototype', 'Shared project']
    const states = []
    for (const stage of [0, 1, 2, 1, 0]) {
      const progress = stage / 2
      await scroll(range.start + (range.end - range.start) * progress)
      await evaluate(`document.querySelectorAll('.about-process-stages [role="tab"]')[${stage}].click()`)
      await until(`document.querySelectorAll('.about-process-stages [role="tab"]')[${stage}].getAttribute('aria-selected') === 'true'`)
      await pause(350)
      const state = await sample()
      assert(!state.overflow && !state.pin, `${width}: stable reading flow`)
      assert.equal(state.stage, stage, `${width}: requested Method stage is selected`)
      assert.equal(state.title, titles[stage], `${width}: the selected panel has the real stage heading`)
      assert(state.copy.length > 40, `${width}: the selected panel explains the working step`)
      assert(state.linked && state.visibility && state.roving, `${width}: tabs control exactly one visible linked panel`)
      assert(state.opacity > .98, `${width}: the selected panel is fully visible`)
      if (states.length) assert.equal(state.height, states[0].height, 'Animation does not change document height')
      states.push(state)
      if (progress === .5 && states.length === 2) await capture(`about-page-process-${width}`)
    }
    assert.equal(states[1].title, states[3].title, 'Revisiting a stage returns to the same detail')
    await evaluate('document.querySelectorAll(".about-process-stages [role=tab]")[0].focus({preventScroll:true})')
    await key('End', 'End', 35)
    await until('document.querySelectorAll(".about-process-stages [role=tab]")[2].getAttribute("aria-selected") === "true"')
    assert.equal(await evaluate('document.activeElement === document.querySelectorAll(".about-process-stages [role=tab]")[2]'), true, 'End selects and focuses the final Method tab')
    await key('ArrowUp', 'ArrowUp', 38)
    await until('document.querySelectorAll(".about-process-stages [role=tab]")[1].getAttribute("aria-selected") === "true"')
    await key('Home', 'Home', 36)
    await until('document.querySelectorAll(".about-process-stages [role=tab]")[0].getAttribute("aria-selected") === "true"')
    assert.equal(await evaluate('document.activeElement === document.querySelectorAll(".about-process-stages [role=tab]")[0]'), true, 'Home selects and focuses the first Method tab')
    await evaluate('document.querySelector(".about-fields").scrollIntoView()')
    await pause(160)
    await evaluate('document.querySelector(".about-field button").focus()')
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid')
    await key('Enter', 'Enter', 13)
    await pause(650)
    assert.equal(await evaluate('document.querySelector(".about-field button").getAttribute("aria-expanded")'), 'true')
    assert(await evaluate('document.querySelector(".about-field-detail").getBoundingClientRect().height > 20'))
    await capture(`about-page-fields-${width}`)
    report.push({ width, height, states })
    console.log(`PASS ${width}x${height}: Method tabs, reversal, stable layout, keyboard accordion`)
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await pause(300)
  assert.equal(await evaluate('document.querySelector(".about-page").dataset.motion'), 'reduced')
  const reducedMethod = await sample()
  assert.equal(reducedMethod.stage, 0)
  assert(reducedMethod.linked && reducedMethod.visibility && reducedMethod.roving, 'Reduced motion preserves the Method tab contract')
  assert.equal(reducedMethod.opacity, 1, 'Reduced motion keeps the selected Method panel visible')
  await scroll(0)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".page-hero-letter")).transform'), 'none')
  assert.equal(await evaluate('document.documentElement.classList.contains("lenis")'), false)
  await evaluate('document.querySelector(".menu-toggle").click()')
  await pause(300)
  assert.equal(await evaluate('document.querySelector(".menu-join").getAttribute("href")'), '/contact')
  await evaluate('document.querySelector(".menu-join").click()')
  await until('location.pathname === "/contact" && document.querySelector(".contact-page")')
  await pause(350)
  assert.equal(await evaluate('document.querySelector(".contact-page h1").getAttribute("aria-label")'), 'Contact.')
  assert(await evaluate('scrollY < 2'), 'Dedicated Contact page starts at the top')
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
