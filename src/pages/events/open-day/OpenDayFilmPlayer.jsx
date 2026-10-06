import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import useMotionPreference from '../../../hooks/useMotionPreference'
import { filmTime } from './openDayFilms.js'

export default function OpenDayFilmPlayer({ film, viewerOpen }) {
  const frameRef = useRef(null)
  const videoRef = useRef(null)
  const timeRef = useRef(null)
  const userPaused = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const reduced = useMotionPreference()

  // Only attach the selected source near the viewport. Stop decoding outside
  // the scene, in background tabs and while any site dialog is open.
  useEffect(() => {
    const video = videoRef.current
    let visible = false
    let locked = viewerOpen
    const saveData = Boolean(navigator.connection?.saveData)
    video.pause()
    video.removeAttribute('src')
    video.load()
    const sync = () => {
      if (visible && !video.getAttribute('src') && !saveData) {
        video.src = film.src
        video.load()
      }
      if (visible && !document.hidden && !locked && !reduced && !saveData && !userPaused.current) {
        video.play().catch(() => { /* The manual play button remains available. */ })
      } else if (!visible || document.hidden || locked) video.pause()
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .4
      sync()
    }, { threshold: [0, .4] })
    const lock = (event) => { locked = Boolean(event.detail?.locked); sync() }
    observer.observe(frameRef.current)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('infinity:scroll-lock', lock)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('infinity:scroll-lock', lock)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [film.src, reduced, viewerOpen])

  const toggle = () => {
    const video = videoRef.current
    if (!video.paused) { userPaused.current = true; video.pause(); return }
    userPaused.current = false
    setFailed(false)
    if (!video.getAttribute('src')) { video.src = film.src; video.load() }
    video.play().catch(() => setFailed(true))
  }
  const updateProgress = () => {
    const video = videoRef.current
    if (timeRef.current) timeRef.current.textContent = filmTime(video.currentTime)
  }
  const revealFrame = () => {
    if (!reduced) videoRef.current?.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' })
  }

  return (
    <div className="od-film-presentation">
      <div ref={frameRef} className="od-film-frame">
        <video ref={videoRef} width={film.width} height={film.height} poster={film.poster} preload="none" muted playsInline loop aria-label={film.description}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedData={revealFrame} onCanPlay={() => setFailed(false)} onTimeUpdate={updateProgress} onEmptied={updateProgress} onError={() => setFailed(true)} />
      </div>
      <div className="od-film-controls">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause video preview' : 'Play video preview'}>{playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}<span>{playing ? 'Pause' : 'Play'}</span></button>
        <span className="od-label od-film-clock" aria-hidden="true"><span ref={timeRef}>00:00</span> / {filmTime(film.duration)}</span>
        <span className="od-label">Silent preview</span>
      </div>
      {failed && <p className="od-film-error" role="status">Preview unavailable. <a href={film.src}>Open the original clip</a>.</p>}
    </div>
  )
}
