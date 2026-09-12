import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, NotebookPen } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { preparationItems } from './aivexData'

export default function AivexPreparation() {
  const [checked, setChecked] = useState([])
  const reduced = useMotionPreference()
  const count = checked.length
  const toggle = id => setChecked(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])

  return (
    <section className="ax-preparation" id="preparation" aria-labelledby="ax-preparation-title" tabIndex={-1}>
      <div className="ax-container ax-preparation-layout">
        <div className="ax-preparation-intro">
          <h2 id="ax-preparation-title">Une idée se prépare.<br />Pas besoin d’attendre.</h2>
          <p>En attendant les modalités officielles, commence par clarifier ton projet. Voici un carnet pour avancer à ton rythme.</p>
          <aside className="ax-preparation-tracker" aria-label="Progression du carnet personnel">
            <div className="ax-tracker-heading"><NotebookPen size={20} strokeWidth={1.5} aria-hidden="true" /><span>Mon carnet de préparation</span></div>
            <div className="ax-tracker-count" aria-hidden="true"><strong>{count}</strong><span>/ {preparationItems.length}<small>repères cochés</small></span></div>
            <div className="ax-tracker-line" aria-hidden="true"><motion.span animate={{ scaleX: count / preparationItems.length }} initial={false} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 186, damping: 25 }} /></div>
            <p role="status" aria-live="polite">{count === preparationItems.length ? 'Tes repères sont cochés. Pense aussi à consulter le règlement officiel.' : `${count} point${count > 1 ? 's' : ''} coché${count > 1 ? 's' : ''} sur ${preparationItems.length}. Rien à envoyer : ce carnet est pour toi.`}</p>
            <button type="button" className="ax-tracker-reset" disabled={!count} onClick={() => setChecked([])}>Tout décocher</button>
          </aside>
        </div>
        <div>
          <fieldset className="ax-preparation-list"><legend className="sr-only">Les repères de préparation de mon projet</legend>
            {preparationItems.map(item => <label className={`ax-preparation-item${checked.includes(item.id) ? ' is-checked' : ''}`} key={item.id}>
              <input className="ax-preparation-input" type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} aria-labelledby={`ax-prep-title-${item.id}`} aria-describedby={`ax-prep-note-${item.id}`} />
              <span className="ax-preparation-check" aria-hidden="true"><Check size={16} strokeWidth={1.8} /></span>
              <span className="ax-preparation-copy"><strong id={`ax-prep-title-${item.id}`}>{item.title}</strong><span id={`ax-prep-note-${item.id}`}>{item.detail}</span></span>
            </label>)}
          </fieldset>
          <p className="ax-preparation-disclaimer">Un outil de réflexion, pas une liste de pièces à fournir ni une grille d’évaluation. Les cases restent cochées uniquement pendant ta visite sur cette page.</p>
        </div>
      </div>
    </section>
  )
}
