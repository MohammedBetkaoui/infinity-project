import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { contactInstagram } from './contactData'

export default function ContactClosing() {
  return (
    <section className="contact-closing" aria-labelledby="contact-closing-title">
      <div className="page-container">
        <div className="contact-closing-layout">
          <h2 id="contact-closing-title">Bring the idea.<br />We will start there.</h2>
          <div className="contact-closing-copy">
            <p>Send the club a direct message. For recruitment dates and event announcements, Instagram is also where the latest information is shared.</p>
            <a href={contactInstagram} target="_blank" rel="noreferrer" className="contact-closing-primary" data-magnetic data-ripple>Write to Infinity Club <ArrowUpRight size={18} /></a>
            <Link to="/community" className="contact-closing-secondary">Meet the community</Link>
          </div>
        </div>
        <div className="contact-closing-foot"><span>No Limits For Infiniters</span><span><MapPin size={14} /> Bordj Bou Arreridj, Algeria</span></div>
      </div>
    </section>
  )
}
