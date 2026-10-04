import { useEffect, useLayoutEffect, useRef } from 'react'
import useMotionPreference from '../hooks/useMotionPreference'
import { HERO_BREAKPOINTS, HERO_PROFILES, LINES_COMPACT, LINES_WIDE, portraitFrame } from '../lib/heroLayouts'
import { onLayoutResize } from '../lib/viewportResize'
import { heroBeamOpacity, heroBeamProgress, heroZoomProgress } from '../lib/heroLogoZoom'
import { beamCoordinates, beamSpan, HERO_ENERGY_DURATION, HERO_ENERGY_START, HERO_LIGHT_EVENT, HERO_SCROLL_EVENT, homeLinesFragmentShader, homeLinesVertexShader, measureRibbon, ribbonPath } from '../lib/homeHeroLines'
import './home-hero-lines.css'

const staticRibbons = [false, true].map(compact => ({
  compact,
  paths: [-1, 1].flatMap(side => Array.from({ length: compact ? 4 : 7 }, (_, line) => ({
    key: `${side}:${line}`, side, line, d: ribbonPath(side, line, compact),
    opacity: .28 + line * (compact ? .07 : .04),
  }))),
}))

// Position, edge, opacity, fibre offset, loop travel, beam A and B coordinates.
const VERTEX_FLOATS = 8
const VERTEX_LAYOUT = [['aPosition', 2, 0], ['aEdge', 1, 2], ['aOpacity', 1, 3], ['aOffset', 1, 4], ['aTravel', 1, 5], ['aBeam', 2, 6]]
const LIGHT_UNIFORMS = ['uIntro', 'uCompact', 'uHover', 'uPointer', 'uSize', 'uScroll', 'uScrollActive', 'uBeam', 'uBeamAlpha', 'uBeamsOnly']
const CONTEXT_OPTIONS = {
  alpha: true, antialias: false, depth: false, stencil: false,
  preserveDrawingBuffer: false, powerPreference: 'low-power',
}

function createProgram(gl) {
  const shaders = []
  let program = null
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, homeLinesVertexShader], [gl.FRAGMENT_SHADER, homeLinesFragmentShader]]) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Shader unavailable')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed')
    }
    program = gl.createProgram()
    if (!program) throw new Error('Program unavailable')
    shaders.forEach(shader => gl.attachShader(program, shader))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed')
    return program
  } catch {
    if (program) gl.deleteProgram(program)
    return null
  } finally {
    shaders.forEach(shader => gl.deleteShader(shader))
  }
}

// Layout box of a node relative to an ancestor, ignoring CSS transforms (the
// copy lifts and fades during the scroll sequence).
function layoutBox(node, ancestor) {
  let x = 0
  let y = 0
  for (let current = node; current && current !== ancestor; current = current.offsetParent) {
    x += current.offsetLeft
    y += current.offsetTop
  }
  return { x, y, width: node.offsetWidth, height: node.offsetHeight }
}

// Program, buffer, vertex layout and blending of one lines canvas.
function prepareCanvas(gl) {
  const program = createProgram(gl)
  const buffer = program && gl.createBuffer()
  if (!buffer) {
    if (program) gl.deleteProgram(program)
    return null
  }
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  for (const [name, size, offset] of VERTEX_LAYOUT) {
    const location = gl.getAttribLocation(program, name)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, VERTEX_FLOATS * 4, offset * 4)
  }
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)
  return {
    program, buffer, phase: gl.getUniformLocation(program, 'uPhase'),
    lights: Object.fromEntries(LIGHT_UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)])),
  }
}

export default function HomeHeroLines({ held = false }) {
  const layerRef = useRef(null)
  const canvasRef = useRef(null)
  const beamCanvasRef = useRef(null)
  const heldRef = useRef(held)
  const resumeRef = useRef(null)
  const reduced = useMotionPreference()

  // While the home loader covers the Hero, the scene waits on its first frame:
  // the currents, and the title light that follows them, start at the handoff.
  useEffect(() => {
    heldRef.current = held
    if (!held) resumeRef.current?.()
  }, [held])

  // Portrait phones and tablets: the symbol is drawn in a frame much wider
  // than the screen (its loops overflow both sides, as on desktop), centred,
  // with its crossing on the logo and its upper loops under the paragraph.
  // The canvases and the static SVG read the frame from these properties.
  useLayoutEffect(() => {
    const layer = layerRef.current
    const hero = layer?.parentElement
    if (!layer || !hero) return undefined
    const wide = window.matchMedia(LINES_WIDE)
    const tablet = window.matchMedia(HERO_BREAKPOINTS.tablet)
    const properties = ['--lines-frame-width', '--lines-frame-height', '--lines-crossing']
    const place = () => {
      const mark = hero.querySelector('.home-hero-mark')
      if (!wide.matches || !mark) { properties.forEach(name => layer.style.removeProperty(name)); return }
      const text = hero.querySelector('.home-hero-description')
      const size = { width: hero.clientWidth, height: hero.clientHeight }
      const logo = layoutBox(mark, hero)
      const copy = text && layoutBox(text, hero)
      const frame = portraitFrame(HERO_PROFILES[tablet.matches ? 'tablet' : 'mobile'], size, logo.y + logo.height / 2, copy && {
        bottom: copy.y + copy.height,
        halfWidth: Math.max(size.width / 2 - copy.x, copy.x + copy.width - size.width / 2),
      })
      layer.style.setProperty('--lines-frame-width', `${Math.round(frame.width)}px`)
      layer.style.setProperty('--lines-frame-height', `${Math.round(frame.height)}px`)
      layer.style.setProperty('--lines-crossing', `${Math.round(frame.crossing)}px`)
    }
    place()
    // Webfonts and wrapping move the paragraph and the logo (the paragraph can
    // change width alone); the address bar of a phone does not (svh), so only
    // width changes count (onLayoutResize).
    let disposed = false
    document.fonts?.ready.then(() => { if (!disposed) place() })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
    for (const selector of ['.home-hero-copy', '.home-hero-description']) {
      const node = hero.querySelector(selector)
      if (node) observer?.observe(node)
    }
    const removeResize = onLayoutResize(place)
    wide.addEventListener('change', place)
    tablet.addEventListener('change', place)
    return () => {
      disposed = true
      observer?.disconnect()
      removeResize()
      wide.removeEventListener('change', place)
      tablet.removeEventListener('change', place)
      properties.forEach(name => layer.style.removeProperty(name))
    }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    const beamCanvas = beamCanvasRef.current
    const hero = layer?.parentElement
    if (!layer || !canvas || !hero) return undefined
    layer.dataset.render = 'static'
    layer.dataset.motion = reduced ? 'reduced' : 'paused'
    const initialScrollFrame = hero.homeHeroScrollFrame
    let scrollProgress = 0
    let scrollZoom = true
    let scrollFocusX = hero.clientWidth / 2
    let scrollFocusY = hero.clientHeight / 2
    let applyScrollFrame = () => undefined
    const staticFrames = Array.from(layer.querySelectorAll('.home-hero-lines-still'), svg => ({
      svg, group: svg.firstElementChild, left: 0, top: 0, width: 0, height: 0,
    }))
    let canvasLeft = 0
    let canvasTop = 0
    const cacheLayout = () => {
      const heroBounds = hero.getBoundingClientRect()
      const canvasBounds = canvas.getBoundingClientRect()
      canvasLeft = canvasBounds.left - heroBounds.left
      canvasTop = canvasBounds.top - heroBounds.top
      staticFrames.forEach(frame => {
        const bounds = frame.svg.getBoundingClientRect()
        frame.left = bounds.left - heroBounds.left
        frame.top = bounds.top - heroBounds.top
        frame.width = bounds.width
        frame.height = bounds.height
      })
    }
    const depthScale = () => scrollZoom ? 1 + .5 * Math.min(1, heroZoomProgress(scrollProgress)) : 1
    const updateStaticZoom = () => {
      const scale = reduced ? 1 : depthScale()
      staticFrames.forEach(({ group, left, top, width, height }) => {
        if (scale === 1) { group.removeAttribute('transform'); return }
        if (!width || !height) return
        const x = (scrollFocusX - left) / width * 1000
        const y = (scrollFocusY - top) / height * 1000
        group.setAttribute('transform', `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`)
      })
    }
    const resizeStatic = () => { cacheLayout(); updateStaticZoom() }
    const handleScroll = event => {
      const wasScrolling = scrollProgress > 0
      scrollProgress = Math.min(1, Math.max(0, Number(event.detail?.progress) || 0))
      scrollZoom = event.detail?.zoom !== false
      if (event.detail?.layoutChanged) cacheLayout()
      if (Number.isFinite(event.detail?.focusX)) scrollFocusX = event.detail.focusX
      if (Number.isFinite(event.detail?.focusY)) scrollFocusY = event.detail.focusY
      layer.dataset.scrollProgress = String(scrollProgress)
      if (!reduced && (scrollProgress > 0 || layer.dataset.render === 'static')) {
        layer.dataset.motion = scrollProgress > 0 && scrollProgress < 1 ? 'scroll' : 'paused'
      }
      updateStaticZoom()
      applyScrollFrame(wasScrolling)
    }
    cacheLayout()
    hero.addEventListener(HERO_SCROLL_EVENT, handleScroll)
    // SVG remains scroll-driven when WebGL is unavailable or loses its context.
    const removeStaticResize = onLayoutResize(resizeStatic)
    const removeScrollListeners = () => {
      hero.removeEventListener(HERO_SCROLL_EVENT, handleScroll)
      removeStaticResize()
      staticFrames.forEach(({ group }) => group.removeAttribute('transform'))
      delete layer.dataset.scrollProgress
    }
    const notifyLight = (mode, elapsed = 0, delta = 0) => {
      hero.dispatchEvent(new CustomEvent(HERO_LIGHT_EVENT, { detail: { mode, elapsed, delta } }))
    }
    // Reduced motion uses the SVG, without a GPU context or a frame loop.
    if (reduced) {
      if (initialScrollFrame) handleScroll({ detail: initialScrollFrame })
      notifyLight('static')
      return removeScrollListeners
    }

    const compactMedia = window.matchMedia(LINES_COMPACT)
    const wideMedia = window.matchMedia(LINES_WIDE)
    let wide = wideMedia.matches
    const fineMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
    let compact = compactMedia.matches
    let gl = null
    let program = null
    let buffer = null
    let phaseLocation = null
    let lightLocations = null
    let frame = 0
    let lastTimestamp = 0
    let elapsed = 0
    let visible = false
    let lost = false
    let disposed = false
    let width = 1
    let height = 1
    let points = 0
    let vertices = null
    let curves = null
    let pointerX = 0
    let pointerY = 0
    let targetX = 0
    let targetY = 0
    let mouseX = .5
    let mouseY = .5
    let targetMouseX = .5
    let targetMouseY = .5
    let hover = 0
    let targetHover = 0

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      lastTimestamp = 0
      layer.dataset.motion = scrollProgress > 0 && scrollProgress < 1 ? 'scroll' : 'paused'
    }
    const release = () => {
      if (gl && !lost) {
        if (buffer) gl.deleteBuffer(buffer)
        if (program) gl.deleteProgram(program)
      }
      buffer = null
      program = null
      phaseLocation = null
      lightLocations = null
    }
    const fallback = () => { stop(); layer.dataset.render = 'static'; notifyLight('static') }
    // The beams' own canvas sits above the centre shade, which would hide the
    // crossing they pass through. Same program, same vertices, same draw: the
    // beams stay on the fibres and follow their zoom. Without it there are
    // simply no beams.
    let beams = null
    let beamsLost = false
    const initBeams = () => {
      try {
        const beamGl = beamCanvas.getContext('webgl', CONTEXT_OPTIONS)
        const prepared = beamGl && prepareCanvas(beamGl)
        beams = prepared ? { gl: beamGl, ...prepared, drawn: false } : null
        beams?.gl.uniform1f(beams.lights.uBeamsOnly, 1)
      } catch {
        beams = null
      }
    }
    const releaseBeams = () => {
      if (beams && !beamsLost) {
        beams.gl.deleteBuffer(beams.buffer)
        beams.gl.deleteProgram(beams.program)
      }
      beams = null
    }
    const initialize = () => {
      try {
        gl = canvas.getContext('webgl', CONTEXT_OPTIONS)
        if (!gl) return false
        const prepared = prepareCanvas(gl)
        if (!prepared) { release(); return false }
        program = prepared.program
        buffer = prepared.buffer
        phaseLocation = prepared.phase
        lightLocations = prepared.lights
        return true
      } catch {
        release()
        return false
      }
    }
    const resize = () => {
      cacheLayout()
      if (!program || lost) return
      // CSS gives the compact symbol its own proportional frame. Measure that
      // frame so WebGL and the static SVG share the same responsive silhouette.
      width = Math.max(1, canvas.clientWidth)
      height = Math.max(1, canvas.clientHeight)
      compact = compactMedia.matches
      wide = wideMedia.matches
      if (compact && !scrollProgress) { pointerX = 0; pointerY = 0; targetX = 0; targetY = 0; hover = 0; targetHover = 0 }
      // Bound the pixel budget. The wide portrait frame keeps the compact
      // fibres but gets a sharp backing store and smoother curves: only its
      // ribbons are shaded, whatever its size off screen.
      const dpr = Math.min(window.devicePixelRatio || 1, wide ? 2 : compact ? 1 : 1.5)
      const scale = Math.min(dpr, Math.sqrt((wide ? 1500000 : compact ? 420000 : 1600000) / (width * height)))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      points = wide ? 97 : compact ? 65 : 129
      vertices = new Float32Array(2 * (compact ? 4 : 7) * points * 2 * VERTEX_FLOATS)
      curves = Array.from({ length: (compact ? 4 : 7) * 2 }, () => ({
        positions: new Float32Array(points * 2), distances: new Float32Array(points), length: 0,
      }))
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW)
      if (beams && !beamsLost) {
        beamCanvas.width = canvas.width
        beamCanvas.height = canvas.height
        beams.gl.viewport(0, 0, canvas.width, canvas.height)
        beams.gl.bindBuffer(beams.gl.ARRAY_BUFFER, beams.buffer)
        beams.gl.bufferData(beams.gl.ARRAY_BUFFER, vertices.byteLength, beams.gl.DYNAMIC_DRAW)
        beams.drawn = false
      }
      layer.dataset.quality = compact ? 'mobile' : 'desktop'
    }
    const draw = () => {
      if (!program || lost || !vertices) return
      let offset = 0
      const lineCount = compact ? 4 : 7
      const halfWidth = compact ? 4.5 : 9
      const focusX = scrollFocusX - canvasLeft
      const focusY = scrollFocusY - canvasTop
      const scale = depthScale()
      for (let line = 0; line < lineCount; line++) {
        for (const [sideIndex, side] of [[0, -1], [1, 1]]) {
          const curve = curves[sideIndex * lineCount + line]
          curve.length = measureRibbon(curve.positions, curve.distances, side, line, elapsed, compact, width, height)
        }
      }
      // Beam paths per fibre, from the lengths just measured.
      const spans = Array.from({ length: lineCount }, (_, line) => beamSpan(curves[line].distances, curves[lineCount + line].distances))
      for (const [sideIndex, side] of [[0, -1], [1, 1]]) {
        for (let line = 0; line < lineCount; line++) {
          const curve = curves[sideIndex * lineCount + line]
          const rightLength = curves[lineCount + line].length
          const totalLength = rightLength + curves[line].length
          for (let point = 0; point < points; point++) {
            const progress = point / (points - 1)
            const previous = Math.max(0, point - 1) * 2
            const next = Math.min(points - 1, point + 1) * 2
            const dx = curve.positions[next] - curve.positions[previous]
            const dy = curve.positions[next + 1] - curve.positions[previous + 1]
            const length = Math.max(.001, Math.hypot(dx, dy))
            const normalX = -dy / length * halfWidth
            const normalY = dx / length * halfWidth
            const opacity = (.3 + line / lineCount * .28) * Math.sin(progress * Math.PI) ** .45
            const travel = side === 1 ? curve.distances[point] / totalLength
              : (rightLength + curve.length - curve.distances[point]) / totalLength
            const [beamA, beamB] = beamCoordinates(side, curve.distances[point], spans[line])
            // Expand the centreline in CSS pixels before adding its normal:
            // ribbon ink and glow keep the same thickness throughout the zoom.
            const x = focusX + (curve.positions[point * 2] + pointerX - focusX) * scale
            const y = focusY + (curve.positions[point * 2 + 1] + pointerY - focusY) * scale
            for (const edge of [-1, 1]) {
              // Keep the original arithmetic at scale 1, including the first
              // ambient frame before the scroll choreography begins.
              const screenX = scale === 1 ? curve.positions[point * 2] + normalX * edge + pointerX : x + normalX * edge
              const screenY = scale === 1 ? curve.positions[point * 2 + 1] + normalY * edge + pointerY : y + normalY * edge
              vertices[offset++] = screenX / width * 2 - 1
              vertices[offset++] = 1 - screenY / height * 2
              vertices[offset++] = edge
              vertices[offset++] = opacity
              // A 0.14s delay from one fibre to the next gives the fine head
              // about 3–5 neighbouring bright lines, followed by a softer wake.
              vertices[offset++] = (line - (lineCount - 1) / 2) * .013
              vertices[offset++] = travel
              vertices[offset++] = beamA
              vertices[offset++] = beamB
            }
          }
        }
      }
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices)
      gl.uniform1f(phaseLocation, (elapsed / HERO_ENERGY_DURATION + HERO_ENERGY_START) % 1)
      gl.uniform1f(lightLocations.uIntro, .52 + .48 * (1 - Math.exp(-elapsed / .45)))
      gl.uniform1f(lightLocations.uCompact, compact ? 1 : 0)
      gl.uniform1f(lightLocations.uHover, hover)
      // The reflection that follows the scroll (see useHeroMotion) stays live
      // through the scroll sequence too.
      gl.uniform1f(lightLocations.uScroll, Number(hero.style.getPropertyValue('--hero-light-scroll')) || 0)
      gl.uniform1f(lightLocations.uScrollActive, Number(hero.style.getPropertyValue('--hero-light-scroll-active')) || 0)
      gl.uniform2f(lightLocations.uPointer, mouseX, mouseY)
      gl.uniform2f(lightLocations.uSize, width, height)
      const stripSize = points * 2
      for (let strip = 0; strip < lineCount * 2; strip++) gl.drawArrays(gl.TRIANGLE_STRIP, strip * stripSize, stripSize)
      layer.dataset.render = 'webgl'
      drawBeams(stripSize, lineCount * 2)
    }
    // The beams follow the scroll sequence only: at rest their canvas is empty.
    const drawBeams = (stripSize, strips) => {
      if (!beams || beamsLost) return
      const beamGl = beams.gl
      const alpha = scrollZoom ? heroBeamOpacity(scrollProgress) : 0
      if (!alpha) {
        if (beams.drawn) beamGl.clear(beamGl.COLOR_BUFFER_BIT)
        beams.drawn = false
        return
      }
      beamGl.bindBuffer(beamGl.ARRAY_BUFFER, beams.buffer)
      beamGl.bufferSubData(beamGl.ARRAY_BUFFER, 0, vertices)
      beamGl.uniform1f(beams.lights.uBeam, heroBeamProgress(scrollProgress))
      beamGl.uniform1f(beams.lights.uBeamAlpha, alpha)
      beamGl.uniform1f(beams.lights.uCompact, compact ? 1 : 0)
      beamGl.uniform1f(beams.lights.uHover, hover)
      beamGl.uniform2f(beams.lights.uPointer, mouseX, mouseY)
      beamGl.uniform2f(beams.lights.uSize, width, height)
      beamGl.clear(beamGl.COLOR_BUFFER_BIT)
      for (let strip = 0; strip < strips; strip++) beamGl.drawArrays(beamGl.TRIANGLE_STRIP, strip * stripSize, stripSize)
      beams.drawn = true
    }
    const tick = timestamp => {
      frame = 0
      if (disposed || scrollProgress >= 1 || !visible || document.hidden || lost || !program) return
      const delta = lastTimestamp ? timestamp - lastTimestamp : 0
      if (!lastTimestamp || delta >= (compact && !wide ? 1000 / 24 : 1000 / 30) - 1) {
        // Resetting the timestamp on pause avoids a jump when resuming.
        elapsed += delta / 1000
        const damping = 1 - Math.exp(-Math.max(delta, 33) / 260)
        pointerX += (targetX - pointerX) * damping
        pointerY += (targetY - pointerY) * damping
        mouseX += (targetMouseX - mouseX) * damping
        mouseY += (targetMouseY - mouseY) * damping
        hover += (targetHover - hover) * damping
        lastTimestamp = timestamp
        notifyLight('frame', elapsed, Math.min(delta / 1000, .08))
        draw()
      }
      frame = window.requestAnimationFrame(tick)
    }
    const start = () => {
      if (disposed || scrollProgress >= 1 || frame || !visible || document.hidden || lost || !program) return
      // Held: draw the first frame (so WebGL replaces the still SVG under the
      // loader) without starting the clock.
      if (heldRef.current) { draw(); return }
      layer.dataset.motion = scrollProgress > 0 ? 'scroll' : 'animated'
      frame = window.requestAnimationFrame(tick)
    }
    const handleResize = () => {
      resize()
      if (hero.homeHeroScrollFrame) handleScroll({ detail: hero.homeHeroScrollFrame })
      else updateStaticZoom()
      if (visible && !document.hidden && (!scrollProgress || !hero.homeHeroScrollFrame)) draw()
      start()
    }
    const handlePointerMove = event => {
      if (scrollProgress > 0 || compact || !fineMedia.matches || event.pointerType === 'touch') return
      const bounds = hero.getBoundingClientRect()
      targetMouseX = (event.clientX - bounds.left) / bounds.width
      targetMouseY = (event.clientY - bounds.top) / bounds.height
      targetX = (targetMouseX - .5) * 12
      targetY = (targetMouseY - .5) * 8
      targetHover = 1
    }
    const handlePointerLeave = () => {
      if (scrollProgress > 0) return
      targetX = 0; targetY = 0; targetHover = 0
    }
    const handleVisibility = () => { if (document.hidden) stop(); else start() }
    const handleContextLost = event => {
      event.preventDefault()
      lost = true
      fallback()
    }
    const handleBeamsLost = event => {
      event.preventDefault()
      beamsLost = true
    }
    const handleBeamsRestored = () => {
      beamsLost = false
      beams = null
      initBeams()
      resize()
      if (visible && !document.hidden) draw()
    }
    const handleContextRestored = () => {
      lost = false
      buffer = null
      program = null
      if (!initialize()) { fallback(); return }
      resize()
      if (visible && !document.hidden) draw()
      start()
    }

    applyScrollFrame = wasScrolling => {
      if (scrollProgress > 0) {
        // The pointer stops steering the lines once the sequence starts: the
        // zoom and its focus come from the scroll alone. The light currents
        // keep their clock, so the symbol stays alive while it scrubs.
        if (!wasScrolling) {
          targetX = pointerX; targetY = pointerY
          targetMouseX = mouseX; targetMouseY = mouseY; targetHover = hover
        }
        // Drawn on the scroll frame itself, in step with the logo; the clock
        // rests once the Hero is fully covered.
        draw()
        if (scrollProgress >= 1) stop()
        else start()
      } else start()
      if (frame) layer.dataset.motion = scrollProgress > 0 ? 'scroll' : 'animated'
    }

    if (!initialize()) {
      fallback()
      if (initialScrollFrame) handleScroll({ detail: initialScrollFrame })
      return removeScrollListeners
    }
    initBeams()
    resize()
    // Parent layout effects can publish before this passive effect mounts.
    // Restore that frame before any observer is allowed to start the clock.
    if (initialScrollFrame) handleScroll({ detail: initialScrollFrame })
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(handleResize) : null
    resizeObserver?.observe(layer)
    // The portrait frame resizes the canvas without resizing the layer.
    resizeObserver?.observe(canvas)
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start(); else stop()
    }, { threshold: 0 }) : null
    if (observer) observer.observe(hero)
    else { visible = true; start() }
    const removeResize = onLayoutResize(handleResize)
    compactMedia.addEventListener('change', handleResize)
    wideMedia.addEventListener('change', handleResize)
    hero.addEventListener('pointermove', handlePointerMove, { passive: true })
    hero.addEventListener('pointerleave', handlePointerLeave, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
    beamCanvas.addEventListener('webglcontextlost', handleBeamsLost)
    beamCanvas.addEventListener('webglcontextrestored', handleBeamsRestored)
    resumeRef.current = start

    return () => {
      resumeRef.current = null
      disposed = true
      stop()
      observer?.disconnect()
      resizeObserver?.disconnect()
      removeResize()
      compactMedia.removeEventListener('change', handleResize)
      wideMedia.removeEventListener('change', handleResize)
      hero.removeEventListener('pointermove', handlePointerMove)
      hero.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      beamCanvas.removeEventListener('webglcontextlost', handleBeamsLost)
      beamCanvas.removeEventListener('webglcontextrestored', handleBeamsRestored)
      releaseBeams()
      release()
      layer.dataset.render = 'static'
      removeScrollListeners()
    }
  }, [reduced])

  return (
    <div ref={layerRef} className="home-hero-lines" data-render="static" aria-hidden="true">
      {staticRibbons.map(({ compact, paths }) => (
        <svg key={String(compact)} className={`home-hero-lines-still${compact ? ' is-compact' : ''}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
          <g>
            {paths.map(({ key, d, opacity }) => <path key={key} d={d} opacity={opacity} vectorEffect="non-scaling-stroke" />)}
            {paths.filter(({ line }) => Math.abs(line - (compact ? 1.5 : 3)) <= 1).map(({ key, d, side, line }) => (
              <path key={`light:${key}`} className="home-hero-lines-still-light" d={d} pathLength="1" strokeDasharray="0.18 0.82" strokeDashoffset={-(side === 1 ? .1 : .61) - line * .012} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </svg>
      ))}
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="home-hero-lines-shade" />
      <canvas ref={beamCanvasRef} className="home-hero-lines-beams" aria-hidden="true" />
    </div>
  )
}
