import { AnimatePresence, motion } from 'framer-motion'
import ApplicationField from '../../../components/forms/ApplicationField'
import {
  OTHER_INSTITUTION_ID, algerianWilayas, findWilaya, getInstitutionsByWilaya,
  institutionDisplayName, wilayaDisplayName,
} from '../../../data/algeriaHigherEducation'
import { sectionFieldProps } from './fieldProps'
import FormSection from './FormSection'
import { getRoleOptions } from './registrationI18n'
import StepHeading from './StepHeading'

export default function InstitutionStep({ registration, reduced, t, lang }) {
  const { team } = registration
  const field = (section, name) => sectionFieldProps(registration, section, name)
  const wilaya = findWilaya(team.wilaya)
  const listed = wilaya?.institutions.length ?? 0
  const wilayaOptions = [
    { value: '', label: t.selectWilaya },
    ...algerianWilayas.map((item) => ({ value: item.code, label: `${item.code} — ${wilayaDisplayName(item, lang)}` })),
  ]
  const institutionOptions = [
    { value: '', label: wilaya ? t.selectInstitution : t.selectWilayaFirst },
    ...getInstitutionsByWilaya(team.wilaya).map((institution) => ({
      value: institution.id,
      label: institution.id === OTHER_INSTITUTION_ID
        ? t.otherInstitution
        : institutionDisplayName(institution, lang),
    })),
  ]
  const activityRoles = getRoleOptions(t)
  let institutionHint = t.hintNoWilaya
  if (wilaya) {
    institutionHint = listed ? t.hintOther : t.hintNoInstitution
  }

  return (
    <>
      <StepHeading kicker={t.instKicker} title={t.instTitle}>
        {t.instDesc}
      </StepHeading>
      <div className="axr-sections">
        <FormSection index="01" title={t.teamSection}>
          <ApplicationField {...field('team', 'name')} label={t.teamNameLabel} placeholder={t.teamNamePlaceholder} autoComplete="off" />
        </FormSection>

        <FormSection index="02" title={t.institutionSection}>
          <div className="af-grid-two">
            <ApplicationField {...field('team', 'wilaya')} label={t.wilayaLabel} as="select" options={wilayaOptions} />
            <ApplicationField {...field('team', 'institution')} label={t.institutionFieldLabel} as="select"
              options={institutionOptions} disabled={!wilaya} hint={institutionHint} />
          </div>
          <AnimatePresence initial={false}>
            {team.institution === OTHER_INSTITUTION_ID && (
              <motion.div key="custom-institution" className="axr-reveal"
                initial={reduced ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
                transition={{ duration: .24, ease: [0.16, 1, 0.3, 1] }}>
                <ApplicationField {...field('team', 'customInstitution')} label={t.customLabel}
                  placeholder={t.customPlaceholder} autoComplete="organization"
                  hint={t.customHint} />
              </motion.div>
            )}
          </AnimatePresence>
          <p className="sr-only" aria-live="polite">
            {wilaya ? t.listedCount({ count: listed, name: wilayaDisplayName(wilaya, lang) }) : ''}
          </p>
        </FormSection>

        <FormSection index="03" title={t.contactSection}
          note={t.contactNote}>
          <div className="af-grid-two">
            <ApplicationField {...field('activityOfficial', 'role')} label={t.roleLabel} as="select" options={activityRoles} />
            <ApplicationField {...field('activityOfficial', 'fullName')} label={t.fullNameLabel} placeholder={t.fullNamePlaceholder} autoComplete="off" />
          </div>
          <div className="af-grid-two">
            <ApplicationField {...field('activityOfficial', 'email')} label={t.emailLabel} type="email" inputMode="email"
              autoComplete="off" placeholder={t.emailPlaceholder} hint={t.emailHint} />
            <ApplicationField {...field('activityOfficial', 'phone')} label={t.phoneLabel} type="tel" inputMode="tel"
              autoComplete="off" placeholder={t.phonePlaceholder} hint={t.phoneHint} />
          </div>
        </FormSection>
      </div>
    </>
  )
}
