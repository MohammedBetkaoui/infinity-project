import { useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { downloadAivexOfficialDocument } from '../../../lib/applicationSubmission'

// Official Word document of the registration: the only document the
// application produces. The download is authorised by the submissionId this
// tab generated, so it is offered only while that tab still holds it.
function OfficialDocument({ reference, submissionId, t }) {
  const [state, setState] = useState({ status: 'idle', message: '' })
  const busy = state.status === 'downloading'

  const download = async () => {
    if (busy) return
    setState({ status: 'downloading', message: '' })
    try {
      await downloadAivexOfficialDocument({ reference, submissionId })
      setState({ status: 'idle', message: '' })
    } catch {
      // Localised on purpose: the server's messages are English-only.
      setState({ status: 'error', message: t.successDownloadError })
    }
  }

  return (
    <section className="axr-success-document" aria-labelledby="axr-success-document-title">
      <p id="axr-success-document-title" className="axr-success-document-title">{t.successDocumentReady}</p>
      <button type="button" className="af-button af-button-primary" onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? t.successDownloading : t.successDownload}
      </button>
      <p className="axr-success-document-hint">{t.successDownloadHint}</p>
      {state.status === 'error' && <p className="axr-success-document-error" role="alert">{state.message}</p>}
    </section>
  )
}

export default function RegistrationSuccess({ teamName, institution, studentCount, contactEmail, reference, submissionId, magicLink, reduced, onReset, t }) {
  return (
    <motion.div className="axr-success" role="status"
      initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .4, ease: [0.16, 1, 0.3, 1] }}>
      <span className="axr-success-kicker">{t.successKicker}</span>
      <h2 id="axr-success-heading" tabIndex={-1}>{t.successTitle}</h2>
      <p className="axr-success-stamp">{t.successStamp}</p>

      {magicLink && (
        <p className="axr-success-access">
          <a className="af-button af-button-secondary" href={magicLink}>{t.successAccessDossier}</a>
          <span>{t.successAccessHint}</span>
        </p>
      )}

      {reference && submissionId && <OfficialDocument reference={reference} submissionId={submissionId} t={t} />}

      <dl className="axr-success-record">
        <div><dt>{t.successTeam}</dt><dd>{teamName}</dd></div>
        <div><dt>{t.successInstitution}</dt><dd>{institution}</dd></div>
        <div><dt>{t.successStudents}</dt><dd>{t.successStudentsValue({ count: studentCount })}</dd></div>
        <div><dt>{t.successContact}</dt><dd>{contactEmail}</dd></div>
        {reference && <div><dt>{t.successReference}</dt><dd className="axr-success-ref">{reference}</dd></div>}
      </dl>

      <p className="axr-success-note">
        {t.successNote}
      </p>
      <button type="button" className="af-button af-button-secondary" onClick={onReset}>
        <RotateCcw size={14} aria-hidden="true" /> {t.restart}
      </button>
    </motion.div>
  )
}
