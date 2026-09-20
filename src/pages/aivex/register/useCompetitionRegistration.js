import { useEffect, useMemo, useReducer, useRef } from 'react'
import { isApplicationDeliveryConfigured, submitAivexRegistrationV4 } from '../../../lib/applicationSubmission'
import { OTHER_INSTITUTION_ID, findInstitution, findWilaya } from '../../../data/algeriaHigherEducation'
import {
  IDENTITY_CARD_SUBJECTS, createRegistrationStateV4, identityCardUploadName, isUuidV4, studentCardUploadName,
} from '../../../../shared/aivex/contract-v4.js'
import {
  DRAFT_KEY, LEGACY_DRAFT_KEYS, SECTIONS, SECTION_ISSUES, STEP, STUDENT_COUNT, STUDENT_FIELDS, STUDENT_TEXT_FIELDS,
  buildSubmission, buildSummary, studentIssues,
} from './registrationModel'
import { getRegistrationStrings } from './registrationI18n'
import prepareCardUploads from './prepareCardUploads'

const SECTION_NAMES = Object.keys(SECTIONS)
// Empty records of the v4 contract, used as templates when a draft is read.
const BLANK = createRegistrationStateV4({ submissionId: '' })

export const fieldId = (section, field) => `axr-${section}-${field}`
export const studentFieldId = (id, field) => `axr-${id}-${field}`
export const recordId = (key) => `axr-record-${key}`
export const CONSENT_ID = 'axr-consent'

// createRegistrationStateV4() gives the contract part: a fresh submissionId
// (the idempotency key of this attempt, kept across retries and reloads,
// renewed only by a reset), the team, the delegation and three fixed students.
const initialState = () => ({
  step: STEP.institution,
  ...createRegistrationStateV4(),
  // Which identity card was attached before a reload (a bare yes/no: unlike
  // the student cards, the file name is NOT kept, it is often a person's name).
  droppedIdCards: { delegationHead: false, driver: false },
  touched: {},
  attempted: {},
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
// remembers which card was attached so the form can ask for it again.
function restore() {
  const base = initialState()
  try {
    LEGACY_DRAFT_KEYS.forEach((key) => window.sessionStorage.removeItem(key))
    const draft = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || 'null')
    if (!draft || !Array.isArray(draft.students) || draft.students.length !== STUDENT_COUNT) return base

    const team = pick(draft.team, BLANK.team)
    // Never keep an institution that does not belong to the saved wilaya.
    if (!findWilaya(team.wilaya)) Object.assign(team, { wilaya: '', institution: '', customInstitution: '' })
    else if (!findInstitution(team.wilaya, team.institution)) Object.assign(team, { institution: '', customInstitution: '' })
    if (team.institution !== OTHER_INSTITUTION_ID) team.customInstitution = ''

    const studentText = Object.fromEntries(STUDENT_TEXT_FIELDS.map((field) => [field, '']))
    const students = base.students.map((student, index) => ({
      ...student,
      ...pick(draft.students[index], studentText),
      droppedCard: typeof draft.students[index]?.droppedCard === 'string' ? draft.students[index].droppedCard : null,
    }))
    const lostCards = students.some((student) => student.droppedCard)
    const droppedIdCards = Object.fromEntries(IDENTITY_CARD_SUBJECTS.map((subject) => [subject, draft.droppedIdCards?.[subject] === true]))
    const lostIdCards = Object.values(droppedIdCards).some(Boolean)
    // The earliest step that has a file to attach again is where the form reopens.
    const lastStep = lostIdCards ? STEP.delegation : lostCards ? STEP.students : STEP.review
    return {
      ...base,
      // Same attempt after a reload: it keeps its idempotency key.
      ...(isUuidV4(draft.submissionId) ? { submissionId: draft.submissionId } : {}),
      team,
      activityOfficial: pick(draft.activityOfficial, BLANK.activityOfficial),
      // pick() keeps text only: idCard stays null (a file never enters a draft).
      delegationHead: pick(draft.delegationHead, BLANK.delegationHead),
      driver: pick(draft.driver, BLANK.driver),
      droppedIdCards,
      students,
      step: Math.min(Number(draft.step) || 0, lastStep),
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
    // The identity card image of the head of delegation / the driver (a File
    // or null). Attaching one also settles the "was not kept" reminder.
    case 'identityCard':
      return {
        ...state,
        status: idle(state.status),
        [action.subject]: { ...state[action.subject], idCard: action.file },
        droppedIdCards: { ...state.droppedIdCards, [action.subject]: false },
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
  if (raw && !/(stack trace|supabase|sb_secret|service_role|postgres|password|secret|api[_-]?key|node_modules|edition-\d+\/)/i.test(raw)) return raw.slice(0, 300)
  return L?.errSendFail || 'We could not send the registration. Your answers are still saved in this tab.'
}

const hasText = (record) => Object.values(record).some((value) => typeof value === 'string' && value.trim())
const studentText = (student) => Object.fromEntries(STUDENT_TEXT_FIELDS.map((field) => [field, student[field]]))
// A person of the delegation as the draft keeps it: typed answers only, never the identity card file.
const personText = (person) => ({ fullName: person.fullName, phone: person.phone, rfid: person.rfid })

// Canonical v4 payload carrying the attempt's submissionId, plus the five
// image files (three student cards, two identity cards). Each part is named
// after its field and final type (prepareCardUploads may re-encode a large
// photo as JPEG) — never after the applicant's own file name.
async function deliver(state) {
  const { payload, files } = buildSubmission(state)
  const uploads = await prepareCardUploads(files)
  return submitAivexRegistrationV4({
    payload,
    files: uploads.map(({ field, position, file }) => ({
      field,
      file,
      filename: position ? studentCardUploadName(position, file.type) : identityCardUploadName(field, file.type),
    })),
    website: state.website,
  })
}

export default function useCompetitionRegistration(lang = 'en') {
  const [state, dispatch] = useReducer(reducer, undefined, restore)
  const submitting = useRef(false)
  const {
    step, submissionId, team, activityOfficial, delegationHead, driver, droppedIdCards, students, touched, attempted, consent, status, focus,
  } = state
  const L = typeof lang === 'string' ? getRegistrationStrings(lang) : (lang || getRegistrationStrings('en'))

  const derived = useMemo(() => {
    const issues = {
      team: SECTION_ISSUES.team(team, L),
      activityOfficial: SECTION_ISSUES.activityOfficial(activityOfficial, L),
      delegationHead: SECTION_ISSUES.delegationHead(delegationHead, L),
      driver: SECTION_ISSUES.driver(driver, L),
      identityDocuments: SECTION_ISSUES.identityDocuments({ delegationHead: delegationHead.idCard, driver: driver.idCard }, L),
    }
    const studentErrors = Object.fromEntries(students.map((student) => [student.id, studentIssues(student, students, L)]))
    const completeCount = students.filter((student) => !Object.keys(studentErrors[student.id]).length).length
    const sectionComplete = Object.fromEntries(SECTION_NAMES.map((name) => [name, !Object.keys(issues[name]).length]))
    return { issues, studentErrors, completeCount, sectionComplete }
  }, [team, activityOfficial, delegationHead, driver, students, L])

  // Persist typed answers (never files); drop the draft once delivered.
  useEffect(() => {
    if (status === 'success') {
      window.sessionStorage.removeItem(DRAFT_KEY)
      return undefined
    }
    const timer = window.setTimeout(() => {
      try {
        const snapshot = {
          step,
          submissionId,
          team,
          activityOfficial,
          delegationHead: personText(delegationHead),
          driver: personText(driver),
          // Only WHETHER a card was attached: so the form can ask for it again after a reload.
          droppedIdCards: {
            delegationHead: Boolean(delegationHead.idCard) || droppedIdCards.delegationHead,
            driver: Boolean(driver.idCard) || droppedIdCards.driver,
          },
          students: students.map(({ studentCard, ...student }) => ({ ...student, droppedCard: studentCard?.name || student.droppedCard || null })),
        }
        const hasAnswers = [team, activityOfficial, delegationHead, driver].some(hasText)
          || Boolean(delegationHead.idCard || driver.idCard)
          || students.some((student) => hasText(studentText(student)) || student.studentCard)
        if (hasAnswers) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot))
        else window.sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // Private browsing can refuse storage; the form keeps working in memory.
      }
    }, 320)
    return () => window.clearTimeout(timer)
  }, [status, step, submissionId, team, activityOfficial, delegationHead, driver, droppedIdCards, students])

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
    // A missing or invalid card (three are required) sends the user back to it.
    for (const stepIndex of [STEP.institution, STEP.delegation, STEP.students]) {
      const target = firstIssue(stepIndex)
      if (target) {
        dispatch({ type: 'attempt', step: stepIndex })
        return dispatch({ type: 'go', step: stepIndex, focus: { id: target, scroll: true } })
      }
    }
    if (!consent) return dispatch({ type: 'attempt', step: STEP.review, focus: { id: CONSENT_ID } })
    // One request at a time: the button is disabled too, this also covers a double submit.
    if (submitting.current) return undefined

    submitting.current = true
    dispatch({ type: 'status', status: 'submitting' })
    try {
      const [result] = await Promise.all([
        deliver(state),
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
    summary: () => buildSummary(state),
    fieldError: (section, field) => (
      shows(SECTIONS[section].step, `${section}.${field}`) ? derived.issues[section][field] || '' : ''
    ),
    studentError: (id, field) => (
      shows(STEP.students, `student.${id}.${field}`) ? derived.studentErrors[id]?.[field] || '' : ''
    ),
    consentError: attempted[STEP.review] && !consent ? (L.errConsent || 'Confirm the statement above before submitting.') : '',
    setField: (section, field, value) => dispatch({ type: 'field', section, field, value }),
    setStudent: (id, field, value) => dispatch({ type: 'student', id, field, value }),
    setIdentityCard: (subject, file) => dispatch({ type: 'identityCard', subject, file }),
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
