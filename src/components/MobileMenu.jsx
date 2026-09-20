import { motion, useIsPresent } from 'framer-motion'
import { ArrowRight, ArrowUpRight, AtSign, X } from 'lucide-react'
import { joinCallToAction, navigation } from '../data/siteData'
import { MOTION_EASE } from '../lib/motion'
import NavbarBrand from './NavbarBrand'
import NavigationLink from './NavigationLink'

export default function MobileMenu({ dialogRef, activeHref, reduced, onClose, onNavigate }) {
  const present = useIsPresent()

  return (
    <motion.div ref={dialogRef} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu"
      inert={!present} data-lenis-prevent className="mobile-menu"
      style={{ pointerEvents: present ? 'auto' : 'none' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : .24, ease: MOTION_EASE.smooth }}>
      <button type="button" className="mobile-menu-backdrop" onClick={onClose} tabIndex={-1} aria-hidden="true" />
      <motion.div className="mobile-menu-inner"
        initial={reduced ? false : { x: 36, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { x: 24, opacity: 0 }}
        transition={{ duration: reduced ? 0 : .32, ease: MOTION_EASE.smooth }}>
        <div className="menu-top">
          <NavbarBrand onClick={onNavigate} />
          <button type="button" className="menu-close" aria-label="Close menu" onClick={onClose}>
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="menu-introduction"><span>Explore Infinity</span><span>BBA, Algeria</span></div>
        <nav className="mobile-links" aria-label="Mobile navigation">
          {navigation.map((item, index) => (
            <NavigationLink key={item.href} item={item} animated
              aria-current={activeHref === item.href ? (item.section ? 'location' : 'page') : undefined}
              initial={reduced ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: reduced ? 0 : .3, delay: reduced ? 0 : .06 + index * .035, ease: MOTION_EASE.smooth }}
              onClick={onNavigate}>
              <span className="menu-link-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span className="menu-link-label">{item.label}</span>
              <span className="menu-link-arrow" aria-hidden="true"><ArrowUpRight size={21} strokeWidth={1.4} /></span>
            </NavigationLink>
          ))}
        </nav>
        <div className="mobile-menu-footer">
          <p className="menu-invitation">Your curiosity belongs here.</p>
          <NavigationLink item={joinCallToAction} className="menu-join" onClick={onNavigate}
            aria-current={activeHref === joinCallToAction.href ? 'page' : undefined}>
            <span>Join the club</span><ArrowRight size={18} aria-hidden="true" />
          </NavigationLink>
          <div className="menu-social-row">
            <p>No Limits For Infiniters</p>
            <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" aria-label="Infinity Club on Instagram (opens in a new tab)">
              <AtSign size={15} strokeWidth={1.6} aria-hidden="true" /><span>Instagram</span><ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
