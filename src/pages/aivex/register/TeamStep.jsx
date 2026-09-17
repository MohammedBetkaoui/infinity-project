import ApplicationField from '../../../components/forms/ApplicationField'
import StepHeading from './StepHeading'

export default function TeamStep({ registration }) {
  const { team, setTeam, touch, teamError } = registration
  const field = (name) => ({
    formId: 'axr-team',
    name,
    value: team[name],
    error: teamError(name),
    onChange: (_, value) => setTeam(name, value),
    onBlur: () => touch(`team.${name}`),
  })

  return (
    <>
      <StepHeading kicker="Team signal" title="Register your team.">
        Start with the team identity and main contact. Member details are added in the next step.
      </StepHeading>
      <div className="af-fields">
        <div className="af-grid-two">
          <ApplicationField {...field('name')} label="Team name" placeholder="e.g. Null Pointers" autoComplete="off" />
          <ApplicationField {...field('university')} label="University / Institution" placeholder="University of Bordj Bou Arréridj" autoComplete="organization" />
        </div>
        <div className="af-grid-two">
          <ApplicationField {...field('leaderName')} label="Team leader — Full name" placeholder="As written on the student card"
            autoComplete="name" hint="The leader is also member 01 of the team." />
          <ApplicationField {...field('email')} label="Team email" type="email" inputMode="email" autoComplete="email"
            placeholder="team@example.com" hint="Every AIVEX update is sent here." />
        </div>
      </div>
    </>
  )
}
