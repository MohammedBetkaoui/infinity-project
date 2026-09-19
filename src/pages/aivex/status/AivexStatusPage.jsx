import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../../components/InfinityClubMark'
import { UPLOAD_ELIGIBLE_DOCUMENT_STATUSES } from '../../../../shared/aivex/signed-document-policy.js'
import AivexLogoMark from '../AivexLogoMark'
import { REGISTER_LANGS, REGISTER_LANG_STORAGE_KEY, getStatusStrings } from './statusI18n'
import useAivexStatus from './useAivexStatus'
import '../../../components/forms/application-form.css'
import '../register/aivex-register.css'
import './aivex-status.css'

const readLang = () => {
  try {
    const saved = window.localStorage.getItem(REGISTER_LANG_STORAGE_KEY)
    if (saved === 'fr' || saved === 'ar' || saved === 'en') return saved
  } catch {
    // Private browsing: keep default.
  }
  return 'en'
}

// Simple states with a title + body only (LOADING, INVALID, EXPIRED,
// REVOKED, REGISTRATION NOT FOUND, UNKNOWN SERVER ERROR).
function MessageCard({ title, text }) {
  return (
    <div className="axs-card" role="status">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

function OfficialDocument({ documentStatus, download, downloading, downloadError, t }) {
  const ready = documentStatus === 'awaiting_signature' || documentStatus === 'generation_failed'
    || documentStatus === 'signed_document_uploaded' || documentStatus === 'under_review'
    || documentStatus === 'changes_required' || documentStatus === 'validated'
  if (!ready) {
    return <p className="axs-document-pending">{t.documentPendingNote}</p>
  }
  return (
    <section className="axs-document" aria-labelledby="axs-document-title">
      <p id="axs-document-title" className="axs-document-note">{t.documentReadyNote}</p>
      <button type="button" className="af-button af-button-primary" onClick={download} disabled={downloading} aria-busy={downloading}>
        {downloading ? t.downloading : t.downloadButton}
      </button>
      {downloadError && <p className="axs-document-error" role="alert">{t.downloadError}</p>}
    </section>
  )
}

// Read-only confirmation of the current signed-document version already on
// file — RECEIVED only, never "validated" (section 16 of the Phase 5B
// brief): no admin review exists yet, and this page never implies one has
// happened.
function SignedDocumentReceived({ signedDocument, t }) {
  return (
    <div className="axs-upload-received" role="status">
      <p className="axs-upload-received-title">{t.uploadReceivedTitle}</p>
      <p className="axs-upload-received-meta">{t.uploadReceivedVersion({ version: signedDocument.version })}</p>
      <p className="axs-upload-received-note">{t.uploadReceivedNote}</p>
    </div>
  )
}

// The upload form itself. Client-side file checks (extension/size, via
// upload.issue) are a UX hint only — the server re-validates everything,
// including the magic bytes a browser cannot read (Phase 5B brief, §18).
function SignedDocumentUpload({ upload, hasExisting, selectSignedDocument, submitSignedDocument, t }) {
  const busy = upload.status === 'uploading'
  const handleChange = (event) => {
    const file = event.target.files?.[0]
    if (file) selectSignedDocument(file)
    event.target.value = '' // allow picking the exact same file again after an error
  }

  return (
    <section className="axs-upload" aria-labelledby="axs-upload-title">
      <p id="axs-upload-title" className="axs-upload-title">{t.uploadSectionTitle}</p>
      <p className="axs-upload-instructions">{t.uploadInstructions}</p>
      <p className="axs-upload-meta">{t.uploadSupportedFormats} · {t.uploadMaxSize}</p>

      <input type="file" id="axs-upload-input" className="axs-upload-input" disabled={busy}
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={handleChange} />
      <label htmlFor="axs-upload-input" className="af-button af-button-secondary" data-disabled={busy ? '' : undefined}>
        {hasExisting ? t.uploadReplaceFile : t.uploadChooseFile}
      </label>

      {upload.file && (
        <p className="axs-upload-picked">
          <span>{upload.file.name}</span>
          <span>{(upload.file.size / (1024 * 1024)).toFixed(2)} {t.sizeUnit}</span>
        </p>
      )}
      {upload.issue && <p className="axs-upload-issue" role="alert">{t.uploadFileIssues[upload.issue] || t.uploadFileIssues.missing}</p>}

      {upload.file && !upload.issue && (
        <button type="button" className="af-button af-button-primary" onClick={submitSignedDocument} disabled={busy} aria-busy={busy}>
          {busy ? t.uploadSubmitting : t.uploadSubmit}
        </button>
      )}

      {upload.status === 'error' && <p className="axs-upload-error" role="alert">{t.uploadErrors[upload.message] || t.uploadErrors.error}</p>}
      {upload.status === 'success' && <p className="axs-upload-success" role="status">{t.uploadSuccessTitle}</p>}
    </section>
  )
}

function ValidCard({ data, download, downloading, downloadError, upload, selectSignedDocument, submitSignedDocument, t }) {
  const uploadEligible = UPLOAD_ELIGIBLE_DOCUMENT_STATUSES.includes(data.documentStatus)
  return (
    <div className="axs-card" role="status">
      <span className="axs-kicker">{t.validKicker}</span>
      <h2>{t.validTitle}</h2>

      <dl className="axs-record">
        <div><dt>{t.fieldReference}</dt><dd className="axs-ref">{data.reference}</dd></div>
        <div><dt>{t.fieldTeam}</dt><dd>{data.teamName}</dd></div>
        <div><dt>{t.fieldInstitution}</dt><dd>{data.institutionName}</dd></div>
        <div><dt>{t.fieldWilaya}</dt><dd>{data.wilayaName}</dd></div>
        <div><dt>{t.fieldStudents}</dt><dd>{t.studentsValue({ count: data.studentCount })}</dd></div>
        <div><dt>{t.fieldRegistrationStatus}</dt><dd>{t.registrationStatus[data.registrationStatus] || data.registrationStatus}</dd></div>
        <div><dt>{t.fieldDocumentStatus}</dt><dd>{t.documentStatus[data.documentStatus] || data.documentStatus}</dd></div>
      </dl>

      <OfficialDocument documentStatus={data.documentStatus} download={download} downloading={downloading} downloadError={downloadError} t={t} />

      {uploadEligible && (
        <>
          {data.signedDocument && <SignedDocumentReceived signedDocument={data.signedDocument} t={t} />}
          <SignedDocumentUpload upload={upload} hasExisting={Boolean(data.signedDocument)}
            selectSignedDocument={selectSignedDocument} submitSignedDocument={submitSignedDocument} t={t} />
        </>
      )}
    </div>
  )
}

export default function AivexStatusPage() {
  const [lang, setLang] = useState(readLang)
  const t = getStatusStrings(lang)
  const { status, data, download, downloading, downloadError, upload, selectSignedDocument, submitSignedDocument } = useAivexStatus()

  useEffect(() => {
    try {
      window.localStorage.setItem(REGISTER_LANG_STORAGE_KEY, lang)
    } catch {
      // Ignore storage failures.
    }
  }, [lang])

  useEffect(() => {
    const html = document.documentElement
    const previousPage = html.dataset.page
    const previousTitle = document.title
    html.dataset.page = 'aivex'
    document.title = `${t.pageTitle} | AIVEX`
    return () => {
      if (previousPage) html.dataset.page = previousPage
      else delete html.dataset.page
      document.title = previousTitle
    }
  }, [t.pageTitle])

  const messages = {
    loading: [t.loadingTitle, t.loadingText],
    invalid: [t.invalidTitle, t.invalidText],
    expired: [t.expiredTitle, t.expiredText],
    revoked: [t.revokedTitle, t.revokedText],
    registration_not_found: [t.notFoundTitle, t.notFoundText],
    server_error: [t.serverErrorTitle, t.serverErrorText],
  }

  return (
    <div className="ax-registration-page axs-page">
      <header className="axr-header">
        <div className="axr-container axr-header-inner">
          <Link to="/aivex" className="axr-brand" aria-label="Back to the AIVEX event page"><AivexLogoMark /><span>My file</span></Link>
          <Link to="/aivex" className="axr-back"><ArrowLeft size={14} aria-hidden="true" /> {t.backToEvent}</Link>
        </div>
      </header>

      <main className="axs-main">
        <div className="axr-container">
          <div className="axs-paper" dir={t.dir} lang={lang}>
            <div className="axr-lang" role="group" aria-label={t.languageLabel}>
              <span className="axr-lang-label" aria-hidden="true">{t.languageLabel}</span>
              <div className="axr-lang-buttons">
                {REGISTER_LANGS.map((entry) => (
                  <button key={entry.code} type="button" className="axr-lang-button"
                    data-active={lang === entry.code ? '' : undefined} aria-pressed={lang === entry.code} title={entry.name}
                    onClick={() => setLang(entry.code)}>
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            {status === 'valid'
              ? <ValidCard data={data} download={download} downloading={downloading} downloadError={downloadError}
                  upload={upload} selectSignedDocument={selectSignedDocument} submitSignedDocument={submitSignedDocument} t={t} />
              : <MessageCard title={messages[status]?.[0] || t.serverErrorTitle} text={messages[status]?.[1] || t.serverErrorText} />}
          </div>
        </div>
      </main>

      <footer className="axr-footer"><div className="axr-container"><span>AIVEX / Second edition</span><span className="axr-footer-mi"><InfinityClubMark className="axr-footer-mi-mark" />Organised by Infinity Club, BBA</span></div></footer>
    </div>
  )
}
