import { useRef } from 'react'
import useAivexLogoHandoff from '../pages/aivex/useAivexLogoHandoff'
import './aivex-loader.css'

// Exact artwork from public/assets/aivex/logo.svg (same shapes, same colours),
// defined once and shown through five windows — one tile per letter. Each tile
// runs the same snake keyframes with a staggered phase (see --i in CSS), so the
// wave travels A → X like a serpent instead of pulsing as a single block.
const LOGO_STYLE = '.axld-1{fill:#fcfcfc;}.axld-1,.axld-2,.axld-3,.axld-5{stroke:#000;stroke-miterlimit:10;stroke-width:20px;}.axld-2{fill:#930036;}.axld-3{fill:#dc004d;}.axld-4,.axld-5{fill:#fff;}'

const LOGO_SHAPES = '<rect class="axld-1" x="812.38" y="10" width="802.4" height="806.2"/>'
  + '<path class="axld-2" d="M3219.61,10H3999a23,23,0,0,1,23,23V793.2a23,23,0,0,1-23,23h-779.4a0,0,0,0,1,0,0V10A0,0,0,0,1,3219.61,10Z"/>'
  + '<polygon points="3896.13 666.55 3757.71 666.55 3691.09 584.29 3620.82 497.53 3590.53 460.1 3551.6 412.04 3517.17 369.52 3421.05 250.82 3347.21 159.65 3485.66 159.65 3559.49 250.82 3620.82 326.55 3655.62 369.52 3690.05 412.04 3728.97 460.1 3829.51 584.29 3896.13 666.55"/>'
  + '<polygon points="3604.1 518.15 3550.55 584.29 3483.93 666.55 3345.49 666.55 3412.11 584.29 3512.68 460.1 3534.88 432.69 3557.09 460.1 3604.1 518.15"/>'
  + '<polygon points="3894.43 159.65 3820.6 250.82 3724.47 369.52 3703.26 395.72 3682.04 369.52 3634.03 310.26 3682.15 250.82 3755.99 159.65 3894.43 159.65"/>'
  + '<path class="axld-3" d="M32.82,10H812.4a0,0,0,0,1,0,0V816.2a0,0,0,0,1,0,0H32.82A22.82,22.82,0,0,1,10,793.38V32.82A22.82,22.82,0,0,1,32.82,10Z"/>'
  + '<polygon class="axld-4" points="709.07 666.55 586.1 666.55 547.74 584.29 489.83 460.1 447.57 369.52 412.18 293.6 376.79 369.52 334.55 460.1 276.64 584.29 238.28 666.55 113.33 666.55 151.69 584.29 209.6 460.1 251.84 369.52 307.2 250.82 349.71 159.65 472.69 159.65 473.68 161.74 515.2 250.82 570.57 369.52 612.8 460.1 670.71 584.29 709.07 666.55"/>'
  + '<rect class="axld-5" x="2417.18" y="10" width="802.4" height="806.2"/>'
  + '<polygon points="3037.3 584.29 3037.3 666.55 2599.47 666.55 2599.47 159.65 2705.98 159.65 2705.98 584.29 3037.3 584.29"/>'
  + '<rect x="2742.05" y="159.65" width="295.25" height="91.17"/>'
  + '<rect x="2742.05" y="369.52" width="255.96" height="90.58"/>'
  + '<rect x="1160.33" y="159.65" width="106.51" height="506.91"/>'
  + '<rect class="axld-2" x="1614.82" y="10" width="802.4" height="806.2"/>'
  + '<polygon class="axld-4" points="2311.91 159.65 2269.39 250.82 2214.03 369.52 2171.8 460.1 2113.89 584.29 2078.05 661.15 2075.53 666.55 1956.52 666.55 1954 661.15 1918.16 584.29 1860.25 460.1 1818.02 369.52 1762.66 250.82 1720.14 159.65 1844.18 159.65 1886.7 250.82 1942.06 369.52 1984.3 460.1 2016.04 528.14 2047.75 460.1 2089.99 369.52 2145.35 250.82 2187.86 159.65 2311.91 159.65"/>'

// One window per letter tile of the original 4032.01-wide artwork.
const TILE_WINDOWS = [
  { letter: 'A', viewBox: '10 0 802.4 826.2' },
  { letter: 'I', viewBox: '812.38 0 802.4 826.2' },
  { letter: 'V', viewBox: '1614.82 0 802.4 826.2' },
  { letter: 'E', viewBox: '2417.18 0 802.4 826.2' },
  { letter: 'X', viewBox: '3219.61 0 802.4 826.2' },
]

export default function AivexLoader({ ready, onComplete }) {
  const loaderRef = useRef(null)
  useAivexLogoHandoff(loaderRef, ready, onComplete)
  return (
    <div ref={loaderRef} className="aivex-loader" role="status" aria-live="polite" aria-label="Loading the AIVEX page">
      <div className="aivex-loader-backdrop" aria-hidden="true" />
      <div className="aivex-loader-content" aria-hidden="true">
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
          <defs>
            <style>{LOGO_STYLE}</style>
            <g id="aivex-letter-art" dangerouslySetInnerHTML={{ __html: LOGO_SHAPES }} />
          </defs>
        </svg>
        <div className="aivex-loader-mark">
          {TILE_WINDOWS.map((tile, index) => (
            <span key={tile.letter} className="aivex-loader-tile" style={{ '--i': index }}>
              <svg viewBox={tile.viewBox} aria-hidden="true" focusable="false"><use href="#aivex-letter-art" /></svg>
            </span>
          ))}
        </div>
        <div className="aivex-loader-caption"><span>2nd edition</span><span>Loading...</span></div>
      </div>
    </div>
  )
}
