import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Menu, X } from 'lucide-react'
import AivexLogoMark from './AivexLogoMark'
import useMotionPreference from '../../hooks/useMotionPreference'

const links = [
  { href: '#competition', label: 'Competition' },
  { href: '#approche', label: 'Our approach' },
  { href: '#preparation', label: 'Get ready' },
  { href: '#participer', label: 'Event details' },
  { href: '#questions', label: 'FAQ' },
]

export default function AivexHeader() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)
  const reduced = useMotionPreference()

  useEffect(() => {
    const media = window.matchMedia('(min-width: 800px)')
    const close = () => { if (media.matches) setOpen(false) }
    media.addEventListener('change', close)
    return () => media.removeEventListener('change', close)
  }, [])

  return (
    <header className="ax-header" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { setOpen(false); toggleRef.current?.focus() }
    }}>
      <div className="ax-container ax-header-inner">
        <a href="#competition" aria-label="AIVEX, top of page" className="ax-brand"><AivexLogoMark /><span>2nd edition</span></a>
        <nav className="ax-desktop-nav" aria-label="AIVEX navigation">
          {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
          <Link to="/aivex/register" className="ax-nav-register">Register</Link>
        </nav>
        <Link to="/#evenements" className="ax-back"><ArrowLeft size={14} aria-hidden="true" /><span>Infinity Club</span></Link>
        <button className="ax-menu-toggle" ref={toggleRef} aria-expanded={open} aria-controls="ax-mobile-nav"
          aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && <motion.nav id="ax-mobile-nav" className="ax-mobile-nav" aria-label="AIVEX mobile navigation"
          initial={{ opacity: 0, y: reduced ? 0 : -6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }} transition={{ duration: reduced ? .1 : .19 }}>
          {links.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
          <Link to="/aivex/register" className="ax-mobile-register" onClick={() => setOpen(false)}>Register for AIVEX</Link>
        </motion.nav>}
      </AnimatePresence>
      <div className="ax-scroll-progress" aria-hidden="true" />
    </header>
  )
}
