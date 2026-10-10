import { Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clubFilm, filmTime } from './openDayFilms.js'
import './open-day-film.css'

const DURATION = filmTime(clubFilm.duration)

function cardCopy(status, elapsed) {
  if (status === 'ended') return { kicker: 'End of film', title: 'Watch again', meta: 'From the start', label: 'Watch the Open Day film again from the start' }
  if (status === 'paused') return { kicker: 'Paused', title: 'Continue', meta: `${filmTime(elapsed)} / ${DURATION}`, label: `Continue the Open Day film from ${filmTime(elapsed)}` }
  return { kicker: 'Club film', title: 'Press play', meta: `${DURATION} / Sound on`, label: `Play the Open Day club film, ${DURATION}, with sound` }
}

export default function OpenDayClubFilm() {
  const frameRef = useRef(null)
  const videoRef = useRef(null)
  const cardRef = useRef(null)
  const focusVideo = useRef(false)
  const [status, setStatus] = useState('idle')
  const [scene, setScene] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [failed, setFailed] = useState(false)
  const started = status !== 'idle'

  useEffect(() => {
    const video = videoRef.current
    const frame = frameRef.current
    if (!video || !frame) return undefined

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && !video.paused) video.pause()
    })
    const pauseForDialog = (event) => {
      if (event.detail?.locked && !video.paused) video.pause()
    }

    observer.observe(frame)
    window.addEventListener('infinity:scroll-lock', pauseForDialog)
    return () => {
      observer.disconnect()
      window.removeEventListener('infinity:scroll-lock', pauseForDialog)
      video.pause()
    }
  }, [])

  useEffect(() => {
    if (status !== 'playing' || !focusVideo.current) return
    videoRef.current?.focus({ preventScroll: true })
    focusVideo.current = false
  }, [status])

  const play = (time) => {
    const video = videoRef.current
    if (!video) return

    focusVideo.current = true
    setFailed(false)
    if (!video.getAttribute('src')) {
      video.src = clubFilm.src
      video.load()
    } else if (video.error) {
      video.load()
    }

    const seek = time ?? (video.ended ? 0 : undefined)
    if (seek !== undefined) {
      if (video.readyState >= 1) video.currentTime = seek
      else video.addEventListener('loadedmetadata', () => { video.currentTime = seek }, { once: true })
    }

    video.play().catch((error) => {
      if (error.name === 'AbortError') return
      setFailed(true)
      focusVideo.current = false
      cardRef.current?.focus({ preventScroll: true })
    })
  }

  const track = () => {
    const time = videoRef.current?.currentTime ?? 0
    setElapsed(Math.floor(time))
    setScene(Math.max(0, clubFilm.scenes.findLastIndex((item) => time >= item.time - 0.05)))
  }

  const card = cardCopy(status, elapsed)

  return (
    <section id="club-film" className="od-feature" aria-labelledby="od-feature-title" data-film-state={status}>
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
            <div ref={frameRef} className="od-feature-frame">
              <video
                ref={videoRef}
                width={clubFilm.width}
                height={clubFilm.height}
                poster={clubFilm.poster}
                preload="none"
                playsInline
                controls={started}
                tabIndex={started ? 0 : -1}
                aria-label={clubFilm.description}
                onPlay={() => setStatus('playing')}
                onPause={(event) => setStatus(event.currentTarget.ended ? 'ended' : 'paused')}
                onEnded={() => setStatus('ended')}
                onTimeUpdate={track}
                onCanPlay={() => setFailed(false)}
                onError={() => setFailed(true)}
              >
                <a href={clubFilm.src}>Download the Infinity Club film</a>
              </video>
              <span className="od-feature-shade" aria-hidden="true" />
              <button ref={cardRef} type="button" className="od-feature-play" data-state={status} hidden={status === 'playing'} onClick={() => play()} aria-label={card.label}>
                <span className="od-feature-play-mark" aria-hidden="true">{status === 'ended' ? <RotateCcw size={20} /> : <Play size={20} />}</span>
                <span className="od-feature-play-copy" aria-hidden="true"><span className="od-label">{card.kicker}</span><strong>{card.title}</strong><span className="od-label">{card.meta}</span></span>
              </button>
              <span className="od-feature-corner od-feature-corner--top" aria-hidden="true" />
              <span className="od-feature-corner od-feature-corner--bottom" aria-hidden="true" />
              <p className="od-feature-error" role="status">{failed && <>The film could not play here. <a href={clubFilm.src}>Open the original file</a>.</>}</p>
            </div>
            <p className="od-feature-credit od-label"><span>Infinity Club original</span><span>05 OCT 2026</span></p>
          </div>

          <aside className="od-feature-chapters" aria-label="Scenes in the film">
            <p className="od-label">Jump into the film</p>
            <ol>
              {clubFilm.scenes.map((item, index) => (
                <li key={item.time}>
                  <button type="button" onClick={() => play(item.time)} aria-current={started && index === scene ? 'true' : undefined}>
                    <span className="od-feature-chapter-time od-label"><span>{String(index + 1).padStart(2, '0')}</span>{filmTime(item.time)}</span>
                    <strong>{item.title}</strong>
                    <span>{item.note}</span>
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
