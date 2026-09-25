export const ADMIN_AIVEX_ACTIONS = Object.freeze([
  'start_review',
  'approve_registration',
  'request_corrections',
  'validate_file',
  'reject_registration',
  'cancel_registration',
  'verify_activity_official',
  'verify_document',
  'invalidate_document',
  'retry_generation',
])

const REVIEWER_ACTIONS = new Set([
  'start_review',
  'request_corrections',
  'verify_activity_official',
  'verify_document',
  'invalidate_document',
])

export function canManageAivex(role, action) {
  if (!ADMIN_AIVEX_ACTIONS.includes(action)) return false
  if (role === 'super_admin' || role === 'administrator') return true
  return role === 'reviewer' && REVIEWER_ACTIONS.has(action)
}

export function canAccessAivexDocuments(role) {
  return ['super_admin', 'administrator', 'reviewer'].includes(role)
}

export function allowedAivexActions(role) {
  return ADMIN_AIVEX_ACTIONS.filter((action) => canManageAivex(role, action))
}

