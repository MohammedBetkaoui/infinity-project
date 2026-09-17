const route = 'M64 96C102 27 243 42 268 102C293 162 369 151 408 206C457 281 300 351 235 300C164 244 80 318 64 248'

export default function AboutProcessScene() {
  return (
    <figure className="about-process-scene">
      <div className="about-scene-top"><span>Inside the workshop</span><span aria-hidden="true">INFINITY</span></div>
      <svg viewBox="0 0 480 380" fill="none" aria-hidden="true">
        <path className="about-process-guide" d={route} />
        <path className="about-process-ink" d={route} />
        <g className="about-scene-sketch">
          <path d="M119 127L340 116L350 256L131 268Z" />
          <path d="M143 151L228 147M144 172L199 170M151 242L321 233" />
          <circle cx="286" cy="175" r="25" />
          <path d="M150 222L196 192L229 215L288 202L320 224" />
        </g>
        <g className="about-scene-prototype">
          <rect x="106" y="109" width="268" height="163" rx="5" />
          <path d="M106 138H374M120 123H124M135 123H139M150 123H154" />
          <g className="about-scene-code">
            <circle cx="172" cy="190" r="19" />
            <path d="M205 172L234 190L205 208Z" />
            <path d="M151 239H229" />
          </g>
          <rect x="271" y="161" width="76" height="84" rx="2" />
          <path d="M282 177H331M282 190H314M282 223H321" />
        </g>
        <g className="about-scene-shared">
          <path d="M240 157L157 235M240 157L323 235M157 235H323" />
          <circle cx="240" cy="143" r="32" />
          <circle cx="145" cy="247" r="27" />
          <circle cx="335" cy="247" r="27" />
          <path d="M229 144L237 152L253 134M137 247H153M145 239V255M326 247L333 254L346 240" />
        </g>
        <circle className="about-process-head" r="4" />
      </svg>
      <figcaption>
        <span>A working idea, in any discipline.</span>
        <span className="about-scene-indicators" aria-hidden="true"><i /><i /><i /></span>
      </figcaption>
    </figure>
  )
}
