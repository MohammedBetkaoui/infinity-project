// Run against an isolated Chrome session: node scripts/open-day-audit.mjs <CDP port> [site origin]
// No browser dependency; uses Node's WebSocket and Chrome's debugging protocol.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { openDayFilms } from '../src/pages/events/open-day/openDayFilms.js'

const port = process.argv[2] || '9222'
const origin = process.argv[3] || 'http://127.0.0.1:5173'
const output = '.browser-open-day'
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
const target = targets.find((entry) => entry.type === 'page' && entry.url.startsWith(origin))
assert(target, 'Open the local site in an isolated Chrome session first')
const socket = new WebSocket(target.webSocketDebuggerUrl)
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
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (expression, label) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Not ready: ${label}`)
}
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const trustedClick = async (selector) => {
  await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); const r=el.getBoundingClientRect(); if(r.top<0 || r.bottom>innerHeight) el.scrollIntoView({behavior:'instant',block:'center'}); })()`)
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
}
const key = (value, modifiers = 0) => send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, modifiers })
const capture = async (name, full = false) => {
  const params = { format: 'png', captureBeyondViewport: full }
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics')
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 }
  }
  const { data } = await send('Page.captureScreenshot', params)
  await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'))
}
const geometry = () => evaluate(`(() => {
  const headings = [...document.querySelectorAll('.open-day-page h1, .open-day-page h2, .open-day-page h3')];
  return {
    width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
    h1s: document.querySelectorAll('h1').length,
    clippedHeadings: headings.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
    outside: [...document.querySelectorAll('.open-day-page img, .open-day-page h1, .open-day-page h2, .open-day-page h3')].filter(el => { const r = el.getBoundingClientRect(); return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && (r.left < -1 || r.right > innerWidth + 1) }).map(el => el.alt || el.textContent),
    photos: [...document.querySelectorAll('.od-contact-sheet img')].map(el => ({ ratio: el.clientWidth / el.clientHeight, native: el.width / el.height, loaded: el.complete && el.naturalWidth > 0 })),
    nav: Boolean(document.querySelector('.site-header .site-nav')),
    footer: Boolean(document.querySelector('footer')),
    overlay: Boolean(document.querySelector('vite-error-overlay')),
  };
})()`)
const report = { viewports: [], clubFilm: [], lightbox: [], films: [], errors }

try {
  await mkdir(output, { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: `${origin}/events/open-day-2026` })
  await until('Boolean(document.querySelector(".od-contact-sheet"))', 'Open Day page')
  await evaluate('document.fonts.ready.then(() => true)')
  assert.equal(await evaluate('document.querySelector(".od-film-frame video").getAttribute("src")'), null, 'footage is not fetched above the film scene')
  for (const [width, height] of [[375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 })
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    // A fresh load per width, so the club film starts from its poster each time.
    await send('Page.navigate', { url: `${origin}/events/open-day-2026` })
    await until('Boolean(document.querySelector(".od-contact-sheet") && document.querySelector(".od-feature-play"))', 'Open Day page')
    await evaluate('document.fonts.ready.then(() => true)')
    await evaluate('window.scrollTo({top: 0, behavior: "instant"})')
    await pause(1050)
    const state = await geometry()
    assert.equal(state.h1s, 1, `${width}: one H1`)
    assert.equal(state.overflow, false, `${width}: no horizontal overflow`)
    assert.deepEqual(state.clippedHeadings, [], `${width}: no clipped headings`)
    assert.deepEqual(state.outside, [], `${width}: images and headings fit the viewport`)
    assert.ok(state.nav && state.footer && !state.overlay, `${width}: shared shell and no error overlay`)
    const spinLink = await evaluate(`(() => { const link = document.querySelector('.od-spin-link'); const r = link.getBoundingClientRect(); return { href: link.href, newTab: link.target === '_blank', safeRel: link.rel.includes('noopener'), fits: r.left >= 0 && r.right <= innerWidth }; })()`)
    assert.equal(spinLink.href, 'https://open-day-psi.vercel.app/')
    assert.ok(spinLink.newTab && spinLink.safeRel && spinLink.fits, `${width}: spin-game link fits and opens in a new tab`)
    for (const photo of state.photos) assert.ok(Math.abs(photo.ratio - photo.native) < .015, `${width}: original image ratio`)
    await capture(`hero-${width}`)

    // The club film: poster only until asked, then original sound; the
    // browser's controls only once it has started, on hover, focus or touch.
    const feature = '.od-feature-frame video'
    const featureState = (expression) => evaluate(`(() => { const v = document.querySelector('${feature}'); const s = document.querySelector('.od-feature'); return ${expression} })()`)
    const filmAt = async (progress, settle = 1900) => {
      await evaluate(`(() => { const space = document.querySelector('.od-feature-space'); const top = space.getBoundingClientRect().top + scrollY; window.scrollTo({ top: top + Math.max(0, space.offsetHeight - innerHeight) * ${progress}, behavior: 'instant' }) })()`)
      await pause(settle)
    }
    const rect = (selector) => evaluate(`(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } })()`)
    const visible = (selector) => evaluate(`(() => { const el = document.querySelector('${selector}'); return !el.hidden && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > .5 })()`)
    assert.equal(await featureState('v.getAttribute("src") === null && v.networkState === 0 && !v.controls'), true, `${width}: club film not fetched before play`)
    const mode = await featureState('s.dataset.filmMode')
    const portrait = width < 768 || height < 560 || width / height <= 1.1
    assert.equal(mode, portrait ? 'compact' : 'cinematic', `${width}x${height}: screening-room mode`)
    const handoff = await featureState('s.hasAttribute("data-film-handoff")')
    assert.equal(handoff, mode === 'cinematic' && width >= 1024, `${width}x${height}: handoff into the field notes`)
    const fine = await evaluate('matchMedia("(hover: hover) and (pointer: fine)").matches')
    await trustedClick('.od-hero-actions a[href="#club-film"]')
    await until('(() => { const top = document.querySelector("#club-film").getBoundingClientRect().top; return top > -10 && top < 160 })()', 'hero link reaches the club film')
    // Let the smooth anchor scroll finish before taking over the scroll position.
    await pause(1000)

    // Scroll choreography: object, approach, immersion, exit. Composed at every stop.
    const stops = {}
    for (const progress of [0, .15, .3, .5, .65, .8, 1]) {
      await filmAt(progress)
      const box = await rect('.od-feature-frame')
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${width}: no overflow at ${progress}`)
      assert.ok(box.left >= -1 && box.right <= width + 1, `${width}: frame stays inside the viewport at ${progress}`)
      stops[progress] = box
      await capture(`club-film-${width}x${height}-${String(Math.round(progress * 100)).padStart(3, '0')}`)
      if (progress === .65) {
        assert.equal(await evaluate('document.documentElement.hasAttribute("data-od-film-immersed")'), true, `${width}: the header goes quiet while immersed`)
        assert.equal(await visible('.od-feature-credits'), true, `${width}: credits while immersed`)
      }
    }
    const immersed = stops[.65]
    assert.ok(Math.abs(immersed.width / immersed.height - 16 / 9) < .02, `${width}: native 16:9 ratio when immersed`)
    assert.ok(immersed.top >= 0 && immersed.bottom <= height, `${width}: immersed film fits the viewport`)
    assert.ok(immersed.width >= width * .8 || immersed.height >= (height - 160) * .95, `${width}: the film dominates the room`)
    assert.ok(stops[0].width < immersed.width * .97, `${width}: the film starts as an object`)
    assert.equal(await visible('.od-feature-credits'), false, `${width}: credits leave with the exit`)
    assert.equal(await evaluate('document.documentElement.hasAttribute("data-od-film-immersed")'), false, `${width}: the header is restored after immersion`)
    if (mode === 'compact') {
      // The film stays the centre of the room: no band of empty room above it.
      for (const progress of [0, .15, .3, .5, .65, .8, 1]) {
        const centre = (stops[progress].top + stops[progress].bottom) / 2 / height
        assert.ok(centre > .4 && centre < .64, `${width}: film centred at ${progress} (${centre.toFixed(2)})`)
      }
    }
    if (handoff) {
      // The film lands in the slot the field notes keep for it, beside their
      // heading, and the release into normal scrolling does not jump.
      const slot = await evaluate(`(() => { const r = document.querySelector('.od-intro-register').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.width * 9 / 32, width: r.width } })()`)
      const film = stops[1]
      assert.ok(Math.abs((film.left + film.right) / 2 - slot.x) < 30 && Math.abs((film.top + film.bottom) / 2 - slot.y) < 30, `${width}: the film rests in its slot`)
      assert.ok(Math.abs(film.width - slot.width) / slot.width < .08, `${width}: the film is the slot's width`)
      assert.equal(await visible('.od-intro-layout > :last-child'), true, `${width}: field notes enter beside the film`)
      assert.ok((await rect('.od-feature-atmosphere')).bottom <= 0, `${width}: the room has lifted off the notes`)
      await evaluate('window.scrollBy({ top: 80, behavior: "instant" })')
      await pause(900)
      const after = await rect('.od-feature-frame')
      assert.ok(Math.abs(film.top - after.top - 80) < 3 && Math.abs(after.width - film.width) < 2, `${width}: release continues without a jump`)
    }

    // Playback in the room: play, scroll while playing, pause, seek, volume, end, replay.
    await filmAt(.65)
    await trustedClick('.od-feature-play')
    await until(`(() => { const v = document.querySelector('${feature}'); return v.readyState >= 2 && !v.paused && v.currentTime > .2 })()`, 'club film plays on request')
    assert.equal(await featureState('v.controls && !v.muted && v.volume > 0 && document.activeElement === v && document.querySelector(".od-feature-play").hidden && s.dataset.filmState === "playing"'), true, `${width}: sound, controls under the pointer, focus on the film`)
    assert.deepEqual(await featureState('({ width: v.videoWidth, height: v.videoHeight })'), { width: 1280, height: 720 })
    await pause(700)
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".od-feature-credits > span")).opacity'), '0', `${width}: annotations step back while playing`)
    await filmAt(.6, 700)
    assert.equal(await featureState('!v.paused'), true, `${width}: scrolling inside the room keeps playing`)
    await capture(`club-film-playing-${width}x${height}`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width - 4, y: Math.round(height * .98) })
    await featureState('(v.pause(), true)')
    await until('document.querySelector(".od-feature").dataset.filmState === "paused" && document.querySelector(".od-feature-play").dataset.state === "paused"', 'pause shows the resume card')
    await pause(300)
    assert.equal(await featureState('v.controls'), !fine, `${width}: away from the screen the browser bar stays hidden (shown on touch)`)
    await capture(`club-film-paused-${width}x${height}`)
    await featureState('(v.currentTime = 20, v.volume = .4, true)')
    await until(`Math.abs(document.querySelector('${feature}').currentTime - 20) < .3 && !document.querySelector('${feature}').seeking`, 'seek')
    assert.equal(await featureState('v.volume'), .4)
    await featureState('v.play().then(() => true)')
    await featureState('(v.currentTime = v.duration - .4, true)')
    await until(`document.querySelector('.od-feature').dataset.filmState === 'ended' && document.querySelector('.od-feature-play').dataset.state === 'ended' && !document.querySelector('.od-feature-play').hidden`, 'ended state offers a replay')
    assert.equal(await featureState('v.paused && v.ended'), true, `${width}: no automatic restart`)
    await capture(`club-film-ended-${width}x${height}`)
    await trustedClick('.od-feature-play')
    await until(`(() => { const v = document.querySelector('${feature}'); return !v.paused && v.currentTime < 3 })()`, 'watch again from the start')

    // A scene from the index: the camera returns into the screen and the film seeks.
    await filmAt(0, 1400)
    await trustedClick('.od-feature-scenes li:nth-child(4) button')
    await until(`(() => { const v = document.querySelector('${feature}'); return v.currentTime >= 14 && v.currentTime < 17 && !v.paused })()`, 'scene button seeks')
    await until('document.querySelector(".od-feature-scenes li:nth-child(4) button").getAttribute("aria-current") === "true"', 'active scene marked')
    await until(`document.querySelector('.od-feature-frame').getBoundingClientRect().width >= ${immersed.width * .96}`, 'play brings the camera into the screen')
    await evaluate('window.dispatchEvent(new CustomEvent("infinity:scroll-lock", { detail: { locked: true } }))')
    assert.equal(await featureState('v.paused'), true, `${width}: a site dialog pauses the film`)
    await evaluate('window.dispatchEvent(new CustomEvent("infinity:scroll-lock", { detail: { locked: false } }))')
    await featureState('v.play().then(() => true)')

    await evaluate('document.querySelector(".od-film-frame").scrollIntoView({behavior:"instant",block:"center"})')
    await until(`document.querySelector('${feature}').paused`, 'club film pauses offscreen')
    await filmAt(.65, 1400)
    assert.equal(await featureState('v.paused && s.dataset.filmState === "paused" && !document.querySelector(".od-feature-play").hidden'), true, `${width}: returning finds the film paused behind its resume card`)
    await evaluate('document.querySelector(".od-film-frame").scrollIntoView({behavior:"instant",block:"center"})')
    report.clubFilm.push({ width, height, mode, handoff, objectWidth: Math.round(stops[0].width), immersed: `${Math.round(immersed.width)}x${Math.round(immersed.height)}`, rest: `${Math.round(stops[1].width)}x${Math.round(stops[1].height)}`, playback: true, pauseSeekVolume: true, endedReplay: true, sceneSeek: true, dialogPause: true, offscreenPause: true })
    await until('document.querySelector(".od-film-frame video").readyState >= 2', 'inline recording loads')
    await until('!document.querySelector(".od-film-frame video").paused', 'silent preview plays on entry')
    assert.equal(await evaluate('document.querySelector(".od-film-frame video").muted'), true)
    const previewSize = await evaluate('({width:document.querySelector(".od-film-frame video").videoWidth,height:document.querySelector(".od-film-frame video").videoHeight})')
    assert.deepEqual(previewSize, { width: 720, height: 1280 })
    await click('.od-film-controls button')
    assert.equal(await evaluate('document.querySelector(".od-film-frame video").paused'), true, 'manual pause')
    await click('.od-film-controls button')
    await until('!document.querySelector(".od-film-frame video").paused', 'manual play')
    await capture(`film-${width}`)
    await click('.od-film-strip button:nth-child(2)')
    await until('document.querySelector(".od-film-strip button:nth-child(2)").getAttribute("aria-pressed") === "true"', 'clip selection')
    await until('document.querySelector(".od-film-frame video").readyState >= 2 && document.querySelector(".od-film-frame video").getAttribute("src").includes("(2)")', 'spin recording loads')
    await pause(1000)
    await trustedClick('.od-film-watch')
    await until('Boolean(document.querySelector(".od-film-viewer:modal"))', 'native video dialog')
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close video player')
    assert.equal(await evaluate('document.body.style.overflow'), 'hidden')
    await until('document.querySelector(".od-film-viewer video").readyState >= 2', 'expanded recording loads')
    assert.equal(await evaluate('document.querySelector(".od-film-viewer video").controls && !document.querySelector(".od-film-viewer video").muted'), true, 'original audio and native playback controls')
    const filmFits = await evaluate('(() => { const r=document.querySelector(".od-film-viewer video").getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight; })()')
    assert.ok(filmFits, `${width}: expanded video fits`)
    await capture(`film-viewer-${width}`)
    await evaluate('document.querySelector(".od-film-viewer footer button:last-child").focus()')
    await key('Tab')
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close video player', 'native modal traps focus')
    const currentFilm = await evaluate('Number(document.querySelector(".od-film-viewer footer span").textContent.trim().slice(0,2))')
    const expectedFilm = openDayFilms[currentFilm % openDayFilms.length].label
    await key('ArrowRight')
    await until(`document.querySelector('.od-film-viewer h2').textContent === ${JSON.stringify(expectedFilm)}`, 'viewer arrow navigation')
    await key('Escape')
    await until('!document.querySelector(".od-film-viewer")', 'video Escape closes')
    assert.equal(await evaluate('document.activeElement.classList.contains("od-film-watch")'), true, 'video opener focus restored')
    await trustedClick('.od-film-watch')
    await until('Boolean(document.querySelector(".od-film-viewer:modal"))', 'video reopen')
    await click('.od-film-viewer')
    await until('!document.querySelector(".od-film-viewer")', 'video outside close')
    await evaluate('window.scrollTo({top:0,behavior:"instant"})')
    await until('document.querySelector(".od-film-frame video").paused', 'preview pauses offscreen')
    report.films.push({ width, playback: true, manualPause: true, clipSelection: true, nativeControls: true, audio: true, focusTrap: true, focusReturn: true, outsideClose: true, videoFits: filmFits, offscreenPause: true })

    // Test a portrait and the square artwork in the viewer at every width.
    await evaluate('document.querySelector(".od-sheet-image button").focus({preventScroll:true})')
    await click('.od-sheet-image button')
    await until('Boolean(document.querySelector(".od-lightbox"))', 'lightbox')
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close photo viewer')
    assert.equal(await evaluate('document.getElementById("root").inert && document.body.style.overflow === "hidden"'), true)
    await key('Tab', 8)
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Next photo', 'reverse focus trap')
    await key('Tab')
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close photo viewer', 'forward focus trap')
    await key('ArrowLeft')
    await until('document.querySelector(".od-lightbox figcaption").textContent.includes("10 / 10")', 'previous wraps')
    await key('ArrowRight')
    await until('document.querySelector(".od-lightbox figcaption").textContent.includes("01 / 10")', 'next wraps')
    await click('.od-lightbox-controls button:last-child')
    await until('document.querySelector(".od-lightbox figcaption").textContent.includes("02 / 10")', 'next button')
    await key('Escape')
    await until('!document.querySelector(".od-lightbox")', 'Escape closes')
    assert.equal(await evaluate('document.activeElement === document.querySelector(".od-sheet-image button")'), true, 'focus returns')
    assert.equal(await evaluate('document.getElementById("root").inert || document.body.style.overflow === "hidden"'), false, 'scroll unlocked')
    await click('.od-sheet-image--spin button')
    await until('Boolean(document.querySelector(".od-lightbox"))', 'artwork lightbox')
    await until('document.querySelector(".od-lightbox img").complete && document.querySelector(".od-lightbox img").naturalWidth > 0', 'viewer image')
    const modal = await evaluate(`(() => { const img = document.querySelector('.od-lightbox img'); const r = img.getBoundingClientRect(); return { fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, ratio: r.width / r.height }; })()`)
    assert.ok(modal.fits && Math.abs(modal.ratio - 1) < .01, `${width}: square artwork fits lightbox`)
    await capture(`lightbox-${width}`)
    await click('.od-lightbox-backdrop')
    await until('!document.querySelector(".od-lightbox")', 'outside closes')
    report.viewports.push({ width, height, overflow: state.overflow, clippedHeadings: state.clippedHeadings, photos: state.photos.length })
    report.lightbox.push({ width, keyboard: true, focusTrap: true, focusReturn: true, scrollLock: true, outsideClose: true, imageFits: true })
  }

  // Route navigation leaves nothing behind: one pointer listener while the
  // room exists, none after leaving, exactly one again on return.
  const windowListeners = async (type) => {
    const { result } = await send('Runtime.evaluate', { expression: 'window' })
    const { listeners } = await send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    return listeners.filter((listener) => listener.type === type).length
  }
  await send('Page.navigate', { url: `${origin}/events/open-day-2026` })
  await until('document.querySelector(".od-feature")?.dataset.filmMode === "cinematic"', 'room ready')
  const onPage = await windowListeners('pointermove')
  await click('.od-back')
  await until('location.pathname === "/events" && !document.querySelector(".open-day-page")', 'left the Open Day page')
  const away = await windowListeners('pointermove')
  assert.equal(await evaluate('Boolean(document.querySelector("[data-film-mode], [data-film-active]"))'), false)
  await evaluate('history.back()')
  await until('document.querySelector(".od-feature")?.dataset.filmMode === "cinematic"', 'room rebuilt on return')
  const back = await windowListeners('pointermove')
  assert.equal(onPage - away, 1, 'the room owns exactly one pointer listener')
  assert.equal(back, onPage, 'no duplicate listeners after returning')
  report.cleanup = { onPage, away, back }

  // With reduced motion everything is visible, including photos never scrolled into view.
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await send('Page.navigate', { url: `${origin}/events/open-day-2026` })
  await until('Boolean(document.querySelector(".od-contact-sheet"))', 'Open Day page, reduced motion')
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(250)
  const still = await evaluate(`(() => { const s = document.querySelector('.od-feature'); return { mode: s.dataset.filmMode || 'static', stage: getComputedStyle(s.querySelector('.od-feature-stage')).position, rig: getComputedStyle(s.querySelector('.od-feature-rig')).transform, space: s.querySelector('.od-feature-space').offsetHeight < innerHeight * 1.6 } })()`)
  assert.deepEqual(still, { mode: 'static', stage: 'static', rig: 'none', space: true }, 'reduced motion: no pinned 3D scene, a static frame')
  await trustedClick('.od-feature-play')
  await until('!document.querySelector(".od-feature-frame video").paused', 'reduced motion: the film still plays')
  await evaluate('document.querySelector(".od-feature-frame video").pause()')
  await capture('club-film-reduced')
  report.reducedMotionFilm = still
  const hidden = await evaluate(`[...document.querySelectorAll('.open-day-page [data-od-reveal], .od-date > span')].filter(el => getComputedStyle(el).opacity !== '1' || getComputedStyle(el).visibility === 'hidden').length`)
  assert.equal(hidden, 0, 'reduced motion keeps every image and date visible')
  report.reducedMotion = true
  await evaluate('document.querySelector(".od-film-frame").scrollIntoView({behavior:"instant",block:"center"})')
  await pause(250)
  assert.equal(await evaluate('document.querySelector(".od-film-frame video").paused'), true, 'reduced motion does not autoplay video')
  report.reducedMotionVideo = true
  for (const selector of ['.od-intro', '.od-films', '.od-conversations', '.od-play', '.od-spin', '.od-gallery', '.od-closing']) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'start'})`)
    await pause(200)
    await capture(`section-${selector.slice(1)}`)
  }
  for (let index = 0; index < 10; index++) {
    await evaluate(`document.querySelectorAll('.od-contact-sheet img')[${index}].scrollIntoView({behavior:'instant',block:'center'})`)
    await until(`document.querySelectorAll('.od-contact-sheet img')[${index}].complete && document.querySelectorAll('.od-contact-sheet img')[${index}].naturalWidth > 0`, `gallery image ${index + 1}`)
  }
  const loaded = await geometry()
  assert.ok(loaded.photos.every((photo) => photo.loaded), 'all ten original images load')
  report.galleryLoaded = 10
  await evaluate('window.scrollTo({top:0, behavior:"instant"})')
  await pause(100)
  await capture('full-desktop', true)

  // Follow the whole linked card through the existing archive and its past filter.
  await click('.od-closing-links a[href="/events"]')
  await until('Boolean(document.querySelector("#event-open-day-2026-title"))', 'archive card')
  const card = await evaluate(`(() => { const card = document.querySelector('#event-open-day-2026-title').closest('article'); return { linked: card.querySelector('a').getAttribute('href'), variant: card.dataset.variant, src: card.querySelector('img').getAttribute('src') }; })()`)
  assert.equal(card.linked, '/events/open-day-2026')
  assert.equal(card.variant, 'standard')
  assert.match(card.src, /^\/open-day\//)
  await click('.events-filter button:last-child')
  assert.ok(await evaluate('Boolean(document.querySelector("#event-open-day-2026-title"))'), 'Open Day remains in past filter')
  await evaluate('document.querySelector("#event-open-day-2026-title").scrollIntoView({behavior:"instant",block:"center"})')
  await pause(250)
  await capture('archive-card')
  await click('#event-open-day-2026-title')
  await until('Boolean(document.querySelector(".open-day-page"))', 'card opens detail route')
  assert.equal(await evaluate('location.pathname'), '/events/open-day-2026')
  assert.equal(await evaluate('document.querySelectorAll("script[data-route-seo]").length'), 2)
  report.archive = card
  await click('.od-back')
  await until('location.pathname === "/events" && !document.querySelector(".open-day-page")', 'back to archive')
  assert.equal(await evaluate('[...document.querySelectorAll("script[data-route-seo]")].some(s=>JSON.parse(s.textContent)["@type"]==="Event")'), false, 'Event schema removed after SPA navigation')
  report.seoNavigation = true
  await send('Page.navigate', { url: `${origin}/` })
  await until('Boolean(document.querySelector("#accueil h1"))', 'home navigation')
  report.homeLoads = true
  assert.deepEqual(errors, [], 'no console or runtime errors')
  await writeFile(`${output}/audit.json`, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket.close()
}
