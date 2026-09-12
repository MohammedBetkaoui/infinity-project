import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { INSTAGRAM_URL, practicalDetails } from './aivexData'

export default function AivexDetails() {
  return (
    <section className="ax-details" id="participer" aria-labelledby="ax-details-title" tabIndex={-1}>
      <div className="ax-container ax-details-layout">
        <div className="ax-details-intro">
          <h2 id="ax-details-title">La prochaine étape,<br />c’est par ici.</h2>
          <p>Tu veux prendre part à AIVEX ? Voici les informations disponibles pour cette deuxième édition.</p>
          <div className="ax-announcement"><CalendarDays size={21} aria-hidden="true" /><div><strong>Les détails se préparent.</strong><p>Dates, règlement et inscriptions : retrouve les annonces officielles sur le compte du club.</p></div></div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="ax-text-link">Voir les annonces sur Instagram <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <dl className="ax-facts">
          {practicalDetails.map(item => (
            <div className="ax-fact" key={item.label}>
              <dt>{item.label}</dt>
              <dd><strong className={item.pending ? 'ax-pending' : undefined}>{item.pending && <i aria-hidden="true" />}{item.value}</strong><p>{item.detail}</p></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
