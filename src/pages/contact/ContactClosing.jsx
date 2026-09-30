import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ContactClosing() {
  return (
    <section className="contact-campus" aria-labelledby="contact-campus-title">
      <div className="page-container">
        <p className="contact-section-index contact-section-index-dark" data-animated-text=""><span>03 / Find us</span><span>Bordj Bou Arreridj · Algeria</span></p>
        <div className="contact-campus-layout">
          <div>
            <p className="contact-overline" data-animated-text="">A local club with an open horizon</p>
            <h2 id="contact-campus-title">Rooted in BBA.<br />Open to what is next.</h2>
          </div>
          <div className="contact-campus-copy">
            <p>Infinity Club lives at the Faculty of Mathematics and Computer Science, inside the University of Bordj Bou Arreridj.</p>
            <address className="contact-campus-address">
              <MapPin size={18} strokeWidth={1.4} aria-hidden="true" />
              <span>MI Faculty<br />Bordj Bou Arreridj, Algeria</span>
            </address>
            <div className="contact-campus-actions">
              <Link to="/community">Meet the community <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
              <Link to="/join">Join Infinity <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
        <div className="contact-campus-signoff"><span>No Limits For Infiniters</span><span>Infinity Club · MI Faculty</span></div>
      </div>
    </section>
  )
}
