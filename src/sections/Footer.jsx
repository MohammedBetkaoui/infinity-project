import { ArrowUp } from 'lucide-react'
import { useRef } from 'react'
import gsap from 'gsap'
import useScrollAnimations from '../hooks/useScrollAnimations'
import { useLocation } from 'react-router-dom'
import Logo from '../components/Logo'
import MiFacultyMark from '../components/MiFacultyMark'
import NavigationLink from '../components/NavigationLink'
import { navigation } from '../data/siteData'

export default function Footer() {
  const footerRef = useRef(null)
  useScrollAnimations(footerRef, (motion) => {
    if (motion.reduced) return
    gsap.fromTo(footerRef.current.querySelector('.footer-brand'), { scale: .8, opacity: 0 }, {
      scale: 1, opacity: 1, ease: 'power3.out', transformOrigin: 'left center',
      scrollTrigger: { trigger: footerRef.current, start: 'clamp(top 99%)', end: 'clamp(bottom bottom)', scrub: true },
    })
    motion.revealSection('.footer-navigation > a', {
      mode: 'fade', trigger: footerRef.current, stagger: .07,
      start: 'clamp(top 99%)', end: 'clamp(bottom bottom)',
    })
  })
  const { pathname } = useLocation()
  const pageTopIds = {
    '/about': 'about-page',
    '/community': 'community-page',
    '/contact': 'contact-page',
    '/events': 'events-page',
    '/join': 'join-page',
  }
  const topHref = `#${pageTopIds[pathname] || 'accueil'}`

  return (
    <footer ref={footerRef} className="py-10">
      <div className="page-container flex flex-col gap-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div className="footer-brand flex items-center gap-3">
            <Logo />
            <span className="hidden sm:flex items-center gap-2 border-l border-white/10 pl-3 text-[#d2d2d2]">
              <MiFacultyMark className="h-6 w-auto" />
              <span className="text-[10px] font-semibold tracking-[0.08em]">MI Faculty, BBA</span>
            </span>
          </div>
          <div className="footer-navigation flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-text-muted">
            {navigation.slice(0, -1).map((item) => <NavigationLink key={item.href} item={item} className="transition-colors hover:text-primary-glow">{item.label}</NavigationLink>)}
          </div>
          <a href={topHref} aria-label="Back to top" className="grid size-11 place-items-center rounded-full border border-white/10 text-text-muted transition-colors hover:border-primary hover:text-primary-glow"><ArrowUp className="size-4" /></a>
        </div>
        <div className="flex flex-col justify-between gap-2 border-t border-white/[.07] pt-6 text-[11px] tracking-[0.08em] text-text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Infinity Club. All rights reserved.</p>
          <p>No Limits For Infiniters</p>
        </div>
      </div>
    </footer>
  )
}
