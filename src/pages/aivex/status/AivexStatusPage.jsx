import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../../components/InfinityClubMark'
import { UPLOAD_ELIGIBLE_DOCUMENT_STATUSES } from '../../../../shared/aivex/signed-document-policy.js'
import AivexLogoMark from '../AivexLogoMark'
import CurrentDossierStatus from './CurrentDossierStatus'
import DossierHeader from './DossierHeader'
import OfficialFormPanel from './OfficialFormPanel'
import ProgressTracker from './ProgressTracker'
import ReceivedPanel from './ReceivedPanel'
import SignaturePanel from './SignaturePanel'
import { StatusFooter, StatusNotice, StatusSkeleton } from './StatusNotices'
import { REGISTER_LANGS, REGISTER_LANG_STORAGE_KEY, getStatusStrings } from './statusI18n'
import { stageFor } from './statusModel'
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

// The candidate's file: who it belongs to, where it stands, and the one
// thing to do next. Which panel leads is decided by document_status alone
// (statusModel.js); whether an upload is offered at all stays with the same
// rule the server enforces (shared/aivex/signed-document-policy.js).
function Dossier({ data, lang, api, t }) {
  const uploadEligible = UPLOAD_ELIGIBLE_DOCUMENT_STATUSES.includes(data.documentStatus)
  const stage = stageFor(data.documentStatus)
  const { download, downloading, downloadError, upload, selectSignedDocument, clearSignedDocument, submitSignedDocument } = api

  return (
    <article className="axs-dossier" aria-label={t.validTitle}>
      <DossierHeader data={data} t={t} />
      <CurrentDossierStatus data={data} onRefresh={api.refresh} refreshing={api.refreshing} refreshFailed={api.refreshFailed} t={t}/>
      <ProgressTracker documentStatus={data.documentStatus} t={t} />

      {uploadEligible && stage === 'sign' && (
        <SignaturePanel download={download} downloading={downloading} downloadError={downloadError} upload={upload}
          selectSignedDocument={selectSignedDocument} clearSignedDocument={clearSignedDocument}
          submitSignedDocument={submitSignedDocument} t={t} />
      )}
      {uploadEligible && stage === 'received' && (
        <ReceivedPanel signedDocument={data.signedDocument} lang={lang} download={download} downloading={downloading}
          downloadError={downloadError} upload={upload} selectSignedDocument={selectSignedDocument}
          clearSignedDocument={clearSignedDocument} submitSignedDocument={submitSignedDocument} t={t} />
      )}
      {!uploadEligible && (
        <OfficialFormPanel stage={stage} download={download} downloading={downloading} downloadError={downloadError}
          refresh={api.refresh} refreshing={api.refreshing} refreshFailed={api.refreshFailed} t={t} />
      )}

      <StatusFooter t={t} />
    </article>
  )
}

export default function AivexStatusPage() {
  const [lang, setLang] = useState(readLang)
  const t = getStatusStrings(lang)
  const api = useAivexStatus()
  const { status, data } = api

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

  return (
    <div className="ax-registration-page axs-page">
      <header className="axr-header">
        <div className="axr-container axr-header-inner">
          <Link to="/aivex" className="axr-brand" aria-label="Back to the AIVEX event page"><AivexLogoMark /><span>{t.headerLabel}</span></Link>
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

            {status === 'loading' && <StatusSkeleton t={t} />}
            {status === 'valid' && <Dossier data={data} lang={lang} api={api} t={t} />}
            {status !== 'loading' && status !== 'valid' && <StatusNotice kind={status} onRetry={api.retry} t={t} />}
          </div>
        </div>
      </main>

      <footer className="axr-footer"><div className="axr-container"><span>AIVEX / Second edition</span><span className="axr-footer-mi"><InfinityClubMark className="axr-footer-mi-mark" />Organised by Infinity Club, BBA</span></div></footer>
    </div>
  )
}
