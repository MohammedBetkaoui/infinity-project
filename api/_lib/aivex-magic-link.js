// AIVEX candidate Magic Link — token design, lifetime, and orchestration
// over a small `store` interface (api/_lib/aivex-magic-link-store.js), the
// same layering as api/_lib/aivex-document-generation.js sits over
// api/_lib/aivex-document-store.js.
//
// Solves one thing: a candidate can only reach their registration/DOCX from
// the original submitting browser today (api/aivex/document.js needs
// submissionId, which lives only in that browser's memory/sessionStorage).
// A Magic Link is a bearer credential good for AIVEX_MAGIC_LINK_TTL_DAYS
// that survives closing the browser, printed on nothing, stored nowhere but
// the URL itself.
//
// Token: 32 CSPRNG bytes (256 bits — not brute-forceable), base64url so it
// drops straight into a query string with no re-encoding. The database
// never sees the raw token, only sha256(token) — a leak of the database
// (or of a log) cannot be turned back into a working link. One row per
// issued link; a new link for the same registration revokes the previous
// one (never deletes it — see the migration).

import { createHash, randomBytes } from 'node:crypto'

// Named constant per the brief: change this in one place if the policy
// changes, no redesign needed.
export const AIVEX_MAGIC_LINK_TTL_DAYS = 30
const TOKEN_BYTES = 32 // 256 bits

export function generateMagicLinkToken(randomBytesFn = randomBytes) {
  return randomBytesFn(TOKEN_BYTES).toString('base64url')
}

export function hashMagicLinkToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}

// Optional forensic signal only (api/_lib/aivex-magic-link-store.js never
// reads these back in Phase 5A) — hashed so the raw IP/User-Agent is never
// written to the database.
export function hashClientSignal(value) {
  return value ? createHash('sha256').update(value).digest('hex') : null
}

export function magicLinkExpiryFrom(now) {
  return new Date(now.getTime() + AIVEX_MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)
}

// 32 bytes of base64url is 43 characters, no padding (Node's base64url
// encoding drops '='). A little slack either side absorbs a future TOKEN_
// BYTES change without this check silently going stale.
const TOKEN_SHAPE_RE = /^[A-Za-z0-9_-]{40,86}$/
export const isPlausibleMagicLinkToken = (value) => typeof value === 'string' && TOKEN_SHAPE_RE.test(value)

// The status page lives at a fixed, well-known path — building the full
// URL from the request's own Host header (same trust source isTrustedOrigin
// already relies on in api/_lib/security.js) needs no new environment
// variable and self-corrects if the site is ever served from another host.
export function siteOrigin(req) {
  const host = req?.headers?.host
  if (!host) return null
  return `${process.env.VERCEL ? 'https' : 'http'}://${host}`
}

export function buildMagicLinkUrl(req, rawToken) {
  const origin = siteOrigin(req)
  return origin ? `${origin}/aivex/status?token=${encodeURIComponent(rawToken)}` : null
}

// Best-effort: called right after a registration succeeds
// (api/aivex/register.js), never allowed to fail the registration itself.
// Returns { magicLink, expiresAt } on success; throws on a real store
// failure, which the caller catches and logs (a code only, never the token).
export async function issueMagicLink({ magicLinkStore, registrationId, now, ip, userAgent, req }) {
  const rawToken = generateMagicLinkToken()
  const expiresAt = magicLinkExpiryFrom(now)
  await magicLinkStore.createOrRotate(registrationId, {
    tokenHash: hashMagicLinkToken(rawToken),
    expiresAt,
    now,
    createdIpHash: hashClientSignal(ip),
    userAgentHash: hashClientSignal(userAgent),
  })
  return { magicLink: buildMagicLinkUrl(req, rawToken), expiresAt }
}

// Shared by api/aivex/magic-link/verify.js and api/aivex/magic-link/
// document.js so both endpoints agree, byte for byte, on what counts as
// valid — a token could expire or be revoked between one call and the
// other, so each call re-resolves independently; nothing here is cached.
//
// The distinction matters for what a caller may be told (api/aivex/magic-
// link/verify.js's own comment has the reasoning): a token that doesn't
// even hash-match anything gets the same generic 'invalid' as a wrong
// guess would, never revealing whether it once existed; a token that DOES
// hash-match a row is, by construction, the exact 256-bit secret handed to
// one real candidate, so telling that caller *why* it no longer works
// (expired vs revoked) leaks nothing to anyone else.
export async function resolveMagicLink({ magicLinkStore, rawToken, now }) {
  if (!isPlausibleMagicLinkToken(rawToken)) return { ok: false, status: 'invalid' }
  const row = await magicLinkStore.findByTokenHash(hashMagicLinkToken(rawToken))
  if (!row) return { ok: false, status: 'invalid' }
  if (row.revoked_at) return { ok: false, status: 'revoked' }
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, status: 'expired' }
  return { ok: true, magicLinkId: row.id, registrationId: row.registration_id }
}
