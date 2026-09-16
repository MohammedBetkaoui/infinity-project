import { useState } from 'react'
import { AlertCircle, Image as ImageIcon, MapPin, Type, X } from 'lucide-react'
import useDismissable from '../hooks/useDismissable'
import { EVENT_CATEGORIES, EVENT_COVERS } from '../data/mockEvents'

const EMPTY = {
  title: '', category: EVENT_CATEGORIES[0], description: '',
  startsAt: '', venue: '', capacity: '', cover: EVENT_COVERS[0], status: 'draft',
}

const validators = {
  title: (value) => {
    const trimmed = String(value || '').trim()
    if (trimmed.length < 3) return 'Donnez un titre d’au moins 3 caractères.'
    if (trimmed.length > 120) return 'Titre trop long (120 caractères maximum).'
    return ''
  },
  description: (value) => {
    const trimmed = String(value || '').trim()
    if (trimmed.length < 20) return 'Décrivez l’événement en au moins 20 caractères.'
    if (trimmed.length > 900) return 'Description trop longue (900 caractères maximum).'
    return ''
  },
  startsAt: (value) => (value ? '' : 'Choisissez une date et une heure.'),
  venue: (value) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return 'Indiquez le lieu.'
    if (trimmed.length > 140) return 'Lieu trop long (140 caractères maximum).'
    return ''
  },
  capacity: (value) => {
    const number = Number(value)
    if (!value || !Number.isFinite(number)) return 'Indiquez une capacité.'
    if (number < 1) return 'La capacité doit être d’au moins 1 place.'
    if (number > 5000) return 'Capacité irréaliste (5000 maximum).'
    return ''
  },
}

export default function EventFormModal({ event, onSave, onClose }) {
  const surfaceRef = useDismissable(onClose)
  const [values, setValues] = useState(() => (event ? { ...EMPTY, ...event } : EMPTY))
  const [errors, setErrors] = useState({})

  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  const submit = (submitEvent) => {
    submitEvent.preventDefault()
    const found = {}
    Object.entries(validators).forEach(([name, validate]) => {
      const message = validate(values[name])
      if (message) found[name] = message
    })
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const [first] = Object.keys(found)
      surfaceRef.current?.querySelector(`[name="${first}"]`)?.focus()
      return
    }
    onSave({
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      venue: values.venue.trim(),
      capacity: Number(values.capacity),
    })
  }

  const field = (name, label, control, hint) => (
    <div className="ad-form-field" data-invalid={errors[name] ? 'true' : undefined} data-span={hint?.span}>
      <label htmlFor={`evt-${name}`}>{label}{hint?.optional && <small>facultatif</small>}</label>
      {control}
      <span className="ad-form-error">{errors[name] && <><AlertCircle size={12} /> {errors[name]}</>}</span>
    </div>
  )

  return (
    <>
      <div className="ad-overlay" onClick={onClose} aria-hidden="true" />
      <div ref={surfaceRef} className="ad-modal" data-wide="true" role="dialog" aria-modal="true"
        aria-labelledby="ad-event-form-title" tabIndex={-1}>
        <header className="ad-panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="ad-eyebrow">{event ? 'Modification' : 'Nouvel événement'}</p>
            <h2 id="ad-event-form-title">{event ? event.title : 'Créer un événement'}</h2>
          </div>
          <button type="button" className="ad-icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </header>

        <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <section className="ad-form-section">
              <div className="ad-form-legend">
                <span className="ad-form-step" aria-hidden="true">01</span>
                <Type size={13} aria-hidden="true" />
                <h3>Identité</h3>
              </div>
              <div className="ad-form-grid">
                {field('title', 'Titre', (
                  <input id="evt-title" name="title" className="ad-input" value={values.title}
                    onChange={(e) => setField('title', e.target.value)} placeholder="AIVEX 2026 — Seconde édition" />
                ), { span: '2' })}

                {field('category', 'Catégorie', (
                  <select id="evt-category" name="category" className="ad-select" value={values.category}
                    onChange={(e) => setField('category', e.target.value)}>
                    {EVENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                ))}

                {field('status', 'Statut', (
                  <select id="evt-status" name="status" className="ad-select" value={values.status}
                    onChange={(e) => setField('status', e.target.value)}>
                    <option value="draft">Brouillon</option>
                    <option value="published">Publié</option>
                    <option value="archived">Archivé</option>
                  </select>
                ))}

                {field('description', 'Description', (
                  <textarea id="evt-description" name="description" className="ad-textarea" maxLength={900}
                    value={values.description} onChange={(e) => setField('description', e.target.value)}
                    placeholder="Ce que les participants vont faire, apprendre ou construire..." />
                ), { span: '2' })}
              </div>
            </section>

            <section className="ad-form-section">
              <div className="ad-form-legend">
                <span className="ad-form-step" aria-hidden="true">02</span>
                <MapPin size={13} aria-hidden="true" />
                <h3>Quand et où</h3>
              </div>
              <div className="ad-form-grid">
                {field('startsAt', 'Date et heure', (
                  <input id="evt-startsAt" name="startsAt" type="datetime-local" className="ad-input"
                    value={values.startsAt} onChange={(e) => setField('startsAt', e.target.value)} />
                ))}

                {field('capacity', 'Capacité maximale', (
                  <input id="evt-capacity" name="capacity" type="number" min="1" max="5000" className="ad-input"
                    value={values.capacity} onChange={(e) => setField('capacity', e.target.value)} placeholder="120" />
                ))}

                {field('venue', 'Lieu', (
                  <input id="evt-venue" name="venue" className="ad-input" value={values.venue}
                    onChange={(e) => setField('venue', e.target.value)} placeholder="Amphithéâtre A — Faculté MI" />
                ), { span: '2' })}
              </div>
            </section>

            <section className="ad-form-section">
              <div className="ad-form-legend">
                <span className="ad-form-step" aria-hidden="true">03</span>
                <ImageIcon size={13} aria-hidden="true" />
                <h3>Visuel de couverture</h3>
              </div>
              <div className="ad-cover-picker" role="radiogroup" aria-label="Visuel de couverture">
                {EVENT_COVERS.map((cover) => (
                  <button key={cover} type="button" className="ad-cover-option" data-on={values.cover === cover || undefined}
                    role="radio" aria-checked={values.cover === cover} onClick={() => setField('cover', cover)}>
                    <img src={cover} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
              <p className="ad-form-hint" style={{ marginTop: 10 }}>
                L’upload d’un visuel personnalisé sera disponible quand le stockage sera branché.
              </p>
            </section>
          </div>

          <footer className="ad-panel-foot">
            <button type="button" className="ad-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>Annuler</button>
            <button type="submit" className="ad-btn" data-variant="primary">
              {event ? 'Enregistrer' : 'Créer l’événement'}
            </button>
          </footer>
        </form>
      </div>
    </>
  )
}
