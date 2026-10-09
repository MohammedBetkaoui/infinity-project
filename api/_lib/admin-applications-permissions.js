export const ADMIN_APPLICATION_ACTIONS = Object.freeze([
  'start_review',
  'schedule_interview',
  'accept_member',
  'change_staff_department',
  'decline',
  'archive',
  'add_note',
  'invite_staff_confirmation',
  'create_stable_staff_confirmation_link',
  'regenerate_staff_confirmation_link',
  'block_staff_confirmation_link',
  'unblock_staff_confirmation_link',
  'extend_staff_confirmation_deadline',
  'request_staff_confirmation_revision',
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
      else {
        const confirmationStatus = confirmation.effective_status || confirmation.status
        const linkAccess = confirmation.link_access || 'none'
        if (!confirmation.link_reconstructable) actions.push('create_stable_staff_confirmation_link')
        if (confirmation.link_reconstructable) {
          actions.push('regenerate_staff_confirmation_link')
          if (linkAccess === 'blocked') actions.push('unblock_staff_confirmation_link')
          else actions.push('block_staff_confirmation_link')
        }
        if (confirmationStatus === 'expired') actions.push('extend_staff_confirmation_deadline')
        if (confirmationStatus === 'submitted') actions.push('confirm_staff_membership', 'request_staff_confirmation_revision')
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
