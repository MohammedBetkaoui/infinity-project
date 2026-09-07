import { ArrowUpRight, AtSign, MapPin, MessageCircle } from 'lucide-react'
import Logo from '../components/Logo'

export default function Contact() {
  return (
    <section id="contact" className="relative scroll-mt-16 overflow-hidden px-4 pb-5 pt-8 sm:px-6">
      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-bl-md rounded-br-[4rem] rounded-tl-[4rem] rounded-tr-md bg-sand p-6 text-ink sm:p-10 lg:p-14">
        <div className="absolute -right-48 -top-48 size-[38rem] rounded-full border border-olive/30" />
        <div className="absolute -right-20 -top-20 size-[24rem] rounded-full border border-primary-dark/30" />
        <div className="absolute bottom-0 left-0 h-2/3 w-full bg-[linear-gradient(transparent,rgba(23,32,24,.06))]" />
        <span className="pointer-events-none absolute -bottom-20 right-8 font-display text-[16rem] font-semibold leading-none text-ink/[.035]" aria-hidden="true">BBA</span>

        <div className="relative">
          <div className="flex items-center justify-between">
            <Logo compact />
            <span className="text-sm font-semibold text-ink/65">Bordj Bou Arréridj, Algérie</span>
          </div>

          <div className="my-14 grid gap-10 lg:my-20 lg:grid-cols-[1fr_.38fr] lg:items-end">
            <h2 className="max-w-5xl font-display text-[clamp(3.7rem,8.2vw,8.2rem)] font-semibold leading-[.8] tracking-[-0.055em]">
              Entre dans<br /><span className="font-medium text-cream">l’Infinity.</span>
            </h2>
            <p className="max-w-[34ch] border-l border-ink/25 pl-5 text-base leading-7 text-ink/70">Viens avec une compétence, une idée ou simplement l’envie d’apprendre. Le reste se construit avec l’équipe.</p>
          </div>

          <div className="grid gap-8 border-t border-background/20 pt-7 md:grid-cols-[1fr_auto] md:items-end">
            <div className="flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:gap-6">
              <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition-opacity hover:opacity-60"><AtSign className="size-4" /> @club_.infinity</a>
              <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition-opacity hover:opacity-60"><MessageCircle className="size-4" /> DM ouvert sur Instagram</a>
              <span className="inline-flex items-center gap-2"><MapPin className="size-4" /> Université BBA</span>
            </div>
            <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" data-magnetic data-ripple className="group inline-flex w-fit items-center gap-3 rounded-sm bg-ink px-7 py-4 font-bold text-cream transition-colors hover:bg-olive-dark">
              Nous écrire sur Instagram <ArrowUpRight className="size-5 text-primary transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
