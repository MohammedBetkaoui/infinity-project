import { AnimatePresence, motion } from 'framer-motion'
import ApplicationField from '../../../components/forms/ApplicationField'
import {
  OTHER_INSTITUTION_ID, algerianWilayas, findWilaya, getInstitutionsByWilaya,
} from '../../../data/algeriaHigherEducation'
import { sectionFieldProps } from './fieldProps'
import FormSection from './FormSection'
import { activityRoles } from './registrationModel'
import StepHeading from './StepHeading'

const wilayaOptions = [
  { value: '', label: 'Select wilaya' },
  ...algerianWilayas.map((wilaya) => ({ value: wilaya.code, label: `${wilaya.code} — ${wilaya.name}` })),
]

export default function InstitutionStep({ registration, reduced }) {
  const { team } = registration
  const field = (section, name) => sectionFieldProps(registration, section, name)
  const wilaya = findWilaya(team.wilaya)
  const listed = wilaya?.institutions.length ?? 0
  const institutionOptions = [
    { value: '', label: wilaya ? 'Select institution' : 'Select a wilaya first' },
    ...getInstitutionsByWilaya(team.wilaya).map((institution) => ({ value: institution.id, label: institution.name })),
  ]
  let institutionHint = 'Available once a wilaya is selected.'
  if (wilaya) {
    institutionHint = listed
      ? 'Not in the list? Choose “Other / Institution not listed”.'
      : 'No public institution is listed for this wilaya. Choose “Other” and type its name.'
  }

  return (
    <>
      <StepHeading kicker="Institution signal" title="Register your team.">
        Name the team, its institution and the university contact who follows student activities.
      </StepHeading>
      <div className="axr-sections">
        <FormSection index="01" title="Team">
          <ApplicationField {...field('team', 'name')} label="Team name" placeholder="e.g. Null Pointers" autoComplete="off" />
        </FormSection>

        <FormSection index="02" title="Institution">
          <div className="af-grid-two">
            <ApplicationField {...field('team', 'wilaya')} label="Wilaya" as="select" options={wilayaOptions} />
            <ApplicationField {...field('team', 'institution')} label="University / Higher Education Institution" as="select"
              options={institutionOptions} disabled={!wilaya} hint={institutionHint} />
          </div>
          <AnimatePresence initial={false}>
            {team.institution === OTHER_INSTITUTION_ID && (
              <motion.div key="custom-institution" className="axr-reveal"
                initial={reduced ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
                transition={{ duration: .24, ease: [0.16, 1, 0.3, 1] }}>
                <ApplicationField {...field('team', 'customInstitution')} label="Institution name"
                  placeholder="École Nationale Supérieure d’Informatique" autoComplete="organization"
                  hint="The official name of the school, institute or university." />
              </motion.div>
            )}
          </AnimatePresence>
          <p className="sr-only" aria-live="polite">
            {wilaya ? `${listed} ${listed === 1 ? 'institution' : 'institutions'} listed for ${wilaya.name}, plus Other.` : ''}
          </p>
        </FormSection>

        <FormSection index="03" title="Activity administration contact"
          note="The Sub-director of Activities or the Activities Officer who follows this team for the institution.">
          <div className="af-grid-two">
            <ApplicationField {...field('activityOfficial', 'role')} label="Role" as="select" options={activityRoles} />
            <ApplicationField {...field('activityOfficial', 'fullName')} label="Full name" placeholder="First and last name" autoComplete="off" />
          </div>
          <div className="af-grid-two">
            <ApplicationField {...field('activityOfficial', 'email')} label="Email" type="email" inputMode="email"
              autoComplete="off" placeholder="activities@univ.dz" hint="AIVEX updates are sent here." />
            <ApplicationField {...field('activityOfficial', 'phone')} label="Phone number" type="tel" inputMode="tel"
              autoComplete="off" placeholder="+213 5XX XX XX XX" hint="Algerian or international format." />
          </div>
        </FormSection>
      </div>
    </>
  )
}
