export function safeAdminReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/admin/') || value.startsWith('/admin/login')) return '/admin/overview'
  if (value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32)) return '/admin/overview'
  try {
    const parsed = new URL(value, 'https://infinity.invalid')
    if (parsed.origin !== 'https://infinity.invalid' || !parsed.pathname.startsWith('/admin/')) return '/admin/overview'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/admin/overview'
  }
}

export function adminLoginPathFor(returnTo) {
  return `/admin/login?returnTo=${encodeURIComponent(safeAdminReturnTo(returnTo))}`
}
