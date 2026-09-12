import InfinityMark from './InfinityMark'

export default function Logo({ compact = false, scrollLinked = false, descriptor, className = '', onClick }) {
  return (
    <a
      href="#accueil"
      onClick={onClick}
      className={`group inline-flex items-center gap-3 ${className}`}
      aria-label="Infinity Club - Home"
    >
      <span className="brand-symbol">
        <InfinityMark className="brand-mark" />
        {scrollLinked && (
          <svg className="brand-journey" viewBox="0 0 56 44" fill="none" aria-hidden="true">
            <path className="brand-journey-ink" d="M28 2H50Q54 2 54 6V38Q54 42 50 42H6Q2 42 2 38V6Q2 2 6 2H28" stroke="#0b4b37" strokeWidth="1" strokeLinecap="round" />
            <g className="brand-journey-head"><circle r="1.7" fill="#039869" /></g>
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
