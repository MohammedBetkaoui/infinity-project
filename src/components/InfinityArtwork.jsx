import { INFINITY_PATH } from '../lib/infinityMotion'

export default function InfinityArtwork() {
  return (
    <div className="infinity-art" aria-hidden="true">
      <div className="art-register"><span>INFINITY CLUB</span><span>BBA, Algeria</span></div>
      <div className="art-scroll-depth">
        <div className="art-depth">
          <div className="art-orbit">
            <svg viewBox="0 0 580 580" fill="none">
              <circle className="orbit-intro-line" cx="290" cy="290" r="256" stroke="currentColor" strokeWidth=".7" />
              <circle className="orbit-intro-line" cx="290" cy="290" r="225" stroke="currentColor" strokeWidth=".45" strokeDasharray="2 11" opacity=".4" />
            </svg>
          </div>
          <svg className="infinity-ribbon" viewBox="0 0 580 480" fill="none">
            <defs>
              <linearGradient id="infinity-ink" x1="50" y1="100" x2="540" y2="380" gradientUnits="userSpaceOnUse">
                <stop stopColor="#d2f0e2" /><stop offset=".42" stopColor="#63d5ad" /><stop offset="1" stopColor="#039869" />
              </linearGradient>
              <radialGradient id="infinity-light">
                <stop stopColor="#a4e5cc" stopOpacity=".55" /><stop offset=".38" stopColor="#63d5ad" stopOpacity=".2" /><stop offset="1" stopColor="#63d5ad" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path d="M32 240H548M290 28V452" stroke="#68a78f" strokeWidth=".6" strokeDasharray="3 7" opacity=".3" />
            <g className="ribbon-shape" transform="rotate(-23 290 240)">
              <path className="ribbon-guide" d={INFINITY_PATH} stroke="#039869" strokeWidth="1.2" opacity=".22" />
              <path className="ribbon-trace" d={INFINITY_PATH} stroke="url(#infinity-ink)" strokeWidth="2.2" strokeLinecap="round" />
              <g className="infinity-trail infinity-trail-far"><circle r="9" fill="url(#infinity-light)" /></g>
              <g className="infinity-trail infinity-trail-near"><circle r="13" fill="url(#infinity-light)" /></g>
              <g className="infinity-head">
                <circle r="24" fill="url(#infinity-light)" />
                <circle r="3.3" fill="#d2f0e2" />
              </g>
            </g>
            <path d="M54 48h16M62 40v16M510 424h16M518 416v16" stroke="#b7d1c5" opacity=".7" />
          </svg>
        </div>
      </div>
      <div className="art-caption"><span>Scroll. Watch infinity take shape.</span><span>∞</span></div>
    </div>
  )
}
