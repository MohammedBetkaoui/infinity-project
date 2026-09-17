import ApplicationField from '../../../components/forms/ApplicationField'
import { sectionFieldProps } from './fieldProps'
import RecordCard from './RecordCard'
import StepHeading from './StepHeading'
import { recordId } from './useCompetitionRegistration'

export default function DelegationStep({ registration, reduced, t }) {
  const field = (section, name) => sectionFieldProps(registration, section, name)
  const people = [
    { section: 'delegationHead', index: '01', role: t.headRole },
    { section: 'driver', index: '02', role: t.driverRole },
  ]

  return (
    <>
      <StepHeading kicker={t.delKicker} title={t.delTitle}>
        {t.delDesc}
      </StepHeading>
      <div className="axr-records">
        {people.map(({ section, index, role }, order) => (
          <RecordCard key={section} id={recordId(section)} index={index} role={role} order={order} reduced={reduced}
            name={registration[section].fullName.trim()} placeholder={role} t={t}
            remaining={Object.keys(registration.issues[section]).length}>
            <ApplicationField {...field(section, 'fullName')} label={t.fullNameLabel} placeholder={t.delegationNamePlaceholder} autoComplete="off" />
            <div className="af-grid-two">
              <ApplicationField {...field(section, 'phone')} label={t.phoneLabel} type="tel" inputMode="tel"
                autoComplete="off" placeholder={t.phonePlaceholder} hint={t.phoneHint} />
              <ApplicationField {...field(section, 'nationalId')} label={t.nationalIdLabel} autoComplete="off"
                spellCheck={false} placeholder={t.nationalIdPlaceholder} hint={t.nationalIdHint} />
            </div>
          </RecordCard>
        ))}
      </div>
    </>
  )
}
