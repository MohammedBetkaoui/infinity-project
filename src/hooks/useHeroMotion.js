import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createInfinityFollower, HERO_DRAW_SHARE as DRAW_SHARE, heroTravel } from '../lib/infinityMotion'

gsap.registerPlugin(ScrollTrigger)

export default function useHeroMotion(sectionRef) {
  const introPlayed = useRef(false)

  useLayoutEffect(() => {
    const section = sectionRef.current
    const media = gsap.matchMedia()

    media.add({
      all: 'all',
      reduced: '(prefers-reduced-motion: reduce)',
      spacious: '(min-width: 1024px) and (min-height: 720px)',
      fine: '(hover: hover) and (pointer: fine)',
    }, (context) => {
      const { reduced, spacious, fine } = context.conditions
      const stage = section.querySelector('.hero-stage')
      const surface = section.querySelector('.hero-surface')
      const artwork = section.querySelector('.infinity-art')
      const path = section.querySelector('.ribbon-trace')
      const head = section.querySelector('.infinity-head')
      const trails = [...section.querySelectorAll('.infinity-trail')].reverse()
      const words = section.querySelectorAll('.hero-word')
      const copy = section.querySelectorAll('.hero-description, .hero-actions')
      const canPin = spacious && fine && !reduced
      const length = path.getTotalLength()
      section.dataset.heroMode = reduced ? 'reduced' : canPin ? 'pinned' : 'flow'

      if (reduced) {
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: 0 })
        if (!introPlayed.current) {
          gsap.from(section.querySelectorAll('.hero-detail, .hero-word, .hero-footnote'), {
            opacity: 0, duration: .32, onComplete: () => { introPlayed.current = true },
          })
        }
        return () => { delete section.dataset.heroMode }
      }

      const orbitLines = section.querySelectorAll('.orbit-intro-line')
      orbitLines.forEach((line) => {
        const orbitLength = line.getTotalLength()
        gsap.set(line, { strokeDasharray: orbitLength, strokeDashoffset: orbitLength })
      })
      const draw = { progress: 0 }
      const follower = createInfinityFollower(path, head, trails)
      const renderPath = () => follower.render(draw.progress)
      renderPath()

      const intro = gsap.timeline({
        defaults: { ease: 'power4.out' },
        onComplete: () => { introPlayed.current = true },
      })
      intro.to(orbitLines, { strokeDashoffset: 0, duration: .94, stagger: .055, ease: 'power3.inOut' }, 0)
        .fromTo(head, { opacity: 0 }, { opacity: 1, duration: .26 }, .22)
        .from('.hero-topline', { opacity: 0, y: 7, duration: .29 }, .46)
        .from('.hero-prelude', { opacity: 0, duration: .27 }, .58)
        .from(words, { yPercent: 108, rotate: 1.4, duration: .67, stagger: .065 }, .65)
        // Le titre dispose d'un temps de lecture avant l'invitation à agir.
        .from(copy, { opacity: 0, y: 6, duration: .36, stagger: .085 }, 1.02)
        .from('.official-motto, .hero-social, .hero-scroll-link, .art-register, .art-caption', { opacity: 0, duration: .31 }, 1.21)
        .from('.hero-event-link', { opacity: 0, x: 19, duration: .43, ease: 'back.out(1.2)' }, 1.43)

      const finishIntro = () => {
        if (window.scrollY > 12 && intro.progress() < 1) intro.progress(1)
      }
      if (introPlayed.current || window.scrollY > 12 || (location.hash && location.hash !== '#accueil')) intro.progress(1)
      window.addEventListener('scroll', finishIntro, { passive: true })

      const travel = () => heroTravel(window.innerHeight)
      const updateOverlap = () => {
        // On ne réserve que le dessin : la sortie se fait sous la section suivante.
        section.style.setProperty('--hero-overlap', `${travel() * (1 - DRAW_SHARE)}px`)
      }
      if (canPin) updateOverlap()
      const flowStart = () => Math.max(0, artwork.getBoundingClientRect().top + window.scrollY - window.innerHeight * .74)
      const flowEnd = () => Math.max(flowStart() + 186, artwork.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * .28)

      const scene = gsap.timeline({
        defaults: { ease: 'none' },
        // Lenis lisse déjà la molette ; un scrub numérique ajouterait du retard.
        scrollTrigger: canPin ? {
          id: 'infinity-hero',
          trigger: section,
          start: () => `top ${Math.min(0, window.innerHeight - stage.offsetHeight)}px`,
          end: () => `+=${travel()}`,
          pin: stage,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: true,
          invalidateOnRefresh: true,
          onRefreshInit: updateOverlap,
          onRefresh: renderPath,
        } : {
          id: 'infinity-hero',
          trigger: section,
          start: flowStart,
          end: flowEnd,
          scrub: true,
          invalidateOnRefresh: true,
          onRefresh: renderPath,
        },
      })
      scene.fromTo(draw, { progress: 0 }, { progress: 1, duration: canPin ? DRAW_SHARE : 1, onUpdate: renderPath, immediateRender: false }, 0)
      if (canPin) {
        scene.addLabel('enter-club', DRAW_SHARE)
          .to(surface, { scale: .978, y: -6, duration: 1 - DRAW_SHARE }, DRAW_SHARE)
          .to('.hero-shade', { opacity: .19, duration: 1 - DRAW_SHARE }, DRAW_SHARE)
          .to('.art-scroll-depth', { scale: .94, y: -12, opacity: .72, duration: 1 - DRAW_SHARE }, DRAW_SHARE)
      } else {
        scene.to('.art-scroll-depth', { y: -13, duration: 1 }, 0)
      }

      let frame
      const cleanups = []
      if (fine) {
        const layers = [
          { node: section.querySelector('.art-depth'), depth: 5.6 },
          { node: section.querySelector('.hero-event-depth'), depth: 8.4 },
        ].map(({ node, depth }) => ({
          depth,
          x: gsap.quickTo(node, 'x', { duration: .46, ease: 'power3.out' }),
          y: gsap.quickTo(node, 'y', { duration: .46, ease: 'power3.out' }),
        }))
        let pointer
        const move = (event) => {
          if (event.pointerType !== 'mouse') return
          pointer = event
          if (frame) return
          frame = requestAnimationFrame(() => {
            frame = undefined
            const x = pointer.clientX / window.innerWidth - .5
            const y = pointer.clientY / window.innerHeight - .5
            layers.forEach((layer) => { layer.x(x * layer.depth); layer.y(y * layer.depth) })
          })
        }
        const reset = () => {
          cancelAnimationFrame(frame)
          frame = undefined
          layers.forEach((layer) => { layer.x(0); layer.y(0) })
        }
        stage.addEventListener('pointermove', move, { passive: true })
        stage.addEventListener('pointerleave', reset)
        cleanups.push(() => {
          stage.removeEventListener('pointermove', move)
          stage.removeEventListener('pointerleave', reset)
          layers.forEach((layer) => { layer.x.tween.kill(); layer.y.tween.kill() })
        })
      }

      return () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('scroll', finishIntro)
        cleanups.forEach((cleanup) => cleanup())
        follower.clear()
        section.style.removeProperty('--hero-overlap')
        delete section.dataset.heroMode
      }
    }, section)

    return () => media.revert()
  }, [sectionRef])
}
