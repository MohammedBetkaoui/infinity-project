import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import useMotionPreference from '../hooks/useMotionPreference'
import useSectionNavigation from '../hooks/useSectionNavigation'
import DesktopNavigation from './DesktopNavigation'
import MobileMenu from './MobileMenu'
import Logo from './Logo'

export default function Navbar() {
  const { scrolled, activeHref } = useSectionNavigation()
  const [menuOpen, setMenuOpen] = useState(false)
  const reduced = useMotionPreference()
  const dialogRef = useRef(null)
  const toggleRef = useRef(null)
  const returningFocus = useRef(true)

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
      if (returningFocus.current) {
        const destination = toggle?.getClientRects().length ? toggle : document.querySelector('.site-nav > a')
        destination?.focus()
      }
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)
  const navigateFromMenu = () => { returningFocus.current = false; setMenuOpen(false) }

  return (
    <>
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`} inert={menuOpen}>
        <nav className="site-nav page-container" aria-label="Navigation principale">
          <Logo scrollLinked descriptor="Faculté MI, BBA" />
          <DesktopNavigation activeHref={activeHref} reduced={reduced} />
          <a href="#contact" className="nav-join" data-magnetic data-ripple>Rejoindre le club</a>
          <button ref={toggleRef} className="menu-toggle" type="button" aria-label="Ouvrir le menu"
            aria-expanded={menuOpen} aria-controls="mobile-menu"
            onClick={() => { returningFocus.current = true; setMenuOpen(true) }}>
            <span>Menu</span><span className="menu-toggle-lines" aria-hidden="true"><i /><i /></span>
          </button>
        </nav>
      </header>
      <AnimatePresence>
        {menuOpen && (
          <MobileMenu dialogRef={dialogRef} activeHref={activeHref} reduced={reduced}
            onClose={closeMenu} onNavigate={navigateFromMenu} />
        )}
      </AnimatePresence>
    </>
  )
}
