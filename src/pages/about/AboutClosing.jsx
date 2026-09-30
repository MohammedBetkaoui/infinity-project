import { ArrowRight, ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AboutClosing() {
  return (
    <section className="about-closing" aria-labelledby="about-closing-title">
      <div className="page-container about-closing-layout">
        <p className="about-closing-index" aria-hidden="true">04 / NEXT</p>
        <div className="about-closing-heading">
          <p className="about-closing-overline">There is room at the table</p>
          <h2 id="about-closing-title">Bring a question.<br />Meet your people.</h2>
        </div>
        <div className="about-closing-action">
          <p>You do not need a finished portfolio or the perfect idea. Bring attention, effort and something you want to learn.</p>
          <div className="about-closing-links">
            <Link to="/community" className="about-closing-link">Meet the community <ArrowRight size={16} /></Link>
            <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={16} /></a>
          </div>
        </div>
        <p className="about-closing-location"><MapPin size={14} /> Bordj Bou Arreridj, Algeria</p>
      </div>
    </section>
  )
}
