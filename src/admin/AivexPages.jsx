import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileCheck2, FileText, FolderClosed, LockKeyhole, RotateCw, ShieldCheck, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { useAdmin } from './AdminStore'
import { CHECKLIST, DOCUMENT_STATUSES, REGISTRATION_STATUSES, dateLabel, filterRecords, timeLabel } from './adminModel'
import { Button, ConfidentialNotice, CriticalNotice, EmptyState, IconButton, Modal, PageHeader, Progress, SectionHeading, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'

export function AivexListPage({ globalQuery }) {
  const { state } = useAdmin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(params.get('document') ? { document: params.get('document') } : {})
  const [view, setView] = useState('table')
  const teams = state.teams.map((team) => ({ ...team, complete: team.completeness === 100 ? 'Complete' : 'Incomplete', signedLabel: team.signed ? 'Present' : 'Absent' }))
  const visible = filterRecords(teams, `${search} ${globalQuery}`.trim(), filters)
  const counts = DOCUMENT_STATUSES.map((status) => ({ status, count: teams.filter((t) => t.document === status).length }))
  return <div className="adm-page adm-aivex-page">
    <PageHeader eyebrow="Competition operations · Edition 02" title="AIVEX files" description="Administrative tracking for every team. From registration to the final green light." actions={<span className="adm-edition"><i/>AIVEX / SECOND EDITION</span>}/>
    <SummaryStrip items={[{ label: 'Registered teams', value: teams.length }, { label: 'Complete files', value: teams.filter((t) => t.completeness === 100).length }, { label: 'Awaiting signature', value: teams.filter((t) => t.document === 'Awaiting signature').length }, { label: 'Signed received', value: teams.filter((t) => t.signed).length }, { label: 'Under review', value: teams.filter((t) => t.document === 'Under review').length }, { label: 'Corrections', value: teams.filter((t) => t.document === 'Corrections needed').length }, { label: 'Validated', value: teams.filter((t) => t.document === 'Validated').length }]}/>
    <div className="adm-status-pipeline" aria-label="Filter by document stage"><button className={!filters.document ? 'is-active' : ''} onClick={() => setFilters({ ...filters, document: '' })}><span>All files</span><b>{teams.length}</b></button>{counts.map(({ status, count }) => <button key={status} className={filters.document === status ? 'is-active' : ''} onClick={() => setFilters({ ...filters, document: status })}><span>{status}</span><b>{count}</b></button>)}</div>
    <div className="adm-work-panel"><RecordToolbar search={search} onSearch={setSearch} placeholder="Search reference, team, institution or person…" filters={filters} onFilters={setFilters} view={view} onView={setView} definitions={[
      { key: 'registration', label: 'Registration status', options: REGISTRATION_STATUSES }, { key: 'document', label: 'Document status', options: DOCUMENT_STATUSES }, { key: 'wilaya', label: 'Wilaya', options: [...new Set(teams.map((t) => t.wilaya))] }, { key: 'institution', label: 'Institution', options: [...new Set(teams.map((t) => t.institution))] }, { key: 'complete', label: 'Completeness', options: ['Complete', 'Incomplete'] }, { key: 'signedLabel', label: 'Signed document', options: ['Present', 'Absent'] }, { key: 'submitted', label: 'Submission date', options: [...new Set(teams.map((t) => t.submitted))] }, { key: 'edition', label: 'Edition', options: ['Second edition'] },
    ]}/><RecordTable records={visible} cards={view === 'cards'} onOpen={(team) => navigate(`/admin/aivex/${team.id}`)} columns={[
      { key: 'name', label: 'Team / reference', render: (t) => <span className="adm-team-cell"><b>{t.name}</b><code>{t.ref}</code></span> },
      { key: 'institution', label: 'Institution', render: (t) => <span className="adm-institution-cell">{t.institution}<small>{t.wilaya}</small></span> },
      { key: 'manager', label: 'Activities manager', secondary: true },
      { key: 'registration', label: 'Registration', render: (t) => <StatusBadge>{t.registration}</StatusBadge> },
      { key: 'document', label: 'Document', render: (t) => <StatusBadge>{t.document}</StatusBadge> },
      { key: 'completeness', label: 'Complete', render: (t) => <Progress value={t.completeness}/> },
      { key: 'submitted', label: 'Submitted', secondary: true }, { key: 'updated', label: 'Updated', secondary: true },
    ]}/></div>
    <div className="adm-security-footnote"><LockKeyhole size={14}/><p>Identity documents are visible only inside the confidential viewer. Every consultation is logged.</p></div>
  </div>
}

function TeamTimeline({ team, onStep }) {
  const generated = team.docs.find((d) => d.id === 'official')?.status === 'Generated'
  const states = [true, generated, team.signed, ['Under review', 'Corrections needed', 'Validated'].includes(team.document), team.document === 'Validated']
  return <div className="adm-team-timeline">{['Registration recorded', 'Official form ready', 'Signed document', 'Organizer review', 'File validated'].map((label, i) => <button key={label} onClick={() => onStep(i === 0 ? 'Team overview' : i < 3 ? 'Documents' : 'Verification')} className={states[i] ? 'is-complete' : ''}><i>{states[i] ? <Check size={15}/> : String(i + 1).padStart(2, '0')}</i><span>{label}</span><small>{states[i] ? 'Completed' : 'Pending'}</small></button>)}</div>
}

function SecureViewer({ team, document: file, onClose }) {
  const { state, update, log, addToast } = useAdmin()
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
  useEffect(() => { if (remaining === 0) { closeRef.current(); addToast('Viewer closed automatically', 'The confidential review session has expired.') } }, [remaining, addToast])
  const views = state.activities.filter((a) => a.sensitivity === 'Confidential' && a.entity.includes(team.ref) && a.entity.includes(file.name))
  const verify = () => {
    if (!note.trim()) { setError('Add a short verification note.'); return }
    const docs = team.docs.map((d) => d.id === file.id ? { ...d, status: 'Verified', verificationNote: note } : d)
    const checklist = [...team.checklist]
    if (file.id === 'leader') checklist[2] = true
    if (file.id === 'driver') checklist[3] = true
    if (file.category === 'signed' && file.active) checklist[9] = true
    update('teams', team.id, { docs, checklist }, 'Document marked as verified', note)
    log('Confidential document verified', `${team.ref} · ${file.name}`, 'AIVEX', 'Confidential')
    onClose()
  }
  return <Modal open wide onClose={onClose} title="Confidential document" eyebrow="Restricted review · Access recorded" footer={<><span className="adm-viewer-timer"><LockKeyhole size={14}/>Auto-close in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span><Button variant="secondary" onClick={onClose}>Close viewer</Button><Button onClick={verify} disabled={file.status === 'Verified'} icon={<CheckCircle2 size={16}/>}>{file.status === 'Verified' ? 'Already verified' : 'Mark as verified'}</Button></>}>
    <div className="adm-viewer-heading"><div><b>{file.person}</b><p>{file.kind}</p></div><StatusBadge tone="sensitive">Confidential</StatusBadge></div>
    <ConfidentialNotice/>
    <div className="adm-viewer-controls"><IconButton label="Zoom out" disabled={zoom <= .5} onClick={() => setZoom((z) => z - .25)}><ZoomOut size={18}/></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((z) => z + .25)}><ZoomIn size={18}/></IconButton><IconButton label="Rotate document" onClick={() => setRotation((r) => r + 90)}><RotateCw size={18}/></IconButton><span className="adm-mono">SYNTHETIC SPECIMEN</span></div>
    <div className="adm-viewer-canvas"><div className="adm-document-specimen" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}><div className="adm-specimen-top"><InfinityMark/><span>INFINITY CLUB<br/>AIVEX · EDITION 02</span><LockKeyhole size={22}/></div><span className="adm-specimen-watermark">DEMO ONLY</span><h3>{file.kind}</h3><p>This is a fictional document used to demonstrate the confidential review workflow.</p><dl><div><dt>Record</dt><dd>{file.person}</dd></div><div><dt>Team</dt><dd>{team.name}</dd></div><div><dt>Document version</dt><dd>{file.version || '01'} · {file.type}</dd></div></dl><div className="adm-specimen-lines"><i/><i/><i/></div><footer>NO REAL IDENTITY DATA · NOT AN OFFICIAL DOCUMENT</footer></div></div>
    <label className="adm-form-field"><span>Verification note</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record the outcome of this review…"/></label>{error && <p className="adm-form-error" role="alert">{error}</p>}
    <details className="adm-access-log"><summary>Consultation log · {views.length} access event{views.length !== 1 ? 's' : ''}</summary>{views.map((entry) => <p key={entry.id}><b>{entry.actor}</b><span>{entry.action} · {dateLabel(entry.at)}, {timeLabel(entry.at)}</span></p>)}</details>
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
  if (!team) return <div className="adm-page"><Link className="adm-back-link" to="/admin/aivex"><ArrowLeft size={16}/>All AIVEX files</Link><EmptyState title="File not found" copy="This reference does not exist in the local demonstration."/></div>
  const file = team.docs.find((d) => d.id === viewerId)
  const generated = team.docs.find((d) => d.id === 'official')
  const canValidate = team.checklist.every(Boolean) && team.docs.filter((d) => ['student', 'identity'].includes(d.category) || d.category === 'signed' && d.active).every((d) => d.status === 'Verified') && team.registration === 'Approved'
  const openFile = (doc) => {
    if (doc.status === 'Absent') { addToast('File absent', 'Request the missing file through a correction request.'); return }
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
    try { await downloadOfficial(team); log('Official demo form downloaded', team.ref, 'AIVEX'); addToast('Demo DOCX downloaded', 'This specimen contains fictional team information only.') } catch { addToast('Download failed', 'Please retry generating the demo document.') } finally { setDownloadBusy(false) }
  }
  const decision = (title, patch, danger = false) => setAction({ title, patch, danger })
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
    if (!items.length) { setCorrectionError('Choose at least one item to correct.'); return }
    update('teams', team.id, { document: 'Corrections needed', correctionRequest: { items, message: data.get('message'), deadline: data.get('deadline'), note: data.get('reason') } }, 'Corrections requested', `${items.join(', ')} — ${data.get('reason')}`)
    setCorrections(false)
  }
  return <div className="adm-page adm-aivex-page adm-team-page">
    <Link className="adm-back-link" to="/admin/aivex"><ArrowLeft size={15}/>All AIVEX files<span>/</span>Team dossier</Link>
    <PageHeader eyebrow={`${team.ref} · SECOND EDITION`} title={team.name} description={`${team.institution} · ${team.wilaya}`} actions={<Button onClick={() => setTab(team.document === 'Validated' ? 'History' : 'Verification')} icon={<ArrowRight size={16}/>}>{team.document === 'Validated' ? 'View audit trail' : 'Review this file'}</Button>}/>
    <div className="adm-team-meta"><StatusBadge>{team.registration}</StatusBadge><StatusBadge>{team.document}</StatusBadge><span>Submitted {team.submitted}</span><div><span>File completeness</span><Progress value={team.completeness}/></div></div>
    <TeamTimeline team={team} onStep={setTab}/>
    <Tabs items={['Team overview', 'Documents', 'Verification', 'History']} value={tab} onChange={setTab} counts={{ Documents: team.docs.length, Verification: `${team.checklist.filter(Boolean).length}/10` }}/>
    {tab === 'Team overview' && <div className="adm-dossier-layout"><div className="adm-dossier-main">
      <section className="adm-panel adm-dossier-section"><SectionHeading index="01" title="Team & institution"/><Facts items={[["Team name", team.name], ['Wilaya code & name', team.wilaya], ['Institution', team.institution], ['Institution type', team.institutionType], ['Edition', team.edition], ['Form version', <code>{team.formVersion}</code>], ['Submission date', team.submitted], ['Reference', <code>{team.ref}</code>]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="02" title="Activities manager"/><Facts items={[["Role", team.managerRole], ['Full name', team.manager], ['Email', team.managerEmail], ['Phone', team.managerPhone]]}/></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="03" title="Delegation"/><div className="adm-delegation"><div><h3>Delegation leader</h3><Facts items={[["Full name", team.leader], ['Phone', '+213 555 40 01 82'], ['RFID', <code>{team.leaderRfid}</code>], ['Identity card', <StatusBadge>{team.docs.find((d) => d.id === 'leader').status}</StatusBadge>]]}/><button className="adm-text-action" onClick={() => openFile(team.docs.find((d) => d.id === 'leader'))}><LockKeyhole size={14}/>Open securely</button></div><div><h3>Driver</h3><Facts items={[["Full name", team.driver], ['Phone', '+213 555 62 08 49'], ['RFID', <code>{team.driverRfid}</code>], ['Identity card', <StatusBadge>{team.docs.find((d) => d.id === 'driver').status}</StatusBadge>]]}/><button className="adm-text-action" disabled={team.docs.find((d) => d.id === 'driver').status === 'Absent'} onClick={() => openFile(team.docs.find((d) => d.id === 'driver'))}><LockKeyhole size={14}/>Open securely</button></div></div></section>
      <section className="adm-panel adm-dossier-section"><SectionHeading index="04" title="Student roster" meta="Exactly 3 students"/><div className="adm-student-roster">{team.students.map((student, i) => <article key={student.position}><header><span>{student.position}</span><h3>{student.name}</h3><StatusBadge>{team.docs.find((d) => d.id === `student-${i}`).status}</StatusBadge></header><Facts items={[["Phone", student.phone], ['Baccalaureate year', student.bac], ['RFID · 8 digits', <code>{student.rfid}</code>], ['Administrative verification', team.docs.find((d) => d.id === `student-${i}`).status === 'Verified' ? 'Identity matched' : 'Review required']]}/><button className="adm-text-action" onClick={() => openFile(team.docs.find((d) => d.id === `student-${i}`))}><LockKeyhole size={14}/>Review student card <ArrowRight size={14}/></button></article>)}</div></section>
    </div><aside className="adm-dossier-aside"><div className="adm-dossier-summary"><span className="adm-eyebrow">Next administrative step</span><h2>{team.document === 'Validated' ? 'Ready for the competition.' : 'Every detail counts.'}</h2><p>{team.document === 'Validated' ? 'The team file has completed every administrative check.' : 'Verify the documents and complete the checklist before validating this team.'}</p><Progress value={team.completeness}/><Button onClick={() => setTab('Verification')} icon={<ArrowRight size={16}/>}>Open verification</Button><InfinityMark/></div><section className="adm-panel adm-aside-docs"><h3>Document centre</h3><p><FileText size={16}/>{team.docs.length} documents on record</p><p><LockKeyhole size={16}/>5 confidential identity files</p><button className="adm-text-action" onClick={() => setTab('Documents')}>Browse documents <ArrowRight size={15}/></button></section><ConfidentialNotice/></aside></div>}
    {tab === 'Documents' && <div className="adm-documents-page"><ConfidentialNotice/>{[
      ['official', 'A', 'Official generated form', 'DOCX · Template AIVEX-2.4 · Versioned generation'],
      ['signed', 'B', 'Signed submissions', 'PDF, JPG or PNG · Maximum 10 MB · Previous versions are preserved'],
      ['student', 'C', 'Student cards', 'Exactly three files · JPG, PNG or WEBP · Maximum 5 MB each'],
      ['identity', 'D', 'Identity documents', 'Delegation leader & driver · JPG or PNG · Maximum 5 MB each'],
    ].map(([category, index, title, meta]) => <section className="adm-panel adm-file-category" key={category}><SectionHeading index={index} title={title} meta={meta} action={category === 'signed' ? <Button variant="secondary" onClick={() => setUpload(true)} icon={<Upload size={15}/>}>Add demo version</Button> : null}/>{team.docs.filter((d) => d.category === category).map((doc) => <div className="adm-file-row" key={doc.id}><span className={`adm-file-icon ${category !== 'official' ? 'is-locked' : ''}`}>{category === 'official' ? <FileText size={22}/> : <LockKeyhole size={20}/>}</span><div className="adm-file-name"><b>{doc.name}</b><small>{doc.person} · {doc.type} · {doc.size}</small>{category === 'official' && <code>Template {doc.template} · Revision {doc.revision}</code>}</div><div className="adm-file-time"><span>{dateLabel(doc.created)}</span><small>{timeLabel(doc.created)}</small></div>{doc.version && <span className="adm-version">v{doc.version}{doc.active ? ' · Active' : ' · Previous'}</span>}<StatusBadge>{doc.status}</StatusBadge>{category === 'official' ? doc.status === 'Generated' ? <IconButton label="Download secure demo DOCX" disabled={downloadBusy} onClick={download}><Download size={18}/></IconButton> : <Button variant="secondary" onClick={regenerate} disabled={busy}>{busy ? 'Generating…' : doc.status === 'Generation issue' ? 'Retry generation' : 'Generate form'}</Button> : <Button variant="secondary" disabled={doc.status === 'Absent'} onClick={() => openFile(doc)} icon={<LockKeyhole size={14}/>}>Open securely</Button>}</div>)}{!team.docs.some((d) => d.category === category) && <div className="adm-file-absent"><FolderClosed size={23}/><div><b>No signed document received</b><p>The official form still needs to be signed and stamped by the institution.</p></div><StatusBadge tone="warning">Absent</StatusBadge></div>}</section>)}</div>}
    {tab === 'Verification' && <div className="adm-verification-layout"><section className="adm-panel"><SectionHeading index="05" title="Administrative checklist" meta={`${team.checklist.filter(Boolean).length} of 10 complete`}/><div className="adm-checklist">{CHECKLIST.map((label, i) => <label key={label}><input type="checkbox" checked={team.checklist[i]} disabled={team.document === 'Validated'} onChange={() => update('teams', team.id, { checklist: team.checklist.map((v, idx) => idx === i ? !v : v) }, `${team.checklist[i] ? 'Unchecked' : 'Checked'}: ${label}`)}/><span><b>{label}</b><small>{i === 9 ? 'Review the active signed document in the secure viewer' : i === 4 ? 'Three roster entries, each with a valid eight-digit RFID' : 'Administrative confirmation required'}</small></span><code>{String(i + 1).padStart(2, '0')}</code></label>)}</div></section><aside className="adm-panel adm-decision-panel"><SectionHeading index="06" title="File decision"/><Progress value={team.completeness}/><p>Each decision requires an internal reason and is recorded in the file history.</p><Button variant="secondary" onClick={() => decision('Move file to review', { registration: 'Under review', document: 'Under review' })}>Move to review</Button><Button variant="secondary" disabled={team.registration === 'Approved'} onClick={() => decision('Approve registration', { registration: 'Approved' })}>Approve registration</Button><Button variant="secondary" onClick={() => { setCorrectionError(''); setCorrections(true) }}>Request corrections</Button><Button disabled={!canValidate || team.document === 'Validated'} onClick={() => decision('Validate AIVEX file', { document: 'Validated', registration: 'Approved' })} icon={<ShieldCheck size={17}/>}>{team.document === 'Validated' ? 'File validated' : 'Validate file'}</Button>{!canValidate && <p className="adm-validation-help"><LockKeyhole size={15}/>Complete all checks, approve registration and verify every identity file plus the active signed document to unlock validation.</p>}<div className="adm-danger-actions"><button onClick={() => decision('Reject registration', { registration: 'Rejected' }, true)}>Reject registration</button><button onClick={() => decision('Cancel registration', { registration: 'Cancelled' }, true)}>Cancel registration</button></div>{team.correctionRequest && <div className="adm-correction-summary"><b>Current correction request</b><p>{team.correctionRequest.message}</p><small>Due {team.correctionRequest.deadline}</small><ul>{team.correctionRequest.items.map((item) => <li key={item}>{item}</li>)}</ul></div>}</aside></div>}
    {tab === 'History' && <section className="adm-panel adm-dossier-section"><SectionHeading index="07" title="Complete file history" meta="Authors, timestamps & decisions"/><History items={team.history}/><div className="adm-history-note"><LockKeyhole size={15}/><p>Confidential document consultations are recorded separately in the <Link to="/admin/activity?sensitivity=Confidential">global activity log</Link>.</p></div></section>}
    {file && <SecureViewer key={file.id} team={team} document={file} onClose={closeViewer}/>}
    {action && <ActionDialog action={action} onClose={() => setAction(null)} onSubmit={(values) => { if (action.patch.document === 'Validated' && !canValidate) return 'The file still contains unverified information.'; update('teams', team.id, action.patch, action.title, values.reason) }}/>} 
    <Modal open={upload} onClose={() => setUpload(false)} title="Add a signed document version" eyebrow="Fictional upload simulation" footer={<><Button variant="secondary" onClick={() => setUpload(false)}>Cancel</Button><Button onClick={addVersion} icon={<Upload size={16}/>}>Add demo version</Button></>}><div className="adm-upload-zone"><Upload size={28}/><b>A sample file is ready</b><p>No real document is requested. A 1.4 MB specimen will be added as the next immutable version.</p></div><label className="adm-form-field"><span>Sample file format</span><select value={uploadType} onChange={(e) => setUploadType(e.target.value)}><option>PDF</option><option>JPG</option><option>PNG</option></select></label><p className="adm-muted">Accepted: PDF, JPG, PNG · maximum 10 MB. Existing versions remain in the file history.</p></Modal>
    <Modal open={corrections} onClose={() => setCorrections(false)} title="Request corrections" eyebrow={team.ref} footer={<><Button variant="secondary" onClick={() => setCorrections(false)}>Cancel</Button><Button form="correction-form" type="submit">Save correction request</Button></>}><form id="correction-form" onSubmit={saveCorrections}><fieldset className="adm-correction-items"><legend>Items requiring correction</legend>{['Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID', 'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form'].map((item) => <label key={item}><input type="checkbox" name="items" value={item}/>{item}</label>)}</fieldset><label className="adm-form-field"><span>Message for the team <em>Required</em></span><textarea name="message" required placeholder="Explain clearly what the team needs to correct…"/></label><label className="adm-form-field"><span>Internal reason <em>Required</em></span><textarea name="reason" required/></label><label className="adm-form-field"><span>Correction deadline <em>Required</em></span><input name="deadline" type="date" required min={new Date().toISOString().slice(0, 10)}/></label><p className="adm-muted">Prototype: the request is stored locally. No message is sent.</p>{correctionError && <p className="adm-form-error" role="alert">{correctionError}</p>}</form></Modal>
    {generated.status === 'Generation issue' && tab !== 'Documents' && <div className="adm-inline-error"><CriticalNotice>The official form could not be generated. The team data is saved.</CriticalNotice><Button variant="secondary" disabled={busy} onClick={regenerate}>Retry generation</Button></div>}
  </div>
}
