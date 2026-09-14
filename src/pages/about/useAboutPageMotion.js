import gsap from 'gsap'
import useScrollAnimations from '../../hooks/useScrollAnimations'

export default function useAboutPageMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    const page = pageRef.current
    page.querySelectorAll('h2').forEach((title) => motion.revealText(title))
    page.querySelectorAll('.about-story-prose p, .about-principle-ledger p, .about-fields-heading > p, .about-closing-action > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    motion.revealSection('.about-story-margin', { mode: 'horizontal', color: '#e7dfcf' })
    page.querySelectorAll('.about-fields-ledger > li').forEach((row) => motion.revealSection(row, { mode: 'fade' }))
    if (motion.reduced) return
    const scene = page.querySelector('.about-process-scene')
    if (!scene) return
    if (motion.compact) {
      motion.revealSection(scene, { mode: 'fade' })
      return
    }
    const path = scene.querySelector('.about-process-ink')
    const head = scene.querySelector('.about-process-head')
    const length = path.getTotalLength()
    const position = { progress: 0 }
    const setX = gsap.quickSetter(head, 'x')
    const setY = gsap.quickSetter(head, 'y')
    const render = () => {
      const point = path.getPointAtLength(length * position.progress)
      setX(point.x)
      setY(point.y)
    }
    render()
    gsap.set(head, { opacity: 1 })
    gsap.set(scene.querySelectorAll('.about-scene-prototype, .about-scene-shared'), {
      opacity: 0, scale: .94, transformOrigin: '240px 190px',
    })
    const indicators = scene.querySelectorAll('.about-scene-indicators i')
    gsap.set(indicators, { opacity: .22 })
    gsap.set(indicators[0], { opacity: 1 })
    // The moving signal links the three stages; no SVG stroke repaints during scroll.
    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        id: 'about-process-network', trigger: page.querySelector('.about-process-track'),
        start: 'top 65%', end: 'bottom 65%', scrub: true, invalidateOnRefresh: true,
      },
    })
      .to(position, { progress: 1, duration: 1, onUpdate: render }, 0)
      .to(scene.querySelector('.about-scene-sketch'), { opacity: 0, duration: .1 }, .28)
      .to(scene.querySelector('.about-scene-prototype'), { opacity: 1, scale: 1, duration: .12 }, .3)
      .to(indicators[0], { opacity: .22, duration: .08 }, .3)
      .to(indicators[1], { opacity: 1, duration: .08 }, .3)
      .to(scene.querySelector('.about-scene-prototype'), { opacity: 0, duration: .1 }, .66)
      .to(scene.querySelector('.about-scene-shared'), { opacity: 1, scale: 1, duration: .15 }, .68)
      .to(indicators[1], { opacity: .22, duration: .08 }, .68)
      .to(indicators[2], { opacity: 1, duration: .08 }, .68)
    page.querySelectorAll('.about-process-stages li').forEach((stage) => {
      gsap.fromTo(stage.querySelector('.about-stage-progress'), { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top 74%', end: 'bottom 57%', scrub: true },
      })
    })
  })
}
