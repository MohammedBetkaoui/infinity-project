import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight, Cpu, MoonStar, PenTool, Terminal } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import TiltCard from '../components/TiltCard'
import { events } from '../data/siteData'
import { GSAP_EASE, shouldReduceMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

const cardStyles = {
  ai: 'xl:col-span-7 rounded-tl-[2.75rem] rounded-br-md border border-sage/15 bg-background text-cream',
  design: 'xl:col-span-5 rounded-none bg-paper text-ink',
  ramadan: 'xl:col-span-5 rounded-tr-[3.5rem] rounded-bl-md bg-[#253026] text-cream',
  access: 'xl:col-span-7 rounded-bl-[3rem] rounded-tr-md border-l-4 border-primary-dark bg-sand text-ink',
}

function AivexVisual({ event }) {
  return (
    <div data-aivex-network className="relative aspect-[16/9] overflow-hidden rounded-tl-[2.25rem] bg-[#111a14]" aria-hidden="true">
      <div className="absolute inset-0 bg-grid-fade bg-[size:34px_34px] opacity-70" />
      <svg viewBox="0 0 640 360" className="absolute inset-0 size-full">
        <g fill="none" stroke="#788166" strokeWidth="1.5" opacity=".7">
          <path className="event-network-path" pathLength="1" d="M86 226 192 118l105 70 121-94 137 115" />
          <path className="event-network-path" pathLength="1" d="m192 118 12 151 93-81 121 83 0-177" />
          <path className="event-network-path" pathLength="1" d="M86 226 204 269l214 2 137-62" />
        </g>
        <g fill="#8BCB6B">
          <circle className="event-network-node" cx="86" cy="226" r="7" /><circle className="event-network-node" cx="192" cy="118" r="9" />
          <circle className="event-network-node" cx="204" cy="269" r="6" /><circle className="event-network-node" cx="297" cy="188" r="12" />
          <circle className="event-network-node" cx="418" cy="94" r="7" /><circle className="event-network-node" cx="418" cy="271" r="9" />
          <circle className="event-network-node" cx="555" cy="209" r="6" />
        </g>
      </svg>
      <div className="absolute bottom-5 left-6 flex items-center gap-3 text-primary">
        <Cpu className="size-5" />
        <span className="font-display text-2xl font-semibold">{event.code}</span>
      </div>
    </div>
  )
}

function DesignVisual({ event }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#D7CCB8] p-6 text-ink" aria-hidden="true">
      <div className="absolute left-[9%] top-[14%] h-[58%] w-[38%] border-2 border-ink" />
      <div className="absolute right-[10%] top-[24%] h-[54%] w-[38%] bg-primary-dark" />
      <div className="absolute right-[18%] top-[14%] size-20 rounded-full bg-cream" />
      <div className="absolute bottom-6 left-6 flex items-center gap-3">
        <PenTool className="size-5" />
        <span className="font-display text-2xl font-semibold">{event.code}</span>
      </div>
      <span className="absolute left-[15%] top-[25%] font-display text-6xl font-semibold leading-none">D</span>
    </div>
  )
}

function RamadanVisual({ event }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-tr-[3rem] bg-[#18221a]" aria-hidden="true">
      <div className="absolute bottom-0 left-1/2 h-[78%] w-[52%] -translate-x-1/2 rounded-t-full border border-sand/40" />
      <div className="absolute bottom-0 left-1/2 h-[62%] w-[38%] -translate-x-1/2 rounded-t-full bg-olive-dark" />
      <MoonStar className="absolute left-1/2 top-[22%] size-12 -translate-x-1/2 text-sand" strokeWidth={1.25} />
      <div className="absolute bottom-5 left-6 flex items-center gap-3 text-sage">
        <span className="font-display text-2xl font-semibold">{event.code}</span>
      </div>
    </div>
  )
}

function AccessVisual({ event }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#B9AE99] p-6 text-ink" aria-hidden="true">
      <div className="absolute inset-x-[9%] top-[14%] border-t border-ink/35" />
      <div className="absolute left-[9%] top-[23%] font-body text-sm leading-7 tracking-[0.04em] text-ink/70">
        <p>&gt; access --start</p>
        <p>opening first project...</p>
        <p className="text-primary-dark">ready to build</p>
      </div>
      <div className="absolute bottom-0 right-[8%] h-[78%] w-[28%] border-x border-t border-ink/40 bg-cream/30" />
      <div className="absolute bottom-6 left-6 flex items-center gap-3">
        <Terminal className="size-5" />
        <span className="font-display text-2xl font-semibold">{event.code}</span>
      </div>
    </div>
  )
}

function EventVisual({ event }) {
  if (event.visual === 'ai') return <AivexVisual event={event} />
  if (event.visual === 'design') return <DesignVisual event={event} />
  if (event.visual === 'ramadan') return <RamadanVisual event={event} />
  return <AccessVisual event={event} />
}

export default function Events() {
  const years = ['2026', '2025']
  const sectionRef = useRef(null)
  const timelineLineRef = useRef(null)

  useLayoutEffect(() => {
    const section = sectionRef.current
    if (!section || shouldReduceMotion()) return undefined

    const context = gsap.context(() => {
      gsap.fromTo(timelineLineRef.current, {
        scaleY: 0,
        transformOrigin: 'top center',
      }, {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: timelineLineRef.current,
          start: 'top 78%',
          end: 'bottom 38%',
          scrub: true,
        },
      })

      const network = section.querySelector('[data-aivex-network]')
      const paths = gsap.utils.toArray('.event-network-path')
      const nodes = gsap.utils.toArray('.event-network-node')
      gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 })
      gsap.set(nodes, { scale: 0, transformOrigin: 'center center' })

      gsap.timeline({
        scrollTrigger: {
          trigger: network,
          start: 'top 76%',
          once: true,
        },
      })
        .to(paths, {
          strokeDashoffset: 0,
          duration: 0.86,
          ease: GSAP_EASE.smooth,
          stagger: (index) => [0, 0.17, 0.41][index],
        })
        .to(nodes, {
          scale: 1,
          duration: 0.48,
          ease: GSAP_EASE.punchy,
          stagger: (index) => [0, 0.04, 0.12, 0.19, 0.31, 0.42, 0.5][index],
        }, '-=0.72')
    }, section)

    return () => context.revert()
  }, [])

  return (
    <section id="evenements" ref={sectionRef} className="relative scroll-mt-20 overflow-hidden bg-[#101510] py-20 sm:py-24 lg:py-28">
      <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_right_center,rgba(120,129,102,.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12 xl:px-16">
        <SectionHeading
          title="Les rendez-vous qui racontent notre année."
          description="Conférences, laboratoires créatifs et journées de découverte : chaque format répond à une envie concrète des étudiants de la Faculté MI."
        />

        <div className="relative mt-14 sm:mt-16">
          <div ref={timelineLineRef} className="absolute bottom-0 left-[3.4rem] top-5 w-px bg-gradient-to-b from-primary via-olive to-olive/10 sm:left-[5.45rem] lg:left-[9.4rem]" />

          {years.map((year) => {
            const yearEvents = events.filter((event) => event.year === year)
            return (
              <div key={year} className="relative grid grid-cols-[4.5rem_1fr] gap-5 pb-16 last:pb-0 sm:grid-cols-[7rem_1fr] sm:gap-9 lg:grid-cols-[12rem_1fr] lg:gap-14">
                <div className="sticky top-28 h-fit">
                  <p className="origin-top-left rotate-90 translate-x-[3.15rem] font-display text-5xl font-semibold tracking-[-0.04em] text-olive sm:translate-x-[4.95rem] sm:text-7xl lg:translate-x-[8.85rem] lg:text-9xl">{year}</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-12">
                  {yearEvents.map((event) => {
                    const light = event.visual === 'design' || event.visual === 'access'
                    return (
                      <TiltCard key={event.name} className={`group overflow-hidden transition-colors duration-300 ${cardStyles[event.visual]}`}>
                        <EventVisual event={event} />
                        <div data-tilt-depth className="p-5 sm:p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className={`text-sm font-semibold ${light ? 'text-primary-dark' : 'text-sage'}`}>{event.type}</p>
                              <h3 className="mt-2 font-display text-card font-semibold">{event.name}</h3>
                            </div>
                            <a
                              href="https://www.instagram.com/club_.infinity/"
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Voir ${event.name} sur Instagram`}
                              data-magnetic
                              data-ripple
                              className={`grid size-10 shrink-0 place-items-center border transition-colors ${light ? 'border-ink/20 hover:bg-ink hover:text-cream' : 'border-sage/20 text-sage hover:bg-cream hover:text-ink'}`}
                            >
                              <ArrowUpRight className="size-4" />
                            </a>
                          </div>
                          <p className={`mt-4 max-w-[52ch] text-sm leading-6 ${light ? 'text-ink/65' : 'text-text-muted'}`}>{event.description}</p>
                        </div>
                      </TiltCard>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
