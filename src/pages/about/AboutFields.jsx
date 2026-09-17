import { Link } from 'react-router-dom'
import { poles } from '../../data/siteData'
import AboutField from './AboutField'

export default function AboutFields() {
  return (
    <section className="about-fields" aria-labelledby="about-fields-title">
      <div className="page-container">
        <div className="about-fields-heading">
          <div><h2 id="about-fields-title">Six fields.<br />Find your way in.</h2></div>
          <p>You can arrive through code, AI, design or storytelling. The useful part begins when those perspectives meet.</p>
        </div>
        <ul className="about-fields-ledger">
          {poles.map((pole) => <AboutField key={pole.title} pole={pole} />)}
        </ul>
        <Link to="/#poles" className="about-fields-link">Explore every field <span aria-hidden="true">View the workshops</span></Link>
      </div>
    </section>
  )
}
