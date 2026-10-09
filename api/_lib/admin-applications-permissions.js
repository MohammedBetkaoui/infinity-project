export const ADMIN_APPLICATION_ACTIONS = Object.freeze([
  'start_review',
  'schedule_interview',
  'accept_member',
  'change_staff_department',
  'decline',
  'archive',
  'add_note',
  'invite_staff_confirmation',
  'regenerate_staff_confirmation_link',
  'request_staff_confirmation_revision',
  'revoke_staff_confirmation',
  'confirm_staff_membership',
])

const ADMINISTRATOR_ACTIONS = new Set(ADMIN_APPLICATION_ACTIONS)

export function canAccessApplications(role) {
  return role === 'super_admin'
}

export function canManageApplication(role, action) {
  if (!ADMIN_APPLICATION_ACTIONS.includes(action)) return false
  return role === 'super_admin' && ADMINISTRATOR_ACTIONS.has(action)
}

export function allowedApplicationActions(role, application, confirmation = null) {
  if (!application) return []
  const closed = ['accepted', 'declined', 'archived'].includes(application.status)
  const actions = ['add_note']

  if (!closed) {
    if (application.status !== 'in_review') actions.push('start_review')
    actions.push('schedule_interview')
    if (application.join_type === 'member') actions.push('accept_member')
    if (application.join_type === 'staff') {
      actions.push('change_staff_department')
      if (!confirmation) actions.push('invite_staff_confirmation')
      else if (['invited', 'revision_requested', 'revoked', 'expired'].includes(confirmation.effective_status || confirmation.status)) {
        actions.push('regenerate_staff_confirmation_link')
        if (!['revoked', 'expired'].includes(confirmation.effective_status || confirmation.status)) actions.push('revoke_staff_confirmation')
      } else if ((confirmation.effective_status || confirmation.status) === 'submitted') {
        actions.push('confirm_staff_membership', 'request_staff_confirmation_revision')
      }
    }
    actions.push('decline')
  }
  if (application.status !== 'archived') actions.push('archive')
  return actions.filter((action) => canManageApplication(role, action))
}

export function canBulkManageApplications(role) {
  return role === 'super_admin'
}
