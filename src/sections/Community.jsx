import { AtSign, MoveUpRight } from 'lucide-react'
import CountUp from '../components/CountUp'
import SectionHeading from '../components/SectionHeading'
import { stats } from '../data/siteData'

const avatars = [
  { initials: 'AM', color: '#8FD96B' },
  { initials: 'YK', color: '#D4EBC8' },
  { initials: 'LN', color: '#56A957' },
  { initials: 'RM', color: '#A9C89B' },
  { initials: 'SA', color: '#6FCB72' },
]

const statTreatments = [
  { box: 'bg-paper text-ink', value: 'text-primary-dark', label: 'text-ink/60' },
  { box: 'bg-transparent text-cream', value: 'text-cream', label: 'text-sage' },
  { box: 'bg-primary-dark/30 text-cream', value: 'text-primary', label: 'text-sage' },
  { box: 'bg-background/35 text-cream', value: 'text-sand', label: 'text-text-muted' },
]

export default function Community() {
  return (
    <section id="communaute" className="relative scroll-mt-20 overflow-hidden bg-olive-dark py-20 sm:py-24 lg:py-28">
      <div className="absolute -left-56 top-1/3 size-[32rem] rounded-full bg-sand/[.05] blur-[120px]" />
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12 xl:px-16">
        <div className="grid gap-14 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div>
            <SectionHeading
              title={<>Une communauté qui compte.<span className="mt-2 block text-[.72em] font-medium text-sage">Et sur qui compter.</span></>}
              description="Chaque chiffre raconte une rencontre, une compétence transmise ou une idée devenue réelle. Infinity est avant tout une énergie collective."
            />
            <div className="mt-10 flex items-center gap-4">
              <div className="flex -space-x-3">
                {avatars.map((avatar) => (
                  <span
                    key={avatar.initials}
                    className="grid size-11 place-items-center rounded-full border-2 border-olive-dark font-display text-xs font-bold text-background"
                    style={{ backgroundColor: avatar.color }}
                  >
                    {avatar.initials}
                  </span>
                ))}
              </div>
              <p className="text-xs leading-5 text-text-muted"><span className="font-bold text-cream">Des profils différents.</span><br />Une même ambition.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 overflow-hidden border-y border-sage/20 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`flex min-h-40 flex-col justify-between border-sage/15 p-5 sm:min-h-48 sm:p-7 ${statTreatments[index].box} ${index % 2 === 0 ? 'border-r' : ''} ${index < 2 ? 'border-b lg:border-b-0' : ''} ${index > 0 ? 'lg:border-l' : ''}`}
              >
                <span className={`font-display text-5xl font-semibold tracking-[-0.05em] sm:text-7xl ${statTreatments[index].value}`}><CountUp value={stat.value} suffix={stat.suffix} delay={[0, 0.08, 0.23, 0.41][index]} /></span>
                <p className={`mt-5 text-sm font-semibold ${statTreatments[index].label}`}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <a
          href="https://www.instagram.com/club_.infinity/"
          target="_blank"
          rel="noreferrer"
          className="group mt-8 flex flex-col justify-between gap-6 border-b border-sage/30 py-6 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center bg-paper text-ink"><AtSign className="size-5" /></span>
            <div><p className="font-display text-2xl font-semibold text-cream">@club_.infinity</p><p className="text-sm text-sage">Ateliers, coulisses et annonces du club.</p></div>
          </div>
          <span data-magnetic className="inline-flex items-center gap-2 text-sm font-bold text-primary">Suivre l’aventure <MoveUpRight className="size-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" /></span>
        </a>
      </div>
    </section>
  )
}
