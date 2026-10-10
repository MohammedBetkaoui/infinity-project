import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Link2Off, RefreshCw, TriangleAlert } from 'lucide-react'
import { RecordTable, RecordToolbar } from './AdminRecords'
import { DEPARTMENTS } from './adminModel'
import { Button, StatusBadge, Tabs } from './AdminUI'
import { useStaffConfirmations } from './useAdminApplications'

const STATUS_TABS = ['All', 'Not invited', 'Waiting', 'Ready for review', 'Revision requested', 'Confirmed', 'Expired']
const STATUS_KEYS = Object.freeze({
  'Not invited': 'not_invited',
  Waiting: 'invited',
  'Ready for review': 'submitted',
  'Revision requested': 'revision_requested',
  Confirmed: 'confirmed',
  Expired: 'expired',
})
const STATUS_LABELS = Object.freeze({
  not_invited: 'Not invited', invited: 'Waiting for candidate', submitted: 'Ready for review', revision_requested: 'Revision requested',
  confirmed: 'Confirmed', expired: 'Invitation expired', revoked: 'Invitation revoked',
})
const STATUS_TONES = Object.freeze({ submitted: 'success', revision_requested: 'warning', confirmed: 'success', expired: 'neutral', revoked: 'neutral' })
const DEPARTMENT_KEYS = Object.freeze({
  'Dev / Tech': 'dev-tech',
  'Design / Content Creation': 'design-content',
  'Management / Logistics': 'management-logistics',
})
const LINK_ACCESS_KEYS = Object.freeze({ Active: 'active', Blocked: 'blocked', Legacy: 'legacy', 'Not created': 'none' })
const LINK_ACCESS_LABELS = Object.freeze({ active: 'Active', blocked: 'Blocked', legacy: 'Legacy', none: 'Not created' })

const dateTime = (value) => value ? new Date(value).toLocaleString('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Algiers',
}) : '—'

export default function StaffConfirmationsView({ onOpen, onRevealLink }) {
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [linkAction, setLinkAction] = useState({ id: '', kind: '', error: '' })
  const status = STATUS_KEYS[tab] || ''
  const department = DEPARTMENT_KEYS[filters.department] || ''
  const linkAccess = LINK_ACCESS_KEYS[filters.linkAccess] || ''
  const { records, pagination, counts: rawCounts, loading, error, refresh } = useStaffConfirmations({
    page, status, linkAccess, search: deferredSearch, department,
  })
  const counts = useMemo(() => ({
    'Not invited': rawCounts.not_invited || 0,
    Waiting: rawCounts.invited || 0,
    'Ready for review': rawCounts.submitted || 0,
    'Revision requested': rawCounts.revision_requested || 0,
    Confirmed: rawCounts.confirmed || 0,
    Expired: rawCounts.expired || 0,
  }), [rawCounts])
  const handleLink = useCallback(async (record, kind) => {
    if (!onRevealLink || linkAction.id) return
    setLinkAction({ id: record.applicationId, kind, error: '' })
    const result = await onRevealLink(record.applicationId)
    if (!result.ok) {
      setLinkAction({ id: '', kind: '', error: result.message })
      return
    }
    try {
      if (kind === 'copy') await navigator.clipboard.writeText(result.privateLink)
      else window.open(result.privateLink, '_blank', 'noopener,noreferrer')
      setLinkAction({ id: record.applicationId, kind: `${kind}-done`, error: '' })
      window.setTimeout(() => setLinkAction({ id: '', kind: '', error: '' }), 1600)
    } catch {
      setLinkAction({ id: '', kind: '', error: 'The private link could not be copied or opened.' })
    }
  }, [onRevealLink, linkAction.id])
  const columns = useMemo(() => [
    { key: 'name', label: 'Candidate', render: (record) => <span className="adm-staff-confirmation-person"><b>{record.name}</b><span className="adm-staff-confirmation-person__department">{record.staffDepartment}</span><small>{record.ref}</small></span> },
    { key: 'staffDepartment', label: 'Requested department' },
    { key: 'applicationStatus', label: 'Application', render: (record) => <StatusBadge tone="neutral">{record.applicationStatus}</StatusBadge> },
    { key: 'statusKey', label: 'Confirmation', render: (record) => <StatusBadge tone={STATUS_TONES[record.statusKey] || 'info'}>{STATUS_LABELS[record.statusKey] || record.statusKey}</StatusBadge> },
    { key: 'privateLink', label: 'Private link', render: (record) => record.linkReconstructable ? <div className="adm-private-link-cell"><span><Link2Off size={12}/>…#token=••••••••</span><div><button type="button" onClick={(event) => { event.stopPropagation(); handleLink(record, 'copy') }} disabled={linkAction.id === record.applicationId} aria-label={`Copy private link for ${record.name}`}>{linkAction.id === record.applicationId && linkAction.kind === 'copy-done' ? <Check size={13}/> : <Copy size={13}/>}</button><button type="button" onClick={(event) => { event.stopPropagation(); handleLink(record, 'open') }} disabled={linkAction.id === record.applicationId} aria-label={`Open private link for ${record.name}`}><ExternalLink size={13}/></button></div></div> : <span className="adm-private-link-unavailable">{record.linkAccess === 'legacy' ? 'Legacy link' : 'Not created'}</span> },
    { key: 'linkAccess', label: 'Link access', render: (record) => <StatusBadge tone={record.linkAccess === 'active' ? 'success' : record.linkAccess === 'blocked' ? 'warning' : 'neutral'}>{LINK_ACCESS_LABELS[record.linkAccess] || record.linkAccess}</StatusBadge> },
    { key: 'invitedAt', label: 'Invited', render: (record) => <span className="adm-confirmation-date">{dateTime(record.invitedAt)}</span> },
    { key: 'submittedAt', label: 'Submitted', render: (record) => <span className="adm-confirmation-date">{dateTime(record.submittedAt)}</span> },
  ], [handleLink, linkAction])
  const reset = (callback) => { callback(); setPage(1) }

  return <div className="adm-staff-confirmations">
    <div className="adm-staff-confirmation-summary">
      <div><span>Staff confirmation queue</span><b>{counts['Ready for review']}</b><small>ready for review</small></div>
      <Button variant="secondary" icon={<RefreshCw size={15}/>} onClick={refresh}>Refresh queue</Button>
    </div>
    <div className="adm-work-panel">
      <Tabs items={STATUS_TABS} value={tab} counts={counts} onChange={(value) => reset(() => setTab(value))} label="Staff confirmation status"/>
      <RecordToolbar
        search={search}
        onSearch={(value) => reset(() => setSearch(value))}
        placeholder="Search candidate or JOIN reference…"
        filters={filters}
        onFilters={(value) => reset(() => setFilters(value))}
        definitions={[{ key: 'department', label: 'Requested department', options: DEPARTMENTS }, { key: 'linkAccess', label: 'Link access', options: Object.keys(LINK_ACCESS_KEYS) }]}
        resultCount={pagination.total}
        filterLabel="Filters"
      />
      {linkAction.error && <div className="adm-inline-application-error" role="alert"><span>{linkAction.error}</span><button onClick={() => setLinkAction({ id: '', kind: '', error: '' })}>Dismiss</button></div>}
      {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={24}/><h3>Staff confirmations could not be loaded</h3><p>{error}</p><Button onClick={refresh} variant="secondary">Try again</Button></div>
        : loading ? <div className="adm-skeleton-group" role="status" aria-label="Loading Staff confirmations">{Array.from({ length: 5 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}</div>
          : <RecordTable
            records={records}
            columns={columns}
            className="adm-staff-confirmation-table"
            rowClassName={(record) => `is-confirmation-${record.statusKey || 'not_invited'}`}
            labels={{ openFile: 'Review application' }}
            onOpen={(record) => onOpen(record.applicationId)}
            pagination={pagination}
            onPageChange={setPage}
            emptyTitle={tab === 'All' ? 'No Staff confirmations yet' : `No ${tab.toLowerCase()} confirmations`}
          />}
    </div>
  </div>
}
