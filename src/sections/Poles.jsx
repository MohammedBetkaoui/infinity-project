import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionHeading from '../components/SectionHeading'
import TiltCard from '../components/TiltCard'
import { poles } from '../data/siteData'
import { GSAP_EASE, shouldReduceMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

const treatments = [
  {
    card: 'sm:col-span-2 lg:col-span-2 xl:col-span-2 rounded-tl-[3rem] rounded-br-lg bg-cream text-ink',
    icon: 'bg-ink text-primary',
    title: 'text-ink',
    body: 'text-ink/65',
    focus: 'border-ink/20 text-primary-dark',
  },
  {
    card: 'rounded-sm bg-olive-dark text-cream',
    icon: 'bg-sage text-ink',
    title: 'text-cream',
    body: 'text-sage',
    focus: 'border-sage/25 text-sage',
  },
  {
    card: 'rounded-none border-y border-olive/30 bg-transparent',
    icon: 'border border-olive/40 text-sage',
    title: 'text-cream',
    body: 'text-text-muted',
    focus: 'border-olive/25 text-olive',
  },
  {
    card: 'rounded-tr-[3rem] rounded-bl-lg bg-surface-light',
    icon: 'bg-primary-dark text-cream',
    title: 'text-cream',
    body: 'text-text-muted',
    focus: 'border-white/10 text-sage',
  },
  {
    card: 'rounded-none bg-[#20291f]',
    icon: 'bg-background text-primary',
    title: 'text-cream',
    body: 'text-sage',
    focus: 'border-primary/15 text-primary',
  },
  {
    card: 'rounded-bl-[3rem] rounded-tr-lg bg-sand text-ink',
    icon: 'bg-olive-dark text-cream',
    title: 'text-ink',
    body: 'text-ink/65',
    focus: 'border-ink/20 text-olive-dark',
  },
  {
    card: 'rounded-lg border border-dashed border-olive/40 bg-transparent',
    icon: 'bg-olive/15 text-primary',
    title: 'text-cream',
    body: 'text-text-muted',
    focus: 'border-olive/25 text-sage',
  },
]

export default function Poles() {
  const sectionRef = useRef(null)
  const gridRef = useRef(null)

  useLayoutEffect(() => {
    const section = sectionRef.current
    const grid = gridRef.current
    if (!section || !grid || shouldReduceMotion()) return undefined

    let resizeObserver
    const context = gsap.context(() => {
      const cards = gsap.utils.toArray('[data-pole-card]')
      const paths = gsap.utils.toArray('.pole-connection')

      const positionConnections = () => {
        const gridBounds = grid.getBoundingClientRect()
        paths.forEach((path, index) => {
          const start = cards[index]?.getBoundingClientRect()
          const end = cards[index + 1]?.getBoundingClientRect()
          if (!start || !end) return

          const startX = start.left - gridBounds.left + start.width / 2
          const startY = start.top - gridBounds.top + start.height / 2
          const endX = end.left - gridBounds.left + end.width / 2
          const endY = end.top - gridBounds.top + end.height / 2
          const curve = Math.max(24, Math.abs(endY - startY) * 0.22)
          path.setAttribute('d', `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`)
        })
      }

      positionConnections()
      resizeObserver = new ResizeObserver(positionConnections)
      resizeObserver.observe(grid)

      gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1, opacity: 0 })
      gsap.timeline({
        scrollTrigger: {
          trigger: grid,
          start: 'top 78%',
          once: true,
        },
      })
        .set(paths, { opacity: 0.62 })
        .to(paths, {
          strokeDashoffset: 0,
          duration: 0.58,
          ease: GSAP_EASE.smooth,
          stagger: (index) => [0, 0.08, 0.19, 0.33, 0.5, 0.62][index],
        })
        .to(paths, { opacity: 0, duration: 0.7, stagger: 0.035, ease: 'power2.out' }, '+=0.3')
    }, section)

    return () => {
      resizeObserver?.disconnect()
      context.revert()
    }
  }, [])

  return (
    <section id="poles" ref={sectionRef} className="relative scroll-mt-20 bg-surface py-20 sm:py-24 lg:py-28">
      <div className="absolute inset-0 bg-grid-fade bg-[size:58px_58px] opacity-20 [mask-image:linear-gradient(to_bottom,transparent,black,transparent)]" />
      <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            title="Sept terrains pour essayer, apprendre et transmettre."
            description="Les pôles sont les ateliers permanents du club. On peut y découvrir une discipline, pratiquer avec le groupe puis contribuer à un projet collectif."
          />
          <p className="max-w-[34ch] border-l border-olive pl-5 text-sm leading-6 text-sage lg:text-right lg:border-l-0 lg:border-r lg:pl-0 lg:pr-5">
            Aucun parcours imposé : les Infiniters circulent entre technique, création et communication selon leurs projets.
          </p>
        </div>

        <div ref={gridRef} className="relative mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <svg className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible opacity-0 motion-reduce:hidden" aria-hidden="true">
            {poles.slice(1).map((pole) => (
              <path key={pole.title} className="pole-connection" pathLength="1" fill="none" stroke="#B3E49A" strokeWidth="1.25" strokeLinecap="round" />
            ))}
          </svg>

          {poles.map((pole, index) => {
            const Icon = pole.icon
            const treatment = treatments[index]
            return (
              <TiltCard
                key={pole.title}
                data-pole-card
                className={`group relative z-10 min-h-56 overflow-hidden p-6 transition-colors duration-300 sm:p-7 ${treatment.card}`}
              >
                <div data-tilt-depth className="relative flex h-full min-h-44 flex-col justify-between gap-9">
                  <div className="flex items-start justify-between gap-4">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-sm ${treatment.icon}`}>
                      <Icon className="size-5" strokeWidth={1.6} />
                    </span>
                    <span className={`max-w-[20ch] border-b pb-2 text-right text-xs leading-5 ${treatment.focus}`}>{pole.focus}</span>
                  </div>
                  <div>
                    <h3 className={`max-w-[16rem] font-display text-card font-semibold ${treatment.title}`}>{pole.title}</h3>
                    <p className={`mt-4 max-w-[48ch] text-sm leading-6 ${treatment.body}`}>{pole.description}</p>
                  </div>
                </div>
              </TiltCard>
            )
          })}

          <a
            href="#contact"
            data-magnetic
            className="group flex items-center justify-between gap-8 border-t border-olive/40 py-7 sm:col-span-2 lg:col-span-3 xl:col-span-4"
          >
            <span className="font-display text-2xl font-semibold text-cream sm:text-3xl">Tu ne sais pas encore quel pôle choisir ?</span>
            <span className="shrink-0 border-b border-primary pb-1 text-sm font-bold text-primary">Viens nous rencontrer</span>
          </a>
        </div>
      </div>
    </section>
  )
}
