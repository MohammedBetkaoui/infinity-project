import { AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { MIN_MEMBERS } from './registrationModel'
import MemberCard from './MemberCard'
import StepHeading from './StepHeading'
import { ADD_MEMBER_ID } from './useCompetitionRegistration'

function RosterReadout({ count, complete }) {
  const slots = Math.max(MIN_MEMBERS, count)
  let label = `${count} / ${MIN_MEMBERS} minimum`
  if (count >= MIN_MEMBERS) {
    label = complete >= MIN_MEMBERS
      ? `${count} members · Minimum reached ✓`
      : `${count} members · ${complete} of ${count} complete`
  }
  return (
    <div className="axr-roster" data-reached={complete >= MIN_MEMBERS ? '' : undefined}>
      <span className="axr-roster-label" aria-live="polite">{label}</span>
      <span className="axr-roster-slots" aria-hidden="true">
        {Array.from({ length: slots }, (_, index) => (
          <i key={index} data-state={index < complete ? 'complete' : index < count ? 'present' : 'empty'} data-min={index === MIN_MEMBERS - 1 ? '' : undefined} />
        ))}
      </span>
    </div>
  )
}

export default function MembersStep({ registration, reduced }) {
  const { members, completeCount, addMember, rosterError } = registration

  return (
    <>
      <StepHeading
        kicker="Team roster"
        title="Who is on the team?"
        aside={<RosterReadout count={members.length} complete={completeCount} />}
      >
        Add and verify the students who will participate in AIVEX.
      </StepHeading>
      <p className="axr-roster-rule"><i aria-hidden="true" />Minimum {MIN_MEMBERS} students · Team leader included</p>

      <div className="axr-members">
        <AnimatePresence initial={false}>
          {members.map((member, index) => (
            <MemberCard key={member.id} member={member} index={index} registration={registration} reduced={reduced} />
          ))}
        </AnimatePresence>
      </div>

      <div className="axr-roster-add" data-invalid={rosterError ? '' : undefined}>
        <button id={ADD_MEMBER_ID} type="button" className="af-button af-button-secondary axr-add-member"
          onClick={addMember} aria-describedby={rosterError ? `${ADD_MEMBER_ID}-error` : undefined}>
          <Plus size={14} strokeWidth={1.8} aria-hidden="true" /> Add team member
        </button>
        <span className="axr-roster-next" aria-hidden="true">Next record · {String(members.length + 1).padStart(2, '0')} / Member</span>
      </div>
      {rosterError && <p id={`${ADD_MEMBER_ID}-error`} className="af-error axr-roster-error" role="alert">{rosterError}</p>}
    </>
  )
}
