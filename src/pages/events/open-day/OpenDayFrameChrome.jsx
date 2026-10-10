// The film's viewfinder language on every photograph: a shutter the exposure
// lifts (hidden unless that runs), two corner marks and the frame's code on
// the contact sheet. Decoration only, so it stays out of the accessibility tree.
export default function OpenDayFrameChrome({ frame }) {
  return (
    <>
      <span className="od-photo-corner od-photo-corner--top" aria-hidden="true" />
      <span className="od-photo-corner od-photo-corner--bottom" aria-hidden="true" />
      <span className="od-frame-code od-label" aria-hidden="true">FR {String(frame).padStart(2, '0')} · 05.10.26</span>
      <span className="od-photo-shutter" aria-hidden="true" />
    </>
  )
}
