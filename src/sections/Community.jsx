import { ArrowUpRight, AtSign } from 'lucide-react'
import CountUp from '../components/CountUp'
import { stats } from '../data/siteData'

export default function Community() {
  return (
    <section id="communaute" className="community-section section-space">
      <div className="page-container">
        <div className="community-top"><h2>Chacun son talent.<br />Le même point de rencontre.</h2><p>Ce qui nous rassemble n’est pas un niveau, un langage ou une spécialité. C’est l’envie de comprendre et de construire quelque chose à plusieurs.</p></div>
        <dl className="community-numbers">{stats.map((stat, index) => <div key={stat.label}><dd><CountUp value={stat.value} suffix={stat.suffix} delay={[0, .09, .23, .36][index]} /></dd><dt>{stat.label}</dt></div>)}</dl>
        <div className="community-social"><div><AtSign size={24} strokeWidth={1.3} /><p>Le club se raconte aussi entre deux ateliers.<span>Les annonces et les coulisses sont sur Instagram.</span></p></div><a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" className="text-link">@club_.infinity <ArrowUpRight size={16} /></a></div>
      </div>
    </section>
  )
}
