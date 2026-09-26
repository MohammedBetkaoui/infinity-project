export const ADMIN_APPLICATION_ACTIONS = Object.freeze([
  'start_review',
  'schedule_interview',
  'accept_member',
  'accept_staff',
  'change_staff_department',
  'decline',
  'archive',
  'add_note',
])

const ADMINISTRATOR_ACTIONS = new Set(ADMIN_APPLICATION_ACTIONS)

export function canAccessApplications(role) {
  return role === 'super_admin'
}

export function canManageApplication(role, action) {
  if (!ADMIN_APPLICATION_ACTIONS.includes(action)) return false
  return role === 'super_admin' && ADMINISTRATOR_ACTIONS.has(action)
}

export function allowedApplicationActions(role, application) {
  if (!application) return []
  const closed = ['accepted', 'declined', 'archived'].includes(application.status)
  const actions = ['add_note']

  if (!closed) {
    if (application.status !== 'in_review') actions.push('start_review')
    actions.push('schedule_interview')
    if (application.join_type === 'member') actions.push('accept_member')
    if (application.join_type === 'staff') actions.push('accept_staff', 'change_staff_department')
    actions.push('decline')
  }
  if (application.status !== 'archived') actions.push('archive')
  return actions.filter((action) => canManageApplication(role, action))
}

export function canBulkManageApplications(role) {
  return role === 'super_admin'
}
