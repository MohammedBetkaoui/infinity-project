import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileCheck2, FileText, FolderClosed, Languages, LockKeyhole, RefreshCw, RotateCw, ShieldCheck, TriangleAlert, ZoomIn, ZoomOut } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { useAivexLocale } from './AivexI18n'
import { DOCUMENT_STATUSES, REGISTRATION_STATUSES, dateLabel, timeLabel } from './adminModel'
import { Button, ConfidentialNotice, CriticalNotice, EmptyState, IconButton, Modal, PageHeader, Pagination, Progress, SectionHeading, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'
import { useAdminAivex, useAdminAivexActions } from './useAdminAivex'

const AIVEX_CARD_STAGES = ['Recorded', 'Form ready', 'Signed', 'Review', 'Validated']
const AIVEX_TABS = ['Team overview', 'Documents', 'Verification', 'History']
const DOCUMENT_KEYS = Object.freeze({
  'Not generated': 'not_generated', Generating: 'generating', 'Awaiting signature': 'awaiting_signature',
  'Signed document received': 'signed_document_uploaded', 'Under review': 'under_review',
  'Corrections needed': 'changes_required', Validated: 'validated',
  'Generation issue': 'generation_failed', Expired: 'expired',
})
const TABLE_SORT_KEYS = Object.freeze({
  ref: 'reference', name: 'team', institution: 'institution', manager: 'team',
  registration: 'registration', document: 'document', completeness: 'completion',
  submitted: 'submitted', updated: 'updated',
})
const CARD_SORTS = Object.freeze({ attention: 'attention_asc', completion: 'completion_asc', team: 'team_asc' })

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

function cardStageState(team) {
  const generated = team.docs?.find((document) => document.id === 'official')?.status === 'Generated' || team.checklist?.[7] === true
  return [true, generated, team.signed, ['Under review', 'Corrections needed', 'Validated'].includes(team.document), team.document === 'Validated']
}

function nextCheckpoint(team) {
  const checkpoints = {
    'Not generated': 'Generate the official form', Generating: 'Wait for form generation',
    'Awaiting signature': 'Receive the signed form', 'Signed document received': 'Start document review',
    'Under review': 'Review missing information', 'Corrections needed': 'Follow up on requested corrections',
    Validated: 'No action required', 'Generation issue': 'Resolve the generation issue', Expired: 'Review the expired file',
  }
  return checkpoints[team.document] || 'Review the administrative file'
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
      <div><span>{t('Operational case board')}</span><b>{isArabic ? `${pagination.total} ملف فريق في هذا العرض` : `${pagination.total} team file${pagination.total !== 1 ? 's' : ''} in this view`}</b></div>
      <label><span>{t('Order by')}</span><select value={order} onChange={(event) => onOrder(event.target.value)}><option value="attention">{t('Action priority')}</option><option value="completion">{t('Lowest completion')}</option><option value="team">{t('Team name')}</option></select></label>
    </header>
    {records.length ? <div className="adm-aivex-card-grid">{records.map((team, index) => {
      const stages = cardStageState(team)
      const attention = ['Generation issue', 'Corrections needed', 'Expired'].includes(team.document)
      return <article key={team.ref} className={`adm-aivex-card ${attention ? 'is-attention' : ''} ${team.document === 'Validated' ? 'is-validated' : ''}`}>
        <div className="adm-aivex-card__rail"><code>{team.ref}</code><span>{isArabic ? 'الطبعة 02 / ملف' : 'ED.02 / CASE'} {String((pagination.page - 1) * pagination.limit + index + 1).padStart(2, '0')}</span></div>
        <header className="adm-aivex-card__identity">
          <div><span>{t('Team dossier')}</span><h3><Ltr>{team.name}</Ltr></h3><p>{team.institution}<small>{team.wilaya}</small></p></div>
          <div className="adm-aivex-card__completion" style={{ '--adm-progress-angle': `${team.completeness * 3.6}deg` }} aria-label={`${t('File completion')}: ${team.completeness}%`}><span><strong>{team.completeness}</strong><small>%</small></span></div>
        </header>
        <div className="adm-aivex-card__statuses"><AivexStatus value={team.registration} t={t}/><AivexStatus value={team.document} t={t}/></div>
        <div className="adm-aivex-card__journey" aria-label={t('Administrative progress')}>{AIVEX_CARD_STAGES.map((label, stage) => <div key={label} className={stages[stage] ? 'is-complete' : ''}><i>{stages[stage] ? <Check size={11}/> : stage + 1}</i><span>{t(label)}</span></div>)}</div>
        <dl className="adm-aivex-card__facts">
          <div><dt>{t('Activities manager')}</dt><dd>{team.manager}</dd></div>
          <div><dt>{t('Submitted')}</dt><dd>{dateLabel(team.submittedAt)}</dd></div>
          <div><dt>{t('Last update')}</dt><dd>{dateLabel(team.updatedAt)}</dd></div>
          <div><dt>{t('Signed file')}</dt><dd className={team.signed ? 'is-present' : 'is-missing'}><LockKeyhole size={12}/>{t(team.signed ? 'Secure copy received' : 'Not received')}</dd></div>
        </dl>
        <div className={`adm-aivex-card__checkpoint ${attention ? 'is-attention' : ''}`}><span>{t(attention ? 'Attention required' : team.document === 'Validated' ? 'Administrative outcome' : 'Next checkpoint')}</span><b>{t(nextCheckpoint(team))}</b></div>
        <footer><button onClick={() => onOpen(team)}><span>{t('Open administrative file')}</span><ArrowRight size={16}/></button></footer>
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
  const counts = DOCUMENT_STATUSES.map((status) => ({ status, count: summary.documentCounts?.[DOCUMENT_KEYS[status]] || 0 }))
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
    <PageHeader eyebrow={t('Competition operations · Edition 02')} title={t('AIVEX files')} description={t('Administrative tracking for every team. From registration to the final green light.')} actions={<div className="adm-aivex-header-actions"><AivexLanguageSwitch language={language} setLanguage={setLanguage} t={t}/><Button variant="secondary" onClick={refresh} icon={<RefreshCw size={15}/>}>{t('Refresh files')}</Button><span className="adm-edition"><i/>{t('AIVEX / SECOND EDITION')}</span></div>}/>
    <SummaryStrip items={[{ label: t('Registered teams'), value: summary.registered || 0 }, { label: t('Complete files'), value: summary.complete || 0 }, { label: t('Awaiting signature'), value: summary.awaitingSignature || 0 }, { label: t('Signed received'), value: summary.signedReceived || 0 }, { label: t('Under review'), value: summary.underReview || 0 }, { label: t('Corrections'), value: summary.corrections || 0 }, { label: t('Validated'), value: summary.validated || 0 }]}/>
    <div className="adm-status-pipeline" aria-label={isArabic ? 'التصفية حسب مرحلة الوثيقة' : 'Filter by document stage'}><button className={!filters.document ? 'is-active' : ''} onClick={() => resetPage(() => setFilters({ ...filters, document: '' }))}><span>{t('All files')}</span><b>{summary.registered || 0}</b></button>{counts.map(({ status, count }) => <button key={status} className={filters.document === status ? 'is-active' : ''} onClick={() => resetPage(() => setFilters({ ...filters, document: status }))}><span>{t(status)}</span><b>{count}</b></button>)}</div>
    <div className="adm-work-panel"><RecordToolbar search={search} onSearch={(value) => resetPage(() => setSearch(value))} placeholder={t('Search reference, team, institution or person…')} filters={filters} onFilters={(value) => resetPage(() => setFilters(value))} resultCount={pagination.total} filterLabel={t('All filters')} getOptionLabel={t} labels={isArabic ? { search: 'البحث في ملفات AIVEX', clearSearch: 'مسح البحث', all: 'الكل', recordView: 'طريقة عرض السجلات', tableView: t('Table view'), cardView: t('Card view'), liveScope: t('Live scope'), matchingRecords: (count) => `${count} سجل مطابق`, removeFilter: 'إزالة عامل تصفية', allIncluded: t('All records included'), clearAll: t('Clear all'), drawerTitle: t('Refine records'), drawerEyebrow: t('Search & filters'), reset: t('Reset filters'), showResults: (count) => `عرض ${count} نتيجة`, drawerSummary: 'سجل مطابق للمعايير الحالية. تظهر التغييرات مباشرة.', close: 'إغلاق عوامل التصفية' } : {}} quickDefinitions={[
      { key: 'document', label: t('Document stage'), shortLabel: t('Stage'), allLabel: t('All stages'), options: DOCUMENT_STATUSES },
      { key: 'registration', label: t('Registration status'), shortLabel: t('Registration'), allLabel: t('All registrations'), options: REGISTRATION_STATUSES },
      { key: 'complete', label: t('Completeness'), shortLabel: t('File state'), allLabel: t('All files'), options: ['Complete', 'Incomplete'] },
    ]} view={activeView} onView={mobileCardsOnly ? undefined : changeView} definitions={[
      { key: 'registration', label: t('Registration status'), options: REGISTRATION_STATUSES }, { key: 'document', label: t('Document status'), options: DOCUMENT_STATUSES }, { key: 'wilaya', label: t('Wilaya'), options: facets.wilayas || [] }, { key: 'institution', label: t('Institution'), options: facets.institutions || [] }, { key: 'complete', label: t('Completeness'), options: ['Complete', 'Incomplete'] }, { key: 'signedLabel', label: t('Signed document'), options: ['Present', 'Absent'] }, { key: 'dateFrom', label: t('Submitted from'), type: 'date', options: [] }, { key: 'dateTo', label: t('Submitted until'), type: 'date', options: [] },
    ]}/>
      {error ? <div className="adm-state-error adm-aivex-error" role="alert"><TriangleAlert size={24}/><h3>{t('AIVEX files could not be loaded')}</h3><p>{t(error)}</p><Button onClick={refresh} variant="secondary" icon={<RefreshCw size={15}/>}>{t('Try again')}</Button></div> : loading ? <AivexSkeleton label={t('Loading AIVEX files')}/> : activeView === 'cards' ? <AivexCardGrid records={teams} locale={locale} pagination={pagination} onPageChange={setPage} order={cardOrder} onOrder={updateCardOrder} onOpen={(team) => navigate(path(`/admin/aivex/${team.ref}`))}/> : <>
        <div className="adm-aivex-register-head"><div><code>AIVEX / REGISTER-02</code><b>{pagination.total}</b><span>{isArabic ? `${pagination.total} ملف فريق في السجل الحالي` : `${pagination.total} team file${pagination.total !== 1 ? 's' : ''} in the current register`}</span></div><div aria-label={isArabic ? 'مؤشرات صفوف السجل' : 'Register row markers'}><span><i className="is-action"/>{t('Action required')}</span><span><i className="is-validated"/>{t('Validated')}</span></div></div>
        <RecordTable className="adm-aivex-table-view" records={teams} controlledSort={tableSort} onSortChange={updateTableSort} pagination={pagination} onPageChange={setPage} locale={isArabic ? 'ar' : 'en'} labels={isArabic ? { open: 'فتح', record: 'السجل', openFile: t('Open file'), openRecord: 'فتح السجل', empty: t('No matching records'), emptyCopy: t('Adjust the search or remove one of the active filters.'), pagination: paginationLabels(true, t) } : {}} rowClassName={(team) => ['Generation issue', 'Corrections needed', 'Expired'].includes(team.document) ? 'is-aivex-attention' : team.document === 'Validated' ? 'is-aivex-validated' : ''} onOpen={(team) => navigate(path(`/admin/aivex/${team.ref}`))} columns={[
          { key: 'ref', label: t('Reference'), render: (team) => <span className="adm-aivex-ref-cell"><code>{team.ref}</code><small>{isArabic ? 'الطبعة 02' : 'Edition 02'}</small></span> },
          { key: 'name', label: t('Team'), render: (team) => <span className="adm-aivex-team-cell"><b><Ltr>{team.name}</Ltr></b><small>{team.completeness === 100 ? t('Administrative file complete') : isArabic ? `${10 - team.checklist.filter(Boolean).length} عناصر للمراجعة` : `${10 - team.checklist.filter(Boolean).length} items to review`}</small></span> },
          { key: 'institution', label: t('Institution'), render: (team) => <span className="adm-institution-cell"><b>{team.institution}</b><small>{team.wilaya}</small></span> },
          { key: 'manager', label: t('Activities manager'), secondary: true, render: (team) => <span className="adm-aivex-manager-cell"><b>{team.manager}</b><small>{t(team.managerRole)}</small></span> },
          { key: 'registration', label: t('Registration'), render: (team) => <AivexStatus value={team.registration} t={t}/> },
          { key: 'document', label: t('Document'), render: (team) => <AivexStatus value={team.document} t={t}/> },
          { key: 'completeness', label: t('Completeness'), render: (team) => <span className="adm-aivex-table-progress"><Progress value={team.completeness} label={t('Completeness')}/><small className={team.signed ? 'is-present' : 'is-missing'}><FileCheck2 size={12}/>{t(team.signed ? 'Signed copy received' : 'Signed copy missing')}</small></span> },
          { key: 'submitted', label: t('Submitted'), secondary: true, render: (team) => <span className="adm-aivex-date-cell"><b>{dateLabel(team.submittedAt)}</b><small>{t('Initial record')}</small></span> },
          { key: 'updated', label: t('Updated'), secondary: true, render: (team) => <span className="adm-aivex-date-cell"><b>{dateLabel(team.updatedAt)}</b><small>{t('Latest activity')}</small></span> },
        ]}/>
      </>}
    </div>
    <div className="adm-security-footnote"><LockKeyhole size={14}/><p>{t('Identity documents are visible only inside the confidential viewer. Every consultation is logged.')}</p></div>
  </div>
}

function TeamTimeline({ team, onStep, t }) {
  const generated = team.docs.find((document) => document.id === 'official')?.status === 'Generated'
  const states = [true, generated, team.signed, ['Under review', 'Corrections needed', 'Validated'].includes(team.document), team.document === 'Validated']
  return <div className="adm-team-timeline">{['Registration recorded', 'Official form ready', 'Signed document', 'Organizer review', 'File validated'].map((label, index) => <button key={label} onClick={() => onStep(index === 0 ? 'Team overview' : index < 3 ? 'Documents' : 'Verification')} className={states[index] ? 'is-complete' : ''}><i>{states[index] ? <Check size={15}/> : String(index + 1).padStart(2, '0')}</i><span>{t(label)}</span><small>{t(states[index] ? 'Completed' : 'Pending')}</small></button>)}</div>
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

function AivexReviewSummary({ team, allowed, locale, syncStatus, onTab, onDecision, onCorrections, onResolveItem, resolvingItemId }) {
  const { isArabic, t } = locale
  const review = team.reviewSummary
  const outstanding = review.blockers.length
  return <section className="adm-panel adm-review-summary">
    <SectionHeading index="05" title={t('Administrative review')} meta={outstanding === 0 ? t('Ready for decision') : isArabic ? `${outstanding} عناصر تتطلب الانتباه` : `${outstanding} item${outstanding === 1 ? '' : 's'} need attention`}/>
    <div className={`adm-review-live is-${syncStatus}`} role="status" aria-live="polite"><i/><span>{t('Live status')}</span><small>{t(syncStatus === 'syncing' ? 'Updating from the protected file…' : syncStatus === 'error' ? 'Automatic update will retry shortly.' : 'Up to date · refreshes automatically')}</small></div>
    <p className="adm-review-intro">{t('Review the file in three clear steps. Every status updates automatically after an action in another section.')}</p>
    <div className="adm-review-groups">{review.groups.map((group, index) => {
      const copy = REVIEW_GROUP_COPY[group.key]
      const managerNeedsConfirmation = group.key === 'people' && team.checklist[1] !== true
      return <article key={group.key} className={group.ready ? 'is-ready' : 'is-action'}>
        <header><span>{String(index + 1).padStart(2, '0')}</span><StatusBadge tone={group.ready ? 'success' : 'warning'}>{t(group.ready ? 'Ready' : 'Action needed')}</StatusBadge></header>
        <h3>{t(copy.title)}</h3>
        <p>{group.key === 'documents' ? (isArabic ? `${review.documents.verified} من ${review.documents.total} وثائق مطلوبة مقبولة.` : `${review.documents.verified} of ${review.documents.total} required documents accepted.`) : t(copy.copy)}</p>
        <div className="adm-review-group-progress"><i style={{ width: `${Math.round(group.complete / group.total * 100)}%` }}/><span>{group.complete}/{group.total}</span></div>
        {managerNeedsConfirmation && allowed.has('verify_activity_official') ? <button type="button" onClick={() => onDecision('Verify activities manager', 'verify_activity_official', false, { verified: true })}>{t('Confirm manager details')}<ArrowRight size={14}/></button> : <button type="button" onClick={() => onTab(group.key === 'team' ? 'Team overview' : 'Documents')}>{t(group.key === 'team' ? 'View team information' : 'Review documents')}<ArrowRight size={14}/></button>}
      </article>
    })}</div>
    <div className={`adm-review-blockers ${outstanding === 0 ? 'is-ready' : ''}`}>
      <header>{outstanding === 0 ? <CheckCircle2 size={19}/> : <TriangleAlert size={19}/>}<div><b>{t(outstanding === 0 ? 'No blocking item remains' : 'Before final acceptance')}</b><small>{t(outstanding === 0 ? 'The administrative file is ready for its final decision.' : 'Complete only the items listed below. The system updates this list automatically.')}</small></div></header>
      {outstanding > 0 && <ul>{review.blockers.map((blocker) => <li key={blocker.key}><span><i/>{t(REVIEW_BLOCKER_LABELS[blocker.key])}</span><button type="button" onClick={() => onTab(blocker.tab)}>{t('Open')}<ArrowRight size={13}/></button></li>)}</ul>}
      {outstanding > 0 && allowed.has('request_corrections') && team.canRequestCorrections && <div className="adm-review-support"><Button variant="secondary" onClick={onCorrections}>{t('Request corrections')}</Button></div>}
    </div>
    {team.correctionRequest && <div className="adm-correction-summary"><b>{t('Current correction request')}</b><small>{t('Due')} <Ltr>{team.correctionRequest.deadline}</Ltr></small><ul className="adm-correction-items-list">{team.correctionRequest.itemStatuses.map((item) => <CorrectionItemRow key={item.id} item={item} allowed={allowed} onTab={onTab} onResolveItem={onResolveItem} resolving={resolvingItemId === item.id} t={t}/>)}</ul></div>}
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
        : 'Final acceptance locked'
  const copy = isAccepted ? 'Registration is approved and the administrative file is validated.'
    : isClosed ? 'This registration is no longer in the active review workflow.'
      : ready ? 'This single action approves the registration and validates the complete team file.'
        : 'The acceptance button unlocks automatically when every required item is ready.'

  return <aside className="adm-panel adm-decision-panel">
    <SectionHeading index="06" title={t('Final team decision')}/>
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
  const closeRef = useRef(onClose)
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
  const isImage = mimeType.startsWith('image/')
  const isPdf = mimeType === 'application/pdf'
  const reviewingCorrection = file.correctionStatus === 'submitted'
  const awaitingCandidateReplacement = file.correctionStatus === 'open' && ['student', 'signed'].includes(file.category)
  const replacementDisabled = saving || loading || (!reviewingCorrection && !team.canRequestCorrections)
  return <Modal open wide onClose={saving ? () => {} : onClose} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Confidential document')} eyebrow={t('Restricted review · Access recorded')} footer={<><span className="adm-viewer-timer"><LockKeyhole size={14}/>{t('Auto-close in')} <Ltr>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Ltr></span><Button variant="secondary" onClick={onClose} disabled={saving}>{t('Close viewer')}</Button><Button variant="danger" onClick={() => reviewingCorrection ? submitReview('invalidate_document') : onNeedsCorrection(file)} disabled={replacementDisabled}>{t(reviewingCorrection ? 'Needs another attempt' : team.correctionRequest ? 'Correction cycle already active' : 'Needs replacement')}</Button><Button onClick={() => submitReview('verify_document')} disabled={saving || loading || file.status === 'Verified' || awaitingCandidateReplacement} icon={<CheckCircle2 size={16}/>}>{t(file.status === 'Verified' ? 'Document accepted' : awaitingCandidateReplacement ? 'Waiting for the team' : saving ? 'Saving…' : 'Document is correct')}</Button></>}>
    <div className="adm-viewer-heading"><div><b>{file.person}</b><p>{t(file.kind)}</p></div><AivexStatus value="Confidential" tone="sensitive" t={t}/></div>
    <AivexConfidentialNotice t={t}/>
    <div className="adm-document-review-guide"><div><span>{t('Simple document review')}</span><b>{t('Is the document readable and consistent with the team information?')}</b><p>{t('Choose one clear result. No technical note is required.')}</p></div><div><span><CheckCircle2 size={16}/>{t('Correct document')}</span><span><TriangleAlert size={16}/>{t('Replacement required')}</span></div></div>
    <div className="adm-viewer-controls"><IconButton label={t('Zoom out')} disabled={zoom <= .5} onClick={() => setZoom((value) => value - .25)}><ZoomOut size={18}/></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label={t('Zoom in')} disabled={zoom >= 2} onClick={() => setZoom((value) => value + .25)}><ZoomIn size={18}/></IconButton><IconButton label={t('Rotate document')} onClick={() => setRotation((value) => value + 90)}><RotateCw size={18}/></IconButton><span className="adm-mono">{t('SECURE SERVER VIEW')}</span></div>
    <div className="adm-viewer-canvas adm-viewer-canvas--real">{loading ? <AivexSkeleton label={t('Opening secure document')}/> : error && !objectUrl ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p></div> : <div className="adm-secure-document" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}>{isImage ? <img src={objectUrl} alt={t(file.kind)}/> : isPdf ? <iframe title={t(file.kind)} src={objectUrl}/> : <div className="adm-file-preview-unavailable"><FileText size={28}/><b>{t('Preview unavailable')}</b><p>{t('This file type can only be downloaded through the secure administration endpoint.')}</p></div>}</div>}</div>
    {error && objectUrl && <p className="adm-form-error" role="alert">{error}</p>}
    <div className="adm-viewer-log"><b>{t('Consultation log')}</b>{accesses.length ? accesses.map((entry, index) => <p key={`${entry.at}-${index}`}><span>{entry.actor}</span><small>{dateLabel(entry.at)} · {timeLabel(entry.at)}</small></p>) : <p><span>{t('No earlier consultation recorded')}</span></p>}</div>
  </Modal>
}

export function AivexDetailPage() {
  const { teamId } = useParams()
  const { addToast } = useAdmin()
  const locale = useAivexLocale()
  const { language, isArabic, dir, t, setLanguage, path } = locale
  const { loadDetail, act, loadDocument } = useAdminAivexActions()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('Team overview')
  const [viewerId, setViewerId] = useState(null)
  const [action, setAction] = useState(null)
  const [corrections, setCorrections] = useState(false)
  const [correctionDefaults, setCorrectionDefaults] = useState([])
  const [correctionError, setCorrectionError] = useState('')
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

  return <div className={`adm-page adm-aivex-page adm-team-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}>
    <Link className="adm-back-link" to={path('/admin/aivex')}><ArrowLeft size={15}/>{t('All AIVEX files')}<span>/</span>{t('Team dossier breadcrumb')}</Link>
    <PageHeader eyebrow={<><Ltr>{team.ref}</Ltr> · {t('SECOND EDITION')}</>} title={<Ltr>{team.name}</Ltr>} description={<>{team.institution} · {team.wilaya}</>} actions={<div className="adm-aivex-header-actions"><AivexLanguageSwitch language={language} setLanguage={setLanguage} t={t}/><Button onClick={() => setTab(team.document === 'Validated' ? 'History' : 'Verification')} icon={<ArrowRight size={16}/>}>{t(team.document === 'Validated' ? 'View audit trail' : 'Review this file')}</Button></div>}/>
    <div className="adm-team-meta"><AivexStatus value={team.registration} t={t}/><AivexStatus value={team.document} t={t}/><span>{t('Submitted')} {dateLabel(team.submittedAt)}</span><div><span>{t('File completeness')}</span><Progress value={team.completeness} label={t('File completeness')}/></div></div>
    <TeamTimeline team={team} onStep={setTab} t={t}/>
    <Tabs items={AIVEX_TABS} value={tab} onChange={setTab} getLabel={t} counts={{ Documents: team.docs.length, Verification: review.blockers.length === 0 ? t('Ready') : review.blockers.length }}/>
    {tab === 'Team overview' && <div className="adm-dossier-layout"><div className="adm-dossier-main">
      <section className="adm-panel adm-dossier-section"><SectionHeading index="01" title={t('Team & institution')}/><Facts missingLabel={t('Not provided')} items={[[t('Team name'), <Ltr>{team.name}</Ltr>], [t('Wilaya code & name'), team.wilaya], [t('Institution'), team.institution], [t('Institution type'), t(team.institutionType)], [t('Edition'), t(team.edition)], [t('Form version'), <code><Ltr>{team.formVersion}</Ltr></code>], [t('Submission date'), dateLabel(team.submittedAt)], [t('Reference'), <code><Ltr>{team.ref}</Ltr></code>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="02" title={t('Activities manager')}/><Facts missingLabel={t('Not provided')} items={[[t('Role'), t(team.managerRole)], [t('Full name'), <Ltr>{team.manager}</Ltr>], [t('Email'), <Ltr>{team.managerEmail}</Ltr>], [t('Phone'), <Ltr>{team.managerPhone}</Ltr>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="03" title={t('Delegation')}/><div className="adm-delegation">{[
        { id: 'delegation-leader', title: 'Delegation leader', name: team.leader, phone: team.leaderPhone, rfid: team.leaderRfid },
        { id: 'driver', title: 'Driver', name: team.driver, phone: team.driverPhone, rfid: team.driverRfid },
      ].map((person) => { const identity = team.docs.find((document) => document.id === person.id); return <div key={person.id}><h3>{t(person.title)}</h3><Facts missingLabel={t('Not provided')} items={[[t('Full name'), <Ltr>{person.name}</Ltr>], [t('Phone'), <Ltr>{person.phone}</Ltr>], ['RFID', <code><Ltr>{person.rfid}</Ltr></code>], [t('Identity card'), <AivexStatus value={identity.status} t={t}/>]]}/><button className="adm-text-action" disabled={!identity.canOpen} onClick={() => openFile(identity)}><LockKeyhole size={14}/>{t('Review document')}</button></div> })}</div></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="04" title={t('Student roster')} meta={t('Exactly 3 students')}/><div className="adm-student-roster">{team.students.map((student, index) => { const studentCard = team.docs.find((document) => document.id === `student-${index + 1}`); return <article key={student.position}><header><span>{student.position}</span><h3><Ltr>{student.name}</Ltr></h3><AivexStatus value={studentCard.status} t={t}/></header><Facts missingLabel={t('Not provided')} items={[[t('Phone'), <Ltr>{student.phone}</Ltr>], [t('Baccalaureate year'), <Ltr>{student.bac}</Ltr>], [t('RFID · 8 digits'), <code><Ltr>{student.rfid}</Ltr></code>], [t('Document review'), t(documentOutcomeLabel(studentCard.status))]]}/><button className="adm-text-action" disabled={!studentCard.canOpen} onClick={() => openFile(studentCard)}><LockKeyhole size={14}/>{t('Review student card')} <ArrowRight size={14}/></button></article> })}</div></section>
    </div><aside className="adm-dossier-aside"><div className="adm-dossier-summary"><span className="adm-eyebrow">{t('Next administrative step')}</span><h2>{t(team.document === 'Validated' ? 'Ready for the competition.' : 'Every detail counts.')}</h2><p>{t(team.document === 'Validated' ? 'The team file has completed every administrative check.' : 'Follow the three review steps before validating this team.')}</p><Progress value={team.completeness}/><Button onClick={() => setTab('Verification')} icon={<ArrowRight size={16}/>}>{t('Open verification')}</Button></div><section className="adm-panel adm-aside-docs"><h3>{t('Document centre')}</h3><p><FileText size={16}/>{isArabic ? `${team.docs.length} وثيقة مسجلة` : `${team.docs.length} documents on record`}</p><p><LockKeyhole size={16}/>{isArabic ? `${team.docs.filter((document) => ['student', 'identity'].includes(document.category)).length} وثائق هوية سرية` : `${team.docs.filter((document) => ['student', 'identity'].includes(document.category)).length} confidential identity files`}</p><button className="adm-text-action" onClick={() => setTab('Documents')}>{t('Browse documents')} <ArrowRight size={15}/></button></section><AivexConfidentialNotice t={t}/></aside></div>}
    {tab === 'Documents' && <div className="adm-documents-page"><AivexConfidentialNotice t={t}/>{[
      ['official', 'A', 'Official generated form', 'DOCX · Versioned generation'],
      ['signed', 'B', 'Signed submissions', 'PDF, JPG or PNG · Maximum 10 MB · Previous versions are preserved'],
      ['student', 'C', 'Student cards', 'Exactly three files · JPG, PNG or WEBP · Maximum 5 MB each'],
      ['identity', 'D', 'Identity documents', 'Delegation leader & driver · JPG or PNG · Maximum 5 MB each'],
    ].map(([category, index, title, meta]) => <section className="adm-panel adm-file-category" key={category}><SectionHeading index={index} title={t(title)} meta={t(meta)}/>{team.docs.filter((document) => document.category === category).map((document) => <div className="adm-file-row" key={document.id}><span className={`adm-file-icon ${category !== 'official' ? 'is-locked' : ''}`}>{category === 'official' ? <FileText size={22}/> : <LockKeyhole size={20}/>}</span><div className="adm-file-name"><b><Ltr>{document.name}</Ltr></b><small><Ltr>{document.person}</Ltr> · <Ltr>{document.type}</Ltr> · <Ltr>{document.size}</Ltr></small>{category === 'official' && <code>{t('Template')} <Ltr>{document.template}</Ltr> · {t('Revision')} <Ltr>{document.revision}</Ltr></code>}</div><div className="adm-file-time"><span>{dateLabel(document.created)}</span><small><Ltr>{timeLabel(document.created)}</Ltr></small></div>{document.version && <span className="adm-version"><Ltr>v{document.version}</Ltr> · {t(document.active ? 'Active' : 'Previous')}</span>}{category === 'official' ? <AivexStatus value={document.status} t={t}/> : <div className="adm-file-review-state"><AivexStatus value={document.status} t={t}/><small>{t(documentOutcomeLabel(document.status))}</small></div>}{category === 'official' ? document.canOpen ? <IconButton label={t('Download secure DOCX')} disabled={downloadBusy} onClick={download}><Download size={18}/></IconButton> : allowed.has('retry_generation') ? <Button variant="secondary" onClick={regenerate}>{t(document.status === 'Generation issue' ? 'Retry generation' : 'Generate form')}</Button> : null : <Button variant="secondary" disabled={!document.canOpen} onClick={() => openFile(document)} icon={<LockKeyhole size={14}/>}>{t(document.status === 'Verified' ? 'Review again' : 'Review document')}</Button>}</div>)}{!team.docs.some((document) => document.category === category) && <div className="adm-file-absent"><FolderClosed size={23}/><div><b>{t('No signed document received')}</b><p>{t('The official form still needs to be signed and stamped by the institution.')}</p></div><AivexStatus value="Absent" tone="warning" t={t}/></div>}</section>)}</div>}
    {tab === 'Verification' && <div className="adm-verification-layout"><AivexReviewSummary team={team} allowed={allowed} locale={locale} syncStatus={verificationSync} onTab={setTab} onDecision={decision} onCorrections={() => openCorrections()} onResolveItem={resolveCorrectionItem} resolvingItemId={resolvingItemId}/><AivexDecisionPanel team={team} allowed={allowed} locale={locale} onDecision={decision}/></div>}
    {tab === 'History' && <section className="adm-panel adm-dossier-section"><SectionHeading index="07" title={t('Complete file history')} meta={t('Authors, timestamps & decisions')}/><History items={team.history} translate={t} locale={isArabic ? 'ar-DZ' : 'en-GB'} emptyTitle={t('Historical data incomplete')} emptyCopy={t('No earlier actions are available for this file. New actions will appear here.')}/><div className="adm-history-note"><LockKeyhole size={15}/><p>{t('Confidential document consultations are recorded separately in the')} <Link to="/admin/activity?sensitivity=Confidential">{t('global activity log')}</Link>.</p></div></section>}
    {file && <SecureViewer key={file.id} team={team} document={file} onClose={closeViewer} onUpdated={setTeam} onNeedsCorrection={requestDocumentCorrection} locale={locale} loadDocument={loadDocument} act={act}/>}
    {action && <ActionDialog key={action.key} action={action} labels={actionDialogLabels(isArabic, t)} getOptionLabel={t} onClose={() => setAction(null)} onSubmit={submitAction}/>} 
    <Modal open={corrections} onClose={() => busy ? undefined : setCorrections(false)} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Request corrections')} eyebrow={team.ref} footer={<><Button variant="secondary" onClick={() => setCorrections(false)} disabled={busy}>{t('Cancel')}</Button><Button form="correction-form" type="submit" disabled={busy}>{t(busy ? 'Saving…' : 'Save correction request')}</Button></>}><form id="correction-form" onSubmit={saveCorrections}><fieldset className="adm-correction-items"><legend>{t('Items requiring correction')}</legend>{['Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID', 'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form'].map((item) => <label key={item}><input type="checkbox" name="items" value={item} defaultChecked={correctionDefaults.includes(item)}/>{t(item)}</label>)}</fieldset><label className="adm-form-field"><span>{t('Correction deadline')} <em>{t('Required')}</em></span><input name="deadline" type="date" required min={new Date().toISOString().slice(0, 10)} defaultValue={tomorrowDate()}/></label><p className="adm-muted">{t('The selected items and deadline are recorded directly in the protected case history.')}</p>{correctionError && <p className="adm-form-error" role="alert">{correctionError}</p>}</form></Modal>
    {generated.status === 'Generation issue' && tab !== 'Documents' && <div className="adm-inline-error"><CriticalNotice>{t('The official form could not be generated. The team data is saved.')}</CriticalNotice>{allowed.has('retry_generation') && <Button variant="secondary" onClick={regenerate}>{t('Retry generation')}</Button>}</div>}
  </div>
}
