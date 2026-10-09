import { useDeferredValue, useMemo, useState } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { RecordTable, RecordToolbar } from './AdminRecords'
import { DEPARTMENTS } from './adminModel'
import { Button, StatusBadge, Tabs } from './AdminUI'
import { useStaffConfirmations } from './useAdminApplications'

const STATUS_TABS = ['All', 'Waiting', 'Ready for review', 'Revision requested', 'Confirmed', 'Expired']
const STATUS_KEYS = Object.freeze({
  Waiting: 'invited',
  'Ready for review': 'submitted',
  'Revision requested': 'revision_requested',
  Confirmed: 'confirmed',
  Expired: 'expired',
})
const STATUS_LABELS = Object.freeze({
  invited: 'Waiting for candidate', submitted: 'Ready for review', revision_requested: 'Revision requested',
  confirmed: 'Confirmed', expired: 'Invitation expired', revoked: 'Invitation revoked',
})
const STATUS_TONES = Object.freeze({ submitted: 'success', revision_requested: 'warning', confirmed: 'success', expired: 'neutral', revoked: 'neutral' })
const DEPARTMENT_KEYS = Object.freeze({
  'Dev / Tech': 'dev-tech',
  'Design / Content Creation': 'design-content',
  'Management / Logistics': 'management-logistics',
})

const dateTime = (value) => value ? new Date(value).toLocaleString('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Algiers',
}) : '—'

export default function StaffConfirmationsView({ onOpen }) {
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const status = STATUS_KEYS[tab] || ''
  const department = DEPARTMENT_KEYS[filters.department] || ''
  const { records, pagination, counts: rawCounts, loading, error, refresh } = useStaffConfirmations({
    page, status, search: deferredSearch, department,
  })
  const counts = useMemo(() => ({
    Waiting: rawCounts.invited || 0,
    'Ready for review': rawCounts.submitted || 0,
    'Revision requested': rawCounts.revision_requested || 0,
    Confirmed: rawCounts.confirmed || 0,
    Expired: rawCounts.expired || 0,
  }), [rawCounts])
  const columns = useMemo(() => [
    { key: 'name', label: 'Candidate', render: (record) => <span className="adm-staff-confirmation-person"><b>{record.name}</b><small>{record.ref}</small></span> },
    { key: 'staffDepartment', label: 'Requested department' },
    { key: 'applicationStatus', label: 'Application', render: (record) => <StatusBadge tone="neutral">{record.applicationStatus}</StatusBadge> },
    { key: 'statusKey', label: 'Confirmation', render: (record) => <StatusBadge tone={STATUS_TONES[record.statusKey] || 'info'}>{STATUS_LABELS[record.statusKey] || record.statusKey}</StatusBadge> },
    { key: 'invitedAt', label: 'Invited', render: (record) => <span className="adm-confirmation-date">{dateTime(record.invitedAt)}</span> },
    { key: 'submittedAt', label: 'Submitted', render: (record) => <span className="adm-confirmation-date">{dateTime(record.submittedAt)}</span> },
  ], [])
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
        definitions={[{ key: 'department', label: 'Requested department', options: DEPARTMENTS }]}
        resultCount={pagination.total}
        filterLabel="Filters"
      />
      {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={24}/><h3>Staff confirmations could not be loaded</h3><p>{error}</p><Button onClick={refresh} variant="secondary">Try again</Button></div>
        : loading ? <div className="adm-skeleton-group" role="status" aria-label="Loading Staff confirmations">{Array.from({ length: 5 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}</div>
          : <RecordTable records={records} columns={columns} onOpen={(record) => onOpen(record.applicationId)} pagination={pagination} onPageChange={setPage} emptyTitle={tab === 'All' ? 'No Staff confirmations yet' : `No ${tab.toLowerCase()} confirmations`}/>}
    </div>
  </div>
}
