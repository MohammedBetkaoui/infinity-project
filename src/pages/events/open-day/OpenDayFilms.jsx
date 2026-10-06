import { ArrowDown, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import useMotionPreference from '../../../hooks/useMotionPreference'
import { useAnimationContext } from '../../../lib/AnimationContext'
import OpenDayFilmPlayer from './OpenDayFilmPlayer'
import OpenDayFilmViewer from './OpenDayFilmViewer'
import { filmTime, openDayFilms } from './openDayFilms.js'

export default function OpenDayFilms() {
  const sceneRef = useRef(null)
  const selecting = useRef(false)
  const selectionTimer = useRef(null)
  const [index, setIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const reduced = useMotionPreference()
  const lenis = useAnimationContext()
  const film = openDayFilms[index]

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px) and (min-height: 740px)')
    let observer
    const setup = () => {
      observer?.disconnect()
      if (!media.matches || reduced || viewerOpen) return
      observer = new IntersectionObserver((entries) => {
        if (selecting.current) return
        const entry = entries.find((item) => item.isIntersecting)
        if (entry) setIndex(Number(entry.target.dataset.filmIndex))
      }, { rootMargin: '-36% 0px -42% 0px' })
      sceneRef.current.querySelectorAll('.od-film-note').forEach((note) => observer.observe(note))
    }
    setup()
    media.addEventListener('change', setup)
    return () => { observer?.disconnect(); media.removeEventListener('change', setup); window.clearTimeout(selectionTimer.current); selecting.current = false }
  }, [reduced, viewerOpen])

  const select = (next) => {
    setIndex(next)
    if (reduced || !matchMedia('(min-width: 1024px) and (min-height: 740px)').matches) return
    const note = sceneRef.current.querySelector(`[data-film-index="${next}"]`)
    const destination = note.getBoundingClientRect().top + scrollY - innerHeight * .3
    selecting.current = true
    window.clearTimeout(selectionTimer.current)
    const complete = () => { selecting.current = false; window.clearTimeout(selectionTimer.current) }
    selectionTimer.current = window.setTimeout(complete, 1000)
    if (lenis?.current) lenis.current.scrollTo(destination, { duration: .7, onComplete: complete })
    else window.scrollTo({ top: destination, behavior: 'smooth' })
  }

  return (
    <section ref={sceneRef} id="open-day-films" className="od-films" aria-labelledby="od-films-title">
      <div className="od-film-marquee" aria-hidden="true"><span>MEET / ASK / TRY / DISCOVER /</span></div>
      <div className="page-container">
        <header className="od-films-heading"><div><p className="od-label od-mint">The moving archive / Short reels</p><h2 id="od-films-title">SHORT CUTS.<br /><span>FROM THE FLOOR.</span></h2></div><p>Three vertical clips filmed at the stand.<br />Silent previews here; open any reel for its original sound.</p></header>
        <div className="od-film-layout">
          <div className="od-film-screen">
            <OpenDayFilmPlayer film={film} viewerOpen={viewerOpen} />
            <div className="od-film-strip" role="group" aria-label="Choose an Open Day clip">
              {openDayFilms.map((clip, next) => <button key={clip.id} type="button" onClick={() => select(next)} aria-pressed={next === index} aria-label={`Show clip ${next + 1}: ${clip.label}`}><img src={clip.poster} width={540} height={960} alt="" loading="lazy" decoding="async" /><span className="od-label">{String(next + 1).padStart(2, '0')}</span></button>)}
            </div>
            <div className="od-film-caption" aria-live="polite" aria-atomic="true"><strong>{film.label}</strong><span className="od-label">{filmTime(film.duration)} / Original recording</span><p>{film.note}</p></div>
            <button className="od-film-watch od-text-link" type="button" onClick={() => setViewerOpen(true)} aria-haspopup="dialog">Watch with sound <Play size={14} aria-hidden="true" /></button>
            <p className="od-film-scroll-hint od-label">Scroll to the next moment <ArrowDown size={13} aria-hidden="true" /></p>
          </div>
          <div className="od-film-notes">
            {openDayFilms.map((clip, next) => <div key={clip.id} className="od-film-note" data-film-index={next} data-active={index === next ? 'true' : 'false'}><span className="od-film-note-number" aria-hidden="true">{String(next + 1).padStart(2, '0')}</span><p className="od-label od-mint">Reel {String(next + 1).padStart(2, '0')} / {clip.label}</p><h3>{clip.title}</h3><p>{clip.note}</p><span className="od-film-note-rule" aria-hidden="true"><i /></span></div>)}
          </div>
        </div>
      </div>
      {viewerOpen && <OpenDayFilmViewer films={openDayFilms} index={index} onChange={setIndex} onClose={() => setViewerOpen(false)} />}
    </section>
  )
}
