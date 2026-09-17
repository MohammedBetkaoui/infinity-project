import { poles } from '../../data/siteData'

export const JOIN_TYPES = [
  {
    value: 'member',
    index: '01',
    label: 'Member',
    description: 'Join the community, attend workshops and events, meet people and learn with us. A flexible way to be part of Infinity without taking on organisational responsibilities.',
    meta: 'Flexible involvement',
  },
  {
    value: 'staff',
    index: '02',
    label: 'Staff',
    description: 'Help build and run Infinity Club. Work with one of our teams, contribute to projects and events, and take on a more active role throughout the season.',
    meta: 'Active involvement',
  },
]

export const STAFF_DEPARTMENTS = [
  {
    value: 'dev-tech',
    index: '01',
    eyebrow: 'Dev + Tech',
    label: 'Dev / Tech',
    description: 'Build digital products, technical projects and tools for the club while collaborating on workshops and tech initiatives.',
    meta: 'Development · Technology · Projects',
  },
  {
    value: 'design-content',
    index: '02',
    eyebrow: 'Design + Content',
    label: 'Design / Content Creation',
    description: 'Shape Infinity’s visual identity and create the design, video and content used across events and communication.',
    meta: 'Design · Media · Content',
  },
  {
    value: 'management-logistics',
    index: '03',
    eyebrow: 'Management + Logistics',
    label: 'Management / Logistics',
    description: 'Help organise events, coordinate activities and make sure the operational side of Infinity runs smoothly.',
    meta: 'Organisation · Events · Coordination',
  },
]

export const studyLevels = [
  { value: '', label: 'Select your level' },
  { label: 'Licence', options: [
    { value: 'L1', label: 'Licence 1' },
    { value: 'L2', label: 'Licence 2' },
    { value: 'L3', label: 'Licence 3' },
  ] },
  { label: 'Master', options: [
    { value: 'M1', label: 'Master 1' },
    { value: 'M2', label: 'Master 2' },
  ] },
  { label: 'Engineering', options: [
    { value: 'E1', label: 'Engineering 1' },
    { value: 'E2', label: 'Engineering 2' },
    { value: 'E3', label: 'Engineering 3' },
    { value: 'E4', label: 'Engineering 4' },
    { value: 'E5', label: 'Engineering 5' },
  ] },
  { value: 'other', label: 'Another level' },
]

export const availabilityOptions = [
  { value: '', label: 'Choose a realistic rhythm' },
  { value: 'weekly', label: 'A few hours each week' },
  { value: 'events', label: 'Mostly around events and projects' },
  { value: 'flexible', label: 'It changes during the semester' },
]

export const experienceOptions = [
  { value: 'starting', label: 'Starting out', description: 'Curious, with little or no prior experience.' },
  { value: 'learning', label: 'Already learning', description: 'Following courses or building first exercises.' },
  { value: 'building', label: 'Building things', description: 'Ready to contribute and share practical skills.' },
]

export const interestOptions = [
  { value: '', label: 'Choose what interests you most' },
  ...poles.map(({ title }) => ({ value: title, label: title })),
  { value: 'Not sure yet', label: 'I would like help choosing' },
]

export const initialValues = {
  fullName: '',
  email: '',
  phone: '',
  studyYear: '',
  department: '',
  joinType: '',
  experience: '',
  memberInterest: '',
  staffDepartment: '',
  availability: '',
  consent: false,
  website: '',
}

export const steps = [
  { label: 'About you', fields: ['fullName', 'email', 'phone', 'studyYear', 'department'] },
  { label: 'Your place', fields: ['joinType', 'experience', 'memberInterest', 'staffDepartment', 'availability', 'consent'] },
]

// Kept in sync with the server-side limits in api/join.js (MAX_LEN) so a
// mismatch is caught here first, with a clear message.
const required = (label) => (value) => (String(value || '').trim() ? '' : `${label} is required.`)
// Role-dependent questions stay silent until a role reveals them.
const requiredOnceRoleChosen = (label) => (value, values) => (values.joinType ? required(label)(value) : '')
export const validators = {
  fullName: (value) => {
    const trimmed = String(value || '').trim()
    if (trimmed.length < 3) return 'Please enter your full name.'
    if (trimmed.length > 120) return 'Please use a shorter name (120 characters max).'
    return ''
  },
  email: (value) => {
    const trimmed = String(value || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.'
    if (trimmed.length > 254) return 'This email address is too long.'
    return ''
  },
  phone: (value) => {
    if (!value) return ''
    const trimmed = String(value).trim()
    if (trimmed.length > 40 || trimmed.replace(/\D/g, '').length < 8) return 'Enter a valid phone number or leave it empty.'
    return ''
  },
  studyYear: required('Your study level'),
  department: (value) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return 'Your department is required.'
    if (trimmed.length > 120) return 'Please use a shorter answer (120 characters max).'
    return ''
  },
  joinType: (value) => (JOIN_TYPES.some((type) => type.value === value) ? '' : 'Choose how you would like to join Infinity.'),
  experience: requiredOnceRoleChosen('Your starting point'),
  memberInterest: (value, values) => (values.joinType !== 'member' || String(value || '').trim() ? '' : 'Choose what you would like to explore.'),
  staffDepartment: (value, values) => (
    values.joinType !== 'staff' || STAFF_DEPARTMENTS.some((department) => department.value === value)
      ? ''
      : 'Choose the department you would like to join.'
  ),
  availability: requiredOnceRoleChosen('Your availability'),
  consent: (value) => (value ? '' : 'Please confirm that the club may contact you about this application.'),
}

// Only the chosen path travels: the other path is sent as null, never stale.
export const serialize = (values) => ({
  ...values,
  memberInterest: values.joinType === 'member' ? values.memberInterest : null,
  staffDepartment: values.joinType === 'staff' ? values.staffDepartment : null,
})

const labelOf = (list, value) => list.find((item) => item.value === value)?.label || value || '—'
const studyLabel = (value) => studyLevels.flatMap((item) => item.options || [item]).find((item) => item.value === value)?.label || value

export const joinTypeLabel = (value) => labelOf(JOIN_TYPES, value)

export const buildSummary = (values) => [
  'INFINITY CLUB - APPLICATION',
  `Joining as: ${joinTypeLabel(values.joinType)}`,
  `Name: ${values.fullName}`,
  `Email: ${values.email}`,
  `Phone: ${values.phone || 'Not provided'}`,
  `Study level: ${studyLabel(values.studyYear)}`,
  `Department or speciality: ${values.department}`,
  values.joinType === 'staff'
    ? `Staff department: ${labelOf(STAFF_DEPARTMENTS, values.staffDepartment)}`
    : `Would like to explore: ${values.memberInterest || '—'}`,
  `Starting point: ${labelOf(experienceOptions, values.experience)}`,
  `Availability: ${labelOf(availabilityOptions, values.availability)}`,
].join('\n')
