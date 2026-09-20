import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import FmiLogo from '../../components/FmiLogo'

export default function AivexOrganisation() {
  return (
    <section className="ax-organisation" aria-labelledby="ax-organisation-title">
      <div className="ax-container ax-organisation-layout">
        <div className="ax-bba-signature" aria-hidden="true"><span>BBA</span><i /><small>Where it all starts.</small></div>
        <div className="ax-organisation-copy"><h2 id="ax-organisation-title">Behind AIVEX,<br />there is Infinity.</h2><p>A scientific club, a group of students and a desire to take tech beyond the classroom. AIVEX is part of that spirit: learn by building and share what you discover.</p><Link to="/about" className="ax-text-link">Get to know the club</Link></div>
        <address className="ax-university"><MapPin size={21} strokeWidth={1.4} aria-hidden="true" /><strong>Faculty of Mathematics<br />and Computer Science</strong><p>Mohamed El Bachir El Ibrahimi University</p><span className="ax-university-mark" aria-hidden="true"><FmiLogo /></span></address>
      </div>
    </section>
  )
}
