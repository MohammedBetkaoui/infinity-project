import { useEffect, useMemo, useState } from 'react'
import {
  Archive, CalendarDays, CalendarPlus, Copy, EllipsisVertical, Eye, EyeOff,
  Gauge, MapPin, Pencil, Search, Trash2, Users,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import SidePanel from '../components/SidePanel'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { CardGridSkeleton, StatsSkeleton } from '../components/Skeleton'
import { useToast } from '../components/toastContext'
import { EVENT_STATUS_LABELS, attendeesFor, events as seedEvents } from '../data/mockEvents'
import EventFormModal from './EventFormModal'

// Reference instant for upcoming/past, captured once when the module
// loads. Reading the clock during render is impure and would make the
// filtered list unstable across re-renders.
const NOW = Date.now()

const dayNumber = new Intl.DateTimeFormat('fr-FR', { day: '2-digit' })
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
const fullDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' })

export default function EventsPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [when, setWhen] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [menuFor, setMenuFor] = useState(null)
  const [form, setForm] = useState(null)
  const [attendeesOf, setAttendeesOf] = useState(null)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEvents(seedEvents)
      setLoading(false)
    }, 680)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!menuFor) return undefined
    const close = (event) => {
      if (!event.target.closest('[data-event-menu]')) setMenuFor(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuFor])

  const stats = useMemo(() => {
    const upcoming = events.filter((item) => new Date(item.startsAt).getTime() > NOW)
    const registered = events.reduce((sum, item) => sum + item.registered, 0)
    const withCapacity = events.filter((item) => item.capacity > 0 && item.registered > 0)
    const fill = withCapacity.length
      ? Math.round(withCapacity.reduce((sum, item) => sum + item.registered / item.capacity, 0) / withCapacity.length * 100)
      : 0
    const perStatus = ['draft', 'published', 'done', 'archived'].map(
      (key) => events.filter((item) => item.status === key).length,
    )
    return { total: events.length, upcoming: upcoming.length, registered, fill, perStatus }
  }, [events])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return events
      .filter((item) => {
        if (status !== 'all' && item.status !== status) return false
        if (when === 'upcoming' && new Date(item.startsAt).getTime() <= NOW) return false
        if (when === 'past' && new Date(item.startsAt).getTime() > NOW) return false
        if (!needle) return true
        return [item.title, item.venue, item.category].some((field) => field.toLowerCase().includes(needle))
      })
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  }, [events, query, status, when])

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const patch = (ids, changes, message) => {
    setEvents((current) => current.map((item) => (ids.includes(item.id) ? { ...item, ...changes } : item)))
    setSelected(new Set())
    setMenuFor(null)
    toast.success(message.title, message.body)
  }

  const duplicate = (event) => {
    const copy = {
      ...event,
      id: `evt_${Math.random().toString(36).slice(2, 8)}`,
      title: `${event.title} (copie)`,
      status: 'draft',
      registered: 0,
    }
    setEvents((current) => [copy, ...current])
    setMenuFor(null)
    toast.success('Événement dupliqué', 'La copie a été créée en brouillon.')
  }

  const remove = (ids) => {
    setEvents((current) => current.filter((item) => !ids.includes(item.id)))
    setSelected(new Set())
    setConfirm(null)
    toast.error(ids.length > 1 ? `${ids.length} événements supprimés` : 'Événement supprimé', 'Cette action est définitive.')
  }

  const save = (values) => {
    if (form?.event) {
      setEvents((current) => current.map((item) => (item.id === form.event.id ? { ...item, ...values } : item)))
      toast.success('Événement mis à jour', values.title)
    } else {
      setEvents((current) => [{
        ...values,
        id: `evt_${Math.random().toString(36).slice(2, 8)}`,
        registered: 0,
      }, ...current])
      toast.success('Événement créé', `${values.title} est enregistré en ${values.status === 'published' ? 'publié' : 'brouillon'}.`)
    }
    setForm(null)
  }

  const selectedIds = [...selected]

  return (
    <div className="ad-page">
      <div className="ad-page-head">
        <div>
          <p className="ad-eyebrow">Programmation · Année 2026</p>
          <h1 className="ad-page-title">Événements</h1>
          <p className="ad-page-sub">
            Ateliers, compétitions et rencontres du club. Un événement publié devient visible sur le site public
            et ouvre les inscriptions.
          </p>
        </div>
        <div className="ad-page-actions">
          <button type="button" className="ad-btn" data-variant="primary" onClick={() => setForm({ event: null })}>
            <CalendarPlus size={15} /> Nouvel événement
          </button>
        </div>
      </div>

      {loading ? <StatsSkeleton /> : (
        <div className="ad-stats">
          <StatCard index={0} lead label="Événements" icon={CalendarDays} value={stats.total}
            delta={`${stats.upcoming} à venir`} deltaTone="up" foot="toutes catégories confondues" />
          <StatCard index={1} label="Répartition" icon={Eye} value={stats.perStatus[1]} unit="publiés"
            spark={stats.perStatus} foot="brouillon · publié · terminé · archivé" />
          <StatCard index={2} label="Inscriptions totales" icon={Users} value={stats.registered}
            track={Math.min(stats.registered / 600, 1)} foot="toutes éditions confondues" />
          <StatCard index={3} label="Remplissage moyen" icon={Gauge} value={stats.fill} unit="%"
            ring={stats.fill / 100} foot="sur les événements ouverts" />
        </div>
      )}

      <div className="ad-toolbar">
        <label className="ad-field">
          <Search size={15} aria-hidden="true" />
          <input type="search" className="ad-input" placeholder="Rechercher un événement..."
            value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Rechercher un événement" />
        </label>

        <div className="ad-segment" role="group" aria-label="Filtrer par statut">
          {[
            ['all', 'Tous'],
            ['published', 'Publiés'],
            ['draft', 'Brouillons'],
            ['done', 'Terminés'],
            ['archived', 'Archivés'],
          ].map(([value, label]) => (
            <button key={value} type="button" data-on={status === value || undefined} onClick={() => setStatus(value)}>
              {label}
            </button>
          ))}
        </div>

        <select className="ad-select" value={when} onChange={(event) => setWhen(event.target.value)} aria-label="Filtrer par date">
          <option value="all">Toutes les dates</option>
          <option value="upcoming">À venir</option>
          <option value="past">Passés</option>
        </select>

        <span className="ad-toolbar-count">{filtered.length} / {events.length}</span>
      </div>

      {selectedIds.length > 0 && (
        <div className="ad-bulk">
          <span className="ad-bulk-count">{selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}</span>
          <div className="ad-bulk-actions">
            <button type="button" className="ad-btn" data-size="sm" data-variant="mint"
              onClick={() => patch(selectedIds, { status: 'published' }, { title: 'Événements publiés', body: 'Ils sont désormais visibles sur le site public.' })}>
              <Eye size={13} /> Publier
            </button>
            <button type="button" className="ad-btn" data-size="sm"
              onClick={() => patch(selectedIds, { status: 'archived' }, { title: 'Événements archivés', body: 'Ils sont retirés du site public.' })}>
              <Archive size={13} /> Archiver
            </button>
            <button type="button" className="ad-btn" data-size="sm" data-variant="danger"
              onClick={() => setConfirm({ ids: selectedIds })}>
              <Trash2 size={13} /> Supprimer
            </button>
            <button type="button" className="ad-btn" data-size="sm" onClick={() => setSelected(new Set())}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <CardGridSkeleton /> : filtered.length === 0 ? (
        <div className="ad-panel">
          <EmptyState
            title={query || status !== 'all' || when !== 'all' ? 'Aucun événement trouvé' : 'Aucun événement programmé'}
            message={query || status !== 'all' || when !== 'all'
              ? 'Aucun événement ne correspond à ces filtres. Élargissez la recherche ou changez le statut.'
              : 'Créez le premier événement de la saison : il restera en brouillon tant que vous ne l’aurez pas publié.'}
            action={(query || status !== 'all' || when !== 'all') ? (
              <button type="button" className="ad-btn" onClick={() => { setQuery(''); setStatus('all'); setWhen('all') }}>
                Réinitialiser les filtres
              </button>
            ) : (
              <button type="button" className="ad-btn" data-variant="primary" onClick={() => setForm({ event: null })}>
                <CalendarPlus size={15} /> Créer un événement
              </button>
            )}
          />
        </div>
      ) : (
        <div className="ad-grid">
          {filtered.map((event, index) => {
            const date = new Date(event.startsAt)
            const fill = event.capacity ? Math.min(event.registered / event.capacity, 1) : 0
            return (
              <article key={event.id} className="ad-event" style={{ '--i': index }}
                data-selected={selected.has(event.id) || undefined}>
                <div className="ad-event-cover">
                  <img src={event.cover} alt="" loading="lazy" />
                  <div className="ad-event-cover-top">
                    <input type="checkbox" className="ad-check ad-event-check" checked={selected.has(event.id)}
                      onChange={() => toggle(event.id)} aria-label={`Sélectionner ${event.title}`} />
                    <StatusBadge status={event.status} label={EVENT_STATUS_LABELS[event.status]} />
                  </div>
                  <div className="ad-event-date" aria-hidden="true">
                    <strong>{dayNumber.format(date)}</strong>
                    <span>{monthShort.format(date).replace('.', '')}</span>
                  </div>
                  <span className="ad-event-cat">{event.category}</span>
                </div>

                <div className="ad-event-body">
                  <h2 className="ad-event-title">{event.title}</h2>
                  <p className="ad-event-place">
                    <MapPin size={12} aria-hidden="true" /> {event.venue}
                  </p>

                  <div className="ad-event-fill">
                    <div className="ad-event-fill-head">
                      <span><b>{event.registered}</b> / {event.capacity} inscrits</span>
                      <span>{event.capacity ? Math.round(fill * 100) : 0}%</span>
                    </div>
                    <div className="ad-track" style={{ marginTop: 0 }}>
                      <span style={{ width: `${Math.round(fill * 100)}%` }} />
                    </div>
                  </div>
                </div>

                <footer className="ad-event-foot">
                  <button type="button" className="ad-btn" data-size="sm" onClick={() => setAttendeesOf(event)}>
                    <Users size={13} /> Inscrits
                  </button>
                  <button type="button" className="ad-btn" data-size="sm" onClick={() => setForm({ event })}>
                    <Pencil size={13} /> Modifier
                  </button>
                  <div style={{ position: 'relative', marginLeft: 'auto' }} data-event-menu>
                    <button type="button" className="ad-icon-btn" style={{ width: 30, height: 30 }}
                      onClick={() => setMenuFor(menuFor === event.id ? null : event.id)}
                      aria-haspopup="menu" aria-expanded={menuFor === event.id}
                      aria-label={`Autres actions pour ${event.title}`}>
                      <EllipsisVertical size={15} />
                    </button>
                    {menuFor === event.id && (
                      <div className="ad-menu" role="menu" style={{ bottom: 'calc(100% + 8px)', top: 'auto' }}>
                        <button type="button" className="ad-menu-item" role="menuitem" onClick={() => duplicate(event)}>
                          <Copy size={14} /> Dupliquer
                        </button>
                        {event.status === 'published' ? (
                          <button type="button" className="ad-menu-item" role="menuitem"
                            onClick={() => patch([event.id], { status: 'draft' }, { title: 'Événement dépublié', body: 'Il n’apparaît plus sur le site public.' })}>
                            <EyeOff size={14} /> Dépublier
                          </button>
                        ) : (
                          <button type="button" className="ad-menu-item" role="menuitem"
                            onClick={() => patch([event.id], { status: 'published' }, { title: 'Événement publié', body: 'Il est visible sur le site public.' })}>
                            <Eye size={14} /> Publier
                          </button>
                        )}
                        <button type="button" className="ad-menu-item" role="menuitem"
                          onClick={() => patch([event.id], { status: 'archived' }, { title: 'Événement archivé', body: 'Il est retiré du site public.' })}>
                          <Archive size={14} /> Archiver
                        </button>
                        <div className="ad-menu-sep" />
                        <button type="button" className="ad-menu-item" data-danger="true" role="menuitem"
                          onClick={() => { setMenuFor(null); setConfirm({ ids: [event.id], title: event.title }) }}>
                          <Trash2 size={14} /> Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {form && (
        <EventFormModal event={form.event} onSave={save} onClose={() => setForm(null)} />
      )}

      {attendeesOf && (
        <SidePanel
          title={attendeesOf.title}
          eyebrow={`${attendeesOf.registered} inscrits · ${fullDate.format(new Date(attendeesOf.startsAt))}`}
          onClose={() => setAttendeesOf(null)}
          footer={(
            <button type="button" className="ad-btn" style={{ marginLeft: 'auto' }}
              onClick={() => toast.info('Export préparé', 'La liste sera exportable en CSV une fois l’API branchée.')}>
              Exporter la liste
            </button>
          )}
        >
          {attendeesOf.registered === 0 ? (
            <EmptyState title="Aucun inscrit" message="Les inscriptions apparaîtront ici dès que l’événement sera publié et ouvert." />
          ) : (
            <div className="ad-panel">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th style={{ width: 70 }}>Niveau</th>
                    <th style={{ width: 96 }}>Présence</th>
                  </tr>
                </thead>
                <tbody>
                  {attendeesFor(attendeesOf).map((person, index) => (
                    <tr key={person.id} style={{ '--i': index }}>
                      <td>
                        <span className="ad-cell-name">{person.name}</span>
                        <span className="ad-cell-meta">{person.email}</span>
                      </td>
                      <td><span className="ad-cell-mono">{person.studyYear}</span></td>
                      <td>
                        <StatusBadge status={person.checkedIn ? 'accepted' : 'draft'}
                          label={person.checkedIn ? 'Présent' : 'Attendu'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {attendeesOf.registered > 24 && (
                <div className="ad-pagination">
                  <span className="ad-pagination-info">24 affichés sur {attendeesOf.registered}</span>
                </div>
              )}
            </div>
          )}
        </SidePanel>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.ids.length > 1 ? `Supprimer ${confirm.ids.length} événements ?` : 'Supprimer cet événement ?'}
          message={confirm.ids.length > 1
            ? 'Ces événements et leurs inscriptions seront définitivement supprimés. Cette action ne peut pas être annulée.'
            : `« ${confirm.title} » et ses inscriptions seront définitivement supprimés. Cette action ne peut pas être annulée.`}
          confirmLabel="Supprimer"
          icon={Trash2}
          onConfirm={() => remove(confirm.ids)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
