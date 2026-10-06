import { Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { clubFilm, filmTime } from './openDayFilms.js'
import useOpenDayFilmMotion from './useOpenDayFilmMotion'
import './open-day-film.css'

// A mouse can summon the native controls by hovering; touch screens keep them.
const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const watchPointer = (notify) => {
  const media = window.matchMedia(FINE_POINTER)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const finePointer = () => window.matchMedia(FINE_POINTER).matches

const DURATION = filmTime(clubFilm.duration)

// The cinematic card shown whenever the film is not playing.
function cardCopy(status, elapsed) {
  if (status === 'ended') return { kicker: 'End of film', title: 'Watch again', meta: 'From the start', label: 'Watch again: the club film, from the start' }
  if (status === 'paused') return { kicker: 'Paused', title: 'Resume film', meta: `${filmTime(elapsed)} of ${DURATION}`, label: `Resume film: paused at ${filmTime(elapsed)} of ${DURATION}` }
  return { kicker: 'Watch the day', title: 'Play film', meta: `${DURATION} / Sound on`, label: `Play film: the club film, ${DURATION}, with sound` }
}

export default function OpenDayClubFilm() {
  const sectionRef = useRef(null)
  const frameRef = useRef(null)
  const tiltRef = useRef(null)
  const cardRef = useRef(null)
  const videoRef = useRef(null)
  const focusVideo = useRef(false)
  const [status, setStatus] = useState('idle')
  const [scene, setScene] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const [failed, setFailed] = useState(false)
  const fine = useSyncExternalStore(watchPointer, finePointer, () => false)
  const room = useOpenDayFilmMotion(sectionRef, status === 'playing')
  const started = status !== 'idle'
  // No browser chrome before the first play; after it, controls appear while
  // a mouse hovers the screen or keyboard focus is inside it, and always on
  // touch screens.
  const controls = started && (!fine || hovered || keyboard)

  // Played only on request, with sound. Nothing is fetched before that; once
  // playing, it stops when scrolled out of view or when a site dialog opens.
  useEffect(() => {
    const video = videoRef.current
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) video.pause() })
    const lock = (event) => { if (event.detail?.locked) video.pause() }
    observer.observe(frameRef.current)
    window.addEventListener('infinity:scroll-lock', lock)
    return () => {
      observer.disconnect()
      window.removeEventListener('infinity:scroll-lock', lock)
      video.pause()
    }
  }, [])

  // The card hides on play; hand focus to the film so its controls follow.
  useEffect(() => {
    if (status !== 'playing') return
    if (focusVideo.current) videoRef.current.focus({ preventScroll: true })
    focusVideo.current = false
  }, [status])

  const play = (time) => {
    const video = videoRef.current
    focusVideo.current = true
    setFailed(false)
    if (!video.getAttribute('src')) { video.src = clubFilm.src; video.load() } else if (video.error) video.load()
    const seek = time ?? (video.ended ? 0 : undefined)
    if (seek !== undefined) {
      if (video.readyState >= 1) video.currentTime = seek
      else video.addEventListener('loadedmetadata', () => { video.currentTime = seek }, { once: true })
    }
    room.current.present()
    video.play().catch((error) => {
      if (error.name === 'AbortError') return
      setFailed(true)
      focusVideo.current = false
      cardRef.current?.focus({ preventScroll: true })
    })
  }
  const track = () => {
    const time = videoRef.current.currentTime
    setElapsed(Math.floor(time))
    setScene(Math.max(0, clubFilm.scenes.findLastIndex((item) => time >= item.time - .05)))
  }
  const hover = (value) => (event) => {
    if (event.pointerType !== 'mouse') return
    if (!value && event.buttons) {
      window.addEventListener('pointerup', () => setHovered(Boolean(tiltRef.current?.matches(':hover'))), { once: true })
      return
    }
    setHovered(value)
  }
  const keys = (event) => {
    const video = videoRef.current
    if (controls || !started || event.target !== video || event.altKey || event.ctrlKey || event.metaKey) return
    setKeyboard(true)
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault()
      if (video.paused) play()
      else video.pause()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      video.currentTime = Math.max(0, video.currentTime + (event.key === 'ArrowLeft' ? -5 : 5))
    }
  }
  const card = cardCopy(status, elapsed)

  return (
    <section id="club-film" ref={sectionRef} className="od-feature" aria-labelledby="od-feature-title" data-film-state={status}>
      <div className="od-feature-space">
        <div className="od-feature-stage">
          <div className="od-feature-atmosphere" aria-hidden="true"><span className="od-feature-deep" /><span className="od-feature-glow" /><span className="od-feature-vignette" /><span className="od-feature-dim" /></div>
          <header className="od-feature-heading page-container">
            <div><p className="od-label od-mint od-feature-kicker">The club film / Open Day 2026</p><h2 id="od-feature-title">WELCOME TO <span className="od-feature-accent">INFINITY.</span></h2></div>
            <div className="od-feature-intro">
              <p>Half a minute in the faculty hall: the welcome, the awards on the table, the conversations and the games. Infinity, as students met it on Open Day.</p>
              <dl className="od-feature-specs od-label"><div><dt>Runtime</dt><dd>{DURATION}</dd></div><div><dt>Format</dt><dd>16:9</dd></div><div><dt>Sound</dt><dd>Original</dd></div></dl>
            </div>
          </header>
          <div className="od-feature-scene">
            <div className="od-feature-rig">
              <div ref={tiltRef} className="od-feature-tilt" onPointerEnter={hover(true)} onPointerLeave={hover(false)} onKeyDown={keys}
                onFocus={(event) => setKeyboard(event.target.matches(':focus-visible'))} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboard(false) }}>
                <span className="od-feature-shadow" aria-hidden="true" />
                <span className="od-feature-light" aria-hidden="true" />
                <div ref={frameRef} className="od-feature-frame">
                  <video ref={videoRef} width={clubFilm.width} height={clubFilm.height} poster={clubFilm.poster} preload="none" playsInline controls={controls} tabIndex={started ? 0 : -1} aria-label={clubFilm.description}
                    onPlay={() => setStatus('playing')} onPause={(event) => setStatus(event.currentTarget.ended ? 'ended' : 'paused')} onEnded={() => setStatus('ended')}
                    onTimeUpdate={track} onCanPlay={() => setFailed(false)} onError={() => setFailed(true)}>
                    <a href={clubFilm.src}>Download the Infinity Club film</a>
                  </video>
                  <span className="od-feature-shade" aria-hidden="true" />
                  <span className="od-feature-edge" aria-hidden="true" />
                </div>
                <button ref={cardRef} type="button" className="od-feature-play" data-state={status} hidden={status === 'playing'} onClick={() => play()} aria-label={card.label}>
                  <span className="od-feature-play-inner">
                    <span className="od-feature-play-mark" aria-hidden="true">{status === 'ended' ? <RotateCcw size={22} /> : <Play size={22} />}</span>
                    <span className="od-feature-play-copy" aria-hidden="true"><span className="od-label">{card.kicker}</span><strong>{card.title}</strong><span className="od-label">{card.meta}</span></span>
                  </span>
                </button>
                <span className="od-feature-marks" aria-hidden="true"><span className="od-feature-mark od-feature-mark--tl" /><span className="od-feature-mark od-feature-mark--tr" /><span className="od-feature-mark od-feature-mark--bl" /><span className="od-feature-mark od-feature-mark--br" /></span>
                <p className="od-feature-credits od-label" aria-hidden="true"><span>The club film</span><span>05 Oct 2026</span></p>
                <p className="od-feature-error" role="status">{failed && <>The film could not play here. <a href={clubFilm.src}>Open the original file</a>.</>}</p>
              </div>
            </div>
          </div>
          <ol className="od-feature-scenes" aria-label="Scenes in the film">
            {clubFilm.scenes.map((item, index) => (
              <li key={item.time}>
                <button type="button" onClick={() => play(item.time)} aria-current={started && index === scene ? 'true' : undefined} data-past={started && index < scene ? 'true' : undefined}>
                  <span className="sr-only">Play from </span><span className="od-label">{filmTime(item.time)}</span><strong>{item.title}</strong><span>{item.note}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
