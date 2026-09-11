import { MoonStar } from 'lucide-react'

// Original typographic studies, not photographs or official event posters.
export default function EventArtwork({ variant }) {
  return (
    <div className={`event-artwork artwork-${variant}`} aria-hidden="true" data-aivex-network={variant === 'ai' ? '' : undefined}>
      <div className="poster-register"><span>Infinity Club</span><span>Faculté MI / BBA</span></div>
      {variant === 'ai' && <>
        <svg viewBox="0 0 600 360" className="poster-network">
          <g fill="none" stroke="#a2b389" strokeWidth="1" opacity=".65">
            <path className="event-network-path" pathLength="1" d="M310 34 463 86 567 26M310 34 352 183 463 86 568 203" />
            <path className="event-network-path" pathLength="1" d="M352 183 487 316 568 203 463 86M352 183 568 203" />
            <path className="event-network-path" pathLength="1" d="m487 316 80-290M310 34l177 282" />
          </g>
          <g fill="#c2dcab">{[[310,34],[463,86],[567,26],[352,183],[568,203],[487,316]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="3" />)}</g>
        </svg>
        <div className="poster-title">AI<span>VEX</span></div>
        <p className="poster-foot">Comprendre. Expérimenter. Imaginer.</p>
      </>}
      {variant === 'design' && <>
        <div className="design-cutout" />
        <div className="poster-title">Design<br /><span>Lab.</span></div>
        <span className="design-edition">v2</span>
        <p className="poster-foot">Du brouillon à l’identité.</p>
      </>}
      {variant === 'ramadan' && <>
        <div className="ramadan-arch"><MoonStar size={40} strokeWidth={1} /></div>
        <div className="poster-title">Ramadan<br /><span>Conferences</span></div>
        <p className="poster-foot">Le temps d’échanger.</p>
      </>}
      {variant === 'access' && <>
        <div className="access-prompt">&gt; l’aventure commence ici_</div>
        <div className="poster-title">ACCESS<span>0</span></div>
        <div className="access-door"><span>↳</span></div>
        <p className="poster-foot">Un premier pas. Toutes les possibilités.</p>
      </>}
    </div>
  )
}
