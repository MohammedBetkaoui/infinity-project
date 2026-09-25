import { existsSync, readFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizeAdminUsername } from '../../api/_lib/admin-security.js'
import { passwordPolicyError } from '../../api/_lib/admin-password.js'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROLES = new Set(['super_admin', 'administrator', 'reviewer'])

export function loadLocalServerEnv() {
  const path = join(projectRoot, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match || match[1] in process.env) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

export function createAdminCliClient() {
  const url = process.env.SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in the server environment first.')
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const prompt = async (label) => {
  const terminal = createInterface({ input: stdin, output: stdout })
  try { return await terminal.question(label) } finally { terminal.close() }
}

export function promptSecret(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Password entry requires an interactive TTY. No password command-line argument is accepted.')
  }
  stdout.write(label)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Cancelled.'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
        else if (character >= ' ') value += character
      }
    }
    stdin.on('data', onData)
  })
}

export async function collectUsername() {
  const username = (await prompt('Username: ')).trim()
  const normalized = normalizeAdminUsername(username)
  if (!normalized) throw new Error('Username must be 3-64 characters using letters, numbers, dot, underscore or hyphen.')
  return { username, normalized }
}

export async function collectPassword() {
  const password = await promptSecret('Password: ')
  const policy = passwordPolicyError(password)
  if (policy) throw new Error('Password must contain between 12 and 128 characters.')
  const confirmation = await promptSecret('Confirm password: ')
  if (password !== confirmation) throw new Error('Passwords do not match.')
  return password
}

export async function collectRole() {
  const role = (await prompt('Role [super_admin/administrator/reviewer] (administrator): ')).trim() || 'administrator'
  if (!ROLES.has(role)) throw new Error('Invalid role.')
  return role
}

export function safeDatabaseError(prefix, error) {
  const code = error?.code ? ` (${error.code})` : ''
  throw new Error(`${prefix}${code}`)
}
