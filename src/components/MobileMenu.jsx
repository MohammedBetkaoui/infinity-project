import { motion, useIsPresent } from 'framer-motion'
import { ArrowUpRight, X } from 'lucide-react'
import { joinCallToAction, navigation } from '../data/siteData'
import { MOTION_EASE } from '../lib/motion'
import Logo from './Logo'
import NavigationLink from './NavigationLink'

export default function MobileMenu({ dialogRef, activeHref, reduced, onClose, onNavigate }) {
  const present = useIsPresent()

  return (
    <motion.div ref={dialogRef} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu"
      inert={!present} data-lenis-prevent className="mobile-menu"
      style={{ pointerEvents: present ? 'auto' : 'none' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduced ? .14 : .23, ease: MOTION_EASE.smooth }}>
      <div className="mobile-menu-inner">
        <div className="menu-top">
          <Logo descriptor="MI Faculty, BBA" onClick={onNavigate} />
          <button type="button" aria-label="Close menu" onClick={onClose}><span>Close</span><X size={18} /></button>
        </div>
        <p className="menu-introduction">A place to meet.<br /><strong>Possibilities without limits.</strong></p>
        <nav className="mobile-links" aria-label="Mobile navigation">
          {navigation.map((item, index) => (
            <NavigationLink key={item.href} item={item} animated
              aria-current={activeHref === item.href ? 'location' : undefined}
              initial={reduced ? false : { x: 14, rotate: .7, opacity: 0 }}
              animate={{ x: 0, rotate: 0, opacity: 1 }}
              transition={{ duration: .38, delay: reduced ? 0 : .045 + index * .032, ease: MOTION_EASE.smooth }}
              onClick={onNavigate}>
              <span>{item.label}</span>
              {activeHref === item.href && <small>You are here</small>}
            </NavigationLink>
          ))}
        </nav>
        <div className="mobile-menu-footer">
          <NavigationLink item={joinCallToAction} className="button-primary menu-join" onClick={onNavigate}>Join the club</NavigationLink>
          <div className="menu-social-row">
            <p>No Limits For Infiniters</p>
            <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">@club_.infinity <ArrowUpRight size={14} /></a>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
