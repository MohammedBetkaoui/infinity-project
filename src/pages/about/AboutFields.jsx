import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { poles } from '../../data/siteData'
import AboutField from './AboutField'

export default function AboutFields() {
  return (
    <section className="about-fields" aria-labelledby="about-fields-title">
      <div className="page-container">
        <p className="about-section-index" data-animated-text=""><span>03 / Learning map</span><span>{String(poles.length).padStart(2, '0')} disciplines</span></p>
        <div className="about-fields-heading">
          <div>
            <p className="about-fields-overline" data-animated-text="">One club, many ways to contribute</p>
            <h2 id="about-fields-title">Six fields.<br />Find your way in.</h2>
          </div>
          <p>You can arrive through code, AI, design or storytelling. The useful part begins when those perspectives meet.</p>
        </div>
        <ul className="about-fields-ledger">
          {poles.map((pole, index) => <AboutField key={pole.title} pole={pole} index={index + 1} />)}
        </ul>
        <Link to="/#poles" className="about-fields-link">
          <span>Explore every field</span>
          <span aria-hidden="true">View the workshops <ArrowUpRight size={16} /></span>
        </Link>
      </div>
    </section>
  )
}
