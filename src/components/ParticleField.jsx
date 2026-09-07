const particles = [
  [8, 16, 3, 0], [16, 66, 2, 1.2], [22, 29, 4, 2.7], [31, 82, 2, 0.8],
  [41, 18, 2, 3.1], [48, 62, 3, 1.7], [57, 35, 2, 2.2], [64, 87, 4, 0.4],
  [72, 12, 3, 2.5], [79, 51, 2, 1.1], [87, 25, 4, 3.4], [93, 76, 2, 0.2],
  [12, 91, 2, 2.9], [37, 46, 3, 0.6], [68, 57, 2, 3.6], [84, 91, 3, 1.9],
]

export default function ParticleField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {[0, 1, 2].map((layer) => (
        <div key={layer} data-parallax-depth={0.35 + layer * 0.32} className="absolute inset-0">
          {particles.map(([left, top, size, delay], index) => index % 3 === layer && (
            <span
              key={`${left}-${top}`}
              className={`particle absolute rounded-full bg-primary-glow ${index % 4 === 0 ? 'shadow-[0_0_14px_3px_rgba(183,243,151,.4)]' : ''}`}
              style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
