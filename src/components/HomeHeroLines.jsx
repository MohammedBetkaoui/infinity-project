import { useEffect, useRef } from 'react'
import useMotionPreference from '../hooks/useMotionPreference'
import { HERO_ENERGY_DURATION, HERO_ENERGY_START, HERO_LIGHT_EVENT, homeLinesFragmentShader, homeLinesVertexShader, measureRibbon, ribbonPath } from '../lib/homeHeroLines'
import './home-hero-lines.css'

const staticRibbons = [false, true].map(compact => ({
  compact,
  paths: [-1, 1].flatMap(side => Array.from({ length: compact ? 4 : 7 }, (_, line) => ({
    key: `${side}:${line}`, side, line, d: ribbonPath(side, line, compact),
    opacity: .28 + line * (compact ? .07 : .04),
  }))),
}))

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

export default function HomeHeroLines({ held = false }) {
  const layerRef = useRef(null)
  const canvasRef = useRef(null)
  const heldRef = useRef(held)
  const resumeRef = useRef(null)
  const reduced = useMotionPreference()

  // While the home loader covers the Hero, the scene waits on its first frame:
  // the currents, and the title light that follows them, start at the handoff.
  useEffect(() => {
    heldRef.current = held
    if (!held) resumeRef.current?.()
  }, [held])

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    const hero = layer?.parentElement
    if (!layer || !canvas || !hero) return undefined
    layer.dataset.render = 'static'
    layer.dataset.motion = reduced ? 'reduced' : 'paused'
    const notifyLight = (mode, elapsed = 0, delta = 0) => {
      hero.dispatchEvent(new CustomEvent(HERO_LIGHT_EVENT, { detail: { mode, elapsed, delta } }))
    }
    // Reduced motion uses the SVG, without a GPU context or a frame loop.
    if (reduced) { notifyLight('static'); return undefined }

    const compactMedia = window.matchMedia('(max-width: 767px), (pointer: coarse)')
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
      layer.dataset.motion = 'paused'
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
    const initialize = () => {
      try {
        gl = canvas.getContext('webgl', {
          alpha: true, antialias: false, depth: false, stencil: false,
          preserveDrawingBuffer: false, powerPreference: 'low-power',
        })
        if (!gl) return false
        program = createProgram(gl)
        buffer = gl.createBuffer()
        if (!program || !buffer) { release(); return false }
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        phaseLocation = gl.getUniformLocation(program, 'uPhase')
        lightLocations = Object.fromEntries(['uIntro', 'uCompact', 'uHover', 'uPointer', 'uSize', 'uScroll', 'uScrollActive'].map(name => [name, gl.getUniformLocation(program, name)]))
        for (const [name, size, offset] of [['aPosition', 2, 0], ['aEdge', 1, 2], ['aOpacity', 1, 3], ['aOffset', 1, 4], ['aTravel', 1, 5]]) {
          const location = gl.getAttribLocation(program, name)
          gl.enableVertexAttribArray(location)
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 24, offset * 4)
        }
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.clearColor(0, 0, 0, 0)
        return true
      } catch {
        release()
        return false
      }
    }
    const resize = () => {
      if (!program || lost) return
      // CSS gives the compact symbol its own proportional frame. Measure that
      // frame so WebGL and the static SVG share the same responsive silhouette.
      width = Math.max(1, canvas.clientWidth)
      height = Math.max(1, canvas.clientHeight)
      compact = compactMedia.matches
      if (compact) { pointerX = 0; pointerY = 0; targetX = 0; targetY = 0; hover = 0; targetHover = 0 }
      // Bound the pixel budget; mobile also halves geometry and refresh rate.
      const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.5)
      const scale = Math.min(dpr, Math.sqrt((compact ? 420000 : 1600000) / (width * height)))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      points = compact ? 65 : 129
      vertices = new Float32Array(2 * (compact ? 4 : 7) * points * 2 * 6)
      curves = Array.from({ length: (compact ? 4 : 7) * 2 }, () => ({
        positions: new Float32Array(points * 2), distances: new Float32Array(points), length: 0,
      }))
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW)
      layer.dataset.quality = compact ? 'mobile' : 'desktop'
    }
    const draw = () => {
      if (!program || lost || !vertices) return
      let offset = 0
      const lineCount = compact ? 4 : 7
      const halfWidth = compact ? 4.5 : 9
      for (let line = 0; line < lineCount; line++) {
        for (const [sideIndex, side] of [[0, -1], [1, 1]]) {
          const curve = curves[sideIndex * lineCount + line]
          curve.length = measureRibbon(curve.positions, curve.distances, side, line, elapsed, compact, width, height)
        }
      }
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
            for (const edge of [-1, 1]) {
              vertices[offset++] = (curve.positions[point * 2] + normalX * edge + pointerX) / width * 2 - 1
              vertices[offset++] = 1 - (curve.positions[point * 2 + 1] + normalY * edge + pointerY) / height * 2
              vertices[offset++] = edge
              vertices[offset++] = opacity
              // A 0.14s delay from one fibre to the next gives the fine head
              // about 3–5 neighbouring bright lines, followed by a softer wake.
              vertices[offset++] = (line - (lineCount - 1) / 2) * .013
              vertices[offset++] = travel
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
      gl.uniform1f(lightLocations.uScroll, Number(hero.style.getPropertyValue('--hero-light-scroll')) || 0)
      gl.uniform1f(lightLocations.uScrollActive, Number(hero.style.getPropertyValue('--hero-light-scroll-active')) || 0)
      gl.uniform2f(lightLocations.uPointer, mouseX, mouseY)
      gl.uniform2f(lightLocations.uSize, width, height)
      const stripSize = points * 2
      for (let strip = 0; strip < lineCount * 2; strip++) gl.drawArrays(gl.TRIANGLE_STRIP, strip * stripSize, stripSize)
      layer.dataset.render = 'webgl'
    }
    const tick = timestamp => {
      frame = 0
      if (disposed || !visible || document.hidden || lost || !program) return
      const delta = lastTimestamp ? timestamp - lastTimestamp : 0
      if (!lastTimestamp || delta >= (compact ? 1000 / 24 : 1000 / 30) - 1) {
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
      if (disposed || frame || !visible || document.hidden || lost || !program) return
      // Held: draw the first frame (so WebGL replaces the still SVG under the
      // loader) without starting the clock.
      if (heldRef.current) { draw(); return }
      layer.dataset.motion = 'animated'
      frame = window.requestAnimationFrame(tick)
    }
    const handleResize = () => {
      resize()
      if (visible && !document.hidden) draw()
      start()
    }
    const handlePointerMove = event => {
      if (compact || !fineMedia.matches || event.pointerType === 'touch') return
      const bounds = hero.getBoundingClientRect()
      targetMouseX = (event.clientX - bounds.left) / bounds.width
      targetMouseY = (event.clientY - bounds.top) / bounds.height
      targetX = (targetMouseX - .5) * 12
      targetY = (targetMouseY - .5) * 8
      targetHover = 1
    }
    const handlePointerLeave = () => { targetX = 0; targetY = 0; targetHover = 0 }
    const handleVisibility = () => { if (document.hidden) stop(); else start() }
    const handleContextLost = event => {
      event.preventDefault()
      lost = true
      fallback()
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

    if (!initialize()) { fallback(); return undefined }
    resize()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(handleResize) : null
    resizeObserver?.observe(layer)
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start(); else stop()
    }, { threshold: 0 }) : null
    if (observer) observer.observe(hero)
    else { visible = true; start() }
    window.addEventListener('resize', handleResize, { passive: true })
    compactMedia.addEventListener('change', handleResize)
    hero.addEventListener('pointermove', handlePointerMove, { passive: true })
    hero.addEventListener('pointerleave', handlePointerLeave, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
    resumeRef.current = start

    return () => {
      resumeRef.current = null
      disposed = true
      stop()
      observer?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleResize)
      compactMedia.removeEventListener('change', handleResize)
      hero.removeEventListener('pointermove', handlePointerMove)
      hero.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      release()
      layer.dataset.render = 'static'
    }
  }, [reduced])

  return (
    <div ref={layerRef} className="home-hero-lines" data-render="static" aria-hidden="true">
      {staticRibbons.map(({ compact, paths }) => (
        <svg key={String(compact)} className={`home-hero-lines-still${compact ? ' is-compact' : ''}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
          {paths.map(({ key, d, opacity }) => <path key={key} d={d} opacity={opacity} vectorEffect="non-scaling-stroke" />)}
          {paths.filter(({ line }) => Math.abs(line - (compact ? 1.5 : 3)) <= 1).map(({ key, d, side, line }) => (
            <path key={`light:${key}`} className="home-hero-lines-still-light" d={d} pathLength="1" strokeDasharray="0.18 0.82" strokeDashoffset={-(side === 1 ? .1 : .61) - line * .012} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      ))}
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="home-hero-lines-shade" />
    </div>
  )
}
