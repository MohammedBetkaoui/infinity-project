import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import useMotionPreference from '../hooks/useMotionPreference'
import useSectionNavigation from '../hooks/useSectionNavigation'
import DesktopNavigation from './DesktopNavigation'
import MobileMenu from './MobileMenu'
import NavbarBrand from './NavbarBrand'
import NavigationLink from './NavigationLink'
import { joinCallToAction } from '../data/siteData'
import './navbar.css'

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
    const focusFrame = requestAnimationFrame(() => dialog.querySelector('.menu-close')?.focus())
    const closeAtDesktop = () => { if (innerWidth >= 1024) setMenuOpen(false) }
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false) }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll('button:not([tabindex="-1"]), a[href]')]
        .filter((item) => !item.disabled && item.getClientRects().length)
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
        <nav className="site-nav" aria-label="Main navigation">
          <NavbarBrand />
          <DesktopNavigation activeHref={activeHref} />
          <div className="nav-actions">
            <NavigationLink item={joinCallToAction} className="nav-join"
              aria-current={activeHref === joinCallToAction.href ? 'page' : undefined}>
              <span>Join the club</span><ArrowUpRight size={16} strokeWidth={1.7} aria-hidden="true" />
            </NavigationLink>
            <button ref={toggleRef} className="menu-toggle" type="button" aria-label="Open menu"
              aria-expanded={menuOpen} aria-controls="mobile-menu" aria-haspopup="dialog"
              onClick={() => { returningFocus.current = true; setMenuOpen(true) }}>
              <span>Menu</span><span className="menu-toggle-lines" aria-hidden="true"><i /><i /></span>
            </button>
          </div>
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
