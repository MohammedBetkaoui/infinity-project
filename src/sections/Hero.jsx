import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowDown, CalendarDays, MapPin, Sparkles } from 'lucide-react'
import ParticleField from '../components/ParticleField'
import { GSAP_EASE, shouldReduceMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

function HeroLine({ children, className = '' }) {
  return (
    <span className={`block ${className}`}>
      {children.split(' ').map((word, index, words) => (
        <span key={`${word}-${index}`} className="inline-block overflow-hidden pb-[.08em] align-top">
          <span className="hero-word inline-block">{word}{index < words.length - 1 ? '\u00A0' : ''}</span>
        </span>
      ))}
    </span>
  )
}

function HeroMark() {
  return (
    <span className="hero-mark relative grid size-14 shrink-0 place-items-center rounded-full border border-cream/20 bg-background/60 backdrop-blur" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="size-8 overflow-visible">
        <circle className="hero-mark-line" pathLength="1" cx="24" cy="24" r="22" fill="none" stroke="#788166" strokeWidth="1" />
        <path className="hero-mark-line" pathLength="1" d="M14 13h17l-7 7h-8l-5 5 5 5h8l7 7H14L2 25 14 13Z" fill="none" stroke="#8BCB6B" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        <path className="hero-mark-line" pathLength="1" d="m31 13 12 12-12 12h-6l12-12-12-12h6Z" fill="none" stroke="#B3E49A" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        <path className="hero-mark-fill" d="m19 20 9 5-9 5 4-5-4-5Z" fill="#F1EBDD" />
      </svg>
    </span>
  )
}

function OrbitScene() {
  return (
    <div className="pointer-events-none absolute -right-[28rem] top-12 size-[50rem] opacity-70 sm:-right-72 lg:right-[-8rem] lg:top-[-7rem] lg:size-[62rem]" aria-hidden="true">
      <div data-parallax-depth="0.45" className="absolute inset-0">
        <svg data-orbit-spin="52" viewBox="0 0 700 700" className="size-full overflow-visible">
          <defs>
            <linearGradient id="orbit-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8BCB6B" stopOpacity="0" />
              <stop offset=".5" stopColor="#B3E49A" stopOpacity=".9" />
              <stop offset="1" stopColor="#557D49" stopOpacity=".05" />
            </linearGradient>
          </defs>
          <ellipse className="hero-orbit-line" pathLength="1" cx="350" cy="350" rx="315" ry="180" fill="none" stroke="url(#orbit-gradient)" strokeWidth="1.2" transform="rotate(-28 350 350)" />
          <circle cx="612" cy="175" r="4" fill="#B3E49A" />
        </svg>
      </div>
      <div data-parallax-depth="0.75" className="absolute inset-[7%]">
        <svg data-orbit-spin="-61" viewBox="0 0 700 700" className="size-full overflow-visible">
          <ellipse className="hero-orbit-line" pathLength="1" cx="350" cy="350" rx="286" ry="148" fill="none" stroke="#8BCB6B" strokeOpacity=".25" strokeWidth="1" transform="rotate(36 350 350)" />
          <circle cx="170" cy="500" r="3" fill="#F1EBDD" />
        </svg>
      </div>
      <div data-parallax-depth="1.05" className="absolute inset-[14%]">
        <svg data-orbit-spin="43" viewBox="0 0 700 700" className="size-full overflow-visible">
          <ellipse className="hero-orbit-line" pathLength="1" cx="350" cy="350" rx="246" ry="112" fill="none" stroke="#F1EBDD" strokeOpacity=".14" strokeWidth="1" transform="rotate(82 350 350)" />
        </svg>
      </div>
    </div>
  )
}

export default function Hero() {
  const sectionRef = useRef(null)
  const stageRef = useRef(null)

  useLayoutEffect(() => {
    const section = sectionRef.current
    if (!section || shouldReduceMotion()) return undefined

    let cleanupPointer = () => {}
    let pointerFrame
    let pointerPosition = { x: 0, y: 0 }

    const context = gsap.context(() => {
      const markLines = gsap.utils.toArray('.hero-mark-line')
      const orbitLines = gsap.utils.toArray('.hero-orbit-line')
      const words = gsap.utils.toArray('.hero-word')
      const orbitSpinners = gsap.utils.toArray('[data-orbit-spin]')
      const parallaxLayers = gsap.utils.toArray('[data-parallax-depth]')
      const particles = gsap.utils.toArray('.particle')

      gsap.set(markLines, { strokeDasharray: 1, strokeDashoffset: 1 })
      gsap.set(orbitLines, { strokeDasharray: 1, strokeDashoffset: 1 })
      gsap.set('.hero-mark-fill', { autoAlpha: 0, scale: 0.6, transformOrigin: '50% 50%' })
      gsap.set(words, { yPercent: 118, rotate: 2, transformOrigin: 'left bottom' })
      gsap.set(['.hero-badge', '.hero-copy', '.hero-featured', '.hero-explorer'], { autoAlpha: 0 })

      const intro = gsap.timeline({ defaults: { ease: GSAP_EASE.smooth } })
      intro
        .to(markLines, { strokeDashoffset: 0, duration: 0.62, stagger: 0.08 })
        .to('.hero-mark-fill', { autoAlpha: 1, scale: 1, duration: 0.34, ease: GSAP_EASE.punchy }, '-=0.22')
        .fromTo('.hero-badge', { clipPath: 'inset(0 100% 0 0)' }, { autoAlpha: 1, clipPath: 'inset(0 0% 0 0)', duration: 0.58 }, '-=0.08')
        .to(orbitLines, { strokeDashoffset: 0, duration: 1.2, stagger: 0.13 }, '-=0.45')
        .to(words, { yPercent: 0, rotate: 0, duration: 0.92, stagger: 0.065 }, '-=0.92')
        .fromTo('.hero-copy', { clipPath: 'inset(0 100% 0 0)' }, { autoAlpha: 1, clipPath: 'inset(0 0% 0 0)', duration: 0.72 }, '-=0.42')
        .fromTo('.hero-featured', { xPercent: 8, clipPath: 'inset(0 0 100% 0)' }, { autoAlpha: 1, xPercent: 0, clipPath: 'inset(0 0 0% 0)', duration: 0.86 }, '-=0.65')
        .to('.hero-explorer', { autoAlpha: 1, duration: 0.35 }, '-=0.22')

      const orbitTweens = orbitSpinners.map((spinner) => {
        const duration = Number(spinner.dataset.orbitSpin)
        return gsap.to(spinner, {
          rotate: duration > 0 ? 360 : -360,
          duration: Math.abs(duration),
          repeat: -1,
          ease: 'none',
          transformOrigin: '50% 50%',
        })
      })

      const setAmbientMotion = (active) => {
        orbitTweens.forEach((tween) => {
          if (active) tween.resume()
          else tween.pause()
        })
        particles.forEach((particle) => {
          particle.style.animationPlayState = active ? 'running' : 'paused'
        })
        section.classList.toggle('hero-motion-active', active)
      }

      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => setAmbientMotion(self.isActive),
      })

      gsap.to('.hero-scroll-dot', {
        y: 11,
        opacity: 0.25,
        duration: 1.15,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })

      const parallaxSetters = parallaxLayers.map((layer) => ({
        depth: Number(layer.dataset.parallaxDepth),
        x: gsap.quickTo(layer, 'x', { duration: 0.9, ease: 'power3.out' }),
        y: gsap.quickTo(layer, 'y', { duration: 0.9, ease: 'power3.out' }),
      }))

      const renderParallax = () => {
        pointerFrame = undefined
        const horizontal = pointerPosition.x / window.innerWidth - 0.5
        const vertical = pointerPosition.y / window.innerHeight - 0.5
        parallaxSetters.forEach((setter) => {
          setter.x(horizontal * 22 * setter.depth)
          setter.y(vertical * 18 * setter.depth)
        })
      }
      const handlePointerMove = (event) => {
        pointerPosition = { x: event.clientX, y: event.clientY }
        if (!pointerFrame) pointerFrame = requestAnimationFrame(renderParallax)
      }
      const resetParallax = () => {
        parallaxSetters.forEach((setter) => {
          setter.x(0)
          setter.y(0)
        })
      }

      if (window.matchMedia('(pointer: fine)').matches) {
        section.addEventListener('pointermove', handlePointerMove)
        section.addEventListener('pointerleave', resetParallax)
        cleanupPointer = () => {
          section.removeEventListener('pointermove', handlePointerMove)
          section.removeEventListener('pointerleave', resetParallax)
        }
      }
    }, section)

    const mediaContext = gsap.matchMedia()
    mediaContext.add('(min-width: 1024px)', () => {
      const pinEnd = () => `+=${Math.round(window.innerHeight * 0.72)}`
      gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: pinEnd,
          pin: true,
          pinSpacing: false,
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })
        .to(stageRef.current, {
          scale: 0.96,
          yPercent: -1,
          opacity: 0.52,
          force3D: true,
          ease: 'none',
        }, 0)
    }, section)

    return () => {
      if (pointerFrame) cancelAnimationFrame(pointerFrame)
      cleanupPointer()
      mediaContext.revert()
      context.revert()
    }
  }, [])

  return (
    <section id="accueil" ref={sectionRef} className="relative z-0 min-h-[100svh] bg-background">
      <div className="relative min-h-[100svh] overflow-hidden pb-16 pt-32 sm:pt-36 lg:flex lg:items-center lg:pb-20 lg:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(110,156,90,.18),transparent_32%),radial-gradient(circle_at_15%_80%,rgba(205,191,169,.07),transparent_25%)]" />
        <div className="absolute inset-0 bg-grid-fade bg-[size:54px_54px] opacity-40 [mask-image:radial-gradient(circle_at_center,black,transparent_80%)]" />
        <ParticleField />
        <OrbitScene />

        <div ref={stageRef} className="relative mx-auto grid w-full max-w-[1440px] origin-center grid-cols-1 items-end gap-14 px-5 sm:px-8 lg:grid-cols-[1.35fr_.65fr] lg:px-12 xl:px-16">
          <div className="relative z-10">
            <div className="mb-7 flex items-center gap-3 sm:mb-9">
              <HeroMark />
              <div className="hero-badge inline-flex items-center overflow-hidden rounded-full border border-sage/45 bg-background/55 px-4 py-2 text-xs font-semibold text-cream backdrop-blur">
                <Sparkles className="mr-2 size-3.5 text-primary" />
                <span>Club scientifique</span>
                <span className="mx-3 h-4 w-px bg-sage/35" aria-hidden="true" />
                <span className="text-sage">Faculté MI</span>
              </div>
            </div>

            <h1 className="max-w-5xl font-display text-hero font-bold text-cream">
              <HeroLine>Repousse tes limites.</HeroLine>
              <HeroLine className="mt-2 text-[.72em] font-medium tracking-[-0.035em] text-sage [text-shadow:0_0_55px_rgba(139,203,107,.12)]">
                Rejoins l’Infinity.
              </HeroLine>
            </h1>

            <div className="hero-copy mt-9 grid max-w-4xl gap-8 border-l border-olive pl-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:pl-8">
              <div>
                <p className="max-w-[62ch] text-base leading-8 text-text-muted sm:text-lg">
                  La communauté tech de la Faculté des Mathématiques et Informatique de l’Université Mohamed El Bachir El Ibrahimi, BBA.
                </p>
                <p className="mt-3 font-display text-lg font-bold uppercase tracking-[0.16em] text-cream">No Limits For Infiniters</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a href="#contact" data-magnetic data-ripple className="inline-flex items-center rounded-lg bg-cream px-6 py-3.5 font-bold text-ink transition-colors hover:bg-sand">
                  Nous rejoindre
                </a>
                <a href="#evenements" data-magnetic className="inline-flex items-center border-b border-sage/60 px-1 py-3.5 font-bold text-cream transition-colors hover:border-primary hover:text-primary">
                  Nos événements
                </a>
              </div>
            </div>
          </div>

          <a href="#evenements" data-magnetic className="hero-featured group relative z-10 overflow-hidden rounded-t-[2.75rem] rounded-b-lg border border-sand/25 bg-paper p-2 text-ink shadow-[0_24px_80px_rgba(0,0,0,.28)] lg:mb-2">
            <div className="relative min-h-64 overflow-hidden rounded-t-[2.25rem] rounded-b-sm bg-[radial-gradient(circle_at_78%_12%,rgba(110,156,90,.18),transparent_30%),linear-gradient(135deg,#E7DFCF,#D9D0BE)] p-6">
              <div className="absolute -right-20 -top-24 size-64 rounded-full border border-olive/30" />
              <div className="absolute -right-5 top-2 size-40 rounded-full border border-primary-dark/35" />
              <div className="relative flex h-full flex-col justify-between">
                <span className="w-fit border-b border-ink/30 pb-1 text-xs font-semibold text-ink/70">Édition 2026</span>
                <div className="mt-16">
                  <h2 className="font-display text-5xl font-bold leading-none text-ink">AIVEX <span className="font-medium text-primary-dark">2026</span></h2>
                  <p className="mt-2 max-w-[32ch] text-sm leading-6 text-ink/65">L’intelligence artificielle vue, testée et discutée par les étudiants.</p>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink/65">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-primary-dark" /> Prochaine édition bientôt</span>
                    <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-primary-dark" /> Faculté MI, BBA</span>
                  </div>
                </div>
              </div>
            </div>
          </a>
        </div>

        <a href="#a-propos" className="hero-explorer absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-text-muted lg:flex">
          Explorer
          <span className="relative h-11 w-7 overflow-hidden rounded-full border border-white/15">
            <ArrowDown className="hero-scroll-dot absolute left-1/2 top-2 size-3 -translate-x-1/2 text-primary" />
          </span>
        </a>
      </div>
    </section>
  )
}
