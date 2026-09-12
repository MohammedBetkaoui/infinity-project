import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'

export default function AivexOrganisation() {
  return (
    <section className="ax-organisation" aria-labelledby="ax-organisation-title">
      <div className="ax-container ax-organisation-layout">
        <div className="ax-bba-signature" aria-hidden="true"><span>BBA</span><i /><small>Le point de départ.</small></div>
        <div className="ax-organisation-copy"><h2 id="ax-organisation-title">Derrière AIVEX,<br />il y a Infinity.</h2><p>Un club scientifique, des étudiants et l’envie de faire vivre la tech au-delà des cours. AIVEX s’inscrit dans cet esprit : apprendre en construisant et partager ce que l’on découvre.</p><Link to="/#a-propos" className="ax-text-link">Faire connaissance avec le club</Link></div>
        <address className="ax-university"><MapPin size={21} strokeWidth={1.4} aria-hidden="true" /><strong>Faculté des Mathématiques<br />et Informatique</strong><p>Université Mohamed El Bachir El Ibrahimi</p><span>Bordj Bou Arréridj, Algérie</span></address>
      </div>
    </section>
  )
}
