import { useEffect, useRef } from 'react'
import { liquidMetalFragmentShader, liquidMetalVertexShader } from '../lib/liquidMetalShader'
import './infinity-liquid-metal.css'

const variants = {
  home: { shader: [1, 1, 1, .13], idle: .46, active: .82, stillTime: 11.7 },
  about: { shader: [.82, .72, .72, .31], idle: .37, active: .72, stillTime: 27.4 },
  community: { shader: [.95, .82, .78, .57], idle: .41, active: .76, stillTime: 42.2 },
  events: { shader: [1.05, 1.05, .92, .79], idle: .45, active: .81, stillTime: 58.6 },
  contact: { shader: [.78, .68, .66, .93], idle: .35, active: .7, stillTime: 73.1 },
}

const fallbackVariant = variants.home

// The page opens on the CSS fallback: the context is created once the title's
// rise has done most of its travel, so the two never share a frame budget.
const SETUP_DELAY_MS = 450
// Frames slower than this were held up by the main thread (a route mounting),
// not by the GPU: they say nothing about the quality the device can afford.
const STALLED_FRAME_MS = 50

const whenIdle = (callback) => {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 600 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(callback, 0)
  return () => window.clearTimeout(handle)
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

// Compiles and links without asking for the result: asking blocks the main
// thread until the driver is done (about 250 ms for this shader on Direct3D).
// The status is read once the driver reports completion (see programSettled).
function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, liquidMetalVertexShader)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, liquidMetalFragmentShader)
  const program = vertexShader && fragmentShader ? gl.createProgram() : null
  if (program) {
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
  }
  if (vertexShader) gl.deleteShader(vertexShader)
  if (fragmentShader) gl.deleteShader(fragmentShader)
  return program
}

// With KHR_parallel_shader_compile the driver compiles in the background and
// can be polled; without it the status read waits, as it always did.
function programSettled(gl, program, parallel) {
  return !parallel || gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)
}

export default function InfinityLiquidMetal({ variant = 'home' }) {
  const layerRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    const hero = layer?.parentElement
    if (!layer || !canvas || !hero) return undefined

    const preset = variants[variant] || fallbackVariant
    const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
    const coarsePointerMedia = window.matchMedia('(pointer: coarse)')
    let gl = null
    let program = null
    let parallel = null
    let positionBuffer = null
    let locations = null
    let frame = 0
    let setupFrame = 0
    let cancelSetup = null
    let disposed = false
    let visible = true
    let reduced = reducedMedia.matches
    let contextLost = false
    let elapsed = preset.stillTime
    let lastTimestamp = 0
    let currentIntensity = preset.idle
    let targetIntensity = preset.idle
    let pointerX = .5
    let pointerY = .5
    let targetPointerX = .5
    let targetPointerY = .5
    let frameAverage = 16.7
    let measuredFrames = 0
    // The first frames share the main thread with the page settling in.
    let warmupFrames = 24
    let qualityScale = 1

    const setFallback = () => {
      layer.dataset.webgl = 'fallback'
      canvas.style.opacity = '0'
    }

    // Context and program, without waiting for the driver to compile.
    const initialize = () => {
      gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'low-power',
      }) || canvas.getContext('experimental-webgl')
      if (!gl) return false
      parallel = gl.getExtension('KHR_parallel_shader_compile')
      program = createProgram(gl)
      return Boolean(program)
    }

    // Once the program is linked: geometry, uniforms, and the canvas fades in
    // over the CSS fallback it replaces.
    const completeSetup = () => {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program)
        program = null
        return false
      }
      positionBuffer = gl.createBuffer()
      if (!positionBuffer) return false

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
      ]), gl.STATIC_DRAW)

      locations = {
        position: gl.getAttribLocation(program, 'aPosition'),
        resolution: gl.getUniformLocation(program, 'uResolution'),
        pointer: gl.getUniformLocation(program, 'uPointer'),
        time: gl.getUniformLocation(program, 'uTime'),
        intensity: gl.getUniformLocation(program, 'uIntensity'),
        variant: gl.getUniformLocation(program, 'uVariant'),
      }

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.enableVertexAttribArray(locations.position)
      gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0)
      gl.uniform4fv(locations.variant, preset.shader)
      gl.clearColor(0, 42 / 255, 30 / 255, 1)
      layer.dataset.webgl = 'ready'
      canvas.style.opacity = '1'
      return true
    }

    const resize = (force = false) => {
      if (!gl || contextLost) return false
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return false

      const constrained = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
        || (navigator.deviceMemory && navigator.deviceMemory <= 4)
      const renderScale = constrained ? .76 : coarsePointerMedia.matches ? .82 : .9
      const effectiveDpr = Math.min(window.devicePixelRatio || 1, 1.5) * renderScale * qualityScale
      const drawingWidth = Math.max(1, Math.round(width * effectiveDpr))
      const drawingHeight = Math.max(1, Math.round(height * effectiveDpr))
      if (!force && Math.abs(canvas.width - drawingWidth) < 2 && Math.abs(canvas.height - drawingHeight) < 2) return false

      canvas.width = drawingWidth
      canvas.height = drawingHeight
      gl.viewport(0, 0, drawingWidth, drawingHeight)
      return true
    }

    const draw = () => {
      if (!gl || !program || !locations || contextLost) return
      gl.useProgram(program)
      gl.uniform2f(locations.resolution, canvas.width, canvas.height)
      gl.uniform2f(locations.pointer, pointerX, pointerY)
      gl.uniform1f(locations.time, reduced ? preset.stillTime : elapsed)
      gl.uniform1f(locations.intensity, currentIntensity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      lastTimestamp = 0
    }

    const tick = (timestamp) => {
      frame = 0
      if (!visible || document.hidden || reduced || contextLost) return
      if (lastTimestamp) {
        const frameDuration = timestamp - lastTimestamp
        elapsed += Math.min(frameDuration / 1000, .05)
        if (warmupFrames > 0) warmupFrames -= 1
        else if (measuredFrames < 46 && frameDuration < STALLED_FRAME_MS) {
          frameAverage += (frameDuration - frameAverage) * .08
          measuredFrames += 1
          if (measuredFrames === 20 && frameAverage > 25) {
            qualityScale = .62
            layer.dataset.quality = 'reduced'
            resize(true)
            frameAverage = 16.7
          } else if (measuredFrames === 45 && frameAverage > 21) {
            qualityScale = .5
            layer.dataset.quality = 'minimum'
            resize(true)
          }
        }
      }
      lastTimestamp = timestamp
      currentIntensity += (targetIntensity - currentIntensity) * .045
      pointerX += (targetPointerX - pointerX) * .055
      pointerY += (targetPointerY - pointerY) * .055
      draw()
      frame = window.requestAnimationFrame(tick)
    }

    const start = () => {
      if (frame || !visible || document.hidden || reduced || contextLost || !locations) return
      frame = window.requestAnimationFrame(tick)
    }

    const drawStillFrame = () => {
      stop()
      currentIntensity = preset.idle
      targetIntensity = preset.idle
      pointerX = .5
      pointerY = .5
      targetPointerX = .5
      targetPointerY = .5
      resize()
      draw()
    }

    const handlePointerEnter = () => {
      if (reduced || !finePointerMedia.matches) return
      targetIntensity = preset.active
    }
    const handlePointerMove = (event) => {
      if (reduced || !finePointerMedia.matches) return
      const bounds = hero.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      targetPointerX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      targetPointerY = 1 - Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
      targetIntensity = preset.active
    }
    const handlePointerLeave = () => {
      targetIntensity = preset.idle
      targetPointerX = .5
      targetPointerY = .5
    }
    const handleVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    const handleMotionPreference = (event) => {
      reduced = event.matches
      layer.dataset.motion = reduced ? 'static' : 'animated'
      if (reduced) drawStillFrame()
      else start()
    }
    // Polled once per frame until the driver is done, then the first frame.
    const awaitProgram = () => {
      setupFrame = 0
      if (disposed || contextLost || !program) return
      if (!programSettled(gl, program, parallel)) {
        setupFrame = window.requestAnimationFrame(awaitProgram)
        return
      }
      if (!completeSetup()) {
        setFallback()
        return
      }
      resize(true)
      if (reduced) drawStillFrame()
      else {
        draw()
        start()
      }
    }
    const boot = () => {
      cancelSetup = null
      if (disposed) return
      if (!initialize()) {
        setFallback()
        return
      }
      awaitProgram()
    }

    const handleContextLost = (event) => {
      event.preventDefault()
      contextLost = true
      stop()
      window.cancelAnimationFrame(setupFrame)
      setupFrame = 0
      layer.dataset.webgl = 'context-lost'
    }
    const handleContextRestored = () => {
      contextLost = false
      program = null
      positionBuffer = null
      locations = null
      boot()
    }

    layer.dataset.motion = reduced ? 'static' : 'animated'
    const setupTimer = window.setTimeout(() => { cancelSetup = whenIdle(boot) }, SETUP_DELAY_MS)
    cancelSetup = () => window.clearTimeout(setupTimer)

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (!resize()) return
          if (reduced || !frame) draw()
        })
      : null
    resizeObserver?.observe(hero)

    const intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting
          if (visible) start()
          else stop()
        }, { rootMargin: '120px 0px' })
      : null
    intersectionObserver?.observe(hero)

    hero.addEventListener('pointerenter', handlePointerEnter, { passive: true })
    hero.addEventListener('pointermove', handlePointerMove, { passive: true })
    hero.addEventListener('pointerleave', handlePointerLeave, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMedia.addEventListener('change', handleMotionPreference)
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    return () => {
      disposed = true
      cancelSetup?.()
      window.cancelAnimationFrame(setupFrame)
      stop()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      hero.removeEventListener('pointerenter', handlePointerEnter)
      hero.removeEventListener('pointermove', handlePointerMove)
      hero.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMedia.removeEventListener('change', handleMotionPreference)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (gl && !contextLost) {
        if (positionBuffer) gl.deleteBuffer(positionBuffer)
        if (program) gl.deleteProgram(program)
      }
    }
  }, [variant])

  return (
    <div ref={layerRef} className={`infinity-liquid-metal infinity-liquid-metal--${variant}`} data-webgl="fallback" aria-hidden="true">
      <canvas ref={canvasRef} className="infinity-liquid-metal-canvas" aria-hidden="true" />
    </div>
  )
}
