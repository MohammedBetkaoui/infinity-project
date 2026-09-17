import ApplicationField from '../../../components/forms/ApplicationField'
import { studentFieldProps } from './fieldProps'
import RecordCard from './RecordCard'
import { STUDENT_COUNT, studyLevels } from './registrationModel'
import StepHeading from './StepHeading'
import StudentCardUpload from './StudentCardUpload'
import { recordId, studentFieldId } from './useCompetitionRegistration'

function StudentsReadout({ complete }) {
  const done = complete === STUDENT_COUNT
  let label = `${STUDENT_COUNT} participants required`
  if (complete > 0) label = done ? `${STUDENT_COUNT} / ${STUDENT_COUNT} students complete ✓` : `${complete} / ${STUDENT_COUNT} students complete`
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

export default function StudentsStep({ registration, reduced }) {
  const { students, completeCount, studentErrors, studentError, setStudent, touch } = registration

  return (
    <>
      <StepHeading kicker="Participants" title="Who will compete?" aside={<StudentsReadout complete={completeCount} />}>
        Every AIVEX team competes with exactly three students. Complete each record and attach each student card.
      </StepHeading>
      <p className="axr-roster-rule"><i aria-hidden="true" />{STUDENT_COUNT} participants required · Every field is mandatory</p>

      <div className="axr-records">
        {students.map((student, order) => {
          const number = String(student.position).padStart(2, '0')
          const field = (name) => studentFieldProps(registration, student, name)
          return (
            <RecordCard key={student.id} id={recordId(student.id)} index={number} role="Student" order={order} reduced={reduced}
              name={student.fullName.trim()} placeholder={`Student ${number}`}
              remaining={Object.keys(studentErrors[student.id]).length}>
              <div className="af-grid-two">
                <ApplicationField {...field('fullName')} label="Full name" autoComplete="off" placeholder="As written on the student card" />
                <ApplicationField {...field('registrationNumber')} label="Student registration number" inputMode="numeric"
                  autoComplete="off" placeholder="202133046094" hint="Use the registration number printed on the student card." />
              </div>
              <div className="af-grid-two">
                <ApplicationField {...field('studyLevel')} label="Study level" as="select" options={studyLevels} />
                <ApplicationField {...field('phone')} label="Phone number" type="tel" inputMode="tel"
                  autoComplete="off" placeholder="+213 5XX XX XX XX" hint="Algerian or international format." />
              </div>
              <StudentCardUpload
                inputId={studentFieldId(student.id, 'studentCard')}
                file={student.studentCard}
                droppedCard={student.droppedCard}
                ownerName={student.fullName.trim() || `student ${number}`}
                error={studentError(student.id, 'studentCard')}
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
