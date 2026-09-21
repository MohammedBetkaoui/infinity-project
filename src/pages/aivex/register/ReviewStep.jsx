import { useState } from 'react'
import { ChevronDown, FileCheck2, Pencil } from 'lucide-react'
import { OTHER_INSTITUTION_ID } from '../../../data/algeriaHigherEducation'
import { IDENTITY_CARD_POLICY } from '../../../../shared/aivex/contract-v4.js'
import { STEP, describeCardFile, institutionLabel, wilayaLabel } from './registrationModel'
import { getRoleLabel } from './registrationI18n'
import PrivacyNotice from './PrivacyNotice'
import StepHeading from './StepHeading'
import { fieldId, recordId } from './useCompetitionRegistration'
import useObjectUrl from './useObjectUrl'

function ReviewItem({ label, value, t }) {
  return (
    <div className="axr-review-item">
      <dt>{label}</dt>
      <dd>{value ? <bdi>{value}</bdi> : <span className="axr-review-missing">{t.notProvided}</span>}</dd>
    </div>
  )
}

function ReviewPerson({ label, person, onEdit, editText, t }) {
  return (
    <li className="axr-review-record">
      <div className="axr-review-record-head">
        <div className="axr-review-record-title">
          <span className="axr-review-record-role">{label}</span>
          <strong><bdi>{person.fullName.trim() || t.notProvided}</bdi></strong>
        </div>
        <EditButton onClick={onEdit.onClick} aria={onEdit.aria}>{editText}</EditButton>
      </div>
      <dl className="axr-review-record-grid">
        <ReviewItem label={t.revPhone} value={person.phone.trim()} t={t} />
        <ReviewItem label={t.revRfid} value={person.rfid.trim()} t={t} />
        {/* Confirmed, never shown: an identity document is not drawn back on screen. */}
        <div className="axr-review-item axr-review-document">
          <dt>{t.revIdCard}</dt>
          <dd>
            {person.idCard
              ? <span className="axr-review-attached"><FileCheck2 size={16} aria-hidden="true" /><span>{t.uploadedCheck}<small>{describeCardFile(person.idCard, IDENTITY_CARD_POLICY)}</small></span></span>
              : <span className="axr-review-missing">{t.missing}</span>}
          </dd>
        </div>
      </dl>
    </li>
  )
}

function ReviewStudent({ student, onEdit, editText, t }) {
  const [open, setOpen] = useState(false)
  const preview = useObjectUrl(student.studentCard)
  const number = String(student.position).padStart(2, '0')
  const name = student.fullName.trim()
  const previewId = `axr-review-card-${student.id}`

  return (
    <li className="axr-review-record">
      <div className="axr-review-record-head">
        <span className="axr-review-record-no" aria-hidden="true">{number}</span>
        <div className="axr-review-record-title">
          <strong><bdi>{name || t.unnamedStudent({ number })}</bdi></strong>
        </div>
        <EditButton onClick={onEdit.onClick} aria={onEdit.aria}>{editText}</EditButton>
      </div>
      <dl className="axr-review-record-grid">
        <ReviewItem label={t.revPhone} value={student.phone.trim()} t={t} />
        <ReviewItem label={t.revBacYear} value={student.bacYear} t={t} />
        <ReviewItem label={t.revRfid} value={student.rfid.trim()} t={t} />
        <div className="axr-review-item axr-review-document">
          <dt>{t.revStudentCard}</dt>
          <dd>
            {student.studentCard ? (
              <button type="button" className="axr-review-card-toggle" aria-expanded={open} aria-controls={previewId}
                aria-label={`${open ? t.hide : t.view} — ${t.revStudentCard} — ${name || t.unnamedStudent({ number })}`}
                onClick={() => setOpen(!open)}>
                <span className="axr-review-attached"><FileCheck2 size={16} aria-hidden="true" />{t.uploadedCheck}</span>
                <span className="axr-review-card-action">{open ? t.hide : t.view}<ChevronDown size={14} aria-hidden="true" /></span>
              </button>
            ) : <span className="axr-review-missing">{t.missing}</span>}
          </dd>
        </div>
      </dl>
      {student.studentCard && (
        <figure id={previewId} className="axr-review-card" hidden={!open}>
          <img src={preview} alt={t.cardAlt({ name })} />
          <figcaption>{student.studentCard.name}</figcaption>
        </figure>
      )}
    </li>
  )
}

function EditButton({ onClick, aria, children }) {
  return (
    <button type="button" className="axr-review-edit" onClick={onClick} aria-label={aria}>
      <Pencil size={12} aria-hidden="true" />{children}
    </button>
  )
}

function ReviewSection({ id, number, title, action, children }) {
  return (
    <section className="axr-review-block" aria-labelledby={id}>
      <header>
        <div className="axr-review-section-title">
          <span className="axr-review-section-no" aria-hidden="true">{number}</span>
          <h3 id={id}>{title}</h3>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export default function ReviewStep({ registration, t, lang }) {
  const { team, activityOfficial, delegationHead, driver, students, goTo, consent, consentError, setConsent } = registration
  const institution = institutionLabel(team, lang)

  const teamEdit = { onClick: () => goTo(STEP.institution, fieldId('team', 'name')), aria: t.editAria({ label: `${t.revTeam}` }) }
  const contactEdit = { onClick: () => goTo(STEP.institution, fieldId('activityOfficial', 'role')), aria: t.editAria({ label: `${t.revContact}` }) }

  return (
    <div className="axr-review-step">
      <StepHeading kicker={t.revKicker} title={t.revTitle}>
        {t.revDesc}
      </StepHeading>

      <div className="axr-review">
        <ReviewSection id="axr-review-team" number="01" title={t.revTeam}
          action={<EditButton onClick={teamEdit.onClick} aria={teamEdit.aria}>{t.edit}</EditButton>}>
          <dl className="axr-review-team">
            <ReviewItem label={t.revTeamName} value={team.name.trim()} t={t} />
            <ReviewItem label={t.revWilaya} value={wilayaLabel(team.wilaya, lang)} t={t} />
            <ReviewItem label={t.revInstitution}
              value={institution && (team.institution === OTHER_INSTITUTION_ID ? t.revNotListed({ name: institution }) : institution)} t={t} />
          </dl>
        </ReviewSection>

        <ReviewSection id="axr-review-contact" number="02" title={t.revContact}
          action={<EditButton onClick={contactEdit.onClick} aria={contactEdit.aria}>{t.edit}</EditButton>}>
          <dl className="axr-review-team">
            <ReviewItem label={t.revRole} value={getRoleLabel(activityOfficial.role, t)} t={t} />
            <ReviewItem label={t.revFullName} value={activityOfficial.fullName.trim()} t={t} />
            <ReviewItem label={t.revEmail} value={activityOfficial.email.trim()} t={t} />
            <ReviewItem label={t.revPhone} value={activityOfficial.phone.trim()} t={t} />
          </dl>
        </ReviewSection>

        <ReviewSection id="axr-review-delegation" number="03" title={t.revDelegation}
          action={<span className="axr-review-count">{t.recordsTwo}</span>}>
          <ol className="axr-review-roster">
            <ReviewPerson label={t.headRole} person={delegationHead} t={t} editText={t.edit}
              onEdit={{ onClick: () => goTo(STEP.delegation, recordId('delegationHead')), aria: t.editAria({ label: t.headRole }) }} />
            <ReviewPerson label={t.driverRole} person={driver} t={t} editText={t.edit}
              onEdit={{ onClick: () => goTo(STEP.delegation, recordId('driver')), aria: t.editAria({ label: t.driverRole }) }} />
          </ol>
        </ReviewSection>

        <ReviewSection id="axr-review-students" number="04" title={t.revStudents}
          action={<span className="axr-review-count">{t.recordsCount({ count: students.length })}</span>}>
          <ol className="axr-review-roster">
            {students.map((student) => {
              const number = String(student.position).padStart(2, '0')
              return (
                <ReviewStudent key={student.id} student={student} t={t} editText={t.edit}
                  onEdit={{ onClick: () => goTo(STEP.students, recordId(student.id)), aria: t.editStudentAria({ number, name: student.fullName.trim() }) }} />
              )
            })}
          </ol>
        </ReviewSection>

        <PrivacyNotice consent={consent} error={consentError} onConsent={setConsent} t={t} />
      </div>
    </div>
  )
}
