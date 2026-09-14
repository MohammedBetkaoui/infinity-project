import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ContactClosing() {
  return (
    <section className="contact-campus" aria-labelledby="contact-campus-title">
      <div className="page-container contact-campus-layout">
        <div className="contact-campus-address">
          <MapPin size={21} strokeWidth={1.4} aria-hidden="true" />
          <div>
            <h2 id="contact-campus-title">Rooted in BBA. Open to new ideas.</h2>
            <p>Faculty of Mathematics and Computer Science<br />University of Bordj Bou Arreridj, Algeria</p>
          </div>
        </div>
        <Link to="/community" className="text-link">Meet the people behind Infinity</Link>
      </div>
    </section>
  )
}
