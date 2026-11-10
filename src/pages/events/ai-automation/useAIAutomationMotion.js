import { useEffect, useRef, useState } from 'react'
import useScrollAnimations from '../../../hooks/useScrollAnimations'
import { vortexOf } from './vortexEngine'

const pad = (value) => String(value).padStart(2, '0')

// The hero pin decision (height >= 520) and the flat copy layout (<= 900px)
// are local to this page. The global hook only rebuilds on its own queries,
// so a rotation rebuilds the scene through rebuildKey.
const HERO_QUERIES = ['(min-height: 520px)', '(max-width: 900px)']
const heroKey = () => HERO_QUERIES.map((query) => (window.matchMedia(query).matches ? 1 : 0)).join('')

export default function useAIAutomationMotion(pageRef) {
  const introComplete = useRef(false)
  const dealt = useRef(false)
  const [heroLayout, setHeroLayout] = useState(heroKey)
  useEffect(() => {
    const lists = HERO_QUERIES.map((query) => window.matchMedia(query))
    const sync = () => setHeroLayout(heroKey())
    lists.forEach((list) => list.addEventListener('change', sync))
    return () => lists.forEach((list) => list.removeEventListener('change', sync))
  }, [])

  useScrollAnimations(pageRef, (motion) => {
    const { gsap, ScrollTrigger, reduced, compact, canPin, select } = motion
    const page = pageRef.current
    const title = page.querySelector('.ai-hero-title')
    if (reduced) {
      title?.classList.add('is-lit')
      return undefined
    }
    const cleanup = []
    const hero = page.querySelector('.ai-hero')
    // The canvas engine mounts after this layout effect: always resolve late.
    const heroVortex = () => vortexOf(page.querySelector('.ai-hero-vortex'))

    // ── Opening: the card comes out of the tunnel, the chrome lights up.
    // Only the opening uses a clock, and it plays once per visit.
    if (!introComplete.current && window.scrollY < 80 && !window.location.hash) {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => { introComplete.current = true } })
      intro.call(() => heroVortex()?.burst(1.3), null, .05)
        .from(select('.ai-hero-backdrop'), { opacity: 0, duration: 1.4 }, 0)
        .from(select('.ai-hero-vortex'), { opacity: 0, duration: 1.1 }, 0)
        .from(select('.ai-icard-body'), { scale: .04, rotationY: 360, rotationZ: -30, opacity: 0, transformPerspective: 2400, duration: 2.2, ease: 'expo.out' }, .15)
        .from(select('.ai-icard-halo'), { opacity: 0, scale: .3, duration: 1.5 }, .85)
        .from(select('.ai-icard-rays'), { opacity: 0, scale: .25, duration: 1.8 }, .9)
        .from(select('.ai-icard-core'), { scale: .2, opacity: 0, duration: 1, ease: 'back.out(2.2)' }, 1.2)
        .from(select('.ai-hero-title .ai-chrome-letter'), { yPercent: 115, rotationX: -88, opacity: 0, transformPerspective: 520, transformOrigin: '50% 100%', duration: 1.05, stagger: .045, ease: 'power4.out' }, .45)
        .call(() => title?.classList.add('is-lit'), null, 1.45)
        .from(select('.ai-tagline .ai-chrome > span'), { opacity: 0, y: 10, ...(compact ? {} : { filter: 'blur(8px)', clearProps: 'filter' }), duration: .8, stagger: .022 }, 1.35)
        .from(select('.ai-eyebrow, .ai-hero-lead, .ai-hero-description, .ai-actions'), { opacity: 0, y: 18, duration: .75, stagger: .08, clearProps: 'opacity,transform' }, 1.05)
        .from(select('.ai-topline, .ai-hero-meta'), { opacity: 0, duration: .9, clearProps: 'opacity' }, 1.5)
      // Keyboard and anchors never wait for the cinematic sequence.
      const finish = () => intro.progress(1)
      hero.addEventListener('focusin', finish)
      cleanup.push(() => hero.removeEventListener('focusin', finish))
    } else {
      title?.classList.add('is-lit')
    }

    // ── Leaving the hero: the camera dives, the card fills the frame and
    // bursts into the film's light, then the tunnel takes over again.
    // Same choreography on every screen tall enough to hold the stage.
    const pinHero = !reduced && (canPin || window.innerHeight >= 520)
    const stage = page.querySelector('.ai-hero-stage')
    const card = page.querySelector('.ai-icard')

    // The flash is centred on the card. Offsets ignore transforms, so the
    // measure is the same at any scroll position or pin state.
    const placeFlash = () => {
      if (!stage || !card) return
      let x = card.offsetWidth / 2
      let y = card.offsetHeight / 2
      for (let node = card; node && node !== stage; node = node.offsetParent) {
        x += node.offsetLeft
        y += node.offsetTop
      }
      stage.style.setProperty('--fx', `${Math.round(x)}px`)
      stage.style.setProperty('--fy', `${Math.round(y)}px`)
    }
    placeFlash()
    ScrollTrigger.addEventListener('refresh', placeFlash)
    cleanup.push(() => {
      ScrollTrigger.removeEventListener('refresh', placeFlash)
      stage?.style.removeProperty('--fx')
      stage?.style.removeProperty('--fy')
    })

    if (pinHero) {
      // Below 900px `.ai-hero-copy` is display: contents (no box to animate),
      // so its children leave one by one with the very same values.
      const flat = window.matchMedia('(max-width: 900px)').matches
      const scene = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: hero, pin: stage, start: 'top top',
          end: () => `+=${Math.round(window.innerHeight * 1.1)}`, scrub: compact ? .6 : .8, anticipatePin: 1,
          invalidateOnRefresh: true, refreshPriority: 2,
          onUpdate: (self) => heroVortex()?.setWarp(self.progress * 1.3),
        },
      })
      if (flat) {
        // Explicit start values: these elements also play the intro.
        scene.fromTo(select('.ai-eyebrow, .ai-hero-title, .ai-hero-lead, .ai-hero-description, .ai-actions'),
          { yPercent: 0, opacity: 1 }, { yPercent: -16, opacity: 0, duration: .4, immediateRender: false }, 0)
      } else {
        scene.to(select('.ai-hero-copy'), { yPercent: -16, opacity: 0, duration: .4 }, 0)
      }
      scene.to(select('.ai-topline, .ai-hero-meta'), { opacity: 0, duration: .2 }, 0)
        .to(select('.ai-tagline'), { opacity: 0, y: 26, duration: .22 }, .04)
        .to(select('.ai-icard'), { scale: 2.2, rotationZ: -5, duration: .64, ease: 'power2.in' }, 0)
        .fromTo(select('.ai-flash'), { opacity: 0, scale: .3 }, { opacity: 1, scale: 1.1, duration: .26, ease: 'power2.in' }, .44)
        .set(select('.ai-icard'), { opacity: 0 }, .7)
        .to(select('.ai-flash'), { opacity: 0, scale: 1.5, duration: .3, ease: 'power1.out' }, .72)
        .to(select('.ai-hero-vortex'), { opacity: .6, duration: .3 }, .7)
    } else {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .5, onUpdate: (self) => heroVortex()?.setWarp(self.progress) } })
        .to(select('.ai-icard'), { scale: 1.2, y: -30, ease: 'none' }, 0)
        .fromTo(select('.ai-flash'), { opacity: 0, scale: .4 }, { opacity: .5, scale: 1, ease: 'power2.in' }, .35)
    }

    // Pointer: the card leans towards the cursor, its sheen follows. On touch
    // screens the finger does the same and the card sways on its own while
    // nobody touches it. `.ai-icard-tilt` is the only owner of this lean.
    const tilt = page.querySelector('.ai-icard-tilt')
    if (tilt && stage) {
      const rx = gsap.quickTo(tilt, 'rotationX', { duration: .9, ease: 'power3.out' })
      const ry = gsap.quickTo(tilt, 'rotationY', { duration: .9, ease: 'power3.out' })
      const lean = (event) => {
        const x = event.clientX / window.innerWidth
        const y = event.clientY / window.innerHeight
        rx((.5 - y) * 16)
        ry((x - .5) * 22)
        tilt.style.setProperty('--px', `${100 - x * 100}%`)
      }
      if (!compact) {
        const move = (event) => { if (event.pointerType === 'mouse') lean(event) }
        window.addEventListener('pointermove', move, { passive: true })
        cleanup.push(() => { window.removeEventListener('pointermove', move); rx.tween.kill(); ry.tween.kill() })
      } else {
        // Idle sway: two sine waves drive a proxy that is applied only while idle.
        const wave = { x: 0, y: 0 }
        const mix = { weight: 0 }
        const apply = () => gsap.set(tilt, { rotationY: wave.y * 6 * mix.weight, rotationX: wave.x * 3 * mix.weight })
        const swayY = gsap.fromTo(wave, { y: -1 }, { y: 1, duration: 5, ease: 'sine.inOut', repeat: -1, yoyo: true, onUpdate: apply, paused: true })
        const swayX = gsap.fromTo(wave, { x: -1 }, { x: 1, duration: 5, ease: 'sine.inOut', repeat: -1, yoyo: true, onUpdate: apply, paused: true }).progress(.5)
        let visible = true
        let touching = false
        let blend = null
        const playSway = () => { swayX.play(); swayY.play() }
        const pauseSway = () => { swayX.pause(); swayY.pause() }
        const resume = () => {
          touching = false
          blend?.kill()
          blend = gsap.to(mix, { weight: 1, duration: 1.4, ease: 'sine.inOut', onUpdate: apply })
          if (visible) playSway()
        }
        const wait = gsap.delayedCall(1.2, resume).pause()
        const down = (event) => {
          if (event.pointerType !== 'touch') return
          touching = true
          pauseSway()
          blend?.kill()
          wait.pause()
          mix.weight = 0
        }
        const move = (event) => {
          if (event.pointerType !== 'touch') return
          if (!touching) down(event)
          lean(event)
        }
        const up = (event) => {
          if (event.pointerType !== 'touch') return
          rx(0)
          ry(0)
          wait.restart(true)
        }
        stage.addEventListener('pointerdown', down, { passive: true })
        stage.addEventListener('pointermove', move, { passive: true })
        stage.addEventListener('pointerup', up, { passive: true })
        stage.addEventListener('pointercancel', up, { passive: true })
        // No sway, and no work, while the hero is out of sight.
        const watch = ScrollTrigger.create({
          trigger: hero, start: 'top bottom', end: 'bottom top',
          onToggle: (self) => {
            visible = self.isActive
            if (touching || wait.isActive()) return
            if (visible) playSway()
            else pauseSway()
          },
        })
        resume()
        cleanup.push(() => {
          stage.removeEventListener('pointerdown', down)
          stage.removeEventListener('pointermove', move)
          stage.removeEventListener('pointerup', up)
          stage.removeEventListener('pointercancel', up)
          watch.kill()
          wait.kill()
          blend?.kill()
          swayX.kill()
          swayY.kill()
          rx.tween.kill()
          ry.tween.kill()
        })
      }
    }

    // ── Headings and copy. Display titles rise word by word.
    page.querySelectorAll('[data-ai-heading]').forEach((heading) => motion.revealText(heading, { once: true, drift: false }))
    motion.revealSection('.ai-deal-intro, .ai-story-copy, .ai-note, .ai-talks-note, .ai-talks-heading > p, .ai-gallery-heading > div, .ai-finale-copy, .ai-finale-links', { mode: 'fade', once: true })

    // ── 01 The deal: four cards leave the deck and turn face up.
    const hand = page.querySelector('[data-ai-hand]')
    if (hand && !dealt.current) {
      const box = hand.getBoundingClientRect()
      if (box.top > window.innerHeight * .8) {
        const cards = gsap.utils.toArray(hand.querySelectorAll('.ai-play-card'))
        const turns = gsap.utils.toArray(hand.querySelectorAll('.ai-play-turn'))
        const deckX = box.left + box.width / 2
        const deckY = box.top + Math.min(box.height, 420) / 2
        cards.forEach((card, index) => {
          const rect = card.getBoundingClientRect()
          gsap.set(card, { x: deckX - (rect.left + rect.width / 2), y: deckY - (rect.top + rect.height / 2) - index * 3, rotation: (index - 1.5) * 4 })
        })
        gsap.set(turns, { rotationY: 180 })
        const deal = gsap.timeline({ paused: true, onComplete: () => { dealt.current = true } })
        deal.to(cards, { x: 0, y: 0, rotation: 0, duration: 1.05, ease: 'power3.out', stagger: .14 })
          .to(turns, { rotationY: 0, duration: .85, ease: 'power2.inOut', stagger: .14, clearProps: 'transform' }, .32)
        ScrollTrigger.create({ trigger: hand, start: 'top 80%', once: true, onEnter: () => deal.play() })
      } else {
        dealt.current = true
      }
    }

    // ── Day 01: each photograph is turned over by the scroll.
    select('[data-ai-flip]').forEach((card, index) => {
      const turn = card.querySelector('.ai-pcard-turn')
      gsap.fromTo(turn, { rotationY: -180, rotationZ: index % 2 ? 7 : -7, scale: .86, transformPerspective: 1600 }, {
        rotationY: 0, rotationZ: 0, scale: 1, ease: 'power1.inOut',
        scrollTrigger: { trigger: card, start: 'top 98%', end: 'top 48%', scrub: .6 },
      })
      gsap.fromTo(card.querySelector('.ai-pcard-lens'), { scale: 1.035 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom 35%', scrub: .6 } })
    })
    const human = page.querySelector('.ai-interlude')
    if (human) {
      gsap.from(human.querySelectorAll('.ai-interlude-chrome .ai-chrome-letter'), {
        yPercent: 90, rotationX: -80, opacity: 0, transformPerspective: 500, transformOrigin: '50% 100%', stagger: .08, ease: 'power3.out',
        scrollTrigger: { trigger: human, start: 'top 85%', end: 'top 45%', scrub: .5 },
      })
      gsap.from(human.querySelector('.ai-interlude-line'), { scaleY: 0, transformOrigin: '50% 0', ease: 'none', scrollTrigger: { trigger: human, start: 'top 60%', end: 'bottom 60%', scrub: true } })
    }

    // ── Day 02: the spread moves sideways while the page scrolls down.
    const lab = page.querySelector('.ai-lab')
    const track = page.querySelector('.ai-lab-track')
    const viewport = page.querySelector('.ai-lab-viewport')
    if (canPin && lab && track && viewport) {
      lab.dataset.pinned = 'true'
      cleanup.push(() => { delete lab.dataset.pinned })
      const slides = select('.ai-lab-slide')
      const counter = page.querySelector('[data-lab-counter]')
      const bar = page.querySelector('.ai-lab-progress i')
      const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth)
      const skewSet = gsap.quickSetter(slides, 'skewX', 'deg')
      const skew = { value: 0 }
      let current = 1
      const spread = gsap.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: lab, pin: lab.querySelector('.ai-lab-pin'), start: 'top top', end: () => `+=${distance()}`,
          scrub: .7, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (self) => {
            const next = gsap.utils.clamp(-8, 8, self.getVelocity() / -320)
            if (Math.abs(next) > Math.abs(skew.value)) {
              skew.value = next
              gsap.to(skew, { value: 0, duration: .9, ease: 'power3', overwrite: true, onUpdate: () => skewSet(skew.value) })
            }
            const index = Math.min(slides.length, Math.max(1, Math.round(self.progress * (slides.length + 1))))
            if (index !== current && counter) { current = index; counter.textContent = pad(index) }
            if (bar) bar.style.transform = `scaleX(${self.progress})`
          },
        },
      })
      // A coverflow: each card turns as it crosses the frame.
      slides.forEach((slide) => {
        gsap.fromTo(slide.querySelector('.ai-pcard-turn'), { rotationY: 24, transformPerspective: 1200 }, {
          rotationY: -24, ease: 'none',
          scrollTrigger: { containerAnimation: spread, trigger: slide, start: 'left right', end: 'right left', scrub: true },
        })
      })
    }

    // ── 05 The stacking deck: the covered card steps back into the dark.
    const items = select('.ai-stack-item')
    items.forEach((item, index) => {
      const next = items[index + 1]
      if (!next) return
      const top = () => parseFloat(getComputedStyle(next).top) || 0
      gsap.timeline({ scrollTrigger: { trigger: next, start: 'top bottom', end: () => `top ${top()}px`, scrub: true, invalidateOnRefresh: true } })
        .to(item.querySelector('.ai-stack-card'), { scale: .92, ease: 'none' }, 0)
        .to(item.querySelector('.ai-stack-dim'), { opacity: .62, ease: 'none' }, 0)
    })
    select('.ai-stack-symbol').forEach((symbol) => {
      gsap.from(symbol, { scale: .4, rotation: -90, opacity: 0, ease: 'back.out(1.6)', duration: .9, scrollTrigger: { trigger: symbol, start: 'top 88%', once: true } })
    })

    // ── 06 The deck grid fades in as a whole; Framer owns each card.
    motion.revealSection('.ai-deck-reveal', { mode: 'depth', once: true })

    // ── Finale: the rays open and the emblem ignites as it arrives.
    const finale = page.querySelector('.ai-finale')
    if (finale) {
      gsap.timeline({ scrollTrigger: { trigger: finale, start: 'top 90%', end: 'center 55%', scrub: .6 } })
        .fromTo(select('.ai-finale-rays'), { scale: .3, opacity: 0 }, { scale: 1, opacity: 1, ease: 'power2.out' }, 0)
        .fromTo(select('.ai-finale-emblem'), { scale: .55, opacity: .15 }, { scale: 1, opacity: 1, ease: 'power2.out' }, 0)
      gsap.from(select('.ai-finale-tagline .ai-chrome > span'), {
        opacity: 0, yPercent: 70, stagger: .03, ease: 'power3.out',
        scrollTrigger: { trigger: page.querySelector('.ai-finale-tagline'), start: 'top 96%', end: 'top 72%', scrub: .5 },
      })
    }

    return () => cleanup.forEach((dispose) => dispose())
  }, { rebuildKey: heroLayout })
}
