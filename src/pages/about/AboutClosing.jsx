import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AboutClosing() {
  return (
    <section className="about-closing" aria-labelledby="about-closing-title">
      <div className="page-container about-closing-layout">
        <div><h2 id="about-closing-title">Bring a question.<br />Meet your people.</h2></div>
        <div className="about-closing-action">
          <p>You do not need a finished portfolio or the perfect idea. Bring attention, effort and something you want to learn.</p>
          <Link to="/#communaute" className="about-closing-link">Meet the community</Link>
          <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">Talk to us on Instagram <ArrowUpRight size={16} /></a>
        </div>
        <p className="about-closing-location"><MapPin size={14} /> Bordj Bou Arreridj, Algeria</p>
      </div>
    </section>
  )
}
