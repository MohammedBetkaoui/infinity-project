import { safeAdminReturnTo } from './adminAuthPath.js'

const FULL_WORKSPACE_ROLE = 'super_admin'
const AIVEX_WORKSPACE_ROLES = new Set(['administrator', 'reviewer'])

export function hasFullAdminWorkspace(role) {
  return role === FULL_WORKSPACE_ROLE
}

export function hasAivexWorkspace(role) {
  return hasFullAdminWorkspace(role) || AIVEX_WORKSPACE_ROLES.has(role)
}

export function adminHomePath(role) {
  return hasFullAdminWorkspace(role) ? '/admin/overview' : '/admin/aivex'
}

export function adminPathForRole(role, requestedPath) {
  const safePath = safeAdminReturnTo(requestedPath)
  if (hasFullAdminWorkspace(role)) return safePath
  if (!AIVEX_WORKSPACE_ROLES.has(role)) return '/admin/login'

  try {
    const parsed = new URL(safePath, 'https://infinity.invalid')
    if (parsed.pathname === '/admin/aivex' || parsed.pathname.startsWith('/admin/aivex/')) return safePath
  } catch {
    // safeAdminReturnTo already normalises malformed input; fail closed here too.
  }
  return '/admin/aivex'
}
