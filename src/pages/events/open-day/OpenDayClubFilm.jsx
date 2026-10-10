import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useAnimationContext } from '../../../lib/AnimationContext'
import { clubFilm, filmTime, sceneAt, sceneSpans } from './openDayFilms.js'
import './open-day-film.css'

const DURATION = filmTime(clubFilm.duration)
const CHAPTERS = String(clubFilm.scenes.length).padStart(2, '0')
const SKIP = 5
const HUD_DELAY = 2600
const SEEK_KEYS = { ArrowLeft: -SKIP, ArrowDown: -SKIP, ArrowRight: SKIP, ArrowUp: SKIP, PageDown: -10, PageUp: 10 }
const number = (value) => String(value).padStart(2, '0')
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function cardCopy(status, elapsed) {
  if (status === 'ended') return { kicker: 'End of film', title: 'Watch again', meta: 'From the start', label: 'Watch the Open Day film again from the start' }
  if (status === 'paused') return { kicker: 'Paused', title: 'Continue', meta: `${filmTime(elapsed)} / ${DURATION}`, label: `Continue the Open Day film from ${filmTime(elapsed)}` }
  return { kicker: 'Club film', title: 'Press play', meta: `${DURATION} / Sound on`, label: `Play the Open Day club film, ${DURATION}, with sound` }
}

export default function OpenDayClubFilm() {
  const lenis = useAnimationContext()
  const ringId = useId()
  const sectionRef = useRef(null)
  const frameRef = useRef(null)
  const videoRef = useRef(null)
  const cardRef = useRef(null)
  const toggleRef = useRef(null)
  const controlsRef = useRef(null)
  const seekRef = useRef(null)
  const scrubbing = useRef(false)
  const focusToggle = useRef(false)
  const hideTimer = useRef(0)
  const [status, setStatus] = useState('idle')
  const [scene, setScene] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [failed, setFailed] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [hudAwake, setHudAwake] = useState(true)
  const [preview, setPreview] = useState(null)
  const started = status !== 'idle'
  const playing = status === 'playing'

  // Progress is written straight to CSS, never through React state: the
  // timeline and chapter bars follow every frame without re-rendering.
  const paint = useCallback(() => {
    const time = videoRef.current?.currentTime ?? 0
    sectionRef.current?.style.setProperty('--film-progress', String(Math.min(time / clubFilm.duration, 1)))
    if (seekRef.current && !scrubbing.current) seekRef.current.value = String(time)
  }, [])

  // The controls rest after a moment of playback, unless they are in use.
  const wake = useCallback(() => {
    setHudAwake(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(function rest() {
      if (scrubbing.current || controlsRef.current?.matches(':hover') || frameRef.current?.querySelector(':focus-visible')) {
        hideTimer.current = window.setTimeout(rest, HUD_DELAY)
        return
      }
      setHudAwake(false)
    }, HUD_DELAY)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const frame = frameRef.current
    const timer = hideTimer
    if (!video || !frame) return undefined

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && !video.paused) video.pause()
    })
    const pauseForDialog = (event) => {
      if (event.detail?.locked && !video.paused) video.pause()
    }
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === frame)

    observer.observe(frame)
    window.addEventListener('infinity:scroll-lock', pauseForDialog)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => {
      observer.disconnect()
      window.removeEventListener('infinity:scroll-lock', pauseForDialog)
      document.removeEventListener('fullscreenchange', syncFullscreen)
      window.clearTimeout(timer.current)
      video.pause()
    }
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    let frame = requestAnimationFrame(function tick() {
      paint()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, paint])

  useEffect(() => {
    if (!playing || !focusToggle.current) return
    toggleRef.current?.focus({ preventScroll: true })
    focusToggle.current = false
  }, [playing])

  // A chapter pressed below the fold should not play out of sight.
  const bringIntoView = () => {
    const frame = frameRef.current
    if (!frame || document.fullscreenElement) return
    const box = frame.getBoundingClientRect()
    const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
    if (visible >= Math.min(box.height, window.innerHeight) * .8) return
    const top = window.scrollY + box.top + box.height / 2 - window.innerHeight / 2
    if (lenis?.current) lenis.current.scrollTo(top, { duration: .9 })
    else window.scrollTo({ top, behavior: reducedMotion() ? 'instant' : 'smooth' })
  }

  const play = (time) => {
    const video = videoRef.current
    if (!video) return

    setFailed(false)
    if (!video.getAttribute('src')) {
      video.src = clubFilm.src
      video.load()
    } else if (video.error) {
      video.load()
    }
    if (video.readyState < 3) setBuffering(true)

    const seek = time ?? (video.ended ? 0 : undefined)
    if (seek !== undefined) {
      if (video.readyState >= 1) video.currentTime = seek
      else video.addEventListener('loadedmetadata', () => { video.currentTime = seek }, { once: true })
    }

    bringIntoView()
    video.play().catch((error) => {
      if (error.name === 'AbortError') return
      setFailed(true)
      setBuffering(false)
      focusToggle.current = false
      cardRef.current?.focus({ preventScroll: true })
    })
  }

  const playFromCard = () => {
    focusToggle.current = true
    play()
  }

  const toggle = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused || video.ended) play()
    else video.pause()
  }

  const seekTo = (time) => {
    const video = videoRef.current
    if (!video || video.readyState < 1) return
    video.currentTime = Math.min(Math.max(time, 0), clubFilm.duration)
    paint()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (video) video.muted = !video.muted
  }

  // The whole frame goes full screen so the custom controls come along; an
  // iPhone only allows the video itself, through its own player.
  const toggleFullscreen = () => {
    const frame = frameRef.current
    if (document.fullscreenElement) document.exitFullscreen?.()
    else if (frame?.requestFullscreen) frame.requestFullscreen().catch(() => {})
    else videoRef.current?.webkitEnterFullscreen?.()
  }

  const track = () => {
    const time = videoRef.current?.currentTime ?? 0
    setElapsed(Math.floor(time))
    setScene(sceneAt(time))
    paint()
  }

  const handlePlay = () => {
    setStatus('playing')
    wake()
  }
  const handlePause = (event) => {
    setBuffering(false)
    setStatus(event.currentTarget.ended ? 'ended' : 'paused')
    paint()
  }
  const handleEnded = () => setStatus('ended')
  const handleSeeked = (event) => {
    const video = event.currentTarget
    if (started && video.paused) setStatus(video.ended ? 'ended' : 'paused')
  }
  const handleWaiting = () => setBuffering(true)
  const handleReady = () => {
    setBuffering(false)
    setFailed(false)
  }
  const handleVolume = (event) => setMuted(event.currentTarget.muted)
  const handleError = () => {
    setBuffering(false)
    setFailed(true)
  }

  // Click toggles playback. On touch, the first tap only brings the controls back.
  const handleSurface = (event) => {
    if (!started) return
    if (event.nativeEvent.pointerType === 'touch' && playing && !hudAwake) {
      wake()
      return
    }
    toggle()
    wake()
  }

  const handleFrameKey = (event) => {
    if (!started || event.altKey || event.ctrlKey || event.metaKey) return
    const key = event.key.toLowerCase()
    const onButton = event.target instanceof Element && event.target.closest('button')
    if (key === 'k' || (key === ' ' && !onButton)) toggle()
    else if (key === 'm') toggleMute()
    else if (key === 'f') toggleFullscreen()
    else if ((key === 'arrowleft' || key === 'arrowright') && event.target !== seekRef.current) {
      seekTo((videoRef.current?.currentTime ?? 0) + (key === 'arrowleft' ? -SKIP : SKIP))
    } else return
    event.preventDefault()
    wake()
  }

  const handleSeekKey = (event) => {
    const time = videoRef.current?.currentTime ?? 0
    if (event.key === 'Home') seekTo(0)
    else if (event.key === 'End') seekTo(clubFilm.duration)
    else if (Object.hasOwn(SEEK_KEYS, event.key)) seekTo(time + SEEK_KEYS[event.key])
    else return
    event.preventDefault()
  }

  const handleScrubHover = (event) => {
    if (event.pointerType === 'touch') return
    const box = event.currentTarget.getBoundingClientRect()
    setPreview(Math.round(Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1) * 400) / 400)
  }

  const card = cardCopy(status, elapsed)
  const previewTime = preview === null ? 0 : preview * clubFilm.duration
  const chapter = clubFilm.scenes[scene]

  return (
    <section ref={sectionRef} id="club-film" className="od-feature" aria-labelledby="od-feature-title" data-film-state={status}>
      <div className="page-container od-feature-shell">
        <header className="od-feature-heading">
          <p className="od-label od-mint">The new club film / Open Day 2026</p>
          <div className="od-feature-title-row">
            <h2 id="od-feature-title">OPEN DAY<br /><span>IN MOTION.</span></h2>
            <p>A portrait of the day, made for the way it was lived: close to the stand, the games, the people and every small discovery between them.</p>
          </div>
        </header>

        <div className="od-feature-layout">
          <aside className="od-feature-context" aria-label="About the film">
            <span className="od-feature-index od-label" aria-hidden="true">02 / FILM</span>
            <p className="od-feature-pull">Thirty-one seconds from inside the Infinity stand.</p>
            <p>From the first screen to the final clue, this new vertical cut keeps the energy of Open Day close and immediate.</p>
            <dl className="od-feature-specs od-label">
              <div><dt>Runtime</dt><dd>{DURATION}</dd></div>
              <div><dt>Format</dt><dd>9:16 portrait</dd></div>
              <div><dt>Sound</dt><dd>Original</dd></div>
            </dl>
          </aside>

          <div className="od-feature-screen-column">
            <div className="od-feature-stage">
              <span className="od-feature-glow" style={{ backgroundImage: `url(${clubFilm.poster})` }} aria-hidden="true" />
              <div
                ref={frameRef}
                className="od-feature-frame"
                data-hud={playing && !hudAwake ? 'hidden' : 'shown'}
                aria-busy={buffering || undefined}
                onPointerMove={started ? wake : undefined}
                onFocus={started ? wake : undefined}
                onKeyDown={handleFrameKey}
              >
                <video
                  ref={videoRef}
                  width={clubFilm.width}
                  height={clubFilm.height}
                  poster={clubFilm.poster}
                  preload="none"
                  playsInline
                  aria-label={clubFilm.description}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onEnded={handleEnded}
                  onTimeUpdate={track}
                  onSeeked={handleSeeked}
                  onWaiting={handleWaiting}
                  onPlaying={handleReady}
                  onCanPlay={handleReady}
                  onVolumeChange={handleVolume}
                  onError={handleError}
                  onClick={handleSurface}
                  onDoubleClick={toggleFullscreen}
                >
                  <a href={clubFilm.src}>Download the Infinity Club film</a>
                </video>
                <span className="od-feature-shade" aria-hidden="true" />
                <span className="od-feature-grain" aria-hidden="true" />
                <span className="od-feature-line" aria-hidden="true" />
                {started && (
                  <p key={scene} className="od-feature-caption" aria-hidden="true">
                    <span className="od-label">Chapter {number(scene + 1)} / {CHAPTERS}</span>
                    <strong>{chapter.title}</strong>
                  </p>
                )}
                {buffering && <span className="od-feature-spinner" aria-hidden="true" />}
                <button ref={cardRef} type="button" className="od-feature-play" data-state={status} hidden={status === 'playing'} onClick={playFromCard} aria-label={card.label}>
                  <span className="od-feature-play-disc" aria-hidden="true">
                    <svg className="od-feature-ring" viewBox="0 0 120 120">
                      <defs><path id={ringId} d="M60 60m-49 0a49 49 0 1 1 98 0a49 49 0 1 1-98 0" /></defs>
                      <text><textPath href={`#${ringId}`} textLength="306" lengthAdjust="spacing">Open Day 2026 · Club film · Original sound · </textPath></text>
                    </svg>
                    <span className="od-feature-play-mark">{status === 'ended' ? <RotateCcw size={22} /> : <Play size={22} />}</span>
                  </span>
                  <span className="od-feature-play-copy" aria-hidden="true"><span className="od-label">{card.kicker}</span><strong>{card.title}</strong><span className="od-label">{card.meta}</span></span>
                </button>

                <div ref={controlsRef} className="od-feature-controls" role="group" aria-label="Film controls" hidden={!started}>
                  <div className="od-feature-scrub" onPointerMove={handleScrubHover} onPointerLeave={() => setPreview(null)}>
                    <span className="od-feature-scrub-track" aria-hidden="true">
                      {sceneSpans.map((span) => <span key={span.start} style={{ '--start': span.start, '--end': span.end, flexGrow: span.end - span.start }}><i /></span>)}
                    </span>
                    <span className="od-feature-scrub-knob" aria-hidden="true" />
                    {preview !== null && (
                      <span className="od-feature-scrub-tip od-label" style={{ '--at': preview }} aria-hidden="true">
                        {filmTime(previewTime)} · {clubFilm.scenes[sceneAt(previewTime)].title}
                      </span>
                    )}
                    <input
                      ref={seekRef}
                      type="range"
                      min="0"
                      max={clubFilm.duration}
                      step="any"
                      defaultValue="0"
                      aria-label="Seek in the film"
                      aria-valuetext={`${filmTime(elapsed)} of ${DURATION}, chapter ${scene + 1}: ${chapter.title}`}
                      onChange={(event) => seekTo(Number(event.currentTarget.value))}
                      onKeyDown={handleSeekKey}
                      onPointerDown={() => { scrubbing.current = true }}
                      onPointerUp={() => { scrubbing.current = false }}
                      onPointerCancel={() => { scrubbing.current = false }}
                      onBlur={() => { scrubbing.current = false }}
                    />
                  </div>
                  <div className="od-feature-bar">
                    <button ref={toggleRef} type="button" onClick={toggle} aria-label={playing ? 'Pause the film' : 'Play the film'}>
                      {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                    </button>
                    <span className="od-feature-time od-label"><span>{filmTime(elapsed)}</span> / {DURATION}</span>
                    <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label="Mute sound">
                      {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Watch full screen'}>
                      {fullscreen ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <span className="od-feature-corner od-feature-corner--top" aria-hidden="true" />
                <span className="od-feature-corner od-feature-corner--bottom" aria-hidden="true" />
                <p className="od-feature-error" role="status">{failed && <>The film could not play here. <a href={clubFilm.src}>Open the original file</a>.</>}</p>
              </div>
            </div>
            <p className="od-feature-credit od-label"><span>Infinity Club original</span><span>05 OCT 2026</span></p>
          </div>

          <aside className="od-feature-chapters" aria-label="Scenes in the film">
            <p className="od-label">Jump into the film</p>
            <ol>
              {clubFilm.scenes.map((item, index) => (
                <li key={item.time}>
                  <button type="button" onClick={() => play(item.time)} aria-current={started && index === scene ? 'true' : undefined} style={{ '--start': sceneSpans[index].start, '--end': sceneSpans[index].end }}>
                    <span className="od-feature-chapter-time od-label"><span>{number(index + 1)}</span>{filmTime(item.time)}</span>
                    <strong>{item.title}</strong>
                    <span className="od-feature-chapter-note">{item.note}</span>
                    <img className="od-feature-chapter-thumb" src={item.thumb} width="96" height="172" alt="" loading="lazy" decoding="async" />
                    <span className="od-feature-chapter-bar" aria-hidden="true"><i /></span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </section>
  )
}
