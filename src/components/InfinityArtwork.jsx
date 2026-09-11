export default function InfinityArtwork() {
  return (
    <div className="infinity-art" aria-hidden="true">
      <div className="art-register"><span>INFINITY CLUB</span><span>BBA, Algérie</span></div>
      <div className="art-depth">
        <div className="art-orbit">
          <svg viewBox="0 0 580 580" fill="none">
            <circle cx="290" cy="290" r="256" stroke="currentColor" strokeWidth=".7" />
            <circle cx="290" cy="34" r="4" fill="currentColor" />
            <circle cx="290" cy="546" r="2" fill="currentColor" />
          </svg>
        </div>
        <svg className="infinity-ribbon" viewBox="0 0 580 480" fill="none">
          <defs>
            <linearGradient id="ribbon-light" x1="50" y1="100" x2="540" y2="380" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E7EDCA" /><stop offset=".38" stopColor="#A9D785" />
              <stop offset=".72" stopColor="#658955" /><stop offset="1" stopColor="#C1DA9E" />
            </linearGradient>
          </defs>
          <path d="M32 240H548M290 28V452" stroke="#788166" strokeWidth=".6" strokeDasharray="3 7" opacity=".5" />
          <g className="ribbon-shape" transform="rotate(-23 290 240)">
            <path className="ribbon-trace" d="M290 240C239 170 197 118 140 118C51 118 42 243 103 288C172 339 235 309 290 240C345 171 408 141 477 192C538 237 529 362 440 362C383 362 341 310 290 240Z" stroke="url(#ribbon-light)" strokeWidth="49" strokeLinecap="round" />
            <path className="ribbon-edge" d="M290 240C239 170 197 118 140 118C51 118 42 243 103 288C172 339 235 309 290 240C345 171 408 141 477 192C538 237 529 362 440 362C383 362 341 310 290 240Z" stroke="#E7EDCA" strokeWidth=".75" opacity=".7" />
          </g>
          <path d="M54 48h16M62 40v16M510 424h16M518 416v16" stroke="#A9B6A1" />
        </svg>
      </div>
      <div className="art-caption"><span>La curiosité comme point de départ.</span><span>∞</span></div>
    </div>
  )
}
