import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import useMotionPreference from '../hooks/useMotionPreference'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { navigation } from '../data/siteData'
import { MOTION_EASE } from '../lib/motion'
import Logo from './Logo'

gsap.registerPlugin(ScrollTrigger)

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const reduced = useMotionPreference()
  const dialogRef = useRef(null)
  const toggleRef = useRef(null)
  const returningFocus = useRef(true)

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      start: 40, end: 'max',
      onUpdate: () => setScrolled(window.scrollY > 40),
    })
    return () => trigger.kill()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const dialog = dialogRef.current
    const toggle = toggleRef.current
    const background = [...document.querySelectorAll('main, footer')]
    const previousOverflow = document.body.style.overflow
    const previousInert = background.map((element) => element.inert)
    document.body.style.overflow = 'hidden'
    background.forEach((element) => { element.inert = true })
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } }))
    const focusFrame = requestAnimationFrame(() => dialog.querySelector('button').focus())
    const closeAtDesktop = () => { if (innerWidth >= 1024) setMenuOpen(false) }
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false) }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll('button, a[href]')]
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    window.addEventListener('resize', closeAtDesktop)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      background.forEach((element, index) => { element.inert = previousInert[index] })
      window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', closeAtDesktop)
      if (returningFocus.current) toggle?.focus()
    }
  }, [menuOpen])

  return (
    <>
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`} inert={menuOpen}>
        <nav className="site-nav page-container" aria-label="Navigation principale">
          <Logo scrollLinked />
          <div className="nav-links">
            {navigation.map((item) => <a key={item.href} href={item.href} className="nav-link">{item.label}</a>)}
          </div>
          <a href="#contact" className="nav-join" data-magnetic data-ripple>Rejoindre le club</a>
          <button ref={toggleRef} className="menu-toggle" type="button" aria-label="Ouvrir le menu"
            aria-expanded={menuOpen} aria-controls="mobile-menu"
            onClick={() => { returningFocus.current = true; setMenuOpen(true) }}><Menu size={21} /></button>
        </nav>
      </header>
      <AnimatePresence>
        {menuOpen && (
          <motion.div ref={dialogRef} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu de navigation"
            data-lenis-prevent className="mobile-menu"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
            <div className="menu-top"><Logo onClick={() => { returningFocus.current = false; setMenuOpen(false) }} /><button type="button" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}><X size={22} /></button></div>
            <nav className="mobile-links" aria-label="Navigation mobile">
              {navigation.map((item, index) => (
                <motion.a key={item.href} href={item.href}
                  initial={reduced ? false : { x: 12, rotate: 1, opacity: 0 }}
                  animate={{ x: 0, rotate: 0, opacity: 1 }}
                  transition={{ duration: .35, delay: reduced ? 0 : index * .035, ease: MOTION_EASE.smooth }}
                  onClick={() => { returningFocus.current = false; setMenuOpen(false) }}>{item.label}</motion.a>
              ))}
            </nav>
            <div className="mobile-menu-footer"><p>No Limits For Infiniters</p><a className="text-link" href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">@club_.infinity <ArrowUpRight size={16} /></a></div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
