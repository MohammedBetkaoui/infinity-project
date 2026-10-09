import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, KanbanSquare, Link2, List, LockKeyhole, RefreshCw, ShieldCheck, TriangleAlert, UserCheck } from 'lucide-react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAdminAuth } from './AdminAuth'
import { useAdmin } from './AdminStore'
import { ActionDialog, RecordTable, RecordToolbar } from './AdminRecords'
import ApplicationsBoard from './ApplicationsBoard'
import StaffConfirmationsView from './StaffConfirmationsView'
import { applicationActionPayload } from './applicationMoves'
import { ApplicationSubmittedAt, CandidateActionBar, CandidateDossier, CandidateReviewHeader } from './PeoplePages'
import { APPLICATION_STATUSES, AVAILABILITY, DEPARTMENTS, EXPERIENCE, LEVELS, POLES } from './adminModel'
import { Avatar, Button, Modal, PageHeader, SegmentedControl, StatusBadge, Tabs } from './AdminUI'
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

function InvitationDialog({ invitation, onClose }) {
  const [copied, setCopied] = useState('')
  const copy = async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(''), 1600)
    } catch { setCopied('') }
  }
  const expires = new Date(invitation.expiresAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Algiers' })
  return <Modal open title="Staff confirmation invitation" eyebrow="Stable private link" onClose={onClose} footer={<><Button variant="secondary" onClick={() => copy('link', invitation.url)} icon={copied === 'link' ? <Check size={15}/> : <Link2 size={15}/>}>{copied === 'link' ? 'Link copied' : 'Copy link'}</Button><Button onClick={() => copy('message', invitation.message)} icon={copied === 'message' ? <Check size={15}/> : <Copy size={15}/>}>{copied === 'message' ? 'Message copied' : 'Copy message'}</Button></>}>
    <div className="adm-invitation-dialog">
      <div className="adm-invitation-warning"><ShieldCheck size={18}/><p><b>This URL is stable and private.</b> You can reveal it later from the Staff confirmation dossier. Regenerate it only if it has been compromised.</p></div>
      <dl><div><dt>Candidate</dt><dd>{invitation.candidate}</dd></div><div><dt>Reference</dt><dd><code>{invitation.reference}</code></dd></div><div><dt>Expires</dt><dd>{expires}</dd></div></dl>
      <label><span>Private link</span><textarea readOnly value={invitation.url} rows={3}/></label>
      <details><summary>Preview full message</summary><pre>{invitation.message}</pre></details>
    </div>
  </Modal>
}

function StaffLinkExportDialog({ state, onClose, onExport }) {
  const preview = state.preview || {}
  return <Modal open title="Export Staff private links" eyebrow="Sensitive credential export" onClose={state.pending ? () => {} : onClose} footer={<><Button variant="secondary" onClick={onClose} disabled={state.pending}>Cancel</Button><Button onClick={onExport} disabled={state.pending} icon={<Download size={15}/>}>{state.pending ? 'Generating secure CSV…' : 'Export CSV'}</Button></>}>
    <div className="adm-staff-export-dialog">
      <div className="adm-invitation-warning"><LockKeyhole size={18}/><p><b>This CSV contains private candidate credentials.</b> Existing stable links will not change. Blocked links remain present and are clearly marked so n8n can skip them.</p></div>
      <dl><div><dt>Eligible Staff</dt><dd>{preview.eligible || 0}</dd></div><div><dt>Stable links</dt><dd>{preview.existing || 0}</dd></div><div><dt>Links to create</dt><dd>{preview.missing || 0}</dd></div><div><dt>Legacy to replace</dt><dd>{preview.legacy || 0}</dd></div><div><dt>Blocked</dt><dd>{preview.blocked || 0}</dd></div></dl>
      {preview.legacy > 0 && <p className="adm-export-legacy-warning">Exporting explicitly converts these legacy hash-only credentials. Their previous links will permanently stop working.</p>}
      {state.error && <p className="adm-form-error" role="alert">{state.error}</p>}
    </div>
  </Modal>
}

function ApplicationsSkeleton() {
  return <div className="adm-skeleton-group adm-applications-skeleton" role="status" aria-label="Loading Join applications">
    {Array.from({ length: 6 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}
  </div>
}

export default function ApplicationsPage() {
  const { user } = useAdminAuth()
  const { addToast } = useAdmin()
  const [params, setParams] = useSearchParams()
  const requestedRecordId = params.get('record')
  const workspaceView = params.get('view') === 'staff-confirmations' ? 'Staff confirmations' : 'Applications'
  const initialStage = APPLICATION_STATUSES.includes(params.get('stage')) ? params.get('stage') : 'New'
  const [tab, setTab] = useState(initialStage)
  const { state: routeState } = useLocation()
  const [search, setSearch] = useState(() => routeState?.globalSearch || '')
  const deferredSearch = useDeferredValue(search.trim())
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'date', asc: false })
  const [selected, setSelected] = useState([])
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(requestedRecordId))
  const [detailError, setDetailError] = useState('')
  const [action, setAction] = useState(null)
  const [invitation, setInvitation] = useState(null)
  const [staffExport, setStaffExport] = useState(null)
  const [layout, setLayout] = useState('list')
  const [boardVersion, setBoardVersion] = useState(0)
  const sortValue = `${SORT_KEYS[sort.key] || 'submitted'}_${sort.asc ? 'asc' : 'desc'}`
  const { records, pagination, counts: rawCounts, facets, loading, error, refresh } = useAdminApplications({
    page,
    status: tab,
    search: deferredSearch,
    filters,
    sort: sortValue,
  })
  const { loadDetail, act, bulk, revealStaffLink, previewStaffLinkExport, exportStaffLinks } = useAdminApplicationActions()
  const canBulk = user?.role === 'super_admin'

  const changeWorkspaceView = (value) => {
    const next = new URLSearchParams(params)
    if (value === 'Staff confirmations') next.set('view', 'staff-confirmations')
    else next.delete('view')
    next.delete('record')
    setParams(next, { replace: true })
    setDetail(null)
  }

  const counts = useMemo(() => Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, rawCounts[STATUS_KEYS[status]] || 0])), [rawCounts])
  const fields = useMemo(() => [
    { key: 'level', label: 'Study level', options: LEVELS },
    { key: 'type', label: 'Application type', options: ['Member', 'Staff'] },
    { key: 'track', label: 'Interest / requested department', options: [...POLES, ...DEPARTMENTS] },
    { key: 'speciality', label: 'Academic department', options: facets.specialities || [] },
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
    { key: 'date', label: 'Submitted', render: (record) => <ApplicationSubmittedAt value={record.submittedAt} compact/> },
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
    description: extra.description ?? false,
    submit: extra.submit,
  })


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
      payload: applicationActionPayload(action.applicationAction, values, detail),
    })
    if (!result.ok) return result.message
    setDetail(result.application)
    if (result.invitation) setInvitation(result.invitation)
    refresh()
    setBoardVersion((value) => value + 1)
    addToast(action.title, 'The application and its administrative history were updated.')
    return undefined
  }

  const openStaffExport = async () => {
    setStaffExport({ pending: true, preview: null, error: '' })
    const result = await previewStaffLinkExport()
    if (!result.ok) {
      setStaffExport(null)
      addToast('Secure export unavailable', result.message)
      return
    }
    setStaffExport({ pending: false, preview: result.preview, error: '' })
  }

  const runStaffExport = async () => {
    setStaffExport((current) => ({ ...current, pending: true, error: '' }))
    const result = await exportStaffLinks()
    if (!result.ok) {
      setStaffExport((current) => ({ ...current, pending: false, error: result.message }))
      return
    }
    setStaffExport(null)
    refresh()
    setBoardVersion((value) => value + 1)
    addToast('Staff links exported', `${result.rowCount} candidate credential${result.rowCount === 1 ? '' : 's'} exported securely.`)
  }

  const openBulkAction = () => setAction({
    title: `Update ${selected.length} selected applications`,
    bulk: true,
    reason: false,
    fields: [{ name: 'status', label: 'New status', options: Object.keys(BULK_ACTIONS) }],
    description: false,
  })

  return <div className="adm-page adm-people-page adm-applications-page">
    <PageHeader eyebrow="People · Join intake" title={workspaceView} description={workspaceView === 'Applications' ? 'Every new connection starts here. Review, meet and welcome the next Infinity members.' : 'Review private Staff motivations, request revisions and confirm the final Staff membership.'} actions={workspaceView === 'Applications' ? <><SegmentedControl label="Applications view" value={layout} onChange={(value) => { setLayout(value); setSelected([]) }} options={[{ value: 'list', label: 'List', icon: <List size={15} aria-hidden="true"/> }, { value: 'board', label: 'Board', icon: <KanbanSquare size={15} aria-hidden="true"/> }]}/><Button onClick={() => { refresh(); setBoardVersion((value) => value + 1) }} variant="secondary" icon={<RefreshCw size={16}/>}>Refresh applications</Button></> : <><Button variant="secondary" icon={<RefreshCw size={15}/>} onClick={() => setBoardVersion((value) => value + 1)}>Refresh queue</Button><Button icon={<LockKeyhole size={15}/>} onClick={openStaffExport}>Export Staff + private links</Button></>}/>

    <Tabs className="adm-workspace-tabs" items={['Applications', 'Staff confirmations']} value={workspaceView} onChange={changeWorkspaceView} label="Join administration view"/>

    {workspaceView === 'Staff confirmations' ? <StaffConfirmationsView key={boardVersion} onOpen={open} onRevealLink={revealStaffLink}/> : <>

    <div className="adm-intake-banner"><div><UserCheck size={20}/><p><b>Live Join intake</b><span>Secure records received from the Infinity Join form</span></p></div><span className="adm-mono">{Object.values(counts).reduce((sum, value) => sum + value, 0)} IN CURRENT SCOPE</span></div>

    <div className="adm-work-panel">
      {layout === 'list' && <Tabs items={APPLICATION_STATUSES} value={tab} counts={counts} onChange={(value) => resetScope(() => setTab(value))}/>}
      <RecordToolbar
        search={search}
        onSearch={(value) => resetScope(() => setSearch(value))}
        placeholder="Search name, email, department or reference…"
        filters={filters}
        onFilters={(value) => resetScope(() => setFilters(value))}
        definitions={fields}
        resultCount={layout === 'board' ? Object.values(counts).reduce((sum, value) => sum + value, 0) : pagination.total}
        filterLabel="Filters"
      />

      {layout === 'board' ? <ApplicationsBoard key={boardVersion} search={deferredSearch} filters={filters} sort={sortValue} counts={counts} onOpen={open} onChanged={refresh} onShowStage={(stage) => { setLayout('list'); resetScope(() => setTab(stage)) }} addToast={addToast}/> : <>

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
      </>}
    </div>
    </>}

    {detailLoading && <div className="adm-applications-detail-loading" role="status"><RefreshCw size={16}/><span>Opening secure application…</span></div>}
    {detailError && !detailLoading && <div className="adm-inline-application-error" role="alert"><span>{detailError}</span><button onClick={() => setDetailError('')}>Dismiss</button></div>}

    {detail && <Modal open wide className="is-candidate-modal" title="Application review" eyebrow={detail.ref} headerContent={({ titleId }) => <CandidateReviewHeader detail={detail} titleId={titleId}/>} onClose={() => setDetail(null)} footer={<CandidateActionBar detail={detail} request={requestAction}/> }>
      <CandidateDossier detail={detail} onRevealStaffLink={() => revealStaffLink(detail.id)}/>
    </Modal>}

    {action && <ActionDialog key={action.title} action={action} onClose={() => setAction(null)} onSubmit={submitAction}/>} 
    {invitation && <InvitationDialog invitation={invitation} onClose={() => setInvitation(null)}/>}
    {staffExport && <StaffLinkExportDialog state={staffExport} onClose={() => setStaffExport(null)} onExport={runStaffExport}/>} 
  </div>
}
