export const ADMIN_EVENT_ACTIONS = Object.freeze([
  'create_event',
  'update_event',
  'invite_applicants',
  'manage_scanner',
])

export function canAccessEvents(role) {
  return role === 'super_admin'
}

export function canManageEvents(role, action) {
  return role === 'super_admin' && ADMIN_EVENT_ACTIONS.includes(action)
}
