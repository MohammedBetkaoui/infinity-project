import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { navigation } from '../data/siteData'
import { MOTION_EASE, SPRINGS } from '../lib/motion'
import Logo from './Logo'

gsap.registerPlugin(ScrollTrigger)

const menuListVariants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.16, staggerChildren: 0.075 } },
}

const menuItemVariants = {
  hidden: { opacity: 0, x: 46, rotate: 3.5 },
  visible: {
    opacity: 1,
    x: 0,
    rotate: 0,
    transition: { duration: 0.58, ease: MOTION_EASE.smooth },
  },
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      start: 40,
      end: 'max',
      onEnter: () => setScrolled(true),
      onLeaveBack: () => setScrolled(false),
    })
    return () => trigger.kill()
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: menuOpen } }))
    return () => {
      document.body.style.overflow = ''
      if (menuOpen) window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <motion.header
        animate={{ y: scrolled ? 8 : 0 }}
        transition={{ duration: 0.35, ease: MOTION_EASE.smooth }}
        className={`fixed inset-x-0 top-0 mx-auto transition-[padding] duration-500 ${menuOpen ? 'z-[70]' : 'z-50'} ${
          scrolled ? 'px-3 sm:px-6' : 'px-4 sm:px-8'
        }`}
      >
        <nav
          className={`mx-auto flex max-w-[1440px] items-center justify-between transition-all duration-500 ${
            scrolled
              ? 'mt-2 rounded-xl border border-olive/20 bg-[linear-gradient(110deg,rgba(18,24,19,.97),rgba(48,57,45,.95))] px-4 py-2.5 shadow-[0_12px_42px_rgba(0,0,0,.28)] backdrop-blur-md sm:px-6'
              : 'mt-4 px-0 py-3 sm:mt-6'
          }`}
          aria-label="Navigation principale"
        >
          <Logo />

          <div className="hidden items-center gap-7 lg:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="nav-link relative py-2 text-sm font-semibold text-text-muted transition-colors hover:text-cream"
              >
                {item.label}
              </a>
            ))}
          </div>

          <a
            href="#contact"
            data-magnetic
            data-ripple
            className="hidden rounded-lg bg-cream px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-sand md:inline-flex"
          >
            Rejoindre le club
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            data-ripple
            className="relative z-[70] grid size-11 place-items-center rounded-full border border-white/10 bg-surface/70 text-cream lg:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={menuOpen ? 'close' : 'open'}
                initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
                transition={SPRINGS.control}
              >
                {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ clipPath: 'circle(0% at calc(100% - 42px) 42px)' }}
            animate={{ clipPath: 'circle(150% at calc(100% - 42px) 42px)' }}
            exit={{ clipPath: 'circle(0% at calc(100% - 42px) 42px)' }}
            transition={{ duration: 0.72, ease: MOTION_EASE.smooth }}
            className="fixed inset-0 z-[60] flex flex-col justify-center bg-surface px-8 lg:hidden"
          >
            <div className="absolute inset-0 bg-grid-fade bg-[size:42px_42px] opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
            <motion.div
              variants={menuListVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="relative mx-auto flex w-full max-w-lg flex-col gap-3"
            >
              {navigation.map((item) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  variants={menuItemVariants}
                  className="origin-left border-b border-white/10 py-3 font-display text-4xl font-semibold text-cream sm:text-5xl"
                >
                  {item.label}
                </motion.a>
              ))}
              <motion.a
                href="https://www.instagram.com/club_.infinity/"
                target="_blank"
                rel="noreferrer"
                variants={menuItemVariants}
                data-ripple
                className="mt-8 inline-flex w-fit items-center gap-2 rounded-lg bg-cream px-6 py-3 font-bold text-ink"
              >
                @club_.infinity <ArrowUpRight className="size-4" />
              </motion.a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
