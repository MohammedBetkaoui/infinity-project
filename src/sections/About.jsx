import { Check } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'

const goals = [
  'Développer les compétences techniques par la pratique.',
  'Créer un réseau d’entraide entre étudiants passionnés.',
  'Accompagner les projets, de l’idée à la réalisation.',
]

export default function About() {
  return (
    <section id="a-propos" className="relative z-10 scroll-mt-20 overflow-hidden bg-paper py-20 text-ink sm:py-24 lg:py-28">
      <div className="absolute left-0 top-1/3 h-px w-1/3 bg-gradient-to-r from-olive/0 via-olive/60 to-olive/0" />
      <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:px-12 xl:px-16">
        <div className="relative mx-auto w-full max-w-xl pb-14 pr-5 sm:pb-16 sm:pr-14">
          <div className="relative aspect-[4/5] w-[72%] overflow-hidden rounded-bl-md rounded-br-[3rem] rounded-tl-[3rem] rounded-tr-md bg-olive-dark">
            <img src="/assets/team-1.svg" alt="Membres d’Infinity Club réunis autour d’un projet" className="size-full object-cover" />
            <span className="absolute left-5 top-5 border-l-2 border-primary bg-background/80 px-3 py-2 text-xs font-semibold text-cream backdrop-blur">Atelier en équipe</span>
          </div>
          <div className="absolute right-0 top-[17%] aspect-[4/5] w-[47%] overflow-hidden border-[6px] border-paper bg-surface-light shadow-[0_18px_45px_rgba(23,32,24,.22)]">
            <img src="/assets/team-2.svg" alt="Atelier créatif du club" className="size-full object-cover" />
          </div>
          <div className="absolute bottom-0 right-[9%] w-[54%] rounded-sm bg-olive-dark p-5 text-cream shadow-[0_16px_36px_rgba(23,32,24,.18)]">
            <p className="font-display text-5xl font-semibold text-primary">∞</p>
            <p className="mt-1 max-w-[28ch] text-sm font-semibold leading-6">Une idée prend de l’ampleur quand elle circule dans le club.</p>
          </div>
        </div>

        <div>
          <SectionHeading
            tone="light"
            title={<>Ici, on apprend en faisant.<span className="mt-2 block text-[.72em] font-medium text-olive-dark">Et on avance ensemble.</span></>}
            description="Infinity Club réunit les étudiants de la Faculté MI autour d’une conviction simple : le meilleur moyen d’apprendre la technologie, c’est de la pratiquer ensemble."
          />

          <ul className="mt-9 border-t border-ink/20">
            {goals.map((goal) => (
              <li
                key={goal}
                className="flex items-start gap-4 border-b border-ink/20 py-5 text-sm leading-7 text-ink/75 sm:text-base"
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center bg-olive-dark text-cream"><Check className="size-3.5" /></span>
                {goal}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
