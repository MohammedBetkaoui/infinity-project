export const MIN_MEMBERS = 3
export const LEADER_ID = 'leader'
export const CARD_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CARD_MAX_BYTES = 5 * 1024 * 1024
export const CARD_SPEC = 'JPG / PNG / WEBP · Max 5 MB'

export const STEPS = ['Team', 'Members', 'Review']
export const STEP = { team: 0, members: 1, review: 2 }

export const TEAM_FIELDS = ['name', 'university', 'leaderName', 'email']
export const MEMBER_FIELDS = ['fullName', 'registrationNumber', 'studyLevel', 'phone', 'studentCard']

export const studyLevels = [
  { value: '', label: 'Select level' },
  { value: 'Licence 1', label: 'Licence 1' },
  { value: 'Licence 2', label: 'Licence 2' },
  { value: 'Licence 3', label: 'Licence 3' },
  { value: 'Master 1', label: 'Master 1' },
  { value: 'Master 2', label: 'Master 2' },
  { value: 'Engineering cycle', label: 'Engineering cycle' },
  { value: 'Doctorate', label: 'Doctorate' },
  { value: 'Other', label: 'Other' },
]

export const emptyTeam = { name: '', university: '', leaderName: '', email: '' }

const newId = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const createMember = (isLeader = false) => ({
  id: isLeader ? LEADER_ID : newId(),
  isLeader,
  fullName: '',
  registrationNumber: '',
  studyLevel: '',
  phone: '',
  studentCard: null,
})

// The leader's name has one home: team.leaderName. The leader card edits it
// directly, so the Team step and the roster can never disagree.
export const memberName = (member, team) => (member.isLeader ? team.leaderName : member.fullName)

const text = (value) => String(value ?? '').trim()
const digits = (value) => String(value ?? '').replace(/\D/g, '')

export function teamIssues(team) {
  const issues = {}
  if (text(team.name).length < 2) issues.name = 'Team name is required.'
  if (!text(team.university)) issues.university = 'University or institution is required.'
  if (!text(team.leaderName)) issues.leaderName = 'Team leader’s full name is required.'
  else if (text(team.leaderName).length < 3) issues.leaderName = 'Enter the team leader’s full name.'
  if (!text(team.email)) issues.email = 'Team email is required.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(team.email))) issues.email = 'Enter a valid email address.'
  return issues
}

export function memberIssues(member, team) {
  const issues = {}
  const name = text(memberName(member, team))
  if (!name) issues.fullName = 'Full name is required.'
  else if (name.length < 3) issues.fullName = 'Enter the full name as written on the student card.'

  const registration = text(member.registrationNumber).replace(/\s/g, '')
  if (!registration) issues.registrationNumber = 'Student registration number is required.'
  else if (!/^\d{6,20}$/.test(registration)) issues.registrationNumber = 'Use digits only, as printed on the student card.'

  if (!member.studyLevel) issues.studyLevel = 'Study level is required.'

  const phone = text(member.phone)
  if (!phone) issues.phone = 'Phone number is required.'
  else if (!/^\+?[\d\s().-]+$/.test(phone) || digits(phone).length < 9 || digits(phone).length > 15) issues.phone = 'Enter a valid phone number.'

  if (!member.studentCard) issues.studentCard = 'Student card is required.'
  return issues
}

export const isMemberComplete = (member, team) => Object.keys(memberIssues(member, team)).length === 0

export const rosterIssue = (members) => (members.length < MIN_MEMBERS ? `At least ${MIN_MEMBERS} team members are required.` : '')

export function checkCardFile(file) {
  if (!file) return 'No file was selected.'
  if (!CARD_TYPES.includes(file.type)) return 'Use a JPG, PNG or WEBP image of the card.'
  if (file.size > CARD_MAX_BYTES) return 'This image is larger than 5 MB.'
  return ''
}

export const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

// Backend-ready shape: answers are JSON, each student card travels as its own
// multipart file referenced by field name. The server re-checks consent.
export function buildSubmission({ team, members, consent }) {
  const files = []
  const roster = members.map((member, index) => {
    const field = `studentCard_${index + 1}`
    if (member.studentCard) files.push({ field, file: member.studentCard })
    return {
      position: index + 1,
      role: member.isLeader ? 'leader' : 'member',
      fullName: text(memberName(member, team)),
      registrationNumber: text(member.registrationNumber).replace(/\s/g, ''),
      studyLevel: member.studyLevel,
      phone: text(member.phone).replace(/[\s().-]/g, ''),
      studentCard: member.studentCard ? field : null,
    }
  })
  return {
    answers: {
      team: {
        name: text(team.name),
        university: text(team.university),
        leaderName: text(team.leaderName),
        email: text(team.email).toLowerCase(),
        size: members.length,
      },
      members: roster,
      consent: consent === true,
    },
    files,
  }
}

export function buildSummary({ team, members }) {
  return [
    'AIVEX - SECOND EDITION TEAM REGISTRATION',
    `Team: ${text(team.name)}`,
    `University: ${text(team.university)}`,
    `Team leader: ${text(team.leaderName)}`,
    `Team email: ${text(team.email)}`,
    `Members: ${members.length}`,
    '',
    ...members.map((member, index) => [
      `${String(index + 1).padStart(2, '0')} ${member.isLeader ? '(leader) ' : ''}${text(memberName(member, team)) || 'Unnamed'}`,
      `   Registration: ${text(member.registrationNumber) || '-'} · ${member.studyLevel || '-'} · ${text(member.phone) || '-'}`,
      `   Student card: ${member.studentCard ? member.studentCard.name : 'missing'}`,
    ].join('\n')),
  ].join('\n')
}
