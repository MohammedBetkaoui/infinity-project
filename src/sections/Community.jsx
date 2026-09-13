import { ArrowUpRight, AtSign } from 'lucide-react'
import { Link } from 'react-router-dom'
import CountUp from '../components/CountUp'
import { stats } from '../data/siteData'

export default function Community() {
  return (
    <section id="communaute" className="community-section section-space">
      <div className="page-container">
        <div className="community-top"><h2>Different talents.<br />One place to meet.</h2><div><p>It is not a skill level, a language or a specialism that brings us together. It is the desire to understand things and build something with others.</p><Link to="/community" className="text-link mt-4">Meet the Infiniters</Link></div></div>
        <dl className="community-numbers">{stats.map((stat, index) => <div key={stat.label}><dd><CountUp value={stat.value} suffix={stat.suffix} delay={[0, .09, .23, .36][index]} /></dd><dt>{stat.label}</dt></div>)}</dl>
        <div className="community-social"><div><AtSign size={24} strokeWidth={1.3} /><p>There is life between workshops, too.<span>Find announcements and behind-the-scenes moments on Instagram.</span></p></div><a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer" className="text-link">@club_.infinity <ArrowUpRight size={16} /></a></div>
      </div>
    </section>
  )
}
