import ApplicationField from '../../../components/forms/ApplicationField'
import { sectionFieldProps } from './fieldProps'
import RecordCard from './RecordCard'
import StepHeading from './StepHeading'
import { recordId } from './useCompetitionRegistration'

const people = [
  { section: 'delegationHead', index: '01', role: 'Head of delegation' },
  { section: 'driver', index: '02', role: 'Driver' },
]

export default function DelegationStep({ registration, reduced }) {
  const field = (section, name) => sectionFieldProps(registration, section, name)

  return (
    <>
      <StepHeading kicker="Delegation" title="Who travels with the team?">
        The head of delegation and the driver accompany the three students. Their details are used for access and logistics only.
      </StepHeading>
      <div className="axr-records">
        {people.map(({ section, index, role }, order) => (
          <RecordCard key={section} id={recordId(section)} index={index} role={role} order={order} reduced={reduced}
            name={registration[section].fullName.trim()} placeholder={role}
            remaining={Object.keys(registration.issues[section]).length}>
            <ApplicationField {...field(section, 'fullName')} label="Full name" placeholder="As written on the national ID card" autoComplete="off" />
            <div className="af-grid-two">
              <ApplicationField {...field(section, 'phone')} label="Phone number" type="tel" inputMode="tel"
                autoComplete="off" placeholder="+213 5XX XX XX XX" hint="Algerian or international format." />
              <ApplicationField {...field(section, 'nationalId')} label="National ID number" autoComplete="off"
                spellCheck={false} placeholder="As printed on the ID card" hint="Kept exactly as written, leading zeros included." />
            </div>
          </RecordCard>
        ))}
      </div>
    </>
  )
}
