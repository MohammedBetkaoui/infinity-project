import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileCheck2, FileText, FolderClosed, Languages, LockKeyhole, RotateCw, ShieldCheck, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { useAdmin } from './AdminStore'
import { useAivexLocale } from './AivexI18n'
import { CHECKLIST, DOCUMENT_STATUSES, REGISTRATION_STATUSES, dateLabel, filterRecords, timeLabel } from './adminModel'
import { Button, ConfidentialNotice, CriticalNotice, EmptyState, IconButton, Modal, PageHeader, Pagination, Progress, SectionHeading, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'

const AIVEX_CARD_STAGES = ['Recorded', 'Form ready', 'Signed', 'Review', 'Validated']
const AIVEX_TABS = ['Team overview', 'Documents', 'Verification', 'History']

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
  return isArabic ? { close: 'إغلاق', cancel: t('Cancel'), confirm: t('Confirm action'), eyebrow: t('Administrative action'), description: t('This decision will update the local demo record and be recorded in the activity log.'), required: t('Required'), internalReason: t('Internal reason'), reasonPlaceholder: t('Explain the decision for your colleagues…'), reasonError: t('Add an internal reason before confirming.') } : {}
}

function cardStageState(team) {
  const generated = team.docs.find((document) => document.id === 'official')?.status === 'Generated'
  return [
    true,
    generated,
    team.signed,
    ['Under review', 'Corrections needed', 'Validated'].includes(team.document),
    team.document === 'Validated',
  ]
}

function nextCheckpoint(team) {
  const checkpoints = {
    'Not generated': 'Generate the official form',
    Generating: 'Wait for form generation',
    'Awaiting signature': 'Receive the signed form',
    'Signed document received': 'Start document review',
    'Under review': 'Complete administrative checks',
    'Corrections needed': 'Follow up on requested corrections',
    Validated: 'No action required',
    'Generation issue': 'Resolve the generation issue',
    Expired: 'Review the expired file',
  }
  return checkpoints[team.document] || 'Review the administrative file'
}

function AivexCardGrid({ records, onOpen, locale }) {
  const { t, isArabic } = locale
  const [page, setPage] = useState(1)
  const [order, setOrder] = useState('attention')
  const priority = { 'Generation issue': 0, 'Corrections needed': 1, 'Signed document received': 2, 'Under review': 3, 'Awaiting signature': 4, 'Not generated': 5, Generating: 6, Expired: 7, Validated: 8 }
  const sorted = [...records].sort((a, b) => {
    if (order === 'completion') return a.completeness - b.completeness
    if (order === 'team') return a.name.localeCompare(b.name)
    return (priority[a.document] ?? 9) - (priority[b.document] ?? 9)
  })
  const pageSize = 6
  const current = Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize)))
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize)

  return <section className="adm-aivex-board" aria-label={t('AIVEX files')}>
    <header className="adm-aivex-board__head">
      <div><span>{t('Operational case board')}</span><b>{isArabic ? `${records.length} ملف فريق في هذا العرض` : `${records.length} team file${records.length !== 1 ? 's' : ''} in this view`}</b></div>
      <label><span>{t('Order by')}</span><select value={order} onChange={(event) => { setOrder(event.target.value); setPage(1) }}><option value="attention">{t('Action priority')}</option><option value="completion">{t('Lowest completion')}</option><option value="team">{t('Team name')}</option></select></label>
    </header>
    {visible.length ? <div className="adm-aivex-card-grid">{visible.map((team, index) => {
      const stages = cardStageState(team)
      const attention = ['Generation issue', 'Corrections needed', 'Expired'].includes(team.document)
      return <article key={team.id} className={`adm-aivex-card ${attention ? 'is-attention' : ''} ${team.document === 'Validated' ? 'is-validated' : ''}`}>
        <div className="adm-aivex-card__rail"><code>{team.ref}</code><span>{isArabic ? 'الطبعة 02 / ملف' : 'ED.02 / CASE'} {String((current - 1) * pageSize + index + 1).padStart(2, '0')}</span></div>
        <header className="adm-aivex-card__identity">
          <div><span>{t('Team dossier')}</span><h3><Ltr>{team.name}</Ltr></h3><p>{t(team.institution)}<small>{t(team.wilaya)}</small></p></div>
          <div className="adm-aivex-card__completion" style={{ '--adm-progress-angle': `${team.completeness * 3.6}deg` }} aria-label={`${t('File completion')}: ${team.completeness}%`}><span><strong>{team.completeness}</strong><small>%</small></span></div>
        </header>
        <div className="adm-aivex-card__statuses"><AivexStatus value={team.registration} t={t}/><AivexStatus value={team.document} t={t}/></div>
        <div className="adm-aivex-card__journey" aria-label={t('Administrative progress')}>{AIVEX_CARD_STAGES.map((label, stage) => <div key={label} className={stages[stage] ? 'is-complete' : ''}><i>{stages[stage] ? <Check size={11}/> : stage + 1}</i><span>{t(label)}</span></div>)}</div>
        <dl className="adm-aivex-card__facts">
          <div><dt>{t('Activities manager')}</dt><dd>{team.manager}</dd></div>
          <div><dt>{t('Submitted')}</dt><dd>{t(team.submitted)}</dd></div>
          <div><dt>{t('Last update')}</dt><dd>{t(team.updated)}</dd></div>
          <div><dt>{t('Signed file')}</dt><dd className={team.signed ? 'is-present' : 'is-missing'}><LockKeyhole size={12}/>{t(team.signed ? 'Secure copy received' : 'Not received')}</dd></div>
        </dl>
        <div className={`adm-aivex-card__checkpoint ${attention ? 'is-attention' : ''}`}><span>{t(attention ? 'Attention required' : team.document === 'Validated' ? 'Administrative outcome' : 'Next checkpoint')}</span><b>{t(nextCheckpoint(team))}</b></div>
        <footer><button onClick={() => onOpen(team)}><span>{t('Open administrative file')}</span><ArrowRight size={16}/></button></footer>
      </article>
    })}</div> : <EmptyState title={t('No AIVEX files match this view')} copy={t('Adjust the search or remove one of the active filters.')}/>} 
    {records.length > 0 && <Pagination current={current} count={records.length} pageSize={pageSize} onChange={setPage} labels={paginationLabels(isArabic, t)}/>} 
  </section>
}

export function AivexListPage({ globalQuery }) {
  const { state } = useAdmin()
  const navigate = useNavigate()
  const locale = useAivexLocale()
  const { language, isArabic, dir, t, setLanguage, path } = locale
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(params.get('document') ? { document: params.get('document') } : {})
  const [view, setView] = useState('cards')
  const [mobileCardsOnly, setMobileCardsOnly] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const syncView = () => setMobileCardsOnly(query.matches)
    syncView()
    query.addEventListener('change', syncView)
    return () => query.removeEventListener('change', syncView)
  }, [])
  const activeView = mobileCardsOnly ? 'cards' : view
  const teams = state.teams.map((team) => ({ ...team, complete: team.completeness === 100 ? 'Complete' : 'Incomplete', signedLabel: team.signed ? 'Present' : 'Absent' }))
  const visible = filterRecords(teams, `${search} ${globalQuery}`.trim(), filters)
  const counts = DOCUMENT_STATUSES.map((status) => ({ status, count: teams.filter((t) => t.document === status).length }))
  return <div className={`adm-page adm-aivex-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}>
    <PageHeader eyebrow={t('Competition operations · Edition 02')} title={t('AIVEX files')} description={t('Administrative tracking for every team. From registration to the final green light.')} actions={<div className="adm-aivex-header-actions"><AivexLanguageSwitch language={language} setLanguage={setLanguage} t={t}/><span className="adm-edition"><i/>{t('AIVEX / SECOND EDITION')}</span></div>}/>
    <SummaryStrip items={[{ label: t('Registered teams'), value: teams.length }, { label: t('Complete files'), value: teams.filter((team) => team.completeness === 100).length }, { label: t('Awaiting signature'), value: teams.filter((team) => team.document === 'Awaiting signature').length }, { label: t('Signed received'), value: teams.filter((team) => team.signed).length }, { label: t('Under review'), value: teams.filter((team) => team.document === 'Under review').length }, { label: t('Corrections'), value: teams.filter((team) => team.document === 'Corrections needed').length }, { label: t('Validated'), value: teams.filter((team) => team.document === 'Validated').length }]}/>
    <div className="adm-status-pipeline" aria-label={isArabic ? 'التصفية حسب مرحلة الوثيقة' : 'Filter by document stage'}><button className={!filters.document ? 'is-active' : ''} onClick={() => setFilters({ ...filters, document: '' })}><span>{t('All files')}</span><b>{teams.length}</b></button>{counts.map(({ status, count }) => <button key={status} className={filters.document === status ? 'is-active' : ''} onClick={() => setFilters({ ...filters, document: status })}><span>{t(status)}</span><b>{count}</b></button>)}</div>
    <div className="adm-work-panel"><RecordToolbar search={search} onSearch={setSearch} placeholder={t('Search reference, team, institution or person…')} filters={filters} onFilters={setFilters} resultCount={visible.length} filterLabel={t('All filters')} getOptionLabel={t} labels={isArabic ? { search: 'البحث في ملفات AIVEX', clearSearch: 'مسح البحث', all: 'الكل', recordView: 'طريقة عرض السجلات', tableView: t('Table view'), cardView: t('Card view'), liveScope: t('Live scope'), matchingRecords: (count) => `${count} سجل مطابق`, removeFilter: 'إزالة عامل تصفية', allIncluded: t('All records included'), clearAll: t('Clear all'), drawerTitle: t('Refine records'), drawerEyebrow: t('Search & filters'), reset: t('Reset filters'), showResults: (count) => `عرض ${count} نتيجة`, drawerSummary: 'سجل مطابق للمعايير الحالية. تظهر التغييرات مباشرة.', close: 'إغلاق عوامل التصفية' } : {}} quickDefinitions={[
      { key: 'document', label: t('Document stage'), shortLabel: t('Stage'), allLabel: t('All stages'), options: DOCUMENT_STATUSES },
      { key: 'registration', label: t('Registration status'), shortLabel: t('Registration'), allLabel: t('All registrations'), options: REGISTRATION_STATUSES },
      { key: 'complete', label: t('Completeness'), shortLabel: t('File state'), allLabel: t('All files'), options: ['Complete', 'Incomplete'] },
    ]} view={activeView} onView={mobileCardsOnly ? undefined : setView} definitions={[
      { key: 'registration', label: t('Registration status'), options: REGISTRATION_STATUSES }, { key: 'document', label: t('Document status'), options: DOCUMENT_STATUSES }, { key: 'wilaya', label: t('Wilaya'), options: [...new Set(teams.map((team) => team.wilaya))] }, { key: 'institution', label: t('Institution'), options: [...new Set(teams.map((team) => team.institution))] }, { key: 'complete', label: t('Completeness'), options: ['Complete', 'Incomplete'] }, { key: 'signedLabel', label: t('Signed document'), options: ['Present', 'Absent'] }, { key: 'submitted', label: t('Submission date'), options: [...new Set(teams.map((team) => team.submitted))] }, { key: 'edition', label: t('Edition'), options: ['Second edition'] },
    ]}/>{activeView === 'cards' ? <AivexCardGrid records={visible} locale={locale} onOpen={(team) => navigate(path(`/admin/aivex/${team.id}`))}/> : <>
      <div className="adm-aivex-register-head"><div><code>AIVEX / REGISTER-02</code><b>{visible.length}</b><span>{isArabic ? `${visible.length} ملف فريق في السجل الحالي` : `${visible.length} team file${visible.length !== 1 ? 's' : ''} in the current register`}</span></div><div aria-label={isArabic ? 'مؤشرات صفوف السجل' : 'Register row markers'}><span><i className="is-action"/>{t('Action required')}</span><span><i className="is-validated"/>{t('Validated')}</span></div></div>
      <RecordTable className="adm-aivex-table-view" records={visible} defaultSort="ref" locale={isArabic ? 'ar' : 'en'} labels={isArabic ? { open: 'فتح', record: 'السجل', openFile: t('Open file'), openRecord: 'فتح السجل', empty: t('No matching records'), emptyCopy: t('Adjust the search or remove one of the active filters.'), pagination: paginationLabels(true, t) } : {}} rowClassName={(team) => ['Generation issue', 'Corrections needed', 'Expired'].includes(team.document) ? 'is-aivex-attention' : team.document === 'Validated' ? 'is-aivex-validated' : ''} onOpen={(team) => navigate(path(`/admin/aivex/${team.id}`))} columns={[
        { key: 'ref', label: t('Reference'), render: (team) => <span className="adm-aivex-ref-cell"><code>{team.ref}</code><small>{isArabic ? 'الطبعة 02' : 'Edition 02'}</small></span> },
        { key: 'name', label: t('Team'), render: (team) => <span className="adm-aivex-team-cell"><b><Ltr>{team.name}</Ltr></b><small>{team.completeness === 100 ? t('Administrative file complete') : isArabic ? `${10 - team.checklist.filter(Boolean).length} عمليات تحقق متبقية` : `${10 - team.checklist.filter(Boolean).length} checks pending`}</small></span> },
        { key: 'institution', label: t('Institution'), render: (team) => <span className="adm-institution-cell"><b>{t(team.institution)}</b><small>{t(team.wilaya)}</small></span> },
        { key: 'manager', label: t('Activities manager'), secondary: true, render: (team) => <span className="adm-aivex-manager-cell"><b>{team.manager}</b><small>{t(team.managerRole)}</small></span> },
        { key: 'registration', label: t('Registration'), render: (team) => <AivexStatus value={team.registration} t={t}/> },
        { key: 'document', label: t('Document'), render: (team) => <AivexStatus value={team.document} t={t}/> },
        { key: 'completeness', label: t('Completeness'), render: (team) => <span className="adm-aivex-table-progress"><Progress value={team.completeness} label={t('Completeness')}/><small className={team.signed ? 'is-present' : 'is-missing'}><FileCheck2 size={12}/>{t(team.signed ? 'Signed copy received' : 'Signed copy missing')}</small></span> },
        { key: 'submitted', label: t('Submitted'), render: (team) => <span className="adm-aivex-date-cell"><b>{t(team.submitted)}</b><small>{t('Initial record')}</small></span> },
        { key: 'updated', label: t('Updated'), secondary: true, render: (team) => <span className="adm-aivex-date-cell"><b>{t(team.updated)}</b><small>{t('Latest activity')}</small></span> },
      ]}/>
    </>}</div>
    <div className="adm-security-footnote"><LockKeyhole size={14}/><p>{t('Identity documents are visible only inside the confidential viewer. Every consultation is logged.')}</p></div>
  </div>
}

function TeamTimeline({ team, onStep, t }) {
  const generated = team.docs.find((d) => d.id === 'official')?.status === 'Generated'
  const states = [true, generated, team.signed, ['Under review', 'Corrections needed', 'Validated'].includes(team.document), team.document === 'Validated']
  return <div className="adm-team-timeline">{['Registration recorded', 'Official form ready', 'Signed document', 'Organizer review', 'File validated'].map((label, i) => <button key={label} onClick={() => onStep(i === 0 ? 'Team overview' : i < 3 ? 'Documents' : 'Verification')} className={states[i] ? 'is-complete' : ''}><i>{states[i] ? <Check size={15}/> : String(i + 1).padStart(2, '0')}</i><span>{t(label)}</span><small>{t(states[i] ? 'Completed' : 'Pending')}</small></button>)}</div>
}

function SecureViewer({ team, document: file, onClose, locale }) {
  const { state, update, log, addToast } = useAdmin()
  const { isArabic, t } = locale
  const [remaining, setRemaining] = useState(Number(state.settings.viewerTimeout))
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => { if (remaining === 0) { closeRef.current(); addToast(isArabic ? 'تم إغلاق العارض تلقائياً' : 'Viewer closed automatically', isArabic ? 'انتهت جلسة المراجعة السرية.' : 'The confidential review session has expired.') } }, [remaining, addToast, isArabic])
  const views = state.activities.filter((a) => a.sensitivity === 'Confidential' && a.entity.includes(team.ref) && a.entity.includes(file.name))
  const verify = () => {
    if (!note.trim()) { setError(isArabic ? 'أضف ملاحظة تحقق قصيرة.' : 'Add a short verification note.'); return }
    const docs = team.docs.map((d) => d.id === file.id ? { ...d, status: 'Verified', verificationNote: note } : d)
    const checklist = [...team.checklist]
    if (file.id === 'leader') checklist[2] = true
    if (file.id === 'driver') checklist[3] = true
    if (file.category === 'signed' && file.active) checklist[9] = true
    update('teams', team.id, { docs, checklist }, 'Document marked as verified', note)
    log('Confidential document verified', `${team.ref} · ${file.name}`, 'AIVEX', 'Confidential')
    onClose()
  }
  return <Modal open wide onClose={onClose} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Confidential document')} eyebrow={t('Restricted review · Access recorded')} footer={<><span className="adm-viewer-timer"><LockKeyhole size={14}/>{t('Auto-close in')} <Ltr>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Ltr></span><Button variant="secondary" onClick={onClose}>{t('Close viewer')}</Button><Button onClick={verify} disabled={file.status === 'Verified'} icon={<CheckCircle2 size={16}/>}>{t(file.status === 'Verified' ? 'Already verified' : 'Mark as verified')}</Button></>}>
    <div className="adm-viewer-heading"><div><b>{file.person}</b><p>{t(file.kind)}</p></div><AivexStatus value="Confidential" tone="sensitive" t={t}/></div>
    <AivexConfidentialNotice t={t}/>
    <div className="adm-viewer-controls"><IconButton label={t('Zoom out')} disabled={zoom <= .5} onClick={() => setZoom((z) => z - .25)}><ZoomOut size={18}/></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label={t('Zoom in')} disabled={zoom >= 2} onClick={() => setZoom((z) => z + .25)}><ZoomIn size={18}/></IconButton><IconButton label={t('Rotate document')} onClick={() => setRotation((r) => r + 90)}><RotateCw size={18}/></IconButton><span className="adm-mono">{t('SYNTHETIC SPECIMEN')}</span></div>
    <div className="adm-viewer-canvas"><div className="adm-document-specimen" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}><div className="adm-specimen-top"><InfinityMark/><span>INFINITY CLUB<br/>AIVEX · {isArabic ? 'الطبعة 02' : 'EDITION 02'}</span><LockKeyhole size={22}/></div><span className="adm-specimen-watermark">{t('DEMO ONLY')}</span><h3>{t(file.kind)}</h3><p>{t('This is a fictional document used to demonstrate the confidential review workflow.')}</p><dl><div><dt>{t('Record')}</dt><dd>{file.person}</dd></div><div><dt>{t('Team')}</dt><dd><Ltr>{team.name}</Ltr></dd></div><div><dt>{t('Document version')}</dt><dd><Ltr>{file.version || '01'} · {file.type}</Ltr></dd></div></dl><div className="adm-specimen-lines"><i/><i/><i/></div><footer>{t('NO REAL IDENTITY DATA · NOT AN OFFICIAL DOCUMENT')}</footer></div></div>
    <label className="adm-form-field"><span>{t('Verification note')}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('Record the outcome of this review…')}/></label>{error && <p className="adm-form-error" role="alert">{error}</p>}
    <details className="adm-access-log"><summary>{t('Consultation log')} · {views.length} {isArabic ? 'عملية اطلاع' : `access event${views.length !== 1 ? 's' : ''}`}</summary>{views.map((entry) => <p key={entry.id}><b>{entry.actor}</b><span>{t(entry.action)} · {new Date(entry.at).toLocaleDateString(isArabic ? 'ar-DZ' : 'en-GB', { dateStyle: 'medium' })}, {new Date(entry.at).toLocaleTimeString(isArabic ? 'ar-DZ' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</span></p>)}</details>
  </Modal>
}

async function downloadOfficial(team) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const lines = ['INFINITY CLUB — AIVEX — DEMO SPECIMEN', 'Fictional participation form. Not valid for official use.', team.name, team.ref, team.institution, `Template AIVEX-2.4 / Revision ${team.docs[0].revision}`, 'No real identity documents are included.']
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map((line) => `<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`).join('')}<w:sectPr/></w:body></w:document>`)
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `${team.ref}-DEMO.docx`; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function AivexDetailPage() {
  const { teamId } = useParams()
  const { state, update, log, addToast } = useAdmin()
  const locale = useAivexLocale()
  const { language, isArabic, dir, t, setLanguage, path } = locale
  const team = state.teams.find((item) => item.id === teamId)
  const [tab, setTab] = useState('Team overview')
  const [viewerId, setViewerId] = useState(null)
  const [action, setAction] = useState(null)
  const [corrections, setCorrections] = useState(false)
  const [correctionError, setCorrectionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [upload, setUpload] = useState(false)
  const [uploadType, setUploadType] = useState('PDF')
  const [downloadBusy, setDownloadBusy] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!team) return <div className={`adm-page adm-aivex-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}><Link className="adm-back-link" to={path('/admin/aivex')}><ArrowLeft size={16}/>{t('All AIVEX files')}</Link><EmptyState title={t('File not found')} copy={t('This reference does not exist in the local demonstration.')}/></div>
  const file = team.docs.find((d) => d.id === viewerId)
  const generated = team.docs.find((d) => d.id === 'official')
  const canValidate = team.checklist.every(Boolean) && team.docs.filter((d) => ['student', 'identity'].includes(d.category) || d.category === 'signed' && d.active).every((d) => d.status === 'Verified') && team.registration === 'Approved'
  const openFile = (doc) => {
    if (doc.status === 'Absent') { addToast(t('File absent'), t('Request the missing file through a correction request.')); return }
    log('Confidential document opened', `${team.ref} · ${doc.name}`, 'AIVEX', 'Confidential')
    setViewerId(doc.id)
  }
  const closeViewer = () => { if (file) log('Confidential viewer closed', `${team.ref} · ${file.name}`, 'AIVEX', 'Confidential'); setViewerId(null) }
  const regenerate = () => {
    setBusy(true)
    update('teams', team.id, { document: 'Generating', docs: team.docs.map((d) => d.id === 'official' ? { ...d, status: 'Generating' } : d) }, 'Official form generation started')
    timer.current = setTimeout(() => {
      update('teams', team.id, (current) => ({ document: 'Awaiting signature', docs: current.docs.map((d) => d.id === 'official' ? { ...d, status: 'Generated', revision: d.revision + 1, created: new Date().toISOString() } : d), checklist: current.checklist.map((checked, i) => i === 7 ? true : checked) }), 'Official form generated')
      setBusy(false)
    }, 1200)
  }
  const download = async () => {
    setDownloadBusy(true)
    try { await downloadOfficial(team); log('Official demo form downloaded', team.ref, 'AIVEX'); addToast(t('Demo DOCX downloaded'), t('This specimen contains fictional team information only.')) } catch { addToast(t('Download failed'), t('Please retry generating the demo document.')) } finally { setDownloadBusy(false) }
  }
  const decision = (title, patch, danger = false) => setAction({ key: title, title: t(title), patch, danger })
  const addVersion = () => {
    const version = Math.max(0, ...team.docs.filter((d) => d.category === 'signed').map((d) => d.version)) + 1
    const docs = [...team.docs.map((d) => d.category === 'signed' ? { ...d, active: false } : d), { id: `signed-${version}`, category: 'signed', person: team.name, kind: 'Signed participation form', name: `participation-signed-v${version}.${uploadType.toLowerCase()}`, type: uploadType, size: '1.4 MB', created: new Date().toISOString(), version, active: true, status: 'Present' }]
    update('teams', team.id, { docs, document: 'Signed document received', signed: true, checklist: team.checklist.map((v, i) => i === 8 ? true : i === 9 ? false : v) }, `Signed document deposited · v${version}`)
    setUpload(false)
  }
  const saveCorrections = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const items = data.getAll('items')
    if (!items.length) { setCorrectionError(t('Choose at least one item to correct.')); return }
    update('teams', team.id, { document: 'Corrections needed', correctionRequest: { items, message: data.get('message'), deadline: data.get('deadline'), note: data.get('reason') } }, 'Corrections requested', `${items.join(', ')} — ${data.get('reason')}`)
    setCorrections(false)
  }
  return <div className={`adm-page adm-aivex-page adm-team-page ${isArabic ? 'is-arabic' : ''}`} dir={dir} lang={language}>
    <Link className="adm-back-link" to={path('/admin/aivex')}><ArrowLeft size={15}/>{t('All AIVEX files')}<span>/</span>{t('Team dossier breadcrumb')}</Link>
    <PageHeader eyebrow={<><Ltr>{team.ref}</Ltr> · {t('SECOND EDITION')}</>} title={<Ltr>{team.name}</Ltr>} description={<>{t(team.institution)} · {t(team.wilaya)}</>} actions={<div className="adm-aivex-header-actions"><AivexLanguageSwitch language={language} setLanguage={setLanguage} t={t}/><Button onClick={() => setTab(team.document === 'Validated' ? 'History' : 'Verification')} icon={<ArrowRight size={16}/>}>{t(team.document === 'Validated' ? 'View audit trail' : 'Review this file')}</Button></div>}/>
    <div className="adm-team-meta"><AivexStatus value={team.registration} t={t}/><AivexStatus value={team.document} t={t}/><span>{t('Submitted')} {t(team.submitted)}</span><div><span>{t('File completeness')}</span><Progress value={team.completeness} label={t('File completeness')}/></div></div>
    <TeamTimeline team={team} onStep={setTab} t={t}/>
    <Tabs items={AIVEX_TABS} value={tab} onChange={setTab} getLabel={t} counts={{ Documents: team.docs.length, Verification: `${team.checklist.filter(Boolean).length}/10` }}/>
    {tab === 'Team overview' && <div className="adm-dossier-layout"><div className="adm-dossier-main">
      <section className="adm-panel adm-dossier-section"><SectionHeading index="01" title={t('Team & institution')}/><Facts missingLabel={t('Not provided')} items={[[t('Team name'), <Ltr>{team.name}</Ltr>], [t('Wilaya code & name'), t(team.wilaya)], [t('Institution'), t(team.institution)], [t('Institution type'), t(team.institutionType)], [t('Edition'), t(team.edition)], [t('Form version'), <code><Ltr>{team.formVersion}</Ltr></code>], [t('Submission date'), t(team.submitted)], [t('Reference'), <code><Ltr>{team.ref}</Ltr></code>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="02" title={t('Activities manager')}/><Facts missingLabel={t('Not provided')} items={[[t('Role'), t(team.managerRole)], [t('Full name'), <Ltr>{team.manager}</Ltr>], [t('Email'), <Ltr>{team.managerEmail}</Ltr>], [t('Phone'), <Ltr>{team.managerPhone}</Ltr>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="03" title={t('Delegation')}/><div className="adm-delegation">{[
        { id: 'leader', title: 'Delegation leader', name: team.leader, phone: '+213 555 40 01 82', rfid: team.leaderRfid },
        { id: 'driver', title: 'Driver', name: team.driver, phone: '+213 555 62 08 49', rfid: team.driverRfid },
      ].map((person) => { const identity = team.docs.find((doc) => doc.id === person.id); return <div key={person.id}><h3>{t(person.title)}</h3><Facts missingLabel={t('Not provided')} items={[[t('Full name'), <Ltr>{person.name}</Ltr>], [t('Phone'), <Ltr>{person.phone}</Ltr>], ['RFID', <code><Ltr>{person.rfid}</Ltr></code>], [t('Identity card'), <AivexStatus value={identity.status} t={t}/>]]}/><button className="adm-text-action" disabled={identity.status === 'Absent'} onClick={() => openFile(identity)}><LockKeyhole size={14}/>{t('Open securely')}</button></div> })}</div></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="04" title={t('Student roster')} meta={t('Exactly 3 students')}/><div className="adm-student-roster">{team.students.map((student, i) => { const studentCard = team.docs.find((doc) => doc.id === `student-${i}`); return <article key={student.position}><header><span>{student.position}</span><h3><Ltr>{student.name}</Ltr></h3><AivexStatus value={studentCard.status} t={t}/></header><Facts missingLabel={t('Not provided')} items={[[t('Phone'), <Ltr>{student.phone}</Ltr>], [t('Baccalaureate year'), <Ltr>{student.bac}</Ltr>], [t('RFID · 8 digits'), <code><Ltr>{student.rfid}</Ltr></code>], [t('Administrative verification'), t(studentCard.status === 'Verified' ? 'Identity matched' : 'Review required')]]}/><button className="adm-text-action" onClick={() => openFile(studentCard)}><LockKeyhole size={14}/>{t('Review student card')} <ArrowRight size={14}/></button></article> })}</div></section>
    </div><aside className="adm-dossier-aside"><div className="adm-dossier-summary"><span className="adm-eyebrow">{t('Next administrative step')}</span><h2>{t(team.document === 'Validated' ? 'Ready for the competition.' : 'Every detail counts.')}</h2><p>{t(team.document === 'Validated' ? 'The team file has completed every administrative check.' : 'Verify the documents and complete the checklist before validating this team.')}</p><Progress value={team.completeness}/><Button onClick={() => setTab('Verification')} icon={<ArrowRight size={16}/>}>{t('Open verification')}</Button><InfinityMark/></div><section className="adm-panel adm-aside-docs"><h3>{t('Document centre')}</h3><p><FileText size={16}/>{isArabic ? `${team.docs.length} وثيقة مسجلة` : `${team.docs.length} documents on record`}</p><p><LockKeyhole size={16}/>{isArabic ? `${team.docs.filter((doc) => ['student', 'identity'].includes(doc.category)).length} وثائق هوية سرية` : `${team.docs.filter((doc) => ['student', 'identity'].includes(doc.category)).length} confidential identity files`}</p><button className="adm-text-action" onClick={() => setTab('Documents')}>{t('Browse documents')} <ArrowRight size={15}/></button></section><AivexConfidentialNotice t={t}/></aside></div>}
    {tab === 'Documents' && <div className="adm-documents-page"><AivexConfidentialNotice t={t}/>{[
      ['official', 'A', 'Official generated form', 'DOCX · Template AIVEX-2.4 · Versioned generation'],
      ['signed', 'B', 'Signed submissions', 'PDF, JPG or PNG · Maximum 10 MB · Previous versions are preserved'],
      ['student', 'C', 'Student cards', 'Exactly three files · JPG, PNG or WEBP · Maximum 5 MB each'],
      ['identity', 'D', 'Identity documents', 'Delegation leader & driver · JPG or PNG · Maximum 5 MB each'],
    ].map(([category, index, title, meta]) => <section className="adm-panel adm-file-category" key={category}><SectionHeading index={index} title={t(title)} meta={t(meta)} action={category === 'signed' ? <Button variant="secondary" onClick={() => setUpload(true)} icon={<Upload size={15}/>}>{t('Add demo version')}</Button> : null}/>{team.docs.filter((doc) => doc.category === category).map((doc) => <div className="adm-file-row" key={doc.id}><span className={`adm-file-icon ${category !== 'official' ? 'is-locked' : ''}`}>{category === 'official' ? <FileText size={22}/> : <LockKeyhole size={20}/>}</span><div className="adm-file-name"><b><Ltr>{doc.name}</Ltr></b><small><Ltr>{doc.person}</Ltr> · <Ltr>{doc.type}</Ltr> · <Ltr>{doc.size}</Ltr></small>{category === 'official' && <code>{t('Template')} <Ltr>{doc.template}</Ltr> · {t('Revision')} <Ltr>{doc.revision}</Ltr></code>}</div><div className="adm-file-time"><span>{t(dateLabel(doc.created))}</span><small><Ltr>{timeLabel(doc.created)}</Ltr></small></div>{doc.version && <span className="adm-version"><Ltr>v{doc.version}</Ltr> · {t(doc.active ? 'Active' : 'Previous')}</span>}<AivexStatus value={doc.status} t={t}/>{category === 'official' ? doc.status === 'Generated' ? <IconButton label={t('Download secure demo DOCX')} disabled={downloadBusy} onClick={download}><Download size={18}/></IconButton> : <Button variant="secondary" onClick={regenerate} disabled={busy}>{t(busy ? 'Generating…' : doc.status === 'Generation issue' ? 'Retry generation' : 'Generate form')}</Button> : <Button variant="secondary" disabled={doc.status === 'Absent'} onClick={() => openFile(doc)} icon={<LockKeyhole size={14}/>}>{t('Open securely')}</Button>}</div>)}{!team.docs.some((doc) => doc.category === category) && <div className="adm-file-absent"><FolderClosed size={23}/><div><b>{t('No signed document received')}</b><p>{t('The official form still needs to be signed and stamped by the institution.')}</p></div><AivexStatus value="Absent" tone="warning" t={t}/></div>}</section>)}</div>}
    {tab === 'Verification' && <div className="adm-verification-layout"><section className="adm-panel"><SectionHeading index="05" title={t('Administrative checklist')} meta={isArabic ? `${team.checklist.filter(Boolean).length} من 10 مكتملة` : `${team.checklist.filter(Boolean).length} of 10 complete`}/><div className="adm-checklist">{CHECKLIST.map((label, i) => <label key={label}><input type="checkbox" checked={team.checklist[i]} disabled={team.document === 'Validated'} onChange={() => update('teams', team.id, { checklist: team.checklist.map((value, index) => index === i ? !value : value) }, `${team.checklist[i] ? 'Unchecked' : 'Checked'}: ${label}`)}/><span><b>{t(label)}</b><small>{t(i === 9 ? 'Review the active signed document in the secure viewer' : i === 4 ? 'Three roster entries, each with a valid eight-digit RFID' : 'Administrative confirmation required')}</small></span><code>{String(i + 1).padStart(2, '0')}</code></label>)}</div></section><aside className="adm-panel adm-decision-panel"><SectionHeading index="06" title={t('File decision')}/><Progress value={team.completeness}/><p>{t('Each decision requires an internal reason and is recorded in the file history.')}</p><Button variant="secondary" onClick={() => decision('Move file to review', { registration: 'Under review', document: 'Under review' })}>{t('Move to review')}</Button><Button variant="secondary" disabled={team.registration === 'Approved'} onClick={() => decision('Approve registration', { registration: 'Approved' })}>{t('Approve registration')}</Button><Button variant="secondary" onClick={() => { setCorrectionError(''); setCorrections(true) }}>{t('Request corrections')}</Button><Button disabled={!canValidate || team.document === 'Validated'} onClick={() => decision('Validate AIVEX file', { document: 'Validated', registration: 'Approved' })} icon={<ShieldCheck size={17}/>}>{t(team.document === 'Validated' ? 'File validated' : 'Validate file')}</Button>{!canValidate && <p className="adm-validation-help"><LockKeyhole size={15}/>{t('Complete all checks, approve registration and verify every identity file plus the active signed document to unlock validation.')}</p>}<div className="adm-danger-actions"><button onClick={() => decision('Reject registration', { registration: 'Rejected' }, true)}>{t('Reject registration')}</button><button onClick={() => decision('Cancel registration', { registration: 'Cancelled' }, true)}>{t('Cancel registration')}</button></div>{team.correctionRequest && <div className="adm-correction-summary"><b>{t('Current correction request')}</b><p>{team.correctionRequest.message}</p><small>{t('Due')} <Ltr>{team.correctionRequest.deadline}</Ltr></small><ul>{team.correctionRequest.items.map((item) => <li key={item}>{t(item)}</li>)}</ul></div>}</aside></div>}
    {tab === 'History' && <section className="adm-panel adm-dossier-section"><SectionHeading index="07" title={t('Complete file history')} meta={t('Authors, timestamps & decisions')}/><History items={team.history} translate={t} locale={isArabic ? 'ar-DZ' : 'en-GB'} emptyTitle={t('Historical data incomplete')} emptyCopy={t('No earlier actions were imported for this demonstration record. New actions will appear here.')}/><div className="adm-history-note"><LockKeyhole size={15}/><p>{t('Confidential document consultations are recorded separately in the')} <Link to="/admin/activity?sensitivity=Confidential">{t('global activity log')}</Link>.</p></div></section>}
    {file && <SecureViewer key={file.id} team={team} document={file} onClose={closeViewer} locale={locale}/>} 
    {action && <ActionDialog action={action} labels={actionDialogLabels(isArabic, t)} getOptionLabel={t} onClose={() => setAction(null)} onSubmit={(values) => { if (action.patch.document === 'Validated' && !canValidate) return t('The file still contains unverified information.'); update('teams', team.id, action.patch, action.key, values.reason) }}/>} 
    <Modal open={upload} onClose={() => setUpload(false)} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Add a signed document version')} eyebrow={t('Fictional upload simulation')} footer={<><Button variant="secondary" onClick={() => setUpload(false)}>{t('Cancel')}</Button><Button onClick={addVersion} icon={<Upload size={16}/>}>{t('Add demo version')}</Button></>}><div className="adm-upload-zone"><Upload size={28}/><b>{t('A sample file is ready')}</b><p>{t('No real document is requested. A 1.4 MB specimen will be added as the next immutable version.')}</p></div><label className="adm-form-field"><span>{t('Sample file format')}</span><select value={uploadType} onChange={(event) => setUploadType(event.target.value)}><option>PDF</option><option>JPG</option><option>PNG</option></select></label><p className="adm-muted">{t('Accepted: PDF, JPG, PNG · maximum 10 MB. Existing versions remain in the file history.')}</p></Modal>
    <Modal open={corrections} onClose={() => setCorrections(false)} closeLabel={isArabic ? 'إغلاق' : 'Close'} title={t('Request corrections')} eyebrow={team.ref} footer={<><Button variant="secondary" onClick={() => setCorrections(false)}>{t('Cancel')}</Button><Button form="correction-form" type="submit">{t('Save correction request')}</Button></>}><form id="correction-form" onSubmit={saveCorrections}><fieldset className="adm-correction-items"><legend>{t('Items requiring correction')}</legend>{['Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID', 'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form'].map((item) => <label key={item}><input type="checkbox" name="items" value={item}/>{t(item)}</label>)}</fieldset><label className="adm-form-field"><span>{t('Message for the team')} <em>{t('Required')}</em></span><textarea name="message" required placeholder={t('Explain clearly what the team needs to correct…')}/></label><label className="adm-form-field"><span>{t('Internal reason')} <em>{t('Required')}</em></span><textarea name="reason" required/></label><label className="adm-form-field"><span>{t('Correction deadline')} <em>{t('Required')}</em></span><input name="deadline" type="date" required min={new Date().toISOString().slice(0, 10)}/></label><p className="adm-muted">{t('Prototype: the request is stored locally. No message is sent.')}</p>{correctionError && <p className="adm-form-error" role="alert">{correctionError}</p>}</form></Modal>
    {generated.status === 'Generation issue' && tab !== 'Documents' && <div className="adm-inline-error"><CriticalNotice>{t('The official form could not be generated. The team data is saved.')}</CriticalNotice><Button variant="secondary" disabled={busy} onClick={regenerate}>{t('Retry generation')}</Button></div>}
  </div>
}
