import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, Check, Download, Eye, Inbox, Mail,
  Phone, Search, Trash2, TrendingUp, UserCheck, X,
} from 'lucide-react'
import DataTable from '../components/DataTable'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import SidePanel from '../components/SidePanel'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { StatsSkeleton, TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/toastContext'
import {
  AVAILABILITY_LABELS, EXPERIENCE_LABELS, STATUS_LABELS, STUDY_YEAR_LABELS, joinRequests,
} from '../data/mockJoinRequests'

const PAGE_SIZE = 8

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })
const fullDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

const initialsOf = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

export default function JoinRequestsPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState({ key: 'submittedAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRows(joinRequests)
      setLoading(false)
    }, 620)
    return () => window.clearTimeout(timer)
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const total = rows.length
    const pending = rows.filter((row) => row.status === 'pending').length
    const accepted = rows.filter((row) => row.status === 'accepted')
    const acceptedThisMonth = accepted.filter((row) => {
      const date = new Date(row.submittedAt)
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }).length
    const decided = rows.filter((row) => row.status !== 'pending').length
    const rate = decided ? Math.round((accepted.length / decided) * 100) : 0

    // Submissions per day over the last 7 days, for the sparkline.
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now)
      day.setDate(now.getDate() - (6 - index))
      return rows.filter((row) => new Date(row.submittedAt).toDateString() === day.toDateString()).length
    })

    return { total, pending, acceptedThisMonth, rate, week, decided }
  }, [rows])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (!needle) return true
      return [row.fullName, row.email, row.department, row.primaryField]
        .some((field) => String(field).toLowerCase().includes(needle))
    })

    const direction = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (sort.key === 'submittedAt') return (new Date(a.submittedAt) - new Date(b.submittedAt)) * direction
      return String(a[sort.key]).localeCompare(String(b[sort.key]), 'fr') * direction
    })
  }, [rows, query, status, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Filters reset pagination at the source rather than in an effect, so a
  // filter change produces a single render instead of a cascading one.
  const changeQuery = (value) => { setQuery(value); setPage(1) }
  const changeStatus = (value) => { setStatus(value); setPage(1) }

  const toggleRow = (id) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAll = () => setSelected((current) => {
    const ids = visible.map((row) => row.id)
    const every = ids.every((id) => current.has(id))
    const next = new Set(current)
    ids.forEach((id) => (every ? next.delete(id) : next.add(id)))
    return next
  })

  const applyStatus = (ids, nextStatus) => {
    setRows((current) => current.map((row) => (ids.includes(row.id) ? { ...row, status: nextStatus } : row)))
    setSelected(new Set())
    setDetail((current) => (current && ids.includes(current.id) ? { ...current, status: nextStatus } : current))
    const label = nextStatus === 'accepted' ? 'acceptée' : 'refusée'
    toast.success(
      ids.length > 1 ? `${ids.length} demandes ${label}s` : `Demande ${label}`,
      ids.length > 1 ? 'Les candidats seront notifiés par email.' : 'Le candidat sera notifié par email.',
    )
  }

  const remove = (ids) => {
    setRows((current) => current.filter((row) => !ids.includes(row.id)))
    setSelected(new Set())
    setDetail((current) => (current && ids.includes(current.id) ? null : current))
    setConfirm(null)
    toast.error(
      ids.length > 1 ? `${ids.length} demandes supprimées` : 'Demande supprimée',
      'Cette action est définitive.',
    )
  }

  const selectedIds = [...selected]

  const columns = [
    {
      key: 'fullName',
      label: 'Candidat',
      sortable: true,
      render: (row) => (
        <div className="ad-cell-primary">
          <span className="ad-initials" aria-hidden="true">{initialsOf(row.fullName)}</span>
          <span>
            <span className="ad-cell-name">{row.fullName}</span>
            <span className="ad-cell-meta">{row.email}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'department',
      label: 'Filière',
      render: (row) => (
        <span>
          <span className="ad-cell-muted" style={{ display: 'block' }}>{row.department}</span>
          <span className="ad-cell-meta">{STUDY_YEAR_LABELS[row.studyYear] || row.studyYear}</span>
        </span>
      ),
    },
    {
      key: 'primaryField',
      label: 'Pôle visé',
      render: (row) => <span className="ad-cell-muted">{row.primaryField}</span>,
    },
    {
      key: 'submittedAt',
      label: 'Reçue le',
      sortable: true,
      width: 116,
      render: (row) => <span className="ad-cell-mono">{dayMonth.format(new Date(row.submittedAt))}</span>,
    },
    {
      key: 'status',
      label: 'Statut',
      sortable: true,
      width: 130,
      render: (row) => <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />,
    },
  ]

  return (
    <div className="ad-page">
      <div className="ad-page-head">
        <div>
          <p className="ad-eyebrow">Recrutement · Saison 2026</p>
          <h1 className="ad-page-title">Demandes d'adhésion</h1>
          <p className="ad-page-sub">
            Chaque ligne est une candidature reçue depuis le formulaire public. Ouvrez une demande pour lire la
            motivation complète avant de décider.
          </p>
        </div>
        <div className="ad-page-actions">
          <button type="button" className="ad-btn" onClick={() => toast.info('Export préparé', 'Le fichier CSV sera disponible une fois l\'API branchée.')}>
            <Download size={15} /> Exporter
          </button>
        </div>
      </div>

      {loading ? <StatsSkeleton /> : (
        <div className="ad-stats">
          <StatCard index={0} lead label="Demandes reçues" icon={Inbox} value={stats.total}
            delta={`+${stats.week.reduce((sum, day) => sum + day, 0)}`} deltaTone="up" foot="sur les 7 derniers jours" />
          <StatCard index={1} label="En attente" icon={CalendarClock} value={stats.pending}
            spark={stats.week} foot="à traiter cette semaine" />
          <StatCard index={2} label="Acceptées ce mois" icon={UserCheck} value={stats.acceptedThisMonth}
            track={stats.total ? stats.acceptedThisMonth / stats.total : 0} foot={`sur ${stats.total} candidatures`} />
          <StatCard index={3} label="Taux d'acceptation" icon={TrendingUp} value={stats.rate} unit="%"
            ring={stats.rate / 100} delta={`${stats.decided} décidées`} deltaTone="flat" />
        </div>
      )}

      <div className="ad-toolbar">
        <label className="ad-field">
          <Search size={15} aria-hidden="true" />
          <input type="search" className="ad-input" placeholder="Rechercher un nom, un email..."
            value={query} onChange={(event) => changeQuery(event.target.value)} aria-label="Rechercher une demande" />
        </label>

        <div className="ad-segment" role="group" aria-label="Filtrer par statut">
          {[
            ['all', 'Toutes'],
            ['pending', 'En attente'],
            ['accepted', 'Acceptées'],
            ['rejected', 'Refusées'],
          ].map(([value, label]) => (
            <button key={value} type="button" data-on={status === value || undefined} onClick={() => changeStatus(value)}>
              {label}
            </button>
          ))}
        </div>

        <select className="ad-select" value={`${sort.key}:${sort.dir}`} aria-label="Trier"
          onChange={(event) => {
            const [key, dir] = event.target.value.split(':')
            setSort({ key, dir })
          }}>
          <option value="submittedAt:desc">Plus récentes</option>
          <option value="submittedAt:asc">Plus anciennes</option>
          <option value="fullName:asc">Nom (A→Z)</option>
          <option value="fullName:desc">Nom (Z→A)</option>
        </select>

        <span className="ad-toolbar-count">{filtered.length} / {rows.length}</span>
      </div>

      {selectedIds.length > 0 && (
        <div className="ad-bulk">
          <span className="ad-bulk-count">{selectedIds.length} sélectionnée{selectedIds.length > 1 ? 's' : ''}</span>
          <div className="ad-bulk-actions">
            <button type="button" className="ad-btn" data-size="sm" data-variant="mint"
              onClick={() => applyStatus(selectedIds, 'accepted')}>
              <Check size={13} /> Accepter
            </button>
            <button type="button" className="ad-btn" data-size="sm"
              onClick={() => applyStatus(selectedIds, 'rejected')}>
              <X size={13} /> Refuser
            </button>
            <button type="button" className="ad-btn" data-size="sm" data-variant="danger"
              onClick={() => setConfirm({ ids: selectedIds })}>
              <Trash2 size={13} /> Supprimer
            </button>
            <button type="button" className="ad-btn" data-size="sm" onClick={() => setSelected(new Set())}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="ad-panel">
        {loading ? <TableSkeleton rows={7} columns={5} /> : visible.length === 0 ? (
          <EmptyState
            title={query || status !== 'all' ? 'Aucun résultat' : 'Aucune demande pour l’instant'}
            message={query || status !== 'all'
              ? 'Aucune candidature ne correspond à cette recherche. Essayez un autre nom ou retirez le filtre de statut.'
              : 'Les candidatures envoyées depuis le formulaire public apparaîtront ici, prêtes à être examinées.'}
            action={(query || status !== 'all') && (
              <button type="button" className="ad-btn" onClick={() => { changeQuery(''); changeStatus('all') }}>
                Réinitialiser les filtres
              </button>
            )}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(row) => row.id}
              selectable
              selectedIds={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              sort={sort}
              onSort={(key) => setSort((current) => ({
                key,
                dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc',
              }))}
              onRowClick={setDetail}
              renderActions={(row) => (
                <>
                  <button type="button" className="ad-icon-btn" onClick={() => setDetail(row)} title="Voir le détail">
                    <Eye size={14} />
                  </button>
                  {row.status !== 'accepted' && (
                    <button type="button" className="ad-icon-btn" onClick={() => applyStatus([row.id], 'accepted')} title="Accepter">
                      <Check size={14} />
                    </button>
                  )}
                  {row.status !== 'rejected' && (
                    <button type="button" className="ad-icon-btn" onClick={() => applyStatus([row.id], 'rejected')} title="Refuser">
                      <X size={14} />
                    </button>
                  )}
                  <button type="button" className="ad-icon-btn" onClick={() => setConfirm({ ids: [row.id], name: row.fullName })} title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            />
            <Pagination
              page={safePage}
              pageCount={pageCount}
              total={filtered.length}
              rangeStart={(safePage - 1) * PAGE_SIZE + 1}
              rangeEnd={Math.min(safePage * PAGE_SIZE, filtered.length)}
              onPage={setPage}
            />
          </>
        )}
      </div>

      {detail && (
        <SidePanel
          title={detail.fullName}
          eyebrow={`${detail.reference} · reçue le ${fullDate.format(new Date(detail.submittedAt))}`}
          onClose={() => setDetail(null)}
          footer={(
            <>
              <button type="button" className="ad-btn" data-variant="primary" style={{ flex: 1 }}
                onClick={() => applyStatus([detail.id], 'accepted')} disabled={detail.status === 'accepted'}>
                <Check size={15} /> Accepter
              </button>
              <button type="button" className="ad-btn" style={{ flex: 1 }}
                onClick={() => applyStatus([detail.id], 'rejected')} disabled={detail.status === 'rejected'}>
                <X size={15} /> Refuser
              </button>
              <button type="button" className="ad-btn" data-variant="danger"
                onClick={() => setConfirm({ ids: [detail.id], name: detail.fullName })} aria-label="Supprimer la demande">
                <Trash2 size={15} />
              </button>
            </>
          )}
        >
          <div className="ad-detail-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <StatusBadge status={detail.status} label={STATUS_LABELS[detail.status]} />
              <span className="ad-cell-meta">Pôle visé : {detail.primaryField}</span>
            </div>
          </div>

          <div className="ad-detail-group">
            <h3>Contact</h3>
            <dl className="ad-detail-grid">
              <div className="ad-detail-item" data-span="2">
                <dt>Email</dt>
                <dd style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Mail size={13} aria-hidden="true" />
                  <a href={`mailto:${detail.email}`} style={{ color: 'var(--ad-mint)' }}>{detail.email}</a>
                </dd>
              </div>
              <div className="ad-detail-item" data-span="2">
                <dt>Téléphone</dt>
                <dd style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Phone size={13} aria-hidden="true" />
                  {detail.phone || <span style={{ color: 'var(--ad-faint)' }}>Non renseigné</span>}
                </dd>
              </div>
            </dl>
          </div>

          <div className="ad-detail-group">
            <h3>Parcours</h3>
            <dl className="ad-detail-grid">
              <div className="ad-detail-item">
                <dt>Niveau</dt>
                <dd>{STUDY_YEAR_LABELS[detail.studyYear] || detail.studyYear}</dd>
              </div>
              <div className="ad-detail-item">
                <dt>Département</dt>
                <dd>{detail.department}</dd>
              </div>
              <div className="ad-detail-item">
                <dt>Point de départ</dt>
                <dd>{EXPERIENCE_LABELS[detail.experience]}</dd>
              </div>
              <div className="ad-detail-item">
                <dt>Disponibilité</dt>
                <dd>{AVAILABILITY_LABELS[detail.availability]}</dd>
              </div>
            </dl>
          </div>

          <div className="ad-detail-group">
            <h3>Motivation</h3>
            <blockquote className="ad-detail-quote">{detail.motivation}</blockquote>
          </div>
        </SidePanel>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.ids.length > 1 ? `Supprimer ${confirm.ids.length} demandes ?` : 'Supprimer cette demande ?'}
          message={confirm.ids.length > 1
            ? 'Ces candidatures seront définitivement retirées du tableau de bord. Cette action ne peut pas être annulée.'
            : `La candidature de ${confirm.name} sera définitivement retirée du tableau de bord. Cette action ne peut pas être annulée.`}
          confirmLabel="Supprimer"
          icon={Trash2}
          onConfirm={() => remove(confirm.ids)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
