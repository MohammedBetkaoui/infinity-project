import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import ApplicationField from '../../../components/forms/ApplicationField'
import { memberName, studyLevels } from './registrationModel'
import StudentCardUpload from './StudentCardUpload'
import { memberCardId, memberFieldId } from './useCompetitionRegistration'

export default function MemberCard({ member, index, registration, reduced }) {
  const { team, setTeam, setMember, touch, memberError, memberErrors, removeMember } = registration
  const [confirming, setConfirming] = useState(false)
  const keepRef = useRef(null)
  const number = String(index + 1).padStart(2, '0')
  const role = member.isLeader ? 'Team leader' : 'Member'
  const name = memberName(member, team).trim()
  const remaining = Object.keys(memberErrors[member.id] || {}).length
  const complete = remaining === 0
  const titleId = `${memberCardId(member.id)}-title`
  const hasContent = Boolean(member.fullName.trim() || member.registrationNumber || member.studyLevel || member.phone || member.studentCard)

  useEffect(() => {
    if (confirming) keepRef.current?.focus()
  }, [confirming])

  const field = (fieldName) => ({
    formId: `axr-m-${member.id}`,
    name: fieldName,
    value: member[fieldName],
    error: memberError(member.id, fieldName),
    onChange: (_, value) => setMember(member.id, fieldName, value),
    onBlur: () => touch(`member.${member.id}.${fieldName}`),
  })

  const nameField = member.isLeader
    ? { ...field('fullName'), value: team.leaderName, onChange: (_, value) => setTeam('leaderName', value), hint: 'Filled from the Team step. Correct it here if needed.' }
    : { ...field('fullName'), hint: 'As written on the student card.' }

  return (
    <motion.article
      id={memberCardId(member.id)}
      className="axr-member"
      tabIndex={-1}
      aria-labelledby={titleId}
      data-leader={member.isLeader ? '' : undefined}
      data-complete={complete ? '' : undefined}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: .18 } }}
      transition={{ duration: .32, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="axr-member-head">
        <div className="axr-member-title">
          <span className="axr-member-index"><b>{number}</b> / {role}</span>
          <h3 id={titleId} data-empty={name ? undefined : ''}>{name || (member.isLeader ? 'Team leader' : 'New member')}</h3>
        </div>
        <div className="axr-member-meta">
          {member.isLeader && <span className="axr-member-badge">Team leader</span>}
          <span className="axr-member-state" data-complete={complete ? '' : undefined}>
            {complete ? 'Complete ✓' : `${remaining} ${remaining === 1 ? 'field' : 'fields'} remaining`}
          </span>
        </div>
      </header>

      <div className="axr-member-body">
        <div className="af-grid-two">
          <ApplicationField {...nameField} label="Full name" autoComplete={member.isLeader ? 'name' : 'off'} placeholder="First and last name" />
          <ApplicationField {...field('registrationNumber')} label="Student registration number" inputMode="numeric"
            autoComplete="off" placeholder="202133046094" hint="Use the registration number printed on the student card." />
        </div>
        <div className="af-grid-two">
          <ApplicationField {...field('studyLevel')} label="Study level" as="select" options={studyLevels} />
          <ApplicationField {...field('phone')} label="Phone number" type="tel" inputMode="tel"
            autoComplete={member.isLeader ? 'tel' : 'off'} placeholder="+213 5XX XX XX XX" hint="Algerian or international format." />
        </div>
        <StudentCardUpload
          inputId={memberFieldId(member.id, 'studentCard')}
          file={member.studentCard}
          droppedCard={member.droppedCard}
          ownerName={name}
          error={memberError(member.id, 'studentCard')}
          onChange={(file) => {
            setMember(member.id, 'studentCard', file)
            touch(`member.${member.id}.studentCard`)
          }}
        />
      </div>

      {!member.isLeader && (
        <footer className="axr-member-foot" data-confirming={confirming ? '' : undefined}>
          {confirming ? (
            <div className="axr-member-confirm" role="group" aria-label={`Remove member ${number}`}>
              <span>Remove {name || `member ${number}`}? The details entered on this record will be lost.</span>
              <button type="button" className="axr-link-danger" onClick={() => removeMember(member.id)}>Remove</button>
              <button type="button" ref={keepRef} onClick={() => setConfirming(false)}>Keep</button>
            </div>
          ) : (
            <button type="button" className="axr-member-remove"
              onClick={() => (hasContent ? setConfirming(true) : removeMember(member.id))}>
              Remove member
            </button>
          )}
        </footer>
      )}
    </motion.article>
  )
}
