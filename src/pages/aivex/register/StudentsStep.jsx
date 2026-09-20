import ApplicationField from '../../../components/forms/ApplicationField'
import { studentFieldProps } from './fieldProps'
import RecordCard from './RecordCard'
import { STUDENT_COUNT, bacYearChoices } from './registrationModel'
import { getBacYearOptions } from './registrationI18n'
import StepHeading from './StepHeading'
import StudentCardUpload from './StudentCardUpload'
import { recordId, studentFieldId } from './useCompetitionRegistration'

function StudentsReadout({ complete, t }) {
  const done = complete === STUDENT_COUNT
  let label = t.requiredLabel({ total: STUDENT_COUNT })
  if (complete > 0) label = done ? t.progressDone({ total: STUDENT_COUNT }) : t.progressPartial({ complete, total: STUDENT_COUNT })
  return (
    <div className="axr-roster" data-reached={done ? '' : undefined}>
      <span className="axr-roster-label" aria-live="polite">{label}</span>
      <span className="axr-roster-slots" aria-hidden="true">
        {Array.from({ length: STUDENT_COUNT }, (_, index) => (
          <i key={index} data-state={index < complete ? 'complete' : 'empty'} />
        ))}
      </span>
    </div>
  )
}

export default function StudentsStep({ registration, reduced, t }) {
  const { students, completeCount, studentErrors, studentError, setStudent, touch } = registration
  const bacYears = getBacYearOptions(t, bacYearChoices())

  return (
    <>
      <StepHeading kicker={t.stuKicker} title={t.stuTitle} aside={<StudentsReadout complete={completeCount} t={t} />}>
        {t.stuDesc}
      </StepHeading>
      <p className="axr-roster-rule"><i aria-hidden="true" />{t.rosterRule({ total: STUDENT_COUNT })}</p>

      <div className="axr-records">
        {students.map((student, order) => {
          const number = String(student.position).padStart(2, '0')
          const field = (name) => studentFieldProps(registration, student, name)
          return (
            <RecordCard key={student.id} id={recordId(student.id)} index={number} role={t.studentRole} order={order} reduced={reduced}
              name={student.fullName.trim()} placeholder={t.studentPlaceholder({ number })} t={t}
              remaining={Object.keys(studentErrors[student.id]).length}>
              <div className="af-grid-two">
                <ApplicationField {...field('fullName')} label={t.fullNameLabel} autoComplete="off" placeholder={t.studentNamePlaceholder} />
                <ApplicationField {...field('phone')} label={t.phoneLabel} type="tel" inputMode="tel"
                  autoComplete="off" placeholder={t.phonePlaceholder} hint={t.phoneHint} />
              </div>
              <div className="af-grid-two">
                <ApplicationField {...field('bacYear')} label={t.bacYearLabel} as="select" options={bacYears} hint={t.bacYearHint} />
                {/* Digits only, but never type="number" (it would drop the leading zeros) and no maxLength
                    (a pasted value must fail visibly, not be silently cut to 8 characters). */}
                <ApplicationField {...field('rfid')} label={t.rfidLabel} inputMode="numeric" autoComplete="off" spellCheck={false}
                  hint={t.studentRfidHint} />
              </div>
              <StudentCardUpload
                studentLabel={t.studentPlaceholder({ number })}
                inputId={studentFieldId(student.id, 'studentCard')}
                file={student.studentCard}
                droppedCard={student.droppedCard}
                ownerName={student.fullName.trim() || t.studentPlaceholder({ number })}
                error={studentError(student.id, 'studentCard')}
                t={t}
                onChange={(file) => {
                  setStudent(student.id, 'studentCard', file)
                  touch(`student.${student.id}.studentCard`)
                }}
              />
            </RecordCard>
          )
        })}
      </div>
    </>
  )
}
