import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Download, FileCheck2, FileText, FolderClosed, Languages, LockKeyhole, Maximize2, RefreshCw, RotateCw, ShieldCheck, TriangleAlert, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { useAivexLocale } from './AivexI18n'
import { DOCUMENT_STATUSES, REGISTRATION_STATUSES, dateLabel, timeLabel } from './adminModel'
import { Button, ConfidentialNotice, CriticalNotice, EmptyState, IconButton, Modal, PageHeader, Pagination, Progress, SectionHeading, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar } from './AdminRecords'
import { useAdminAivex, useAdminAivexActions } from './useAdminAivex'
import { aivexDateLabel, aivexFilePresentation } from './aivexPresentation'
import './aivex-admin.css'

const AIVEX_TABS = ['Verification', 'Team overview', 'Documents', 'History']
const AIVEX_QUEUES = [
  { label: 'All files', filter: '', count: 'all' },
  { label: 'Ready to review', filter: 'Signed document received', count: 'signed_document_uploaded' },
  { label: 'Under review', filter: 'Under review', count: 'under_review' },
  { label: 'Corrections requested', filter: 'Corrections needed', count: 'changes_required' },
  { label: 'Team accepted', filter: 'Validated', count: 'validated' },
]
const TABLE_SORT_KEYS = Object.freeze({
  ref: 'reference', name: 'team', institution: 'institution', manager: 'team',
  registration: 'registration', document: 'document', completeness: 'completion',
  submitted: 'submitted', updated: 'updated',
})
const CARD_SORTS = Object.freeze({ attention: 'attention_asc', completion: 'completion_asc', team: 'team_asc' })
const IMAGE_ZOOM_MIN = .5
const IMAGE_ZOOM_MAX = 4
const clampImageZoom = (value) => Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, value))
const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const pointerCenter = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function AivexStatus({ value, t, tone }) {
  return <StatusBadge tone={tone || value}>{t(value)}</StatusBadge>
}

function Ltr({ children, className = '' }) {
  return <bdi className={`adm-ltr ${className}`} dir="ltr">{children}</bdi>
}

function AivexLanguageSwitch({ language, setLanguage, t }) {
  return <div className="adm-aivex-language" aria-label={t('Switch AIVEX interface language')}>
    <Languages size={17}/><span><small>{t('Interface language')}</small><b>{language === 'ar' ? 'العربية' : 'English'}</b></span>
    <div role="group" aria-label={t('Switch AIVEX interface language')}><button type="button" className={language === 'en' ? 'is-active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button><button type="button" className={language === 'ar' ? 'is-active' : ''} aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')}>ع</button></div>
  </div>
}

function AivexConfidentialNotice({ t }) {
  return <ConfidentialNotice title={t('Internal verification data.')} copy={t('Access is logged. Do not copy, download or disclose personal documents outside the authorised review process.')}/>
}

function paginationLabels(isArabic, t) {
  return isArabic ? { aria: 'ترقيم الصفحات', previous: t('Previous page'), next: t('Next page'), summary: (start, end, count) => <>عرض <b>{start}–{end}</b> من <b>{count}</b> سجلاً</> } : {}
}

function actionDialogLabels(isArabic, t) {
  return isArabic ? { close: 'إغلاق', cancel: t('Cancel'), confirm: t('Confirm action'), eyebrow: t('Administrative action'), submitError: t('The action could not be completed. Please try again.') } : {}
}

function FileState({ team, t }) {
  const state = aivexFilePresentation(team)
  return <AivexStatus value={state.label} tone={state.tone} t={t}/>
}

function AivexSkeleton({ label }) {
  return <div className="adm-skeleton-group adm-aivex-skeleton" role="status" aria-label={label}>
    {Array.from({ length: 6 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}
  </div>
}

function AivexCardGrid({ records, onOpen, locale, pagination, onPageChange, order, onOrder }) {
  const { t, isArabic } = locale
  return <section className="adm-aivex-board" aria-label={t('AIVEX files')}>
    <header className="adm-aivex-board__head">
      <div><b>{t('Team files')}</b><span>{t('Open a file to see what needs to be done.')}</span></div>
      <label><span>{t('Order by')}</span><select value={order} onChange={(event) => onOrder(event.target.value)}><option value="attention">{t('Action priority')}</option><option value="completion">{t('Lowest completion')}</option><option value="team">{t('Team name')}</option></select></label>
    </header>
    {records.length ? <div className="adm-case-grid">{records.map((team) => {
      const state = aivexFilePresentation(team)
      return <article key={team.ref} className="adm-case-card">
        <header><code><Ltr>{team.ref}</Ltr></code><FileState team={team} t={t}/></header>
        <div className="adm-case-card__identity"><h3><button onClick={() => onOpen(team)}><bdi>{team.name}</bdi></button></h3><p>{team.institution}</p><span>{team.wilaya}</span></div>
        <div className="adm-case-card__progress"><span>{t('Review progress')}</span><Progress value={team.completeness} label={t('Review progress')}/></div>
        <div className="adm-case-card__next"><span>{t('Next step')}</span><b>{t(state.title)}</b></div>
        <footer><span>{t('Updated')} {aivexDateLabel(team.updatedAt, locale.language)}</span><button onClick={() => onOpen(team)} aria-label={`${t('Open file')} · ${team.name}`}>{t('Open file')}<ArrowRight size={16}/></button></footer>
      </article>
    })}</div> : <EmptyState title={t('No AIVEX files match this view')} copy={t('Adjust the search or remove one of the active filters.')}/>} 
    {pagination.total > 0 && <Pagination current={pagination.page} count={pagination.total} pageSize={pagination.limit} onChange={onPageChange} labels={paginationLabels(isArabic, t)}/>} 
  </section>
}

export function AivexListPage({ globalQuery }) {
  const navigate = useNavigate()
  const locale = useAivexLocale()
  const { language, isArabic, dir, t, setLanguage, path } = locale
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(`${search} ${globalQuery}`.trim())
  const [filters, setFilters] = useState(params.get('document') ? { document: params.get('document') } : {})
  const [view, setView] = useState('cards')
  const [mobileCardsOnly, setMobileCardsOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [cardOrder, setCardOrder] = useState('attention')
  const [tableSort, setTableSort] = useState({ key: '', asc: true })
  const [sort, setSort] = useState('attention_asc')
  const { records: teams, pagination, summary, facets, loading, error, refresh } = useAdminAivex({
    page, search: deferredSearch, filters, sort,
  })

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const syncView = () => setMobileCardsOnly(query.matches)
    syncView()
    query.addEventListener('change', syncView)
    return () => query.removeEventListener('change', syncView)
  }, [])
  const activeView = mobileCardsOnly ? 'cards' : view
  const resetPage = useCallback((callback) => { callback(); setPage(1) }, [])
  const updateCardOrder = (value) => resetPage(() => { setCardOrder(value); setSort(CARD_SORTS[value] || 'attention_asc') })
  const updateTableSort = (value) => resetPage(() => {
    setTableSort(value)
    setSort(`${TABLE_SORT_KEYS[value.key] || 'submitted'}_${value.asc ? 'asc' : 'desc'}`)
  })
  const changeView = (value) => {
    setView(value)
    setPage(1)
    setSort(value === 'cards' ? CARD_SORTS[cardOrder] : tableSort.key ? `${TABLE_SORT_KEYS[tableSort.key] || 'submitted'}_${tableSort.asc ? 'asc' : 'desc'}` : 'submitted_desc')
  }

  return <div className={`adm-page adm-aivex-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}>
    <PageHeader eyebrow={t('AIVEX · Edition 02')} title={t('AIVEX files')} description={t('Find a team, review its file and follow up on corrections.')} actions={<div className="adm-aivex-header-actions"><AivexLanguageSwitch language={language} setLanguage={setLanguage} t={t}/><Button variant="secondary" onClick={refresh} disabled={loading} icon={<RefreshCw size={15}/>}>{t('Refresh files')}</Button></div>}/>
    <nav className="adm-case-queues" aria-label={t('Filter team files')}>
      {AIVEX_QUEUES.map((queue) => <button key={queue.count} type="button" aria-pressed={(filters.document || '') === queue.filter} className={(filters.document || '') === queue.filter ? 'is-active' : ''} onClick={() => resetPage(() => setFilters({ ...filters, document: queue.filter }))}><span>{t(queue.label)}</span><b>{queue.count === 'all' ? summary.registered || 0 : summary.documentCounts?.[queue.count] || 0}</b></button>)}
    </nav>
    <div className="adm-work-panel"><RecordToolbar search={search} onSearch={(value) => resetPage(() => setSearch(value))} placeholder={t('Search reference, team, institution or person…')} filters={filters} onFilters={(value) => resetPage(() => setFilters(value))} resultCount={pagination.total} filterLabel={t('All filters')} getOptionLabel={t} labels={isArabic ? { search: 'البحث في ملفات AIVEX', clearSearch: 'مسح البحث', all: 'الكل', recordView: 'طريقة عرض السجلات', tableView: t('Table view'), cardView: t('Card view'), liveScope: t('Live scope'), matchingRecords: (count) => `${count} سجل مطابق`, removeFilter: 'إزالة عامل تصفية', allIncluded: t('All records included'), clearAll: t('Clear all'), drawerTitle: t('Refine records'), drawerEyebrow: t('Search & filters'), reset: t('Reset filters'), showResults: (count) => `عرض ${count} نتيجة`, drawerSummary: 'سجل مطابق للمعايير الحالية. تظهر التغييرات مباشرة.', close: 'إغلاق عوامل التصفية' } : {}} quickDefinitions={[
      { key: 'document', label: t('Document stage'), shortLabel: t('Stage'), allLabel: t('All stages'), options: DOCUMENT_STATUSES },
    ]} view={activeView} onView={mobileCardsOnly ? undefined : changeView} definitions={[
      { key: 'registration', label: t('Registration status'), options: REGISTRATION_STATUSES }, { key: 'document', label: t('Document status'), options: DOCUMENT_STATUSES }, { key: 'wilaya', label: t('Wilaya'), options: facets.wilayas || [] }, { key: 'institution', label: t('Institution'), options: facets.institutions || [] }, { key: 'complete', label: t('Completeness'), options: ['Complete', 'Incomplete'] }, { key: 'signedLabel', label: t('Signed document'), options: ['Present', 'Absent'] }, { key: 'dateFrom', label: t('Submitted from'), type: 'date', options: [] }, { key: 'dateTo', label: t('Submitted until'), type: 'date', options: [] },
    ]}/>
      {error ? <div className="adm-state-error adm-aivex-error" role="alert"><TriangleAlert size={24}/><h3>{t('AIVEX files could not be loaded')}</h3><p>{t(error)}</p><Button onClick={refresh} variant="secondary" icon={<RefreshCw size={15}/>}>{t('Try again')}</Button></div> : loading ? <AivexSkeleton label={t('Loading AIVEX files')}/> : activeView === 'cards' ? <AivexCardGrid records={teams} locale={locale} pagination={pagination} onPageChange={setPage} order={cardOrder} onOrder={updateCardOrder} onOpen={(team) => navigate(path(`/admin/aivex/${team.ref}`))}/> : <>
        <RecordTable className="adm-aivex-table-view" records={teams} controlledSort={tableSort} onSortChange={updateTableSort} pagination={pagination} onPageChange={setPage} locale={isArabic ? 'ar' : 'en'} labels={isArabic ? { open: 'فتح', record: 'السجل', openFile: t('Open file'), openRecord: 'فتح السجل', empty: t('No matching records'), emptyCopy: t('Adjust the search or remove one of the active filters.'), pagination: paginationLabels(true, t) } : {}} rowClassName={(team) => ['Generation issue', 'Corrections needed', 'Expired'].includes(team.document) ? 'is-aivex-attention' : team.document === 'Validated' ? 'is-aivex-validated' : ''} onOpen={(team) => navigate(path(`/admin/aivex/${team.ref}`))} columns={[
          { key: 'name', label: t('Team'), render: (team) => <span className="adm-aivex-team-cell"><b><bdi>{team.name}</bdi></b><small><Ltr>{team.ref}</Ltr></small></span> },
          { key: 'institution', label: t('Institution'), render: (team) => <span className="adm-institution-cell"><b>{team.institution}</b><small>{team.wilaya}</small></span> },
          { key: 'document', label: t('File status'), render: (team) => <div className="adm-case-table-state"><FileState team={team} t={t}/><small>{t(aivexFilePresentation(team).title)}</small></div> },
          { key: 'completeness', label: t('Review progress'), render: (team) => <Progress value={team.completeness} label={t('Review progress')}/> },
          { key: 'updated', label: t('Last update'), render: (team) => aivexDateLabel(team.updatedAt, language) },
        ]}/>
      </>}
    </div>
    <div className="adm-security-footnote"><LockKeyhole size={14}/><p>{t('Identity documents are visible only inside the confidential viewer. Every consultation is logged.')}</p></div>
  </div>
}

const REVIEW_GROUP_COPY = Object.freeze({
  team: {
    title: 'Team information',
    copy: 'Team, institution and the three-student roster.',
  },
  people: {
    title: 'People and responsibilities',
    copy: 'Activities manager, delegation leader and driver.',
  },
  documents: {
    title: 'Required documents',
    copy: 'Official form, signed form and confidential documents.',
  },
})

const REVIEW_BLOCKER_LABELS = Object.freeze({
  team_information: 'Complete the team and institution information',
  student_roster: 'Confirm the three-student roster',
  activities_manager: 'Confirm the activities manager details',
  official_form: 'Generate the official participation form',
  signed_form_missing: 'Receive the signed and stamped form',
  confidential_documents: 'Review the required identity and student documents',
  signed_form_review: 'Review the active signed form',
  correction_cycle: 'Complete the active correction cycle',
})

function documentOutcomeLabel(status) {
  if (status === 'Verified') return 'Document accepted'
  if (status === 'Invalid') return 'Replacement needed'
  if (status === 'Absent') return 'Document missing'
  if (status === 'Expired') return 'Document no longer available'
  if (status === 'Correction submitted') return 'Corrected file awaiting review'
  if (status === 'Replacement requested') return 'Waiting for a replacement'
  return 'Waiting for review'
}

const CORRECTION_ITEM_BY_DOCUMENT = Object.freeze({
  'delegation-leader': 'Delegation leader ID',
  driver: 'Driver ID',
  'student-1': 'Student card 01',
  'student-2': 'Student card 02',
  'student-3': 'Student card 03',
})

const tomorrowDate = () => {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  return value.toISOString().slice(0, 10)
}

const CORRECTION_ITEM_STATUS_TONE = { open: 'warning', submitted: 'info', verified: 'success' }
const CORRECTION_ITEM_STATUS_LABEL = { open: 'Awaiting the team', submitted: 'Submitted — needs review', verified: 'Verified' }
const ACTIVITY_ROLE_LABELS = { sub_director_activities: 'Deputy director of activities', activities_officer: 'Activities manager' }
const IDENTITY_FILE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png'])
const IDENTITY_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png'])
const IDENTITY_MAX_BYTES = 5 * 1024 * 1024

const identityFileIssue = (file) => {
  if (!file || !(file.size > 0)) return 'The selected file is empty.'
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!IDENTITY_FILE_TYPES.has(file.type.toLowerCase()) || !IDENTITY_FILE_EXTENSIONS.has(extension)) return 'Use a JPG, JPEG or PNG image.'
  if (file.size > IDENTITY_MAX_BYTES) return 'The selected file is larger than 5 MB.'
  return ''
}

const identityFileSize = (bytes) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`

function IdentityReplacementControl({ team, document: file, allowed, locale, uploadIdentityReplacement, onUploaded }) {
  const { t } = locale
  const inputRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [issue, setIssue] = useState('')
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const canUpload = allowed.has('replace_identity_document') && file.correctionStatus === 'open'
  const busy = ['preparing', 'uploading', 'validating'].includes(phase)
  if (!allowed.has('replace_identity_document') || (!canUpload && phase !== 'success')) return null

  const choose = (event) => {
    const next = event.target.files?.[0] || null
    setSelected(next)
    setIssue(identityFileIssue(next))
    setMessage('')
    setPhase('idle')
    event.target.value = ''
  }
  const cancel = () => {
    if (busy) return
    setSelected(null)
    setIssue('')
    setMessage('')
    setPhase('idle')
  }
  const submit = async () => {
    const clientIssue = identityFileIssue(selected)
    if (!canUpload || busy || clientIssue) { setIssue(clientIssue); return }
    try {
      const nextTeam = await uploadIdentityReplacement(
        team.ref, file.id, team.updatedAt, selected,
        (nextPhase, nextProgress) => { setPhase(nextPhase); setProgress(nextProgress) },
      )
      setPhase('success')
      setProgress(100)
      setMessage(t('Replacement passed secure server validation and is ready for review.'))
      onUploaded(nextTeam)
    } catch (error) {
      setPhase('error')
      setProgress(0)
      setMessage(t(error.message || 'The replacement failed secure server validation.'))
    }
  }

  return <div className="adm-identity-replacement" data-state={phase}>
    <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" aria-label={t('Upload replacement')} onChange={choose} disabled={!canUpload || busy} />
    {!selected && phase !== 'success' && <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={!canUpload || busy} icon={<Upload size={14}/>}>{t('Upload replacement')}</Button>}
    {selected && <div className="adm-identity-replacement__file">
      <div><b>{selected.name}</b><small>{(selected.name.split('.').pop() || selected.type).toUpperCase()} · {identityFileSize(selected.size)}</small></div>
      {phase !== 'success' && <div><button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>{t('Replace')}</button><button type="button" onClick={cancel} disabled={busy}>{t('Cancel')}</button></div>}
    </div>}
    {issue && <p className="adm-form-error" role="alert">{t(issue)}</p>}
    {busy && <div className="adm-identity-replacement__progress" role="status"><progress max="100" value={progress}/><span>{t(phase === 'preparing' ? 'Preparing secure upload…' : phase === 'uploading' ? 'Secure upload in progress…' : 'Running secure server validation…')} <Ltr>{progress}%</Ltr></span></div>}
    {message && <p className={phase === 'success' ? 'adm-form-success' : 'adm-form-error'} role={phase === 'success' ? 'status' : 'alert'}>{message}</p>}
    {selected && phase !== 'success' && <Button onClick={submit} disabled={!canUpload || busy || Boolean(issue)}>{t(phase === 'validating' ? 'Validating…' : 'Upload replacement')}</Button>}
  </div>
}

// One requested item's live status. A document-kind item resolves through
// the Documents tab's existing SecureViewer review (verify_document /
// invalidate_document already syncs the matching correction item — see the
// migration) — never a second control here. A field-kind item ('Team
// information' / 'Activities manager') has no other review surface, so its
// proposed values and the Verified / Needs another attempt buttons live
// right here, calling resolve_correction_item.
function CorrectionItemRow({ item, allowed, onTab, onResolveItem, resolving, t }) {
  const fields = item.submittedFields
  return (
    <li className="adm-correction-item" data-status={item.status}>
      <div className="adm-correction-item-head">
        <span>{t(item.item)}</span>
        <StatusBadge tone={CORRECTION_ITEM_STATUS_TONE[item.status]}>{t(CORRECTION_ITEM_STATUS_LABEL[item.status] || item.status)}</StatusBadge>
      </div>
      {item.status === 'submitted' && item.kind === 'document' && (
        <p className="adm-correction-item-hint">
          {t('Review the resubmitted file from the Documents tab, then accept or reject it there.')}
          <button type="button" className="adm-text-action" onClick={() => onTab('Documents')}>{t('Open Documents')}<ArrowRight size={13}/></button>
        </p>
      )}
      {item.status === 'submitted' && item.kind === 'field' && fields && (
        <div className="adm-correction-item-fields">
          <dl>
            {item.item === 'Team information' ? <>
              <div><dt>{t('Team name')}</dt><dd><Ltr>{fields.name}</Ltr></dd></div>
              <div><dt>{t('Wilaya')}</dt><dd><Ltr>{fields.wilaya?.name}</Ltr></dd></div>
              <div><dt>{t('Institution')}</dt><dd><Ltr>{fields.institution?.name}</Ltr></dd></div>
            </> : <>
              <div><dt>{t('Role')}</dt><dd>{t(ACTIVITY_ROLE_LABELS[fields.role] || fields.role)}</dd></div>
              <div><dt>{t('Full name')}</dt><dd><Ltr>{fields.fullName}</Ltr></dd></div>
              <div><dt>{t('Email')}</dt><dd><Ltr>{fields.email}</Ltr></dd></div>
              <div><dt>{t('Phone')}</dt><dd><Ltr>{fields.phone}</Ltr></dd></div>
            </>}
          </dl>
          {allowed.has('resolve_correction_item') && (
            <div className="adm-correction-item-actions">
              <Button variant="secondary" disabled={resolving} onClick={() => onResolveItem(item.id, 'rejected')}>{t('Needs another attempt')}</Button>
              <Button disabled={resolving} onClick={() => onResolveItem(item.id, 'verified')} icon={<CheckCircle2 size={15}/>}>{t('Verified')}</Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function AivexReviewSummary({ team, allowed, locale, syncStatus, onTab, onDecision, onCorrections, onResolveItem, onExtendDeadline, resolvingItemId }) {
  const { isArabic, t } = locale
  const review = team.reviewSummary
  const outstanding = review.blockers.length
  const isClosed = ['Rejected', 'Cancelled'].includes(team.registration) || team.document === 'Validated'
  return <section className="adm-panel adm-review-summary">
    <SectionHeading title={t('Administrative review')} meta={t(isClosed ? 'Review recorded' : 'Three simple checks')}/>
    <p className="adm-review-intro">{t('Check each section. The final decision becomes available when all required items are accepted.')}</p>
    {team.correctionRequest && <div className="adm-correction-summary"><div className="adm-case-correction-heading"><div><b>{t('Current correction request')}</b><small>{t(team.correctionRequest.expired ? 'Expired correction deadline' : 'Due')} {aivexDateLabel(team.correctionRequest.deadline, locale.language)}</small></div>{allowed.has('extend_correction_deadline') && <Button variant="secondary" onClick={onExtendDeadline}>{t('Set new deadline')}</Button>}</div><ul className="adm-correction-items-list">{team.correctionRequest.itemStatuses.map((item) => <CorrectionItemRow key={item.id} item={item} allowed={allowed} onTab={onTab} onResolveItem={onResolveItem} resolving={resolvingItemId === item.id} t={t}/>)}</ul></div>}
    <div className="adm-case-checks">{review.groups.map((group, index) => {
      const copy = REVIEW_GROUP_COPY[group.key]
      const managerNeedsConfirmation = group.key === 'people' && team.checklist[1] !== true && !isClosed
      return <article key={group.key} className={group.ready ? 'is-ready' : ''}>
        <span className="adm-case-checks__number" aria-hidden="true">{group.ready ? <CheckCircle2 size={22}/> : index + 1}</span>
        <div className="adm-case-checks__content"><h3>{t(copy.title)}</h3><p>{group.key === 'documents' ? (isArabic ? `${review.documents.verified} من ${review.documents.total} وثائق مطلوبة مقبولة.` : `${review.documents.verified} of ${review.documents.total} required documents accepted.`) : t(copy.copy)}</p><StatusBadge tone={group.ready ? 'success' : 'neutral'}>{t(group.ready ? 'Checked' : isClosed ? 'Review recorded' : 'To check')}</StatusBadge>{group.key === 'people' && <details className="adm-case-manager"><summary>{t('View activities manager details')}</summary><Facts missingLabel={t('Not provided')} items={[[t('Full name'), <bdi>{team.manager}</bdi>], [t('Role'), t(team.managerRole)], [t('Email'), <Ltr>{team.managerEmail}</Ltr>], [t('Phone'), <Ltr>{team.managerPhone}</Ltr>]]}/></details>}</div>
        {managerNeedsConfirmation && allowed.has('verify_activity_official') ? <Button variant="secondary" onClick={() => onDecision('Verify activities manager', 'verify_activity_official', false, { verified: true })}>{t('Confirm manager details')}</Button> : <Button variant="secondary" onClick={() => onTab(group.key === 'team' ? 'Team overview' : 'Documents')} icon={<ArrowRight size={15}/>}>{t(group.key === 'team' ? 'View team information' : 'Review documents')}</Button>}
      </article>
    })}</div>
    {outstanding > 0 && !isClosed && <details className="adm-case-remaining"><summary><span>{t('What remains to be checked')} <b>{outstanding}</b></span><ChevronDown size={16}/></summary><ul>{review.blockers.map((blocker) => <li key={blocker.key}><span>{t(REVIEW_BLOCKER_LABELS[blocker.key])}</span><button onClick={() => onTab(blocker.tab)}>{t('Open')}<ArrowRight size={14}/></button></li>)}</ul></details>}
    {outstanding > 0 && !isClosed && allowed.has('request_corrections') && team.canRequestCorrections && <div className="adm-case-correction-help"><div><b>{t('Something needs correcting?')}</b><p>{t('Select only the items the team needs to update.')}</p></div><Button variant="secondary" onClick={onCorrections}>{t('Request corrections')}</Button></div>}
    <div className={`adm-case-sync is-${syncStatus}`} role="status" aria-live="polite"><i/><span>{t(syncStatus === 'syncing' ? 'Updating…' : syncStatus === 'error' ? 'Automatic update will retry shortly.' : 'Up to date · refreshes automatically')}</span></div>
  </section>
}

function AivexDecisionPanel({ team, allowed, locale, onDecision }) {
  const { t } = locale
  const review = team.reviewSummary
  const isAccepted = team.document === 'Validated'
  const isClosed = ['Rejected', 'Cancelled'].includes(team.registration)
  const canAccept = allowed.has('validate_file')
  const ready = review.readyForFinalValidation
  const title = isAccepted ? 'Team accepted'
    : isClosed ? 'Registration closed'
      : ready ? 'Team ready for acceptance'
        : 'Review still in progress'
  const copy = isAccepted ? 'Registration is approved and the administrative file is validated.'
    : isClosed ? 'This registration is no longer in the active review workflow.'
      : ready ? 'All checks are complete. You can now confirm the team’s acceptance.'
        : 'Check the remaining items before accepting this team.'

  return <aside className="adm-panel adm-decision-panel">
    <SectionHeading title={t('Final team decision')}/>
    <div className={`adm-next-decision ${isAccepted || ready ? 'is-complete' : 'is-review_required'}`}><span>{t('Final acceptance')}</span><h3>{t(title)}</h3><p>{t(copy)}</p></div>
    {!isAccepted && !isClosed && <Button disabled={!ready || !canAccept} onClick={() => onDecision('Accept AIVEX team', 'validate_file')} icon={<ShieldCheck size={17}/>}>{t('Accept team')}</Button>}
    {!isAccepted && !isClosed && !ready && <p className="adm-validation-help"><LockKeyhole size={15}/>{t('Complete the remaining review items to unlock final acceptance.')}</p>}
    {!isAccepted && !isClosed && ready && !canAccept && <p className="adm-validation-help"><LockKeyhole size={15}/>{t('This final decision requires an administrator role.')}</p>}
    {isAccepted && <div className="adm-final-accepted"><CheckCircle2 size={18}/><span><b>{t('Acceptance recorded')}</b><small>{t('No further administrative decision is required.')}</small></span></div>}
    <p className="adm-decision-audit"><LockKeyhole size={14}/>{t('Every decision is recorded automatically with your administrator account.')}</p>
  </aside>
}

function SecureViewer({ team, document: file, onClose, onUpdated, onNeedsCorrection, locale, loadDocument, act }) {
  const { addToast, state } = useAdmin()
  const { isArabic, t } = locale
  const [remaining, setRemaining] = useState(Number(state.settings.viewerTimeout || 120))
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [objectUrl, setObjectUrl] = useState('')
  const [mimeType, setMimeType] = useState('')
  const [saving, setSaving] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const closeRef = useRef(onClose)
  const canvasRef = useRef(null)
  const imageViewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } })
  const gestureRef = useRef({ pointers: new Map() })
  const isImage = mimeType.startsWith('image/')
  const isPdf = mimeType === 'application/pdf'
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    let active = true
    let createdUrl = ''
    loadDocument(team.ref, file.id)
      .then(({ blob, mimeType: type }) => {
        if (!active) return
        createdUrl = URL.createObjectURL(blob)
        setObjectUrl(createdUrl)
        setMimeType(type)
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; if (createdUrl) URL.revokeObjectURL(createdUrl) }
  }, [file.id, loadDocument, team.ref])
  useEffect(() => {
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (remaining !== 0) return
    closeRef.current()
    addToast(isArabic ? 'تم إغلاق العارض تلقائياً' : 'Viewer closed automatically', isArabic ? 'انتهت جلسة المراجعة السرية.' : 'The confidential review session has expired.')
  }, [remaining, addToast, isArabic])
  useEffect(() => {
    if (!isImage || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const measure = () => {
      const rect = canvas.getBoundingClientRect()
      setViewport({ width: rect.width, height: rect.height })
      imageViewRef.current = { zoom: 1, pan: { x: 0, y: 0 } }
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [isImage])
  const submitReview = async (action) => {
    setSaving(true)
    const result = await act(team.ref, { action, expectedUpdatedAt: team.updatedAt, payload: { documentKey: file.id } })
    setSaving(false)
    if (!result.ok) { setError(t(result.message)); return }
    onUpdated(result.team)
    addToast(t(action === 'verify_document' ? 'Document accepted' : 'Replacement requested'), t('The review result is recorded automatically in the protected AIVEX history.'))
    onClose()
  }
  const accesses = team.documentAccess.filter((entry) => entry.documentKey === file.id)
  const normalizedRotation = ((rotation % 360) + 360) % 360
  const swapsImageAxes = normalizedRotation === 90 || normalizedRotation === 270
  const rotatedWidth = swapsImageAxes ? imageSize.height : imageSize.width
  const rotatedHeight = swapsImageAxes ? imageSize.width : imageSize.height
  const fitScale = rotatedWidth && rotatedHeight && viewport.width && viewport.height
    ? Math.min((viewport.width - 40) / rotatedWidth, (viewport.height - 40) / rotatedHeight, 1)
    : 1
  const clampPan = (candidate, nextZoom = imageViewRef.current.zoom) => {
    if (!rotatedWidth || !rotatedHeight || !viewport.width || !viewport.height) return { x: 0, y: 0 }
    const displayedWidth = rotatedWidth * fitScale * nextZoom
    const displayedHeight = rotatedHeight * fitScale * nextZoom
    const maxX = Math.max(0, (displayedWidth - viewport.width) / 2 + 20)
    const maxY = Math.max(0, (displayedHeight - viewport.height) / 2 + 20)
    return {
      x: Math.min(maxX, Math.max(-maxX, candidate.x)),
      y: Math.min(maxY, Math.max(-maxY, candidate.y)),
    }
  }
  const updateImageView = (nextZoom, candidatePan = imageViewRef.current.pan) => {
    const boundedZoom = clampImageZoom(nextZoom)
    const boundedPan = clampPan(candidatePan, boundedZoom)
    imageViewRef.current = { zoom: boundedZoom, pan: boundedPan }
    setZoom(boundedZoom)
    setPan(boundedPan)
  }
  const resetImageView = () => {
    imageViewRef.current = { zoom: 1, pan: { x: 0, y: 0 } }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  const rotateImage = () => {
    resetImageView()
    setRotation((value) => (value + 90) % 360)
  }
  const handleImageWheel = (event) => {
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const current = imageViewRef.current
    const nextZoom = clampImageZoom(current.zoom * Math.exp(-event.deltaY * .0015))
    const ratio = nextZoom / current.zoom
    const rect = canvas.getBoundingClientRect()
    const cursor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
    updateImageView(nextZoom, {
      x: current.pan.x + (1 - ratio) * (cursor.x - current.pan.x),
      y: current.pan.y + (1 - ratio) * (cursor.y - current.pan.y),
    })
  }
  const beginImageGesture = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const gesture = gestureRef.current
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...gesture.pointers.values()]
    if (points.length === 1) {
      gesture.mode = 'pan'
      gesture.startPoint = points[0]
      gesture.startPan = { ...imageViewRef.current.pan }
    } else if (points.length === 2) {
      gesture.mode = 'pinch'
      gesture.startDistance = Math.max(1, pointerDistance(points[0], points[1]))
      gesture.startCenter = pointerCenter(points[0], points[1])
      gesture.startZoom = imageViewRef.current.zoom
      gesture.startPan = { ...imageViewRef.current.pan }
    }
  }
  const moveImageGesture = (event) => {
    const gesture = gestureRef.current
    if (!gesture.pointers.has(event.pointerId)) return
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...gesture.pointers.values()]
    if (gesture.mode === 'pinch' && points.length >= 2) {
      const center = pointerCenter(points[0], points[1])
      const nextZoom = clampImageZoom(gesture.startZoom * pointerDistance(points[0], points[1]) / gesture.startDistance)
      const ratio = nextZoom / gesture.startZoom
      const rect = canvasRef.current.getBoundingClientRect()
      const anchor = { x: gesture.startCenter.x - rect.left - rect.width / 2, y: gesture.startCenter.y - rect.top - rect.height / 2 }
      updateImageView(nextZoom, {
        x: gesture.startPan.x + center.x - gesture.startCenter.x + (1 - ratio) * (anchor.x - gesture.startPan.x),
        y: gesture.startPan.y + center.y - gesture.startCenter.y + (1 - ratio) * (anchor.y - gesture.startPan.y),
      })
    } else if (gesture.mode === 'pan' && points.length === 1) {
      updateImageView(imageViewRef.current.zoom, {
        x: gesture.startPan.x + points[0].x - gesture.startPoint.x,
        y: gesture.startPan.y + points[0].y - gesture.startPoint.y,
      })
    }
  }
  const endImageGesture = (event) => {
    const gesture = gestureRef.current
    gesture.pointers.delete(event.pointerId)
    const points = [...gesture.pointers.values()]
    if (points.length === 1) {
      gesture.mode = 'pan'
      gesture.startPoint = points[0]
      gesture.startPan = { ...imageViewRef.current.pan }
    } else if (!points.length) {
      gesture.mode = null
    }
  }
  const handleImageKeys = (event) => {
    const step = 36
    if (event.key === '+' || event.key === '=') updateImageView(imageViewRef.current.zoom + .25)
    else if (event.key === '-') updateImageView(imageViewRef.current.zoom - .25)
    else if (event.key === '0') resetImageView()
    else if (event.key === 'ArrowLeft') updateImageView(imageViewRef.current.zoom, { ...imageViewRef.current.pan, x: imageViewRef.current.pan.x - step })
    else if (event.key === 'ArrowRight') updateImageView(imageViewRef.current.zoom, { ...imageViewRef.current.pan, x: imageViewRef.current.pan.x + step })
    else if (event.key === 'ArrowUp') updateImageView(imageViewRef.current.zoom, { ...imageViewRef.current.pan, y: imageViewRef.current.pan.y - step })
    else if (event.key === 'ArrowDown') updateImageView(imageViewRef.current.zoom, { ...imageViewRef.current.pan, y: imageViewRef.current.pan.y + step })
    else return
    event.preventDefault()
  }
  const reviewingCorrection = file.correctionStatus === 'submitted'
  const awaitingCandidateReplacement = file.correctionStatus === 'open' && ['student', 'signed', 'identity'].includes(file.category)
  const replacementDisabled = saving || loading || (!reviewingCorrection && !team.canRequestCorrections)
  return <Modal open wide className="is-document-viewer" onClose={saving ? () => {} : onClose} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Confidential document')} eyebrow={t('Restricted review · Access recorded')} footer={<div className="adm-viewer-footer"><span className="adm-viewer-timer"><LockKeyhole size={14}/>{t('Auto-close in')} <Ltr>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Ltr></span><div className="adm-viewer-footer-actions"><Button variant="secondary" onClick={onClose} disabled={saving}>{t('Close viewer')}</Button><Button variant="danger" onClick={() => reviewingCorrection ? submitReview('invalidate_document') : onNeedsCorrection(file)} disabled={replacementDisabled}>{t(reviewingCorrection ? 'Needs another attempt' : team.correctionRequest ? 'Correction cycle already active' : 'Needs replacement')}</Button><Button onClick={() => submitReview('verify_document')} disabled={saving || loading || file.status === 'Verified' || awaitingCandidateReplacement} icon={<CheckCircle2 size={16}/>}>{t(file.status === 'Verified' ? 'Document accepted' : awaitingCandidateReplacement ? 'Waiting for the team' : saving ? 'Saving…' : 'Document is correct')}</Button></div></div>}>
    <div className="adm-viewer-heading">
      <div className="adm-viewer-file"><span><FileText size={21}/></span><div><b>{file.person}</b><p>{t(file.kind)}</p></div></div>
      <AivexStatus value="Confidential" tone="sensitive" t={t}/>
    </div>
    <div className="adm-viewer-layout">
      <section className="adm-viewer-preview" aria-label={t('Confidential document')}>
        <div className="adm-viewer-controls">
          <span className="adm-viewer-controls-label"><LockKeyhole size={14}/>{t('Confidential document')}</span>
          {isImage && <div className="adm-viewer-control-actions"><IconButton label={t('Fit image to screen')} onClick={resetImageView}><Maximize2 size={18}/></IconButton><IconButton label={t('Zoom out')} disabled={zoom <= IMAGE_ZOOM_MIN} onClick={() => updateImageView(imageViewRef.current.zoom - .25)}><ZoomOut size={18}/></IconButton><button type="button" className="adm-viewer-zoom" onClick={resetImageView} aria-label={t('Reset zoom')}>{Math.round(zoom * 100)}%</button><IconButton label={t('Zoom in')} disabled={zoom >= IMAGE_ZOOM_MAX} onClick={() => updateImageView(imageViewRef.current.zoom + .25)}><ZoomIn size={18}/></IconButton><IconButton label={t('Rotate document')} onClick={rotateImage}><RotateCw size={18}/></IconButton></div>}
          {!isImage && <span className="adm-viewer-format">{isPdf ? 'PDF' : (mimeType.split('/')[1] || 'FILE').toUpperCase()}</span>}
        </div>
        <div ref={canvasRef} className={`adm-viewer-canvas adm-viewer-canvas--real ${isPdf ? 'is-pdf' : ''} ${isImage ? 'is-image' : ''}`} tabIndex={isImage ? 0 : undefined} aria-label={isImage ? t('Interactive image viewer') : undefined} onWheel={isImage ? handleImageWheel : undefined} onPointerDown={isImage ? beginImageGesture : undefined} onPointerMove={isImage ? moveImageGesture : undefined} onPointerUp={isImage ? endImageGesture : undefined} onPointerCancel={isImage ? endImageGesture : undefined} onDoubleClick={isImage ? resetImageView : undefined} onKeyDown={isImage ? handleImageKeys : undefined}>{loading ? <AivexSkeleton label={t('Opening secure document')}/> : error && !objectUrl ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p></div> : isImage ? <><div className="adm-secure-document is-image" style={{ width: imageSize.width || undefined, height: imageSize.height || undefined, transform: `translate(-50%, -50%) translate3d(${pan.x}px, ${pan.y}px, 0) rotate(${rotation}deg) scale(${fitScale * zoom})` }}><img src={objectUrl} alt={t(file.kind)} draggable="false" onLoad={(event) => { setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); resetImageView() }}/></div><span className="adm-viewer-image-help">{t('Drag to move · Mouse wheel to zoom · Pinch with two fingers on mobile')}</span></> : <div className={`adm-secure-document ${isPdf ? 'is-pdf' : ''}`}>{isPdf ? <iframe title={t(file.kind)} src={objectUrl}/> : <div className="adm-file-preview-unavailable"><FileText size={28}/><b>{t('Preview unavailable')}</b><p>{t('This file type can only be downloaded through the secure administration endpoint.')}</p></div>}</div>}</div>
      </section>
      <aside className="adm-viewer-sidebar">
        <div className="adm-viewer-security"><ShieldCheck size={20}/><div><b>{t('Internal verification data.')}</b><p>{t('Access is logged. Do not copy, download or disclose personal documents outside the authorised review process.')}</p></div></div>
        <div className="adm-document-review-guide"><span>{t('Simple document review')}</span><b>{t('Is the document readable and consistent with the team information?')}</b><p>{t('Accept a readable, matching document or request a replacement.')}</p></div>
        <details className="adm-viewer-log"><summary><span>{t('Consultation log')}</span><Ltr>{accesses.length}</Ltr></summary><div>{accesses.length ? accesses.map((entry, index) => <p key={`${entry.at}-${index}`}><span>{entry.actor}</span><small>{dateLabel(entry.at)} · {timeLabel(entry.at)}</small></p>) : <p><span>{t('No earlier consultation recorded')}</span></p>}</div></details>
      </aside>
    </div>
    {error && objectUrl && <p className="adm-form-error adm-viewer-error" role="alert">{error}</p>}
  </Modal>
}

export function AivexDetailPage() {
  const { teamId } = useParams()
  const { addToast } = useAdmin()
  const locale = useAivexLocale()
  const { language, isArabic, dir, t, setLanguage, path } = locale
  const { loadDetail, act, loadDocument, uploadIdentityReplacement } = useAdminAivexActions()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('Verification')
  const [viewerId, setViewerId] = useState(null)
  const [action, setAction] = useState(null)
  const [corrections, setCorrections] = useState(false)
  const [correctionDefaults, setCorrectionDefaults] = useState([])
  const [correctionError, setCorrectionError] = useState('')
  const [deadlineChange, setDeadlineChange] = useState(false)
  const [deadlineError, setDeadlineError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [verificationSync, setVerificationSync] = useState('current')
  const [resolvingItemId, setResolvingItemId] = useState(null)

  const refreshDetail = useCallback(async () => {
    try {
      const next = await loadDetail(teamId)
      setTeam(next)
      setLoadError('')
      return next
    } catch (error) {
      setLoadError(error.message)
      return null
    }
  }, [loadDetail, teamId])

  useEffect(() => {
    let active = true
    loadDetail(teamId)
      .then((next) => { if (active) { setTeam(next); setLoadError('') } })
      .catch((error) => { if (active) setLoadError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadDetail, teamId])

  useEffect(() => {
    if (tab !== 'Verification') return undefined
    let active = true
    let inFlight = false
    const syncVerification = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      setVerificationSync('syncing')
      try {
        const next = await loadDetail(teamId)
        if (active) {
          setTeam(next)
          setLoadError('')
          setVerificationSync('current')
        }
      } catch {
        if (active) setVerificationSync('error')
      } finally {
        inFlight = false
      }
    }
    const syncWhenVisible = () => { if (document.visibilityState === 'visible') syncVerification() }
    syncVerification()
    const interval = window.setInterval(syncVerification, 12000)
    window.addEventListener('focus', syncVerification)
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', syncVerification)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [loadDetail, tab, teamId])

  if (loading) return <div className={`adm-page adm-aivex-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}><AivexSkeleton label={t('Opening AIVEX file')}/></div>
  if (!team) return <div className={`adm-page adm-aivex-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}><Link className="adm-back-link" to={path('/admin/aivex')}><ArrowLeft size={16}/>{t('All AIVEX files')}</Link><EmptyState title={t('File not found')} copy={t(loadError || 'This AIVEX file is unavailable.')}/><Button variant="secondary" onClick={refreshDetail} icon={<RefreshCw size={15}/>}>{t('Try again')}</Button></div>

  const file = team.docs.find((document) => document.id === viewerId)
  const generated = team.docs.find((document) => document.id === 'official')
  const allowed = new Set(team.allowedActions || [])
  const review = team.reviewSummary
  const presentation = aivexFilePresentation(team)
  const openFile = (document) => {
    if (!document.canOpen) { addToast(t('File absent'), t('Request the missing file through a correction request.')); return }
    setViewerId(document.id)
  }
  const closeViewer = () => { setViewerId(null); refreshDetail() }
  const openCorrections = (items = []) => {
    if (team.correctionRequest) {
      addToast(t('Correction cycle already active'), t('Finish the current correction request before creating another one.'))
      return
    }
    if (!team.canRequestCorrections) {
      addToast(t('Correction request unavailable'), t('A correction request can be opened only after the signed file reaches administrative review.'))
      return
    }
    setCorrectionDefaults(items)
    setCorrectionError('')
    setCorrections(true)
  }
  const requestDocumentCorrection = (document) => {
    const item = CORRECTION_ITEM_BY_DOCUMENT[document.id]
      || (document.category === 'signed' ? 'Signed and stamped form' : null)
    setViewerId(null)
    if (item) openCorrections([item])
  }
  const decision = (title, actionName, danger = false, extra = {}) => setAction({ key: actionName, title: t(title), danger, reason: false, description: false, ...extra })
  const submitAction = async () => {
    const result = await act(team.ref, {
      action: action.key, expectedUpdatedAt: team.updatedAt,
      payload: action.key === 'verify_activity_official' ? { verified: action.verified } : {},
    })
    if (!result.ok) return t(result.message)
    setTeam(result.team)
    setVerificationSync('current')
    addToast(action.title, t('The real AIVEX file and its protected history were updated.'))
    return undefined
  }
  const regenerate = () => decision('Retry official form generation', 'retry_generation', false)
  const download = async () => {
    setDownloadBusy(true)
    try {
      const { blob } = await loadDocument(team.ref, 'official')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${team.ref}.docx`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      addToast(t('Official DOCX downloaded'), t('The download was recorded in the administrative history.'))
    } catch (error) {
      addToast(t('Download failed'), t(error.message))
    } finally { setDownloadBusy(false) }
  }
  const saveCorrections = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const items = data.getAll('items')
    if (!items.length) { setCorrectionError(t('Choose at least one item to correct.')); return }
    setBusy(true)
    const result = await act(team.ref, {
      action: 'request_corrections', expectedUpdatedAt: team.updatedAt,
      payload: { items, deadline: data.get('deadline') },
    })
    setBusy(false)
    if (!result.ok) { setCorrectionError(t(result.message)); return }
    setTeam(result.team)
    setVerificationSync('current')
    setCorrections(false)
    setCorrectionDefaults([])
    addToast(t('Corrections requested'), t('The request is saved in the protected AIVEX history.'))
  }
  const resolveCorrectionItem = async (itemId, decision) => {
    setResolvingItemId(itemId)
    const result = await act(team.ref, {
      action: 'resolve_correction_item', expectedUpdatedAt: team.updatedAt, payload: { itemId, decision },
    })
    setResolvingItemId(null)
    if (!result.ok) { addToast(t('Action failed'), t(result.message)); return }
    setTeam(result.team)
    setVerificationSync('current')
    addToast(t(decision === 'verified' ? 'Correction verified' : 'Sent back to the team'), t('The real AIVEX file and its protected history were updated.'))
  }
  const saveCorrectionDeadline = async (event) => {
    event.preventDefault()
    const deadline = new FormData(event.currentTarget).get('deadline')
    setBusy(true)
    const result = await act(team.ref, {
      action: 'extend_correction_deadline', expectedUpdatedAt: team.updatedAt, payload: { deadline },
    })
    setBusy(false)
    if (!result.ok) { setDeadlineError(t(result.message)); return }
    setTeam(result.team)
    setDeadlineChange(false)
    setDeadlineError('')
    addToast(t('Correction deadline updated'), t('The old and new deadlines were recorded in the protected history.'))
  }

  return <div className={`adm-page adm-aivex-page adm-team-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}>
    <Link className="adm-back-link" to={path('/admin/aivex')}><ArrowLeft size={15}/>{t('All AIVEX files')}</Link>
    <PageHeader eyebrow={<Ltr>{team.ref}</Ltr>} title={<bdi>{team.name}</bdi>} description={<>{team.institution} · {team.wilaya}</>} actions={<div className="adm-aivex-header-actions"><AivexLanguageSwitch language={language} setLanguage={setLanguage} t={t}/><Button variant="secondary" onClick={refreshDetail} icon={<RefreshCw size={15}/>}>{t('Refresh files')}</Button></div>}/>
    <section className={`adm-case-overview is-${presentation.tone}`} aria-label={t('File summary')}>
      <div className="adm-case-overview__copy"><FileState team={team} t={t}/><h2>{t(presentation.title)}</h2><p>{t(presentation.copy)}</p></div>
      <div className="adm-case-overview__meta"><span>{t('Review progress')}</span><Progress value={team.completeness} label={t('Review progress')}/><small>{t('Updated')} {aivexDateLabel(team.updatedAt, language)}</small>{presentation.tab !== tab && <Button variant="secondary" onClick={() => setTab(presentation.tab)} icon={<ArrowRight size={15}/>}>{t(presentation.action)}</Button>}</div>
    </section>
    <Tabs items={AIVEX_TABS} value={tab} onChange={setTab} getLabel={(value) => t(value === 'Verification' ? 'Review & decision' : value)} counts={presentation.tab === 'History' ? {} : { Verification: review.blockers.length === 0 ? t('Ready') : review.blockers.length }}/>
    {tab === 'Team overview' && <div className="adm-dossier-layout"><div className="adm-dossier-main">
      <section className="adm-panel adm-dossier-section"><SectionHeading index="01" title={t('Team & institution')}/><Facts missingLabel={t('Not provided')} items={[[t('Team name'), <Ltr>{team.name}</Ltr>], [t('Wilaya code & name'), team.wilaya], [t('Institution'), team.institution], [t('Institution type'), t(team.institutionType)], [t('Edition'), t(team.edition)], [t('Submission date'), dateLabel(team.submittedAt)], [t('Reference'), <code><Ltr>{team.ref}</Ltr></code>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="02" title={t('Activities manager')}/><Facts missingLabel={t('Not provided')} items={[[t('Role'), t(team.managerRole)], [t('Full name'), <Ltr>{team.manager}</Ltr>], [t('Email'), <Ltr>{team.managerEmail}</Ltr>], [t('Phone'), <Ltr>{team.managerPhone}</Ltr>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="03" title={t('Delegation')}/><div className="adm-delegation">{[
        { id: 'delegation-leader', title: 'Delegation leader', name: team.leader, phone: team.leaderPhone, rfid: team.leaderRfid },
        { id: 'driver', title: 'Driver', name: team.driver, phone: team.driverPhone, rfid: team.driverRfid },
      ].map((person) => { const identity = team.docs.find((document) => document.id === person.id); return <div key={person.id}><h3>{t(person.title)}</h3><Facts missingLabel={t('Not provided')} items={[[t('Full name'), <Ltr>{person.name}</Ltr>], [t('Phone'), <Ltr>{person.phone}</Ltr>], ['RFID', <code><Ltr>{person.rfid}</Ltr></code>], [t('Identity card'), <AivexStatus value={identity.status} t={t}/>]]}/><button className="adm-text-action" disabled={!identity.canOpen} onClick={() => openFile(identity)}><LockKeyhole size={14}/>{t('Review document')}</button></div> })}</div></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="04" title={t('Student roster')} meta={t('Exactly 3 students')}/><div className="adm-student-roster">{team.students.map((student, index) => { const studentCard = team.docs.find((document) => document.id === `student-${index + 1}`); return <article key={student.position}><header><span>{student.position}</span><h3><Ltr>{student.name}</Ltr></h3><AivexStatus value={studentCard.status} t={t}/></header><Facts missingLabel={t('Not provided')} items={[[t('Phone'), <Ltr>{student.phone}</Ltr>], [t('Baccalaureate year'), <Ltr>{student.bac}</Ltr>], [t('RFID · 8 digits'), <code><Ltr>{student.rfid}</Ltr></code>], [t('Document review'), t(documentOutcomeLabel(studentCard.status))]]}/><button className="adm-text-action" disabled={!studentCard.canOpen} onClick={() => openFile(studentCard)}><LockKeyhole size={14}/>{t('Review student card')} <ArrowRight size={14}/></button></article> })}</div></section>
    </div><aside className="adm-dossier-aside"><div className="adm-dossier-summary"><span className="adm-eyebrow">{t('Next step')}</span><h2>{t(presentation.title)}</h2><p>{t(presentation.copy)}</p><Button onClick={() => setTab(presentation.tab)} icon={<ArrowRight size={16}/>}>{t(presentation.action)}</Button></div><section className="adm-panel adm-aside-docs"><h3>{t('Document centre')}</h3><p><FileText size={16}/>{isArabic ? `${team.docs.length} وثيقة مسجلة` : `${team.docs.length} documents on record`}</p><p><LockKeyhole size={16}/>{isArabic ? `${team.docs.filter((document) => ['student', 'identity'].includes(document.category)).length} وثائق هوية سرية` : `${team.docs.filter((document) => ['student', 'identity'].includes(document.category)).length} confidential identity files`}</p><button className="adm-text-action" onClick={() => setTab('Documents')}>{t('Browse documents')} <ArrowRight size={15}/></button></section><AivexConfidentialNotice t={t}/></aside></div>}
    {tab === 'Documents' && <div className="adm-documents-page"><AivexConfidentialNotice t={t}/>{[
      ['official', 'A', 'Participation form', 'Download the form to be signed by the institution.'],
      ['signed', 'B', 'Signed and stamped form', 'Check the signature and stamp on the latest version.'],
      ['student', 'C', 'Student cards', 'Check the name and readability of each student card.'],
      ['identity', 'D', 'Identity documents', 'Check the delegation leader and driver documents.'],
    ].map(([category, index, title, meta]) => <section className="adm-panel adm-file-category" key={category}>
      <SectionHeading index={index} title={t(title)} meta={t(meta)}/>
      {team.docs.filter((document) => document.category === category).map((document) => <div className="adm-file-row" key={document.id}>
        <span className={`adm-file-icon ${category !== 'official' ? 'is-locked' : ''}`}>{category === 'official' ? <FileText size={22}/> : <LockKeyhole size={20}/>}</span>
        <div className="adm-file-name"><b>{t(category === 'official' ? 'Participation form' : document.kind)}</b><small><Ltr>{document.person}</Ltr> · <Ltr>{document.type}</Ltr> · <Ltr>{document.size}</Ltr></small></div>
        <div className="adm-file-time"><span>{dateLabel(document.created)}</span><small><Ltr>{timeLabel(document.created)}</Ltr></small></div>
        {document.version && <span className="adm-version"><Ltr>v{document.version}</Ltr> · {t(document.active ? 'Active' : 'Previous')}</span>}
        {category === 'official' ? <AivexStatus value={document.status} t={t}/> : <div className="adm-file-review-state"><AivexStatus value={documentOutcomeLabel(document.status)} tone={document.status === 'Verified' ? 'success' : document.status === 'Invalid' || document.status === 'Absent' ? 'warning' : 'neutral'} t={t}/></div>}
        {category === 'official' ? document.canOpen
          ? <IconButton label={t('Download secure DOCX')} disabled={downloadBusy} onClick={download}><Download size={18}/></IconButton>
          : allowed.has('retry_generation') ? <Button variant="secondary" onClick={regenerate}>{t(document.status === 'Generation issue' ? 'Retry generation' : 'Generate form')}</Button> : null
          : <Button variant="secondary" disabled={!document.canOpen} onClick={() => openFile(document)} icon={<LockKeyhole size={14}/>}>{t(document.status === 'Verified' ? 'Review again' : 'Review document')}</Button>}
        {category === 'identity' && (
          <IdentityReplacementControl
            team={team} document={document} allowed={allowed} locale={locale}
            uploadIdentityReplacement={uploadIdentityReplacement}
            onUploaded={(nextTeam) => {
              setTeam(nextTeam)
              setVerificationSync('current')
              addToast(t('Identity replacement submitted'), t('The replacement must now be reviewed in the secure viewer.'))
            }}
          />
        )}
      </div>)}
      {!team.docs.some((document) => document.category === category) && <div className="adm-file-absent"><FolderClosed size={23}/><div><b>{t('No signed document received')}</b><p>{t('The official form still needs to be signed and stamped by the institution.')}</p></div><AivexStatus value="Absent" tone="warning" t={t}/></div>}
    </section>)}</div>}
    {tab === 'Verification' && <div className="adm-verification-layout"><AivexReviewSummary team={team} allowed={allowed} locale={locale} syncStatus={verificationSync} onTab={setTab} onDecision={decision} onCorrections={() => openCorrections()} onResolveItem={resolveCorrectionItem} onExtendDeadline={() => { setDeadlineError(''); setDeadlineChange(true) }} resolvingItemId={resolvingItemId}/><AivexDecisionPanel team={team} allowed={allowed} locale={locale} onDecision={decision}/></div>}
    {tab === 'History' && <section className="adm-panel adm-dossier-section"><SectionHeading title={t('Complete file history')} meta={t('Authors, timestamps & decisions')}/><History items={team.history} translate={t} locale={isArabic ? 'ar-DZ' : 'en-GB'} emptyTitle={t('Historical data incomplete')} emptyCopy={t('No earlier actions are available for this file. New actions will appear here.')}/><div className="adm-history-note"><LockKeyhole size={15}/><p>{t('Confidential document consultations are recorded separately in the')} <Link to="/admin/activity?sensitivity=Confidential">{t('global activity log')}</Link>.</p></div></section>}
    {file && <SecureViewer key={file.id} team={team} document={file} onClose={closeViewer} onUpdated={setTeam} onNeedsCorrection={requestDocumentCorrection} locale={locale} loadDocument={loadDocument} act={act}/>}
    {action && <ActionDialog key={action.key} action={action} labels={actionDialogLabels(isArabic, t)} getOptionLabel={t} onClose={() => setAction(null)} onSubmit={submitAction}/>} 
    <Modal open={corrections} onClose={() => busy ? undefined : setCorrections(false)} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Request corrections')} eyebrow={team.ref} footer={<><Button variant="secondary" onClick={() => setCorrections(false)} disabled={busy}>{t('Cancel')}</Button><Button form="correction-form" type="submit" disabled={busy}>{t(busy ? 'Saving…' : 'Save correction request')}</Button></>}><form id="correction-form" onSubmit={saveCorrections}><fieldset className="adm-correction-items"><legend>{t('Items requiring correction')}</legend>{['Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID', 'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form'].map((item) => <label key={item}><input type="checkbox" name="items" value={item} defaultChecked={correctionDefaults.includes(item)}/>{t(item)}</label>)}</fieldset><label className="adm-form-field"><span>{t('Correction deadline')} <em>{t('Required')}</em></span><input name="deadline" type="date" required min={new Date().toISOString().slice(0, 10)} defaultValue={tomorrowDate()}/></label><p className="adm-muted">{t('The selected items and deadline are recorded directly in the protected case history.')}</p>{correctionError && <p className="adm-form-error" role="alert">{correctionError}</p>}</form></Modal>
    <Modal open={deadlineChange} onClose={() => busy ? undefined : setDeadlineChange(false)} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Set new correction deadline')} eyebrow={team.ref} footer={<><Button variant="secondary" onClick={() => setDeadlineChange(false)} disabled={busy}>{t('Cancel')}</Button><Button form="correction-deadline-form" type="submit" disabled={busy}>{t(busy ? 'Saving…' : 'Save new deadline')}</Button></>}><form id="correction-deadline-form" onSubmit={saveCorrectionDeadline}><label className="adm-form-field"><span>{t('New deadline')} <em>{t('Required')}</em></span><input name="deadline" type="date" required min={new Date().toISOString().slice(0, 10)} defaultValue={team.correctionRequest?.expired ? tomorrowDate() : team.correctionRequest?.deadline}/></label><p className="adm-muted">{t('The previous deadline remains in the protected audit history.')}</p>{deadlineError && <p className="adm-form-error" role="alert">{deadlineError}</p>}</form></Modal>
    {generated.status === 'Generation issue' && tab !== 'Documents' && <div className="adm-inline-error"><CriticalNotice>{t('The official form could not be generated. The team data is saved.')}</CriticalNotice>{allowed.has('retry_generation') && <Button variant="secondary" onClick={regenerate}>{t('Retry generation')}</Button>}</div>}
  </div>
}
