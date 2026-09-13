import { useEffect, useRef } from 'react'
import InfinityMark from './InfinityMark'
import useInfinityLoaderHandoff from '../hooks/useInfinityLoaderHandoff'
import './infinity-loader.css'

const journey = [
  ['Question', 'Notice what could work better.'],
  ['Prototype', 'Build, test and learn together.'],
  ['Shared project', 'Turn an idea into something useful.'],
]

export default function InfinityLoader({ leaving = false, onComplete }) {
  const loaderRef = useRef(null)
  useInfinityLoaderHandoff(loaderRef, leaving, onComplete)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  return (
    <div
      ref={loaderRef}
      className="infinity-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading Infinity Club"
    >
      <div className="infinity-loader-backdrop" aria-hidden="true" />
      <span className="infinity-loader-place" aria-hidden="true">BBA</span>
      <div className="infinity-loader-shell" aria-hidden="true">
        <div className="infinity-loader-top">
          <p><strong>Infinity Club</strong><span>Scientific and technology club</span></p>
          <p><span>Faculty of Mathematics and Computer Science</span><strong>Bordj Bou Arreridj</strong></p>
        </div>
        <div className="infinity-loader-stage">
          <div className="infinity-loader-emblem">
            <span className="infinity-loader-coordinate">36.07 N<br />4.76 E</span>
            <InfinityMark className="infinity-loader-mark" />
            <i className="infinity-loader-crosshair" />
          </div>
          <div className="infinity-loader-story">
            <p className="infinity-loader-status"><i /> Opening the club</p>
            <ol>
              {journey.map(([title, text], index) => (
                <li key={title} style={{ '--step': index }}><i /><div><strong>{title}</strong><span>{text}</span></div></li>
              ))}
            </ol>
          </div>
        </div>
        <div className="infinity-loader-bottom">
          <p><strong>No Limits For Infiniters</strong><span>Curiosity becomes practice here.</span></p>
          <div className="infinity-loader-progress"><i /></div>
          <span className="infinity-loader-count">2.5 seconds to enter</span>
        </div>
      </div>
    </div>
  )
}
