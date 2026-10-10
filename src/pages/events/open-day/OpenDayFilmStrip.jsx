import { filmStrip } from './openDayFilms.js'

const HEIGHT = filmStrip.frames * (filmStrip.frameHeight + filmStrip.gap)

// A 35 mm strip running behind the screen. It repeats the film in stills, so
// it stays out of the accessibility tree. Each wrapper owns one motion:
// shift follows the pointer, drift follows the scroll and the opening, and the
// reel runs with playback through --film-progress (two copies of one sprite).
export default function OpenDayFilmStrip() {
  return (
    <div className="od-strip" aria-hidden="true">
      <div className="od-strip-shift">
        <div className="od-strip-drift">
          <span className="od-strip-code od-label">Infinity Club ◆ 35 ◆ Open Day 05·10·26 ◆ BBA</span>
          <div className="od-strip-gate">
            <div className="od-strip-reel">
              {[0, 1].map((copy) => (
                <img key={copy} src={filmStrip.src} width={filmStrip.frameWidth} height={HEIGHT} alt="" loading="lazy" decoding="async" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
