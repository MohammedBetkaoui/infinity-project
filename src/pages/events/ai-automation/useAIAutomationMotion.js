import { useRef } from 'react'
import useScrollAnimations from '../../../hooks/useScrollAnimations'

export default function useAIAutomationMotion(pageRef) {
  const introComplete = useRef(false)
  useScrollAnimations(pageRef, (motion) => {
    const { gsap, reduced, compact, select } = motion
    if (reduced) return
    const page = pageRef.current
    const cleanup = []

    // Only the opening uses a clock. Completed intros stay completed after
    // font loading, breakpoint changes and reduced-motion toggles.
    if (!introComplete.current && window.scrollY < 80 && !window.location.hash) {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => { introComplete.current = true } })
      intro.from(select('.ai-atmosphere'), { opacity: 0, scale: 1.06, duration: 1.6 }, 0)
        .from(select('.ai-deck-flip'), { y: compact ? 30 : 80, rotationY: 180, rotationZ: -16, scale: .86, duration: 1.55, ease: 'power2.inOut' }, .1)
        .from(select('.ai-deck-ghost'), { opacity: 0, rotation: 0, scale: .85, duration: 1.2, stagger: .1 }, .5)
        .from(select('.ai-title-word'), { yPercent: 110, rotation: 2, duration: .95, stagger: .1 }, .65)
        .from(select('.ai-hero-lead, .ai-hero-description, .ai-actions, .ai-deck-caption'), { opacity: 0, y: 14, duration: .65, stagger: .08, clearProps: 'opacity,transform' }, 1.05)
        .fromTo(select('.ai-card-sheen'), { xPercent: -120, opacity: 0 }, { xPercent: 120, opacity: .5, duration: .65 }, 1)
        .to(select('.ai-card-sheen'), { opacity: 0, duration: .25 }, 1.65)
      // Keyboard/anchor navigation never waits for the cinematic sequence.
      const finish = () => intro.progress(1)
      page.querySelector('.ai-hero').addEventListener('focusin', finish)
      cleanup.push(() => page.querySelector('.ai-hero')?.removeEventListener('focusin', finish))
    }

    page.querySelectorAll('[data-ai-heading]').forEach((heading) => motion.revealText(heading, { once: true, drift: false }))
    motion.revealSection('.ai-story-copy, .ai-moment-note, .ai-people-note', { mode: 'fade', once: true })

    // Two bounded connections, no perpetual pulses. Scrolling back redraws
    // the same signal in reverse. The dim static track always explains flow.
    const flow = gsap.timeline({ scrollTrigger: { trigger: page.querySelector('.ai-flow'), start: 'top 85%', end: 'bottom 55%', scrub: .45, invalidateOnRefresh: true } })
    select('.ai-flow-node').forEach((node, index) => {
      flow.from(node, { y: 20, opacity: .45, duration: .4 }, index * .5)
      const path = node.querySelector('.ai-flow-draw')
      const signal = node.querySelector('.ai-flow-signal')
      if (path) {
        flow.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: .6, ease: 'none' }, index * .5 + .15)
          .fromTo(signal, { attr: { cx: 0 }, opacity: 0 }, { attr: { cx: 100 }, opacity: 1, duration: .6, ease: 'none' }, index * .5 + .15)
      }
    })

    // The mask and the photograph have separate transform owners. Native
    // ratios and a maximum 2% optical move keep faces and embedded marks safe.
    page.querySelectorAll('.ai-moment-photo').forEach((figure) => {
      const curtain = figure.querySelector('.ai-photo-curtain')
      const lens = figure.querySelector('.ai-photo-lens')
      gsap.fromTo(curtain, { scaleY: 1 }, { scaleY: 0, ease: 'power2.inOut', scrollTrigger: { trigger: figure, start: 'top 95%', end: 'top 57%', scrub: .5 } })
      gsap.fromTo(lens, { scale: 1.02, yPercent: compact ? 0 : -1 }, { scale: 1, yPercent: 0, ease: 'none', scrollTrigger: { trigger: figure, start: 'top bottom', end: 'bottom 35%', scrub: .6 } })
      gsap.from(figure.querySelector('figcaption'), { opacity: .25, y: 7, ease: 'none', scrollTrigger: { trigger: figure, start: 'bottom 95%', end: 'bottom 75%', scrub: true } })
    })

    const journey = page.querySelector('.ai-journey-steps')
    gsap.fromTo(select('.ai-journey-track i'), { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: journey, start: 'top 65%', end: 'bottom 65%', scrub: .4 } })
    select('.ai-journey-step').forEach((step) => {
      const scene = gsap.timeline({ scrollTrigger: { trigger: step, start: 'top 85%', end: 'top 40%', scrub: .5 } })
      scene.from(step.querySelector('.ai-journey-card'), { y: compact ? 12 : 35, rotationX: compact ? 0 : -5, transformPerspective: 1200, duration: 1 })
        .from(step.querySelector('.ai-journey-dot'), { scale: .6, opacity: .35, duration: .5 }, 0)
        .from(step.querySelector('.ai-journey-card-rule'), { scaleX: 0, duration: 1 }, 0)
    })

    motion.revealSection('.ai-gallery-frame', { mode: 'depth', once: true })
    gsap.from(select('.ai-closing-photo'), { y: 35, rotation: -5, scale: .95, ease: 'none', scrollTrigger: { trigger: page.querySelector('.ai-closing'), start: 'top 90%', end: 'center 70%', scrub: .6 } })
    gsap.from(select('.ai-signature'), { opacity: .25, ease: 'none', scrollTrigger: { trigger: page.querySelector('.ai-signature'), start: 'top 98%', end: 'top 85%', scrub: true } })

    if (!compact) {
      gsap.to(select('.ai-deck-drift'), { y: -36, ease: 'none', scrollTrigger: { trigger: page.querySelector('.ai-hero'), start: 'top top', end: 'bottom top', scrub: .6 } })
      const stage = page.querySelector('.ai-deck-stage')
      const tilt = page.querySelector('.ai-deck-tilt')
      const x = gsap.quickTo(tilt, 'rotationX', { duration: .65, ease: 'power3.out' })
      const y = gsap.quickTo(tilt, 'rotationY', { duration: .65, ease: 'power3.out' })
      const move = (event) => {
        if (event.pointerType !== 'mouse') return
        const bounds = stage.getBoundingClientRect()
        x((.5 - (event.clientY - bounds.top) / bounds.height) * 5)
        y(((event.clientX - bounds.left) / bounds.width - .5) * 7)
      }
      const leave = () => { x(0); y(0) }
      stage.addEventListener('pointermove', move)
      stage.addEventListener('pointerleave', leave)
      cleanup.push(() => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerleave', leave); x.tween.kill(); y.tween.kill() })
    }
    return () => cleanup.forEach((dispose) => dispose())
  })
}
