import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export const ADMIN_PASSWORD_MIN_LENGTH = 12
export const ADMIN_PASSWORD_MAX_LENGTH = 128

// 64 MiB memory cost: deliberately expensive enough for administrator
// passwords while remaining reliable in Node 22 Vercel Functions. Argon2id
// would add a native deployment dependency to this otherwise pure-JS project.
export const ADMIN_SCRYPT_PARAMS = Object.freeze({ N: 65_536, r: 8, p: 1, keyLength: 64, maxmem: 128 * 1024 * 1024 })

const DUMMY_SALT = randomBytes(16)

export function passwordPolicyError(password) {
  if (typeof password !== 'string') return 'invalid_type'
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return 'too_short'
  if (password.length > ADMIN_PASSWORD_MAX_LENGTH || Buffer.byteLength(password, 'utf8') > 512) return 'too_long'
  return null
}

async function derive(password, salt, params = ADMIN_SCRYPT_PARAMS) {
  return scrypt(password, salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: params.maxmem,
  })
}

export async function hashAdminPassword(password) {
  const policyError = passwordPolicyError(password)
  if (policyError) throw Object.assign(new Error('password_policy_failed'), { code: policyError })
  const salt = randomBytes(16)
  const derived = await derive(password, salt)
  const { N, r, p } = ADMIN_SCRYPT_PARAMS
  return `scrypt$v=1$N=${N},r=${r},p=${p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

function parsePasswordHash(encoded) {
  if (typeof encoded !== 'string') return null
  const parts = encoded.split('$')
  if (parts.length !== 5 || parts[0] !== 'scrypt' || parts[1] !== 'v=1') return null
  const match = parts[2].match(/^N=(\d+),r=(\d+),p=(\d+)$/)
  if (!match) return null
  const params = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) }
  if (params.N !== ADMIN_SCRYPT_PARAMS.N || params.r !== ADMIN_SCRYPT_PARAMS.r || params.p !== ADMIN_SCRYPT_PARAMS.p) return null
  try {
    const salt = Buffer.from(parts[3], 'base64url')
    const expected = Buffer.from(parts[4], 'base64url')
    if (salt.length !== 16 || expected.length !== ADMIN_SCRYPT_PARAMS.keyLength) return null
    return { salt, expected, params: { ...ADMIN_SCRYPT_PARAMS, ...params } }
  } catch {
    return null
  }
}

export async function verifyAdminPassword(password, encoded) {
  const bounded = typeof password === 'string' && password.length <= ADMIN_PASSWORD_MAX_LENGTH && Buffer.byteLength(password, 'utf8') <= 512
  const parsed = parsePasswordHash(encoded)
  if (!bounded || !parsed) return consumeAdminPasswordTiming(password)
  const actual = Buffer.from(await derive(password, parsed.salt, parsed.params))
  const { expected } = parsed
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Unknown usernames still pay the same scrypt cost as a real password check.
// Nothing derived here is persisted and the dummy salt changes per process.
export async function consumeAdminPasswordTiming(password) {
  const bounded = typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 512 ? password : ''
  const derived = Buffer.from(await derive(bounded, DUMMY_SALT))
  timingSafeEqual(derived, derived)
  return false
}
