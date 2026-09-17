import { useState } from 'react'
import { OTHER_INSTITUTION_ID } from '../../../data/algeriaHigherEducation'
import { STEP, institutionLabel, roleLabel, wilayaLabel } from './registrationModel'
import PrivacyNotice from './PrivacyNotice'
import StepHeading from './StepHeading'
import { fieldId, recordId } from './useCompetitionRegistration'
import useObjectUrl from './useObjectUrl'

function ReviewItem({ label, value }) {
  return (
    <div className="axr-review-item">
      <dt>{label}</dt>
      <dd>{value || <span className="axr-review-missing">Not provided</span>}</dd>
    </div>
  )
}

function ReviewBlock({ id, index, title, onEdit, editLabel, aside, children }) {
  return (
    <section className="axr-review-block" aria-labelledby={id}>
      <header>
        <h3 id={id}><span>{title}</span> / {index}</h3>
        {onEdit
          ? <button type="button" className="axr-review-edit" onClick={onEdit} aria-label={editLabel}>Edit</button>
          : aside}
      </header>
      {children}
    </section>
  )
}

function ReviewPerson({ label, person, onEdit }) {
  return (
    <li className="axr-review-record">
      <div className="axr-review-record-head">
        <span className="axr-review-record-no">{label}</span>
        <strong>{person.fullName.trim() || 'Not provided'}</strong>
        <button type="button" className="axr-review-edit" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}>Edit</button>
      </div>
      <dl className="axr-review-record-grid axr-review-person-grid">
        <ReviewItem label="Phone" value={person.phone.trim()} />
        <ReviewItem label="National ID" value={person.nationalId.trim()} />
      </dl>
    </li>
  )
}

function ReviewStudent({ student, onEdit }) {
  const [open, setOpen] = useState(false)
  const preview = useObjectUrl(student.studentCard)
  const number = String(student.position).padStart(2, '0')
  const name = student.fullName.trim()
  const previewId = `axr-review-card-${student.id}`

  return (
    <li className="axr-review-record">
      <div className="axr-review-record-head">
        <span className="axr-review-record-no">{number}</span>
        <strong>{name || `Student ${number}`}</strong>
        <button type="button" className="axr-review-edit" onClick={onEdit} aria-label={`Edit student ${number}${name ? `, ${name}` : ''}`}>Edit</button>
      </div>
      <dl className="axr-review-record-grid">
        <ReviewItem label="Registration ID" value={student.registrationNumber.trim()} />
        <ReviewItem label="Study level" value={student.studyLevel} />
        <ReviewItem label="Phone" value={student.phone.trim()} />
        <div className="axr-review-item">
          <dt>Student card</dt>
          <dd>
            {student.studentCard ? (
              <button type="button" className="axr-review-card-toggle" aria-expanded={open} aria-controls={previewId} onClick={() => setOpen(!open)}>
                {preview && <img src={preview} alt="" />}
                <span>✓ Uploaded</span>
                <small>{open ? 'Hide' : 'View'}</small>
              </button>
            ) : <span className="axr-review-missing">Missing</span>}
          </dd>
        </div>
      </dl>
      {student.studentCard && open && (
        <figure id={previewId} className="axr-review-card">
          <img src={preview} alt={`Front of ${name ? `${name}’s` : 'the'} student card`} />
          <figcaption>{student.studentCard.name}</figcaption>
        </figure>
      )}
    </li>
  )
}

export default function ReviewStep({ registration }) {
  const { team, activityOfficial, delegationHead, driver, students, goTo, consent, consentError, setConsent } = registration
  const institution = institutionLabel(team)

  return (
    <>
      <StepHeading kicker="Final check" title="Review your registration.">
        Check the institution, delegation and student information before submitting your AIVEX registration.
      </StepHeading>

      <div className="axr-review">
        <ReviewBlock id="axr-review-team" index="01" title="Team / Institution"
          onEdit={() => goTo(STEP.institution, fieldId('team', 'name'))} editLabel="Edit team and institution">
          <dl className="axr-review-team">
            <ReviewItem label="Team name" value={team.name.trim()} />
            <ReviewItem label="Wilaya" value={wilayaLabel(team.wilaya)} />
            <ReviewItem label="University / Institution"
              value={institution && (team.institution === OTHER_INSTITUTION_ID ? `${institution} (not listed)` : institution)} />
          </dl>
        </ReviewBlock>

        <ReviewBlock id="axr-review-contact" index="02" title="Activity administration contact"
          onEdit={() => goTo(STEP.institution, fieldId('activityOfficial', 'role'))} editLabel="Edit activity administration contact">
          <dl className="axr-review-team">
            <ReviewItem label="Role" value={roleLabel(activityOfficial.role)} />
            <ReviewItem label="Full name" value={activityOfficial.fullName.trim()} />
            <ReviewItem label="Email" value={activityOfficial.email.trim()} />
            <ReviewItem label="Phone" value={activityOfficial.phone.trim()} />
          </dl>
        </ReviewBlock>

        <ReviewBlock id="axr-review-delegation" index="03" title="Delegation"
          aside={<span className="axr-review-count">2 records</span>}>
          <ol className="axr-review-roster">
            <ReviewPerson label="Head of delegation" person={delegationHead}
              onEdit={() => goTo(STEP.delegation, recordId('delegationHead'))} />
            <ReviewPerson label="Driver" person={driver}
              onEdit={() => goTo(STEP.delegation, recordId('driver'))} />
          </ol>
        </ReviewBlock>

        <ReviewBlock id="axr-review-students" index="04" title="Students"
          aside={<span className="axr-review-count">{students.length} records</span>}>
          <ol className="axr-review-roster">
            {students.map((student) => (
              <ReviewStudent key={student.id} student={student} onEdit={() => goTo(STEP.students, recordId(student.id))} />
            ))}
          </ol>
        </ReviewBlock>

        <PrivacyNotice consent={consent} error={consentError} onConsent={setConsent} />
      </div>
    </>
  )
}
