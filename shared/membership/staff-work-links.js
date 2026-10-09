// Optional "Portfolio or links to your work" entries attached to one Staff
// motivation version. The public form, the API and the admin dossier share
// these rules; the API remains authoritative. URLs are only parsed here, never
// requested: the server must not fetch candidate-supplied addresses.

export const STAFF_WORK_LINKS_MAX = 5
export const STAFF_WORK_LINK_MAX_LENGTH = 500

// Returns the WHATWG serialization (lower-case scheme and host, punycode,
// default port dropped). Paths, query strings and fragments are preserved.
export function normalizeStaffWorkLink(value) {
  if (typeof value !== 'string') return { ok: false, code: 'invalid' }
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, code: 'empty' }
  if ([...trimmed].length > STAFF_WORK_LINK_MAX_LENGTH) return { ok: false, code: 'too_long' }
  if (/\p{Cc}/u.test(trimmed)) return { ok: false, code: 'invalid' }
  let url
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, code: 'invalid' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, code: 'scheme' }
  // A complete public address names a domain: rejects "https://github" and "http://localhost".
  if (!url.hostname.includes('.')) return { ok: false, code: 'invalid' }
  if (url.username || url.password) return { ok: false, code: 'credentials' }
  return url.href.length > STAFF_WORK_LINK_MAX_LENGTH
    ? { ok: false, code: 'too_long' }
    : { ok: true, value: url.href }
}

// Missing means no links. Anything other than an array of at most five
// strings is a malformed payload; per-entry problems are reported by index.
export function validateStaffWorkLinks(value) {
  if (value === undefined) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.length > STAFF_WORK_LINKS_MAX
    || !value.every((entry) => typeof entry === 'string')) return { ok: false, errors: [] }
  const links = []
  const errors = []
  value.forEach((entry, index) => {
    const link = normalizeStaffWorkLink(entry)
    if (!link.ok) errors.push({ index, code: link.code })
    else if (links.includes(link.value)) errors.push({ index, code: 'duplicate' })
    else links.push(link.value)
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: links }
}

const KNOWN_SERVICES = Object.freeze([
  ['github.com', 'GitHub'], ['gitlab.com', 'GitLab'], ['behance.net', 'Behance'],
  ['dribbble.com', 'Dribbble'], ['artstation.com', 'ArtStation'], ['figma.com', 'Figma'],
  ['canva.com', 'Canva'], ['instagram.com', 'Instagram'], ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'], ['vimeo.com', 'Vimeo'], ['tiktok.com', 'TikTok'],
  ['linkedin.com', 'LinkedIn'], ['drive.google.com', 'Google Drive'], ['codepen.io', 'CodePen'],
  ['kaggle.com', 'Kaggle'],
])

// Reviewer-facing label derived from the hostname only: no metadata is ever
// fetched. Returns null for anything that is not a safe http(s) link, so a
// caller can never render another scheme as a clickable href.
export function describeStaffWorkLink(value) {
  const link = normalizeStaffWorkLink(value)
  if (!link.ok) return null
  const url = new URL(link.value)
  const host = url.hostname.replace(/^www\./, '')
  const service = KNOWN_SERVICES.find(([domain]) => host === domain || host.endsWith(`.${domain}`))
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  return { href: link.value, label: service ? service[1] : host, detail: `${host}${path}${url.search}` }
}
