// Public reference of an AIVEX registration: the one place that defines its
// format. Server-side only — the browser never proposes a reference.
//
//   AIVEX{edition}-XXXXXXXX   e.g. AIVEX2-7K3M9QXT
//
// 8 characters of Crockford base32 (no I, L, O, U, so nothing to misread on
// paper): 40 random bits from the CSPRNG, no modulo bias (256 = 8 x 32).
// Uniqueness is guaranteed by the unique index on
// aivex_registrations.reference; the caller retries on a collision.

import { randomBytes as cryptoRandomBytes } from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TOKEN_LENGTH = 8

export const REGISTRATION_REFERENCE_PATTERN = /^AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8}$/

export function generateRegistrationReference(edition, randomBytes = cryptoRandomBytes) {
  if (!Number.isInteger(edition) || edition < 1 || edition > 99) throw new TypeError('Invalid edition.')
  const token = Array.from(randomBytes(TOKEN_LENGTH), (byte) => ALPHABET[byte % ALPHABET.length]).join('')
  return `AIVEX${edition}-${token}`
}
