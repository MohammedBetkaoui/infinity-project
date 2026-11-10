// The deck from the workshop film, as a 2D canvas: cards rushing out of a
// tunnel (hero) or raining down (finale). No WebGL, no per-frame allocation:
// sprites are painted once, each frame is a few dozen drawImage calls with a
// matrix. The card count and resolution follow the device tier (perfTier.js).
import { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX } from '../../../components/infinity-club-geometry.js'
import { isForced, lowerTier, perfTier, probeOnce, subscribeTier } from './perfTier'

const [, , LOGO_W, LOGO_H] = INFINITY_CLUB_VIEWBOX.split(' ').map(Number)
const SPRITE_W = 150
const SPRITE_H = 210
const TAU = Math.PI * 2
const RED = '#a5463d'
const INK = '#18211c'
const PAPER_TOP = '#eef0e8'
const PAPER_BOTTOM = '#c9d1c5'

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function sprite() {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W
  canvas.height = SPRITE_H
  return [canvas, canvas.getContext('2d')]
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Vector suits: glyphs would fall back to colour emoji on some systems.
function suitPath(ctx, suit, x, y, s) {
  ctx.beginPath()
  if (suit === 'diamond') {
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * .72, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * .72, y); ctx.closePath()
  } else if (suit === 'heart') {
    ctx.moveTo(x, y + s * .9)
    ctx.bezierCurveTo(x - s * 1.25, y + s * .05, x - s * .75, y - s * 1.05, x, y - s * .38)
    ctx.bezierCurveTo(x + s * .75, y - s * 1.05, x + s * 1.25, y + s * .05, x, y + s * .9)
  } else if (suit === 'spade') {
    ctx.moveTo(x, y - s * .95)
    ctx.bezierCurveTo(x + s * 1.25, y - s * .05, x + s * .7, y + s * .95, x, y + s * .35)
    ctx.bezierCurveTo(x - s * .7, y + s * .95, x - s * 1.25, y - s * .05, x, y - s * .95)
    ctx.moveTo(x, y + s * .2); ctx.lineTo(x + s * .32, y + s); ctx.lineTo(x - s * .32, y + s); ctx.closePath()
  } else {
    const r = s * .38
    ctx.arc(x, y - s * .45, r, 0, TAU)
    ctx.moveTo(x + s * .42 + r, y + s * .12); ctx.arc(x + s * .42, y + s * .12, r, 0, TAU)
    ctx.moveTo(x - s * .42 + r, y + s * .12); ctx.arc(x - s * .42, y + s * .12, r, 0, TAU)
    ctx.moveTo(x, y); ctx.lineTo(x + s * .28, y + s); ctx.lineTo(x - s * .28, y + s); ctx.closePath()
  }
  ctx.fill()
}

const logoPath = typeof Path2D === 'function' ? new Path2D(INFINITY_CLUB_PATH) : null
function drawLogo(ctx, x, y, width, color) {
  if (!logoPath) return
  const scale = width / LOGO_W
  ctx.save()
  ctx.translate(x - width / 2, y - (LOGO_H * scale) / 2)
  ctx.scale(scale, scale)
  ctx.fillStyle = color
  ctx.fill(logoPath)
  ctx.restore()
}

const PIPS = {
  2: [[.5, .2], [.5, .8]],
  3: [[.5, .2], [.5, .5], [.5, .8]],
  4: [[.3, .2], [.7, .2], [.3, .8], [.7, .8]],
  5: [[.3, .2], [.7, .2], [.5, .5], [.3, .8], [.7, .8]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.3, .2], [.7, .2], [.5, .35], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  8: [[.3, .2], [.7, .2], [.5, .35], [.3, .5], [.7, .5], [.5, .65], [.3, .8], [.7, .8]],
  9: [[.3, .17], [.7, .17], [.3, .39], [.7, .39], [.5, .5], [.3, .61], [.7, .61], [.3, .83], [.7, .83]],
  10: [[.3, .17], [.7, .17], [.5, .28], [.3, .39], [.7, .39], [.3, .61], [.7, .61], [.5, .72], [.3, .83], [.7, .83]],
}

function cardFront(rank, suit) {
  const [canvas, ctx] = sprite()
  const red = suit === 'heart' || suit === 'diamond'
  const paper = ctx.createLinearGradient(0, 0, SPRITE_W, SPRITE_H)
  paper.addColorStop(0, PAPER_TOP)
  paper.addColorStop(1, PAPER_BOTTOM)
  roundRect(ctx, 1, 1, SPRITE_W - 2, SPRITE_H - 2, 11)
  ctx.fillStyle = paper
  ctx.fill()
  ctx.strokeStyle = 'rgb(20 40 30 / .35)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  const color = red ? RED : INK
  ctx.fillStyle = color
  ctx.font = '700 22px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  // Corner indices, the second one turned like a real card.
  for (const turn of [0, Math.PI]) {
    ctx.save()
    ctx.translate(SPRITE_W / 2, SPRITE_H / 2)
    ctx.rotate(turn)
    ctx.translate(-SPRITE_W / 2, -SPRITE_H / 2)
    ctx.fillText(String(rank), 17, 28)
    suitPath(ctx, suit, 17, 40, 6)
    ctx.restore()
  }
  if (PIPS[rank]) {
    for (const [px, py] of PIPS[rank]) suitPath(ctx, suit, 30 + px * 90, 30 + py * 150, 11)
  } else if (rank === 'A') {
    if (suit === 'spade') drawLogo(ctx, SPRITE_W / 2, SPRITE_H / 2, 62, '#1f5a3f')
    else suitPath(ctx, suit, SPRITE_W / 2, SPRITE_H / 2, 26)
  } else {
    ctx.strokeStyle = red ? 'rgb(165 70 61 / .5)' : 'rgb(24 33 28 / .45)'
    ctx.lineWidth = 1.2
    ctx.strokeRect(34, 46, SPRITE_W - 68, SPRITE_H - 92)
    ctx.font = '700 54px Georgia, "Times New Roman", serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(rank), SPRITE_W / 2, SPRITE_H / 2 - 8)
    suitPath(ctx, suit, SPRITE_W / 2, SPRITE_H / 2 + 32, 10)
  }
  return canvas
}

function cardBack(variant) {
  const [canvas, ctx] = sprite()
  const felt = ctx.createLinearGradient(0, 0, SPRITE_W, SPRITE_H)
  felt.addColorStop(0, variant ? '#183f2c' : '#12301f')
  felt.addColorStop(1, '#06140d')
  roundRect(ctx, 1, 1, SPRITE_W - 2, SPRITE_H - 2, 11)
  ctx.fillStyle = felt
  ctx.fill()
  ctx.save()
  ctx.clip()
  const cx = SPRITE_W / 2
  const cy = SPRITE_H / 2
  // The sunburst of the Infinity deck, painted once.
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * TAU
    const a1 = a0 + TAU / 56
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, 200, a0, a1)
    ctx.closePath()
    ctx.fillStyle = `rgb(178 235 200 / ${variant ? .1 : .07})`
    ctx.fill()
  }
  ctx.restore()
  ctx.strokeStyle = 'rgb(178 235 200 / .42)'
  ctx.lineWidth = 1.4
  roundRect(ctx, 8, 8, SPRITE_W - 16, SPRITE_H - 16, 7)
  ctx.stroke()
  ctx.strokeStyle = 'rgb(178 235 200 / .16)'
  roundRect(ctx, 13, 13, SPRITE_W - 26, SPRITE_H - 26, 5)
  ctx.stroke()
  const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, 44)
  glow.addColorStop(0, 'rgb(120 240 170 / .55)')
  glow.addColorStop(1, 'rgb(120 240 170 / 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SPRITE_W, SPRITE_H)
  ctx.beginPath()
  ctx.arc(cx, cy, 27, 0, TAU)
  ctx.fillStyle = '#04110a'
  ctx.fill()
  ctx.strokeStyle = 'rgb(140 240 180 / .75)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  drawLogo(ctx, cx, cy, 34, '#e6eee2')
  return canvas
}

function deckBack(image) {
  const [canvas, ctx] = sprite()
  roundRect(ctx, 1, 1, SPRITE_W - 2, SPRITE_H - 2, 11)
  ctx.save()
  ctx.clip()
  ctx.drawImage(image, 0, 0, SPRITE_W, SPRITE_H)
  ctx.restore()
  drawLogo(ctx, SPRITE_W * .505, SPRITE_H * .4666, SPRITE_W * .3, '#e6eee2')
  return canvas
}

function buildSprites() {
  const suits = ['spade', 'heart', 'diamond', 'club']
  const ranks = ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K']
  const fronts = []
  for (let i = 0; i < 16; i++) fronts.push(cardFront(i === 0 ? 'A' : pick(ranks), i === 0 ? 'spade' : pick(suits)))
  return { fronts, backs: [cardBack(0), cardBack(1)] }
}

let shared = null
function sharedSprites(deckImageSrc) {
  if (shared) return shared
  shared = buildSprites()
  if (deckImageSrc) {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => { shared.backs.push(deckBack(image), deckBack(image)) }
    image.src = deckImageSrc
  }
  return shared
}

const MODES = {
  // Hero: the camera looks down a tunnel of cards towards the Infinity card.
  tunnel: { near: .32, far: 6.2, speed: .42, swirl: .1, minCards: 30 },
  // Finale: the cards settle, like the end of the film.
  fall: { near: .55, far: 2.6, speed: 1, swirl: 0, minCards: 12 },
}

// Cards [desktop, compact] per tier and mode, and how each tier draws.
const COUNTS = {
  tunnel: { high: [150, 70], mid: [80, 45], low: [40, 28] },
  fall: { high: [70, 34], mid: [38, 20], low: [20, 12] },
}
const QUALITY = {
  high: { dprMax: 1.5, resolution: 1, every: 1 },
  mid: { dprMax: 1, resolution: 1, every: 1 },
  // Drawn small and stretched by CSS (the blur suits the film), every other frame.
  low: { dprMax: 1, resolution: .75, every: 2 },
}
const PROBE_FRAMES = 90
// The first frames are the page booting (React, images, the intro): not a verdict.
const PROBE_WARMUP = 10
// A device that is clearly struggling is judged early, not after the whole window.
const PROBE_EARLY = 30
// The slowest share of the window is dropped from the mean: a few hitches
// (decoding an image, a GC) must not condemn a capable device.
const PROBE_TRIM = .15
const PROBE_LIMIT = 22
const SLOW_FRAME = 20
const SLOW_RUN = 30
const SCALE_FLOOR = .65

const byDepth = (a, b) => b.z - a.z

// Mean of the fastest (1 - PROBE_TRIM) of the samples. Sorts the buffer in place.
function trimmedMean(samples, count) {
  const window = samples.subarray(0, count)
  window.sort()
  const keep = Math.max(1, Math.floor(count * (1 - PROBE_TRIM)))
  let total = 0
  for (let i = 0; i < keep; i++) total += window[i]
  return total / keep
}

// The scroll scenes reach the engine of a canvas without a React handle.
const engines = new WeakMap()
export const vortexOf = (canvas) => (canvas ? engines.get(canvas) : null) || null

// `still` is the single frame of reduced motion: it keeps the full deck, there is nothing to save.
export function createCardVortex(canvas, { mode = 'tunnel', compact = false, deckImageSrc, intensity = 1, still = false } = {}) {
  const ctx = canvas.getContext('2d', { alpha: true })
  const config = MODES[mode] || MODES.tunnel
  const sprites = sharedSprites(deckImageSrc)
  const state = {
    width: 0, height: 0, dpr: 1, unit: 1, time: 0,
    warp: 0, warpTarget: 0, burst: 0,
    fx: .5, fy: .5, fxTarget: .5, fyTarget: .5,
    camX: 0, camY: 0, camXTarget: 0, camYTarget: 0,
    intensity, intensityTarget: intensity,
  }
  let tier = still ? 'high' : perfTier()
  let quality = QUALITY[tier]
  // The adaptive controller only ever removes: cards first, then resolution.
  let trim = 1
  let shrink = 1
  let cards = []
  let glints = []
  let needsSort = true
  let frame = 0
  let last = 0
  let lastRender = 0
  let skip = false
  let running = false
  // Frame-time watch: a probe on the hero's first frames, then a rolling mean.
  let probing = !still && mode === 'tunnel' && !isForced() && probeOnce()
  let probeSeen = 0
  let probeFrames = 0
  const probeSamples = new Float32Array(PROBE_FRAMES)
  let mean = 1000 / 60
  let slowRun = 0

  const baseCount = () => COUNTS[mode][tier][compact ? 1 : 0]
  const areaFactor = () => clamp((state.width * state.height) / (1440 * 900), .45, 1.25)

  function spawn(card, initial) {
    card.front = pick(sprites.fronts)
    card.back = pick(sprites.backs)
    card.spin = rand(0, TAU)
    card.spinSpeed = rand(-.55, .55)
    card.flip = rand(0, TAU)
    card.flipSpeed = rand(-1.1, 1.1) || .4
    card.tilt = rand(-.55, .55)
    card.size = rand(.85, 1.18)
    if (mode === 'tunnel') {
      card.angle = rand(0, TAU)
      card.radius = rand(.5, 1.55)
      card.z = initial ? rand(config.near, config.far) : rand(config.far * .88, config.far)
    } else {
      card.z = rand(config.near, config.far)
      card.x = rand(-.08, 1.08)
      card.y = initial ? rand(-.15, 1.05) : rand(-.35, -.12)
      card.vy = rand(.05, .11)
      card.vx = rand(-.012, .012)
      card.phase = rand(0, TAU)
    }
    // A new card breaks the depth order: the next frame sorts once.
    needsSort = true
    return card
  }

  function seed() {
    const count = Math.round(baseCount() * areaFactor() * trim)
    cards = Array.from({ length: count }, () => spawn({}, true))
    glints = Array.from({ length: compact ? 12 : 24 }, () => ({ x: Math.random(), y: Math.random(), phase: rand(0, TAU), speed: rand(.6, 1.6), size: rand(3, 6) }))
  }

  function setBackingStore(force) {
    state.dpr = Math.min(window.devicePixelRatio || 1, quality.dprMax) * quality.resolution * shrink
    const w = Math.round(state.width * state.dpr)
    const h = Math.round(state.height * state.dpr)
    // Assigning width or height clears and reallocates the bitmap: only when it changed.
    if (force || canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    // A mobile address bar resizes the box by a few dozen pixels: not worth a new bitmap.
    if (compact && state.width && Math.abs(rect.width - state.width) < 1 && Math.abs(rect.height - state.height) <= 120) return
    state.width = rect.width
    state.height = rect.height
    state.unit = Math.min(rect.width, rect.height)
    setBackingStore(false)
    if (!cards.length) seed()
  }

  function step(dt) {
    state.time += dt
    const ease = 1 - Math.exp(-dt * 4)
    state.warp += (state.warpTarget - state.warp) * ease
    state.fx += (state.fxTarget - state.fx) * ease
    state.fy += (state.fyTarget - state.fy) * ease
    state.camX += (state.camXTarget - state.camX) * (1 - Math.exp(-dt * 2.5))
    state.camY += (state.camYTarget - state.camY) * (1 - Math.exp(-dt * 2.5))
    state.intensity += (state.intensityTarget - state.intensity) * ease
    state.burst = Math.max(0, state.burst - dt * .9)
    const pace = 1 + state.warp * 7 + state.burst * 10
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      card.spin += card.spinSpeed * dt * (1 + state.warp * 1.5)
      card.flip += card.flipSpeed * dt * (1 + state.warp * 2)
      if (mode === 'tunnel') {
        card.z -= config.speed * pace * dt
        card.angle += config.swirl * dt * (1 + state.warp * 2.5)
        if (card.z < config.near) spawn(card, false)
      } else {
        card.y += card.vy * dt * (1 + state.warp * 2.5) / card.z
        card.x += card.vx * dt + Math.sin(state.time * .7 + card.phase) * .006 * dt
        if (card.y > 1.2) spawn(card, false)
      }
    }
  }

  function draw() {
    const { width, height, dpr, unit } = state
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!width) return
    // Far cards first. Every card moves at the same pace, so the order only
    // changes when one respawns: sort then, not on every frame.
    if (needsSort) {
      if (mode === 'tunnel') cards.sort(byDepth)
      needsSort = false
    }
    const baseW = unit * (mode === 'tunnel' ? .17 : compact ? .15 : .085)
    const cx = state.fx * width
    const cy = state.fy * height
    const tunnelRadius = Math.hypot(width, height) * .3
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      let x, y, scale, depth
      if (mode === 'tunnel') {
        scale = 1 / card.z
        x = cx + (Math.cos(card.angle) * card.radius * tunnelRadius - state.camX) * scale
        y = cy + (Math.sin(card.angle) * card.radius * tunnelRadius * .92 - state.camY) * scale
        depth = (card.z - config.near) / (config.far - config.near)
      } else {
        scale = 1 / card.z
        x = card.x * width - state.camX * scale * .6
        y = card.y * height - state.camY * scale * .6
        depth = (card.z - config.near) / (config.far - config.near)
      }
      const w = baseW * card.size * scale
      const h = w * (SPRITE_H / SPRITE_W)
      if (x < -w || x > width + w || y < -h || y > height + h) continue
      // Close to the lens the cards soften, like the film's depth of field.
      const fadeNear = mode === 'tunnel' ? clamp((card.z - config.near) / .45, 0, 1) * clamp(.45 + (card.z - config.near) * .5, .45, 1) : 1
      const fadeFar = mode === 'tunnel' ? clamp((config.far - card.z) / 1.1, 0, 1) : 1
      const alpha = Math.pow(1 - depth, 1.35) * .95 * fadeNear * fadeFar * state.intensity + (mode === 'fall' ? .08 : 0)
      if (alpha < .02) continue
      const flipX = Math.cos(card.flip)
      if (Math.abs(flipX) < .04) continue
      const image = flipX > 0 ? card.front : card.back
      const sx = (w / SPRITE_W) * flipX
      const sy = (h / SPRITE_H) * Math.cos(card.tilt)
      const cos = Math.cos(card.spin)
      const sin = Math.sin(card.spin)
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.setTransform(cos * sx * dpr, sin * sx * dpr, -sin * sy * dpr, cos * sy * dpr, x * dpr, y * dpr)
      ctx.drawImage(image, -SPRITE_W / 2, -SPRITE_H / 2)
    }
    // The film's small "+" glints.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = '#e8f6ec'
    ctx.lineWidth = 1
    for (let i = 0; i < glints.length; i++) {
      const glint = glints[i]
      const twinkle = Math.max(0, Math.sin(state.time * glint.speed + glint.phase))
      if (twinkle < .15) continue
      const gx = glint.x * width
      const gy = glint.y * height
      const s = glint.size * twinkle
      ctx.globalAlpha = twinkle * .55 * state.intensity
      ctx.beginPath()
      ctx.moveTo(gx - s, gy); ctx.lineTo(gx + s, gy)
      ctx.moveTo(gx, gy - s); ctx.lineTo(gx, gy + s)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // Removes load, never adds it back during the session.
  function degrade() {
    if (cards.length > config.minCards) {
      const keep = Math.max(config.minCards, Math.floor(cards.length * .8))
      trim *= keep / cards.length
      // The farthest cards go first: small, dim, the least missed.
      cards.splice(0, cards.length - keep)
    } else if (shrink > SCALE_FLOOR) {
      shrink = Math.max(SCALE_FLOOR, shrink * .85)
      setBackingStore(true)
    }
  }

  // Applies a lower tier chosen by the probe (or by another canvas).
  function applyTier(next) {
    tier = next
    quality = QUALITY[tier]
    const target = Math.round(baseCount() * areaFactor() * trim)
    if (cards.length > target) cards.splice(0, cards.length - target)
    if (state.width) setBackingStore(true)
  }
  const unsubscribe = still ? () => {} : subscribeTier(applyTier)

  // `ms` is the display clock (time between animation frames), whatever we draw.
  function watch(ms) {
    if (probing && ++probeSeen > PROBE_WARMUP) {
      probeSamples[probeFrames++] = ms
      // Two verdicts at most: early for a clearly slow device, final at the end of the window.
      if (probeFrames === PROBE_EARLY || probeFrames >= PROBE_FRAMES) {
        const slow = trimmedMean(probeSamples, probeFrames) > PROBE_LIMIT
        if (slow || probeFrames >= PROBE_FRAMES) probing = false
        if (slow) lowerTier()
      }
    }
    mean += (ms - mean) * .1
    if (mean > SLOW_FRAME) {
      slowRun += 1
      if (slowRun >= SLOW_RUN) { slowRun = 0; mean = 1000 / 60; degrade() }
    } else {
      slowRun = 0
    }
  }

  function loop(now) {
    if (!running) return
    // The very first frame after a start has no previous one to compare with.
    if (last) watch(Math.min(100, now - last))
    last = now
    frame = requestAnimationFrame(loop)
    if (quality.every === 2) {
      skip = !skip
      if (skip) return
    }
    const dt = lastRender ? Math.min(.05, (now - lastRender) / 1000) : 1 / 60
    lastRender = now
    step(dt)
    draw()
  }

  const unitShift = () => state.unit * .09
  const engine = {
    resize,
    start() {
      if (running) return
      running = true
      last = 0
      lastRender = 0
      frame = requestAnimationFrame(loop)
    },
    stop() {
      running = false
      cancelAnimationFrame(frame)
    },
    // A still frame for reduced motion and the first paint.
    still() {
      resize()
      step(.016)
      draw()
    },
    setWarp(value) { state.warpTarget = clamp(value, 0, 1.5) },
    burst(value = 1) { state.burst = Math.max(state.burst, value) },
    setFocus(x, y) { state.fxTarget = x; state.fyTarget = y; if (!running) { state.fx = x; state.fy = y } },
    setPointer(nx, ny) { state.camXTarget = nx * unitShift(); state.camYTarget = ny * unitShift() },
    setIntensity(value) { state.intensityTarget = clamp(value, 0, 1.2) },
    destroy() {
      running = false
      cancelAnimationFrame(frame)
      unsubscribe()
      cards = []
      engines.delete(canvas)
    },
  }
  engines.set(canvas, engine)
  return engine
}
