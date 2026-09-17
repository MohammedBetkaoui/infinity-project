import { useEffect, useMemo, useReducer, useRef } from 'react'
import { isApplicationDeliveryConfigured, submitApplication } from '../../../lib/applicationSubmission'
import {
  LEADER_ID, MIN_MEMBERS, STEP, TEAM_FIELDS, MEMBER_FIELDS,
  buildSubmission, createMember, emptyTeam, isMemberComplete, memberIssues, rosterIssue, teamIssues,
} from './registrationModel'

const STORAGE_KEY = 'aivex-registration-draft-v2'
const LEGACY_KEYS = ['aivex-registration-draft-v1']

export const teamFieldId = (field) => `axr-team-${field}`
export const memberFieldId = (id, field) => `axr-m-${id}-${field}`
export const memberCardId = (id) => `axr-member-${id}`
export const ADD_MEMBER_ID = 'axr-add-member'
export const CONSENT_ID = 'axr-consent'

const initialState = () => ({
  step: STEP.team,
  team: { ...emptyTeam },
  members: [createMember(true)],
  touched: {},
  attempted: {},
  checkedMembers: {},
  consent: false,
  website: '',
  status: 'idle',
  result: null,
  focus: null,
  hasDraft: false,
})

// Files cannot live in sessionStorage: the draft keeps every typed answer and
// remembers which card was attached so the card can ask for it again.
function restore() {
  const base = initialState()
  try {
    LEGACY_KEYS.forEach((key) => window.sessionStorage.removeItem(key))
    const draft = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null')
    if (!draft?.team || !Array.isArray(draft.members) || !draft.members.length) return base
    const members = draft.members.map((member) => ({ ...createMember(member.isLeader), ...member, studentCard: null }))
    if (!members[0]?.isLeader) return base
    const lostCards = members.some((member) => member.droppedCard)
    return {
      ...base,
      team: { ...emptyTeam, ...draft.team },
      members,
      step: Math.min(draft.step || 0, lostCards ? STEP.members : STEP.review),
      hasDraft: true,
    }
  } catch {
    return base
  }
}

const clearIssue = (touched, key) => {
  if (!(key in touched)) return touched
  const next = { ...touched }
  delete next[key]
  return next
}

function reducer(state, action) {
  switch (action.type) {
    case 'team':
      return { ...state, team: { ...state.team, [action.field]: action.value }, status: state.status === 'submitting' ? state.status : 'idle' }
    case 'member':
      return {
        ...state,
        status: state.status === 'submitting' ? state.status : 'idle',
        members: state.members.map((member) => (member.id !== action.id ? member : {
          ...member,
          [action.field]: action.value,
          ...(action.field === 'studentCard' ? { droppedCard: null } : {}),
        })),
      }
    case 'touch':
      return state.touched[action.key] ? state : { ...state, touched: { ...state.touched, [action.key]: true } }
    case 'add': {
      const member = createMember(false)
      return { ...state, members: [...state.members, member], focus: { id: memberFieldId(member.id, 'fullName'), scroll: true } }
    }
    case 'remove': {
      const index = state.members.findIndex((member) => member.id === action.id)
      if (index < 1) return state
      const members = state.members.filter((member) => member.id !== action.id)
      const neighbour = members[Math.min(index, members.length - 1)]
      let touched = state.touched
      MEMBER_FIELDS.forEach((field) => { touched = clearIssue(touched, `member.${action.id}.${field}`) })
      return { ...state, members, touched, focus: { id: index < members.length ? memberCardId(neighbour.id) : ADD_MEMBER_ID } }
    }
    case 'go':
      return { ...state, step: action.step, focus: action.focus ?? { id: 'axr-step-heading' } }
    case 'attempt': {
      // A failed Continue reveals errors on the records that existed then;
      // a record added afterwards starts clean.
      const checkedMembers = action.step === STEP.members
        ? { ...state.checkedMembers, ...Object.fromEntries(state.members.map((member) => [member.id, true])) }
        : state.checkedMembers
      return { ...state, attempted: { ...state.attempted, [action.step]: true }, checkedMembers, focus: action.focus ?? state.focus }
    }
    case 'focused':
      return { ...state, focus: null }
    case 'consent':
      return { ...state, consent: action.value }
    case 'website':
      return { ...state, website: action.value }
    case 'status':
      return { ...state, status: action.status, result: action.result ?? null, step: action.status === 'success' ? STEP.review : state.step }
    case 'reset':
      return { ...initialState(), focus: { id: 'axr-step-heading' } }
    default:
      return state
  }
}

const toUserMessage = (error) => {
  if (error?.name === 'AbortError') return 'The request timed out. Your answers are still here — please try again.'
  const raw = typeof error?.message === 'string' ? error.message.trim() : ''
  if (raw && !/(stack trace|supabase|sb_secret|service_role|postgres|password|secret|api[_-]?key|node_modules)/i.test(raw)) return raw.slice(0, 300)
  return 'We could not send the registration. Your answers are still saved in this tab.'
}

export default function useCompetitionRegistration() {
  const [state, dispatch] = useReducer(reducer, undefined, restore)
  const submitting = useRef(false)
  const { step, team, members, touched, attempted, consent, status, focus } = state

  const derived = useMemo(() => {
    const teamErrors = teamIssues(team)
    const memberErrors = Object.fromEntries(members.map((member) => [member.id, memberIssues(member, team)]))
    const completeCount = members.filter((member) => isMemberComplete(member, team)).length
    return {
      teamErrors,
      memberErrors,
      completeCount,
      roster: rosterIssue(members),
      teamValid: Object.keys(teamErrors).length === 0,
      membersValid: members.length >= MIN_MEMBERS && completeCount === members.length,
    }
  }, [team, members])

  // Persist typed answers; drop the draft once the registration is delivered.
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
          members: members.map(({ studentCard, ...member }) => ({ ...member, droppedCard: studentCard?.name || member.droppedCard || null })),
        }
        const hasAnswers = Object.values(team).some((value) => String(value).trim())
          || members.length > 1
          || members.some((member) => member.registrationNumber || member.studyLevel || member.phone || member.studentCard)
        if (hasAnswers) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
        else window.sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // Private browsing can refuse storage; the form keeps working in memory.
      }
    }, 320)
    return () => window.clearTimeout(timer)
  }, [status, step, team, members])

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

  const firstMemberIssue = () => {
    for (const member of members) {
      const issues = derived.memberErrors[member.id]
      const field = MEMBER_FIELDS.find((name) => issues[name])
      if (field) return memberFieldId(member.id, field)
    }
    return null
  }

  const advance = () => {
    if (step === STEP.team) {
      const field = TEAM_FIELDS.find((name) => derived.teamErrors[name])
      if (field) return dispatch({ type: 'attempt', step: STEP.team, focus: { id: teamFieldId(field) } })
      return dispatch({ type: 'go', step: STEP.members })
    }
    if (step === STEP.members) {
      const target = firstMemberIssue() || (derived.roster ? ADD_MEMBER_ID : null)
      if (target) return dispatch({ type: 'attempt', step: STEP.members, focus: { id: target, scroll: true } })
      return dispatch({ type: 'go', step: STEP.review })
    }
    return undefined
  }

  const submit = async (event) => {
    event?.preventDefault()
    if (step !== STEP.review) return advance()
    if (!derived.teamValid) {
      dispatch({ type: 'attempt', step: STEP.team })
      return dispatch({ type: 'go', step: STEP.team, focus: { id: teamFieldId(TEAM_FIELDS.find((name) => derived.teamErrors[name])) } })
    }
    if (!derived.membersValid) {
      dispatch({ type: 'attempt', step: STEP.members })
      return dispatch({ type: 'go', step: STEP.members, focus: { id: firstMemberIssue() || ADD_MEMBER_ID, scroll: true } })
    }
    if (!consent) return dispatch({ type: 'attempt', step: STEP.review, focus: { id: CONSENT_ID } })
    if (submitting.current) return undefined

    submitting.current = true
    dispatch({ type: 'status', status: 'submitting' })
    try {
      const { answers, files } = buildSubmission({ team, members })
      const [result] = await Promise.all([
        submitApplication('aivex', { ...answers, website: state.website }, { files, version: 2 }),
        new Promise((resolve) => window.setTimeout(resolve, 460)),
      ])
      dispatch({ type: 'status', status: result.delivered ? 'success' : 'draft', result })
      if (result.delivered) dispatch({ type: 'go', step: STEP.review, focus: { id: 'axr-success-heading' } })
    } catch (error) {
      dispatch({ type: 'status', status: 'error', result: { message: toUserMessage(error) } })
    } finally {
      submitting.current = false
    }
    return undefined
  }

  const shows = (stepIndex, key) => Boolean(attempted[stepIndex] || touched[key])

  return {
    ...state,
    ...derived,
    endpointConfigured: isApplicationDeliveryConfigured('aivex'),
    teamError: (field) => (shows(STEP.team, `team.${field}`) ? derived.teamErrors[field] || '' : ''),
    memberError: (id, field) => {
      const key = `member.${id}.${field}`
      // The leader's name is also the Team step's leader field.
      const visible = Boolean(state.checkedMembers[id] || touched[key])
        || (id === LEADER_ID && field === 'fullName' && shows(STEP.team, 'team.leaderName'))
      return visible ? derived.memberErrors[id]?.[field] || '' : ''
    },
    rosterError: attempted[STEP.members] ? derived.roster : '',
    consentError: attempted[STEP.review] && !consent ? 'Confirm the statement above before submitting.' : '',
    setTeam: (field, value) => dispatch({ type: 'team', field, value }),
    setMember: (id, field, value) => dispatch({ type: 'member', id, field, value }),
    touch: (key) => dispatch({ type: 'touch', key }),
    addMember: () => dispatch({ type: 'add' }),
    removeMember: (id) => dispatch({ type: 'remove', id }),
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
