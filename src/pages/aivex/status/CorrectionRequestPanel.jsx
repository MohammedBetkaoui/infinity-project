import { CircleCheck, Clock3, TriangleAlert } from 'lucide-react'
import { correctionCardSpec } from '../../../../shared/aivex/correction-items.js'
import {
  OTHER_INSTITUTION_ID, algerianWilayas, findWilaya, getInstitutionsByWilaya, institutionDisplayName, wilayaDisplayName,
} from '../../../data/algeriaHigherEducation'
import { INSTAGRAM_URL } from '../aivexData'
import { getRegistrationStrings, getRoleOptions } from '../register/registrationI18n'
import SignedDocumentDropzone from './SignedDocumentDropzone'
import { formatCorrectionDeadline } from './statusModel'
import useCorrectionSubmission from './useCorrectionSubmission'

// The real correction the organisers recorded for this team — not a generic
// "changes required" placeholder. `correctionRequest` comes straight from
// the admin dashboard's request_corrections action (aivex_correction_requests
// + aivex_correction_items), via the Magic Link verify endpoint: the exact
// items checked, each one's own live status, the deadline, and the message
// sent to the team. An 'open' item gets the form or dropzone that answers
// it right here; 'submitted'/'verified' items are shown as read-only history.
const STATUS_ICON = { open: TriangleAlert, submitted: Clock3, verified: CircleCheck }

// A dropzone built for the signed form (SignedDocumentDropzone) reused as-is
// for a card correction: only the handful of strings that literally say
// "signed document" are swapped for `t.correctionUpload`'s generic wording,
// everything else (drag/drop, progress, remove, generic errors) stays.
function correctionDropzoneStrings(t) {
  return {
    ...t,
    uploadDropTitle: t.correctionUpload.dropTitle,
    uploadChooseFile: t.correctionUpload.chooseFile,
    uploadReplaceFile: t.correctionUpload.chooseFile,
    uploadSupportedFormats: t.correctionUpload.formats,
    uploadMaxSize: t.correctionUpload.maxSize,
    uploadFileIssues: t.correctionUpload.fileIssues,
    uploadSubmit: t.correctionUpload.submit,
    uploadSubmitting: t.correctionUpload.submitting,
    uploadSuccessTitle: t.correctionUpload.successTitle,
    uploadErrors: t.correctionUpload.errors,
  }
}

function DocumentCorrectionForm({ itemId, item, correction, t }) {
  const upload = correction.uploadFor(itemId)
  return (
    <SignedDocumentDropzone
      upload={upload} hasExisting selectSignedDocument={(file) => correction.selectFile(itemId, item, file)}
      clearSignedDocument={() => correction.clearFile(itemId)} submitSignedDocument={() => correction.submitFile(itemId)}
      t={correctionDropzoneStrings(t)}
    />
  )
}

function TeamInformationForm({ itemId, initialValues, correction, lang, t }) {
  const { values, error, errorMessage, saving } = correction.fieldFor(itemId, initialValues)
  const wilaya = findWilaya(values.wilayaCode || '')
  const institutions = wilaya ? getInstitutionsByWilaya(values.wilayaCode) : []
  const set = (key) => (event) => correction.updateFieldValue(itemId, key, event.target.value, initialValues)

  const submit = (event) => {
    event.preventDefault()
    const listed = values.institutionId !== OTHER_INSTITUTION_ID
      ? institutions.find((institution) => institution.id === values.institutionId) : null
    correction.submitField(itemId, {
      name: values.name || '',
      wilaya: { code: values.wilayaCode || '', name: wilaya?.name || '' },
      institution: values.institutionId === OTHER_INSTITUTION_ID
        ? { id: OTHER_INSTITUTION_ID, name: values.customInstitution || '', custom: true }
        : { id: listed?.id || '', name: listed?.name || '', custom: false },
    })
  }

  return (
    <form className="axs-correction-form" onSubmit={submit}>
      <label>{t.correctionFieldTeamName}<input value={values.name || ''} onChange={set('name')} maxLength={120} required /></label>
      <div className="axs-correction-form-grid">
        <label>{t.correctionFieldWilaya}
          <select value={values.wilayaCode || ''} onChange={set('wilayaCode')} required>
            <option value="" disabled>{t.correctionSelectPlaceholder}</option>
            {algerianWilayas.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {wilayaDisplayName(entry, lang)}</option>)}
          </select>
        </label>
        <label>{t.correctionFieldInstitution}
          <select value={values.institutionId || ''} onChange={set('institutionId')} disabled={!wilaya} required>
            <option value="" disabled>{t.correctionSelectPlaceholder}</option>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institution.id === OTHER_INSTITUTION_ID ? t.correctionOtherInstitution : institutionDisplayName(institution, lang)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {values.institutionId === OTHER_INSTITUTION_ID && (
        <label>{t.correctionFieldCustomInstitution}<input value={values.customInstitution || ''} onChange={set('customInstitution')} maxLength={180} required /></label>
      )}
      {error && <p className="axs-inline-error" role="alert">{errorMessage || t.correctionGenericError}</p>}
      <button type="submit" className="af-button af-button-primary" disabled={saving} aria-busy={saving}>{saving ? t.correctionSaving : t.correctionSaveButton}</button>
    </form>
  )
}

function ActivitiesManagerForm({ itemId, initialValues, correction, lang, t }) {
  const { values, error, errorMessage, saving } = correction.fieldFor(itemId, initialValues)
  const roleOptions = getRoleOptions(getRegistrationStrings(lang))
  const set = (key) => (event) => correction.updateFieldValue(itemId, key, event.target.value, initialValues)

  const submit = (event) => {
    event.preventDefault()
    correction.submitField(itemId, {
      role: values.role || '', fullName: values.fullName || '', email: values.email || '', phone: values.phone || '',
    })
  }

  return (
    <form className="axs-correction-form" onSubmit={submit}>
      <div className="axs-correction-form-grid">
        <label>{t.correctionFieldRole}
          <select value={values.role || ''} onChange={set('role')} required>
            <option value="" disabled>{t.correctionSelectPlaceholder}</option>
            {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>{t.correctionFieldFullName}<input value={values.fullName || ''} onChange={set('fullName')} maxLength={120} required /></label>
      </div>
      <div className="axs-correction-form-grid">
        <label>{t.correctionFieldEmail}<input type="email" value={values.email || ''} onChange={set('email')} required /></label>
        <label>{t.correctionFieldPhone}<input type="tel" value={values.phone || ''} onChange={set('phone')} required /></label>
      </div>
      {error && <p className="axs-inline-error" role="alert">{errorMessage || t.correctionGenericError}</p>}
      <button type="submit" className="af-button af-button-primary" disabled={saving} aria-busy={saving}>{saving ? t.correctionSaving : t.correctionSaveButton}</button>
    </form>
  )
}

const FIELD_FORMS = { 'Team information': TeamInformationForm, 'Activities manager': ActivitiesManagerForm }

export default function CorrectionRequestPanel({ correctionRequest, lang, token, onSubmitted, t }) {
  const items = Array.isArray(correctionRequest?.items) ? correctionRequest.items : []
  const deadline = correctionRequest?.deadline ? formatCorrectionDeadline(correctionRequest.deadline, lang) : ''
  const correction = useCorrectionSubmission(token, onSubmitted)

  return (
    <section className="axs-panel axs-correction" data-tone="issue" aria-labelledby="axs-correction-title">
      <div className="axs-panel-head">
        <span className="axs-panel-icon" aria-hidden="true"><TriangleAlert size={18} strokeWidth={2}/></span>
        <h2 id="axs-correction-title" className="axs-panel-title">{t.correctionsTitle}</h2>
      </div>

      {deadline && <p className="axs-correction-deadline">{t.correctionsDeadline({ date: deadline })}</p>}
      {correctionRequest?.message && <p className="axs-panel-text">{correctionRequest.message}</p>}

      {items.length > 0 && (
        <ul className="axs-correction-list">
          {items.map((entry) => {
            const Icon = STATUS_ICON[entry.status] || TriangleAlert
            const FieldForm = entry.kind === 'field' ? FIELD_FORMS[entry.item] : null
            // A student card resubmits right here; the signed form already
            // has its own upload flow just below (SignaturePanel/
            // ReceivedPanel) so this list stays informational for it; the
            // two identity-document items are never self-serviceable via
            // the Magic Link (see correctionCardSpec's own comment) — the
            // team is directed to the organisers instead.
            const isSelfServiceCard = entry.kind === 'document' && Boolean(correctionCardSpec(entry.item))
            const isIdentityDocument = entry.kind === 'document' && !isSelfServiceCard && entry.item !== 'Signed and stamped form'
            return (
              <li key={entry.id} data-status={entry.status}>
                <div className="axs-correction-item-head">
                  <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>{t.correctionItemLabels[entry.item] || entry.item}</span>
                  <em>{t.correctionStatus[entry.status] || entry.status}</em>
                </div>
                {entry.status === 'open' && isSelfServiceCard && (
                  <DocumentCorrectionForm itemId={entry.id} item={entry.item} correction={correction} t={t} />
                )}
                {entry.status === 'open' && isIdentityDocument && (
                  <p className="axs-correction-contact">
                    {t.correctionContactOrganisers} <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">{t.correctionContactLink}</a>
                  </p>
                )}
                {entry.status === 'open' && FieldForm && (
                  <FieldForm itemId={entry.id} initialValues={entry.initialFields || {}} correction={correction} lang={lang} t={t} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
