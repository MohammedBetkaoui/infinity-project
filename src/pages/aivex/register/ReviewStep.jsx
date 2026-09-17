import { useState } from 'react'
import { memberName, STEP } from './registrationModel'
import PrivacyNotice from './PrivacyNotice'
import StepHeading from './StepHeading'
import { memberCardId } from './useCompetitionRegistration'
import useObjectUrl from './useObjectUrl'

function ReviewItem({ label, value }) {
  return (
    <div className="axr-review-item">
      <dt>{label}</dt>
      <dd>{value || <span className="axr-review-missing">Not provided</span>}</dd>
    </div>
  )
}

function ReviewMember({ member, index, team, onEdit }) {
  const [open, setOpen] = useState(false)
  const preview = useObjectUrl(member.studentCard)
  const number = String(index + 1).padStart(2, '0')
  const name = memberName(member, team).trim()
  const previewId = `axr-review-card-${member.id}`

  return (
    <li className="axr-review-member">
      <div className="axr-review-member-head">
        <span className="axr-review-member-no">{number}</span>
        <strong>{name || 'Unnamed member'}</strong>
        {member.isLeader && <span className="axr-member-badge">Team leader</span>}
        <button type="button" className="axr-review-edit" onClick={onEdit} aria-label={`Edit member ${number}${name ? `, ${name}` : ''}`}>Edit</button>
      </div>
      <dl className="axr-review-member-grid">
        <ReviewItem label="Registration ID" value={member.registrationNumber} />
        <ReviewItem label="Study level" value={member.studyLevel} />
        <ReviewItem label="Phone" value={member.phone} />
        <div className="axr-review-item">
          <dt>Student ID</dt>
          <dd>
            {member.studentCard ? (
              <button type="button" className="axr-review-card-toggle" aria-expanded={open} aria-controls={previewId} onClick={() => setOpen(!open)}>
                {preview && <img src={preview} alt="" />}
                <span>✓ Uploaded</span>
                <small>{open ? 'Hide' : 'View'}</small>
              </button>
            ) : <span className="axr-review-missing">Missing</span>}
          </dd>
        </div>
      </dl>
      {member.studentCard && open && (
        <figure id={previewId} className="axr-review-card">
          <img src={preview} alt={`Front of ${name ? `${name}’s` : 'the'} student card`} />
          <figcaption>{member.studentCard.name}</figcaption>
        </figure>
      )}
    </li>
  )
}

export default function ReviewStep({ registration }) {
  const { team, members, goTo, consent, consentError, setConsent } = registration

  return (
    <>
      <StepHeading kicker="Final check" title="Review your registration.">
        Check the team and member information before submitting your AIVEX registration.
      </StepHeading>

      <div className="axr-review">
        <section className="axr-review-block" aria-labelledby="axr-review-team">
          <header>
            <h3 id="axr-review-team"><span>Team</span> / 01</h3>
            <button type="button" className="axr-review-edit" onClick={() => goTo(STEP.team)} aria-label="Edit team information">Edit</button>
          </header>
          <dl className="axr-review-team">
            <ReviewItem label="Team name" value={team.name.trim()} />
            <ReviewItem label="University" value={team.university.trim()} />
            <ReviewItem label="Team leader" value={team.leaderName.trim()} />
            <ReviewItem label="Team email" value={team.email.trim()} />
            <ReviewItem label="Total members" value={`${members.length} students`} />
          </dl>
        </section>

        <section className="axr-review-block" aria-labelledby="axr-review-members">
          <header>
            <h3 id="axr-review-members"><span>Team members</span> / 02</h3>
            <span className="axr-review-count">{members.length} records</span>
          </header>
          <ol className="axr-review-roster">
            {members.map((member, index) => (
              <ReviewMember key={member.id} member={member} index={index} team={team}
                onEdit={() => goTo(STEP.members, memberCardId(member.id))} />
            ))}
          </ol>
        </section>

        <PrivacyNotice consent={consent} error={consentError} onConsent={setConsent} />
      </div>
    </>
  )
}
