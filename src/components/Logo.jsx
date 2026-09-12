import { INFINITY_PATH } from '../lib/infinityMotion'

export default function Logo({ compact = false, scrollLinked = false, descriptor, className = '', onClick }) {
  return (
    <a
      href="#accueil"
      onClick={onClick}
      className={`group inline-flex items-center gap-3 ${className}`}
      aria-label="Infinity Club - Home"
    >
      <span className="brand-symbol relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-cream text-background shadow-[0_0_20px_rgba(164,229,204,.12)]">
        <svg viewBox="0 0 48 48" className="brand-mark size-7" aria-hidden="true">
          <path
            d="M13 12h19l-8 8h-9l-5 5 5 5h9l8 8H13L0 25 13 12Z"
            fill="currentColor"
            className="text-primary-dark"
          />
          <path d="m31 12 13 13-13 13h-7l13-13-13-13h7Z" fill="currentColor" className="text-primary" />
          <path d="m19 20 9 5-9 5 4-5-4-5Z" fill="#0b4b37" />
        </svg>
        {scrollLinked && (
          <svg className="brand-journey" viewBox="0 0 580 480" fill="none" aria-hidden="true">
            <g transform="rotate(-23 290 240)">
              <path d={INFINITY_PATH} stroke="#68a78f" strokeWidth="18" opacity=".32" />
              <path className="brand-journey-ink" d={INFINITY_PATH} stroke="#0b4b37" strokeWidth="22" strokeLinecap="round" />
              <g className="brand-journey-head"><circle r="29" fill="#041f17" /></g>
            </g>
          </svg>
        )}
      </span>
      {!compact && (
        <span className="brand-copy">
          <span className="font-display text-xl font-bold tracking-[0.18em] text-cream">INFINITY</span>
          {descriptor && <span className="brand-descriptor">{descriptor}</span>}
        </span>
      )}
    </a>
  )
}
