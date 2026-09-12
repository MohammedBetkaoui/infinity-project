import { Link } from 'react-router-dom'
import { ArrowUpRight, MoveUp } from 'lucide-react'
import AivexWordmark from './AivexWordmark'
import { INSTAGRAM_URL } from './aivexData'

export default function AivexFooter() {
  return (
    <footer className="ax-footer">
      <div className="ax-container">
        <div className="ax-footer-callout">
          <div><p>Une question sur AIVEX ?</p><h2>Parlons de<br />la suite.</h2></div>
          <div className="ax-footer-contact"><p>Derrière l’événement, des étudiants qui construisent, comme toi.</p><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="ax-button ax-button-cream">Écrire à Infinity Club <ArrowUpRight size={17} aria-hidden="true" /></a><span>@club_.infinity</span></div>
          <span className="ax-footer-cross" aria-hidden="true">×</span>
        </div>
        <div className="ax-footer-bottom">
          <Link to="/" className="ax-footer-home" aria-label="Retour à l’accueil Infinity Club"><AivexWordmark /><span>Un événement Infinity Club</span></Link>
          <p>Faculté MI, Université de BBA<br />No Limits For Infiniters</p>
          <a className="ax-to-top" href="#competition" aria-label="Revenir en haut de la page"><MoveUp size={18} /></a>
        </div>
      </div>
    </footer>
  )
}
