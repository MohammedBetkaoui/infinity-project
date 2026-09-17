import { useEffect, useMemo, useReducer, useRef } from 'react'
import { isApplicationDeliveryConfigured, submitApplication } from '../../../lib/applicationSubmission'
import { OTHER_INSTITUTION_ID, findInstitution, findWilaya } from '../../../data/algeriaHigherEducation'
import {
  FORM_VERSION, SECTIONS, SECTION_ISSUES, STEP, STUDENT_COUNT, STUDENT_FIELDS,
  buildSubmission, createStudents, emptyOfficial, emptyPerson, emptyTeam, studentIssues,
} from './registrationModel'
import { getRegistrationStrings } from './registrationI18n'
import prepareCardUploads from './prepareCardUploads'

const STORAGE_KEY = 'aivex-registration-draft-v3'
const LEGACY_KEYS = ['aivex-registration-draft-v1', 'aivex-registration-draft-v2']
const SECTION_NAMES = Object.keys(SECTIONS)

export const fieldId = (section, field) => `axr-${section}-${field}`
export const studentFieldId = (id, field) => `axr-${id}-${field}`
export const recordId = (key) => `axr-record-${key}`
export const CONSENT_ID = 'axr-consent'

const initialState = () => ({
  step: STEP.institution,
  team: emptyTeam(),
  activityOfficial: emptyOfficial(),
  delegationHead: emptyPerson(),
  driver: emptyPerson(),
  students: createStudents(),
  touched: {},
  attempted: {},
  consent: false,
  website: '',
  status: 'idle',
  result: null,
  focus: null,
  hasDraft: false,
})

const pick = (source, template) => Object.fromEntries(
  Object.keys(template).map((key) => [key, typeof source?.[key] === 'string' ? source[key] : template[key]]),
)

// Files cannot live in sessionStorage: the draft keeps every typed answer and
// remembers which card was attached so the card can ask for it again.
function restore() {
  const base = initialState()
  try {
    LEGACY_KEYS.forEach((key) => window.sessionStorage.removeItem(key))
    const draft = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null')
    if (!draft || !Array.isArray(draft.students) || draft.students.length !== STUDENT_COUNT) return base

    const team = pick(draft.team, emptyTeam())
    // Never keep an institution that does not belong to the saved wilaya.
    if (!findWilaya(team.wilaya)) Object.assign(team, { wilaya: '', institution: '', customInstitution: '' })
    else if (!findInstitution(team.wilaya, team.institution)) Object.assign(team, { institution: '', customInstitution: '' })
    if (team.institution !== OTHER_INSTITUTION_ID) team.customInstitution = ''

    const students = base.students.map((student, index) => ({
      ...student,
      ...pick(draft.students[index], { fullName: '', registrationNumber: '', studyLevel: '', phone: '' }),
      droppedCard: typeof draft.students[index]?.droppedCard === 'string' ? draft.students[index].droppedCard : null,
    }))
    const lostCards = students.some((student) => student.droppedCard)
    return {
      ...base,
      team,
      activityOfficial: pick(draft.activityOfficial, emptyOfficial()),
      delegationHead: pick(draft.delegationHead, emptyPerson()),
      driver: pick(draft.driver, emptyPerson()),
      students,
      step: Math.min(Number(draft.step) || 0, lostCards ? STEP.students : STEP.review),
      hasDraft: true,
    }
  } catch {
    return base
  }
}

const withoutKeys = (touched, keys) => {
  if (!keys.some((key) => key in touched)) return touched
  const next = { ...touched }
  keys.forEach((key) => delete next[key])
  return next
}

const idle = (status) => (status === 'submitting' ? status : 'idle')

function reducer(state, action) {
  switch (action.type) {
    case 'field': {
      const { section, field, value } = action
      const next = { ...state[section], [field]: value }
      let { touched } = state
      if (section === 'team' && field === 'wilaya' && value !== state.team.wilaya) {
        // A new wilaya invalidates the institution chosen for the previous one.
        next.institution = ''
        next.customInstitution = ''
        touched = withoutKeys(touched, ['team.institution', 'team.customInstitution'])
      }
      if (section === 'team' && field === 'institution' && value !== OTHER_INSTITUTION_ID) {
        next.customInstitution = ''
        touched = withoutKeys(touched, ['team.customInstitution'])
      }
      return { ...state, [section]: next, touched, status: idle(state.status) }
    }
    case 'student':
      return {
        ...state,
        status: idle(state.status),
        students: state.students.map((student) => (student.id !== action.id ? student : {
          ...student,
          [action.field]: action.value,
          ...(action.field === 'studentCard' ? { droppedCard: null } : {}),
        })),
      }
    case 'touch':
      return state.touched[action.key] ? state : { ...state, touched: { ...state.touched, [action.key]: true } }
    case 'go':
      return { ...state, step: action.step, focus: action.focus ?? { id: 'axr-step-heading' } }
    case 'attempt':
      return { ...state, attempted: { ...state.attempted, [action.step]: true }, focus: action.focus ?? state.focus }
    case 'focused':
      return { ...state, focus: null }
    case 'consent':
      return { ...state, consent: action.value }
    case 'website':
      return { ...state, website: action.value }
    case 'status':
      return { ...state, status: action.status, result: action.result ?? null }
    case 'reset':
      return { ...initialState(), focus: { id: 'axr-step-heading' } }
    default:
      return state
  }
}

const toUserMessage = (error, L) => {
  if (error?.name === 'AbortError') return L?.errTimeout || 'The request timed out. Your answers are still here — please try again.'
  const raw = typeof error?.message === 'string' ? error.message.trim() : ''
  if (raw && !/(stack trace|supabase|sb_secret|service_role|postgres|password|secret|api[_-]?key|node_modules)/i.test(raw)) return raw.slice(0, 300)
  return L?.errSendFail || 'We could not send the registration. Your answers are still saved in this tab.'
}

const hasText = (record) => Object.values(record).some((value) => typeof value === 'string' && value.trim())

export default function useCompetitionRegistration(lang = 'en') {
  const [state, dispatch] = useReducer(reducer, undefined, restore)
  const submitting = useRef(false)
  const { step, team, activityOfficial, delegationHead, driver, students, touched, attempted, consent, status, focus } = state
  const L = typeof lang === 'string' ? getRegistrationStrings(lang) : (lang || getRegistrationStrings('en'))

  const derived = useMemo(() => {
    const issues = {
      team: SECTION_ISSUES.team(team, L),
      activityOfficial: SECTION_ISSUES.activityOfficial(activityOfficial, L),
      delegationHead: SECTION_ISSUES.delegationHead(delegationHead, L),
      driver: SECTION_ISSUES.driver(driver, L),
    }
    const studentErrors = Object.fromEntries(students.map((student) => [student.id, studentIssues(student, students, L)]))
    const completeCount = students.filter((student) => !Object.keys(studentErrors[student.id]).length).length
    const sectionComplete = Object.fromEntries(SECTION_NAMES.map((name) => [name, !Object.keys(issues[name]).length]))
    return { issues, studentErrors, completeCount, sectionComplete }
  }, [team, activityOfficial, delegationHead, driver, students, L])

  // Persist typed answers (never files); drop the draft once delivered.
  useEffect(() => {
    if (status === 'success') {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return undefined
    }
    const timer = window.setTimeout(() => {
      try {
        const snapshot = {
          step,
          team,
          activityOfficial,
          delegationHead,
          driver,
          students: students.map(({ studentCard, ...student }) => ({ ...student, droppedCard: studentCard?.name || student.droppedCard || null })),
        }
        const hasAnswers = [team, activityOfficial, delegationHead, driver].some(hasText)
          || students.some(({ fullName, registrationNumber, studyLevel, phone, studentCard }) => (
            hasText({ fullName, registrationNumber, studyLevel, phone }) || studentCard
          ))
        if (hasAnswers) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
        else window.sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // Private browsing can refuse storage; the form keeps working in memory.
      }
    }, 320)
    return () => window.clearTimeout(timer)
  }, [status, step, team, activityOfficial, delegationHead, driver, students])

  // Steps swap inside AnimatePresence, so a target can mount a few frames late.
  useEffect(() => {
    if (!focus) return undefined
    let frame
    let tries = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const attemptFocus = () => {
      const node = document.getElementById(focus.id)
      if (!node) {
        if (tries++ < 60) frame = window.requestAnimationFrame(attemptFocus)
        else dispatch({ type: 'focused' })
        return
      }
      node.focus({ preventScroll: true })
      const rect = node.getBoundingClientRect()
      if (focus.scroll || rect.top < 0 || rect.bottom > window.innerHeight) {
        node.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
      }
      dispatch({ type: 'focused' })
    }
    frame = window.requestAnimationFrame(attemptFocus)
    return () => window.cancelAnimationFrame(frame)
  }, [focus])

  // First invalid field of a step, in reading order, or null.
  const firstIssue = (stepIndex) => {
    if (stepIndex === STEP.students) {
      for (const student of students) {
        const field = STUDENT_FIELDS.find((name) => derived.studentErrors[student.id][name])
        if (field) return studentFieldId(student.id, field)
      }
      return null
    }
    for (const section of SECTION_NAMES) {
      if (SECTIONS[section].step !== stepIndex) continue
      const field = SECTIONS[section].fields.find((name) => derived.issues[section][name])
      if (field) return fieldId(section, field)
    }
    return null
  }

  const advance = () => {
    if (step >= STEP.review) return undefined
    const target = firstIssue(step)
    if (target) return dispatch({ type: 'attempt', step, focus: { id: target, scroll: true } })
    return dispatch({ type: 'go', step: step + 1 })
  }

  const submit = async (event) => {
    event?.preventDefault()
    if (step !== STEP.review) return advance()
    for (const stepIndex of [STEP.institution, STEP.delegation, STEP.students]) {
      const target = firstIssue(stepIndex)
      if (target) {
        dispatch({ type: 'attempt', step: stepIndex })
        return dispatch({ type: 'go', step: stepIndex, focus: { id: target, scroll: true } })
      }
    }
    if (!consent) return dispatch({ type: 'attempt', step: STEP.review, focus: { id: CONSENT_ID } })
    if (submitting.current) return undefined

    submitting.current = true
    dispatch({ type: 'status', status: 'submitting' })
    try {
      const { answers, files } = buildSubmission({ team, activityOfficial, delegationHead, driver, students, consent })
      const uploads = await prepareCardUploads(files)
      const [result] = await Promise.all([
        submitApplication('aivex', { ...answers, website: state.website }, { files: uploads, version: FORM_VERSION }),
        new Promise((resolve) => window.setTimeout(resolve, 460)),
      ])
      dispatch({ type: 'status', status: result.delivered ? 'success' : 'draft', result })
      if (result.delivered) dispatch({ type: 'go', step: STEP.review, focus: { id: 'axr-success-heading' } })
    } catch (error) {
      dispatch({ type: 'status', status: 'error', result: { message: toUserMessage(error, L) } })
    } finally {
      submitting.current = false
    }
    return undefined
  }

  const shows = (stepIndex, key) => Boolean(attempted[stepIndex] || touched[key])

  return {
    ...state,
    ...derived,
    langStrings: L,
    endpointConfigured: isApplicationDeliveryConfigured('aivex'),
    fieldError: (section, field) => (
      shows(SECTIONS[section].step, `${section}.${field}`) ? derived.issues[section][field] || '' : ''
    ),
    studentError: (id, field) => (
      shows(STEP.students, `student.${id}.${field}`) ? derived.studentErrors[id]?.[field] || '' : ''
    ),
    consentError: attempted[STEP.review] && !consent ? (L.errConsent || 'Confirm the statement above before submitting.') : '',
    setField: (section, field, value) => dispatch({ type: 'field', section, field, value }),
    setStudent: (id, field, value) => dispatch({ type: 'student', id, field, value }),
    touch: (key) => dispatch({ type: 'touch', key }),
    setConsent: (value) => dispatch({ type: 'consent', value }),
    setWebsite: (value) => dispatch({ type: 'website', value }),
    advance,
    back: () => dispatch({ type: 'go', step: Math.max(0, step - 1) }),
    goTo: (target, focusId) => {
      if (target >= step) return
      dispatch({ type: 'go', step: target, focus: focusId ? { id: focusId, scroll: true } : undefined })
    },
    submit,
    reset: () => dispatch({ type: 'reset' }),
  }
}
