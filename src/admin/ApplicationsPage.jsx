import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { RefreshCw, TriangleAlert, UserCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAdminAuth } from './AdminAuth'
import { useAdmin } from './AdminStore'
import { ActionDialog, RecordTable, RecordToolbar } from './AdminRecords'
import { CandidateActionBar, CandidateDossier } from './PeoplePages'
import { APPLICATION_STATUSES, AVAILABILITY, DEPARTMENTS, EXPERIENCE, LEVELS, POLES, dateLabel } from './adminModel'
import { Avatar, Button, Drawer, PageHeader, StatusBadge, Tabs } from './AdminUI'
import { useAdminApplicationActions, useAdminApplications } from './useAdminApplications'

const STATUS_KEYS = Object.freeze({
  New: 'new',
  'In review': 'in_review',
  Interview: 'interview',
  Accepted: 'accepted',
  Declined: 'declined',
  Archived: 'archived',
})

const SORT_KEYS = Object.freeze({
  name: 'name', type: 'type', level: 'level', track: 'track',
  availability: 'availability', date: 'submitted', status: 'status',
})

const BULK_ACTIONS = Object.freeze({
  'In review': 'start_review',
  Declined: 'decline',
  Archived: 'archive',
})

const Person = ({ record }) => <div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b><small>{record.email || record.ref}</small></span>{record.status === 'New' && <i title="New application"/>}</div>

function ApplicationsSkeleton() {
  return <div className="adm-skeleton-group adm-applications-skeleton" role="status" aria-label="Loading Join applications">
    {Array.from({ length: 6 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}
  </div>
}

export default function ApplicationsPage() {
  const { user } = useAdminAuth()
  const { addToast } = useAdmin()
  const [params] = useSearchParams()
  const requestedRecordId = params.get('record')
  const initialStage = APPLICATION_STATUSES.includes(params.get('stage')) ? params.get('stage') : 'New'
  const [tab, setTab] = useState(initialStage)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'date', asc: false })
  const [selected, setSelected] = useState([])
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(requestedRecordId))
  const [detailError, setDetailError] = useState('')
  const [action, setAction] = useState(null)
  const sortValue = `${SORT_KEYS[sort.key] || 'submitted'}_${sort.asc ? 'asc' : 'desc'}`
  const { records, pagination, counts: rawCounts, facets, loading, error, refresh } = useAdminApplications({
    page,
    status: tab,
    search: deferredSearch,
    filters,
    sort: sortValue,
  })
  const { loadDetail, act, bulk } = useAdminApplicationActions()
  const canBulk = ['administrator', 'super_admin'].includes(user?.role)

  const counts = useMemo(() => Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, rawCounts[STATUS_KEYS[status]] || 0])), [rawCounts])
  const fields = useMemo(() => [
    { key: 'level', label: 'Study level', options: LEVELS },
    { key: 'type', label: 'Application type', options: ['Member', 'Staff'] },
    { key: 'track', label: 'Interest / requested department', options: [...POLES, ...DEPARTMENTS] },
    { key: 'speciality', label: 'Speciality', options: facets.specialities || [] },
    { key: 'experience', label: 'Experience', options: EXPERIENCE },
    { key: 'availability', label: 'Availability', options: AVAILABILITY },
    { key: 'dateFrom', label: 'Submitted from', type: 'date', options: [] },
    { key: 'dateTo', label: 'Submitted until', type: 'date', options: [] },
  ], [facets.specialities])

  const columns = useMemo(() => [
    { key: 'name', label: 'Candidate', render: (record) => <Person record={record}/> },
    { key: 'type', label: 'Type', render: (record) => <StatusBadge tone={record.type === 'Staff' ? 'info' : 'neutral'}>{record.type}</StatusBadge> },
    { key: 'level', label: 'Studies', render: (record) => <><b>{record.level}</b><small className="adm-cell-sub">{record.speciality}</small></> },
    { key: 'track', label: 'Interest / department' },
    { key: 'availability', label: 'Availability', secondary: true },
    { key: 'date', label: 'Submitted', secondary: true, render: (record) => dateLabel(record.submittedAt) },
    { key: 'status', label: 'Status', render: (record) => <StatusBadge>{record.status}</StatusBadge> },
  ], [])

  const resetScope = useCallback((callback) => {
    callback()
    setPage(1)
    setSelected([])
  }, [])

  const open = useCallback(async (recordOrId) => {
    const id = typeof recordOrId === 'string' ? recordOrId : recordOrId.id
    setDetailLoading(true)
    setDetailError('')
    try {
      const next = await loadDetail(id)
      setDetail(next)
    } catch (loadError) {
      setDetailError(loadError.message)
      addToast('Application unavailable', loadError.message)
    } finally {
      setDetailLoading(false)
    }
  }, [addToast, loadDetail])

  useEffect(() => {
    if (!requestedRecordId) return undefined
    let active = true
    loadDetail(requestedRecordId)
      .then((next) => {
        if (!active) return
        setDetail(next)
        setDetailError('')
      })
      .catch((loadError) => {
        if (!active) return
        setDetailError(loadError.message)
        addToast('Application unavailable', loadError.message)
      })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [addToast, loadDetail, requestedRecordId])

  const requestAction = (title, _patch, extra = {}) => setAction({
    title,
    applicationAction: extra.action,
    fields: extra.fields,
    danger: extra.danger,
    reason: false,
    description: false,
  })

  const actionPayload = (actionName, values) => {
    if (actionName === 'schedule_interview') return { scheduledAt: new Date(values.interviewAt).toISOString(), location: values.interviewLocation }
    if (actionName === 'change_staff_department') return { department: values.track }
    return {}
  }

  const submitAction = async (values) => {
    if (action.bulk) {
      const actionName = BULK_ACTIONS[values.status]
      const selectedRecords = records.filter((record) => selected.includes(record.id))
      const result = await bulk({
        action: actionName,
        reason: '',
        records: selectedRecords.map((record) => ({ id: record.id, expectedUpdatedAt: record.updatedAt })),
      })
      if (!result.ok) return result.message
      setSelected([])
      refresh()
      addToast('Applications updated', `${result.succeeded.length} application${result.succeeded.length === 1 ? '' : 's'} updated${result.failed.length ? ` · ${result.failed.length} skipped` : ''}.`)
      return undefined
    }

    const result = await act(detail.id, {
      action: action.applicationAction,
      expectedUpdatedAt: detail.updatedAt,
      reason: '',
      payload: actionPayload(action.applicationAction, values),
    })
    if (!result.ok) return result.message
    setDetail(result.application)
    refresh()
    addToast(action.title, 'The application and its administrative history were updated.')
    return undefined
  }

  const openBulkAction = () => setAction({
    title: `Update ${selected.length} selected applications`,
    bulk: true,
    reason: false,
    fields: [{ name: 'status', label: 'New status', options: Object.keys(BULK_ACTIONS) }],
    description: false,
  })

  return <div className="adm-page adm-people-page adm-applications-page">
    <PageHeader eyebrow="People · Join intake" title="Join applications" description="Every new connection starts here. Review, meet and welcome the next Infinity members." actions={<Button onClick={refresh} variant="secondary" icon={<RefreshCw size={16}/>}>Refresh applications</Button>}/>

    <div className="adm-intake-banner"><div><UserCheck size={20}/><p><b>Live Join intake</b><span>Secure records received from the Infinity Join form</span></p></div><span className="adm-mono">{Object.values(counts).reduce((sum, value) => sum + value, 0)} IN CURRENT SCOPE</span></div>

    <div className="adm-work-panel">
      <Tabs items={APPLICATION_STATUSES} value={tab} counts={counts} onChange={(value) => resetScope(() => setTab(value))}/>
      <RecordToolbar
        search={search}
        onSearch={(value) => resetScope(() => setSearch(value))}
        placeholder="Search name, email, speciality or reference…"
        filters={filters}
        onFilters={(value) => resetScope(() => setFilters(value))}
        definitions={fields}
        resultCount={pagination.total}
        filterLabel="Filters"
      />

      {error ? <div className="adm-state-error adm-applications-error" role="alert"><TriangleAlert size={24}/><h3>Applications could not be loaded</h3><p>{error}</p><Button onClick={refresh} variant="secondary" icon={<RefreshCw size={15}/>}>Try again</Button></div> : loading ? <ApplicationsSkeleton/> : <RecordTable
        records={records}
        columns={columns}
        selected={selected}
        onSelect={canBulk ? setSelected : undefined}
        onOpen={open}
        onBulk={canBulk ? openBulkAction : undefined}
        pagination={pagination}
        onPageChange={(value) => { setPage(value); setSelected([]) }}
        controlledSort={sort}
        onSortChange={(value) => resetScope(() => setSort(value))}
        emptyTitle={Object.values(filters).some(Boolean) || search ? 'No applications match these filters' : `No ${tab.toLowerCase()} applications`}
      />}
    </div>

    {detailLoading && <div className="adm-applications-detail-loading" role="status"><RefreshCw size={16}/><span>Opening secure application…</span></div>}
    {detailError && !detailLoading && <div className="adm-inline-application-error" role="alert"><span>{detailError}</span><button onClick={() => setDetailError('')}>Dismiss</button></div>}

    {detail && <Drawer className="is-candidate-drawer" title="Application review" eyebrow={detail.ref} onClose={() => setDetail(null)} footer={<CandidateActionBar detail={detail} request={requestAction}/> }>
      <CandidateDossier detail={detail}/>
    </Drawer>}

    {action && <ActionDialog key={action.title} action={action} onClose={() => setAction(null)} onSubmit={submitAction}/>} 
  </div>
}
