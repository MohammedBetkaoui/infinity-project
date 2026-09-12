import { ArrowUp } from 'lucide-react'
import Logo from '../components/Logo'
import { navigation } from '../data/siteData'

export default function Footer() {
  return (
    <footer className="py-10">
      <div className="page-container flex flex-col gap-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <Logo />
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-text-muted">
            {navigation.slice(0, -1).map((item) => <a key={item.href} href={item.href} className="transition-colors hover:text-primary-glow">{item.label}</a>)}
          </div>
          <a href="#accueil" aria-label="Back to top" className="grid size-11 place-items-center rounded-full border border-white/10 text-text-muted transition-colors hover:border-primary hover:text-primary-glow"><ArrowUp className="size-4" /></a>
        </div>
        <div className="flex flex-col justify-between gap-2 border-t border-white/[.07] pt-6 text-[11px] tracking-[0.08em] text-text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Infinity Club. All rights reserved.</p>
          <p>No Limits For Infiniters</p>
        </div>
      </div>
    </footer>
  )
}
