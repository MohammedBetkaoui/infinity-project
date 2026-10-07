import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import './page-paused.css'

// Holding screen for a route whose page is temporarily paused (see
// OPEN_DAY_PAUSED in App.jsx). The paused page's own code is left as is.
export default function PagePaused({ label }) {
  return (
    <section className="page-paused" aria-labelledby="page-paused-title" lang="fr">
      <div className="page-container page-paused-inner">
        <p className="page-paused-rail">
          <span>{label}</span>
          <span className="page-paused-status"><i aria-hidden="true" />Statut&nbsp;: en pause</span>
        </p>
        <div className="page-paused-layout">
          <div className="page-paused-copy">
            <h1 id="page-paused-title">Page mise en pause <span>par le développeur</span></h1>
            <div className="page-paused-note">
              <p className="page-paused-lead">Cette page est temporairement indisponible. Elle sera de nouveau accessible très prochainement.</p>
              <p className="page-paused-summary">En attendant, retrouvez les autres événements organisés par Infinity Club.</p>
              <div className="page-paused-actions">
                <Link className="page-paused-primary" to="/events">Voir les événements <ArrowUpRight size={17} aria-hidden="true" /></Link>
                <Link className="page-paused-secondary" to="/"><ArrowLeft size={16} aria-hidden="true" />Retour à l’accueil</Link>
              </div>
            </div>
          </div>
          <div className="page-paused-orb" aria-hidden="true"><span className="page-paused-bars"><i /><i /></span></div>
        </div>
        <p className="page-paused-foot" aria-hidden="true"><span>Infinity Club</span><span>Bordj Bou Arreridj</span></p>
      </div>
    </section>
  )
}
