import { useState } from 'react'
import { OTHER_INSTITUTION_ID } from '../../../data/algeriaHigherEducation'
import { STEP, institutionLabel, wilayaLabel } from './registrationModel'
import { getRoleLabel, getStudyLabel } from './registrationI18n'
import PrivacyNotice from './PrivacyNotice'
import StepHeading from './StepHeading'
import { fieldId, recordId } from './useCompetitionRegistration'
import useObjectUrl from './useObjectUrl'

function ReviewItem({ label, value, t }) {
  return (
    <div className="axr-review-item">
      <dt>{label}</dt>
      <dd>{value || <span className="axr-review-missing">{t.notProvided}</span>}</dd>
    </div>
  )
}

function ReviewPerson({ label, person, onEdit, editText, v4, t }) {
  return (
    <li className="axr-review-record">
      <div className="axr-review-record-head">
        <span className="axr-review-record-no">{label}</span>
        <strong>{person.fullName.trim() || t.notProvided}</strong>
        <button type="button" className="axr-review-edit" onClick={onEdit.onClick} aria-label={onEdit.aria}>{editText}</button>
      </div>
      <dl className="axr-review-record-grid axr-review-person-grid">
        <ReviewItem label={t.revPhone} value={person.phone.trim()} t={t} />
        {v4
          ? <ReviewItem label={t.revRfid} value={person.rfid.trim()} t={t} />
          : <ReviewItem label={t.revNationalId} value={person.nationalId.trim()} t={t} />}
      </dl>
    </li>
  )
}

function ReviewStudent({ student, onEdit, editText, v4, t }) {
  const [open, setOpen] = useState(false)
  const preview = useObjectUrl(student.studentCard)
  const number = String(student.position).padStart(2, '0')
  const name = student.fullName.trim()
  const previewId = `axr-review-card-${student.id}`

  return (
    <li className="axr-review-record">
      <div className="axr-review-record-head">
        <span className="axr-review-record-no">{number}</span>
        <strong>{name || t.unnamedStudent({ number })}</strong>
        <button type="button" className="axr-review-edit" onClick={onEdit.onClick} aria-label={onEdit.aria}>{editText}</button>
      </div>
      <dl className="axr-review-record-grid">
        {v4 ? (
          <>
            <ReviewItem label={t.revBacYear} value={student.bacYear} t={t} />
            <ReviewItem label={t.revRfid} value={student.rfid.trim()} t={t} />
          </>
        ) : (
          <>
            <ReviewItem label={t.revRegId} value={student.registrationNumber.trim()} t={t} />
            <ReviewItem label={t.revStudyLevel} value={getStudyLabel(student.studyLevel, t)} t={t} />
          </>
        )}
        <ReviewItem label={t.revPhone} value={student.phone.trim()} t={t} />
        <div className="axr-review-item">
          <dt>{t.revStudentCard}</dt>
          <dd>
            {student.studentCard ? (
              <button type="button" className="axr-review-card-toggle" aria-expanded={open} aria-controls={previewId} onClick={() => setOpen(!open)}>
                {preview && <img src={preview} alt="" />}
                <span>{t.uploadedCheck}</span>
                <small>{open ? t.hide : t.view}</small>
              </button>
            ) : <span className="axr-review-missing">{t.missing}</span>}
          </dd>
        </div>
      </dl>
      {student.studentCard && open && (
        <figure id={previewId} className="axr-review-card">
          <img src={preview} alt={t.cardAlt({ name })} />
          <figcaption>{student.studentCard.name}</figcaption>
        </figure>
      )}
    </li>
  )
}

// ReviewBlock expects onEdit as a handler; wrap handler + label cleanly.
function EditButton({ onClick, aria, children }) {
  return (
    <button type="button" className="axr-review-edit" onClick={onClick} aria-label={aria}>{children}</button>
  )
}

export default function ReviewStep({ registration, t, lang }) {
  const { team, activityOfficial, delegationHead, driver, students, goTo, consent, consentError, setConsent } = registration
  const v4 = registration.formVersion === 4
  const institution = institutionLabel(team, lang)

  const teamEdit = { onClick: () => goTo(STEP.institution, fieldId('team', 'name')), aria: t.editAria({ label: `${t.revTeam}` }) }
  const contactEdit = { onClick: () => goTo(STEP.institution, fieldId('activityOfficial', 'role')), aria: t.editAria({ label: `${t.revContact}` }) }

  return (
    <>
      <StepHeading kicker={t.revKicker} title={t.revTitle}>
        {t.revDesc}
      </StepHeading>

      <div className="axr-review">
        <section className="axr-review-block" aria-labelledby="axr-review-team">
          <header>
            <h3 id="axr-review-team"><span>{t.revTeam}</span> / 01</h3>
            <EditButton onClick={teamEdit.onClick} aria={teamEdit.aria}>{t.edit}</EditButton>
          </header>
          <dl className="axr-review-team">
            <ReviewItem label={t.revTeamName} value={team.name.trim()} t={t} />
            <ReviewItem label={t.revWilaya} value={wilayaLabel(team.wilaya, lang)} t={t} />
            <ReviewItem label={t.revInstitution}
              value={institution && (team.institution === OTHER_INSTITUTION_ID ? t.revNotListed({ name: institution }) : institution)} t={t} />
          </dl>
        </section>

        <section className="axr-review-block" aria-labelledby="axr-review-contact">
          <header>
            <h3 id="axr-review-contact"><span>{t.revContact}</span> / 02</h3>
            <EditButton onClick={contactEdit.onClick} aria={contactEdit.aria}>{t.edit}</EditButton>
          </header>
          <dl className="axr-review-team">
            <ReviewItem label={t.revRole} value={getRoleLabel(activityOfficial.role, t)} t={t} />
            <ReviewItem label={t.revFullName} value={activityOfficial.fullName.trim()} t={t} />
            <ReviewItem label={t.revEmail} value={activityOfficial.email.trim()} t={t} />
            <ReviewItem label={t.revPhone} value={activityOfficial.phone.trim()} t={t} />
          </dl>
        </section>

        <section className="axr-review-block" aria-labelledby="axr-review-delegation">
          <header>
            <h3 id="axr-review-delegation"><span>{t.revDelegation}</span> / 03</h3>
            <span className="axr-review-count">{t.recordsTwo}</span>
          </header>
          <ol className="axr-review-roster">
            <ReviewPerson label={t.headRole} person={delegationHead} v4={v4} t={t} editText={t.edit}
              onEdit={{ onClick: () => goTo(STEP.delegation, recordId('delegationHead')), aria: t.editAria({ label: t.headRole }) }} />
            <ReviewPerson label={t.driverRole} person={driver} v4={v4} t={t} editText={t.edit}
              onEdit={{ onClick: () => goTo(STEP.delegation, recordId('driver')), aria: t.editAria({ label: t.driverRole }) }} />
          </ol>
        </section>

        <section className="axr-review-block" aria-labelledby="axr-review-students">
          <header>
            <h3 id="axr-review-students"><span>{t.revStudents}</span> / 04</h3>
            <span className="axr-review-count">{t.recordsCount({ count: students.length })}</span>
          </header>
          <ol className="axr-review-roster">
            {students.map((student) => {
              const number = String(student.position).padStart(2, '0')
              return (
                <ReviewStudent key={student.id} student={student} v4={v4} t={t} editText={t.edit}
                  onEdit={{ onClick: () => goTo(STEP.students, recordId(student.id)), aria: t.editStudentAria({ number, name: student.fullName.trim() }) }} />
              )
            })}
          </ol>
        </section>

        <PrivacyNotice consent={consent} error={consentError} onConsent={setConsent} t={t} />
      </div>
    </>
  )
}
