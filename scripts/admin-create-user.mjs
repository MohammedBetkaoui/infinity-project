import { hashAdminPassword } from '../api/_lib/admin-password.js'
import {
  collectPassword, collectRole, collectUsername, createAdminCliClient,
  loadLocalServerEnv, prompt, safeDatabaseError,
} from './_lib/admin-cli.mjs'

loadLocalServerEnv()

try {
  const supabase = createAdminCliClient()
  const { username, normalized } = await collectUsername()
  const displayName = (await prompt('Display name: ')).trim()
  if (displayName.length < 2 || displayName.length > 120) throw new Error('Display name must contain between 2 and 120 characters.')
  const role = await collectRole()
  const password = await collectPassword()
  const passwordHash = await hashAdminPassword(password)

  const { error } = await supabase.from('admin_users').insert({
    username,
    username_normalized: normalized,
    display_name: displayName,
    password_hash: passwordHash,
    role,
    is_active: true,
  })
  if (error) safeDatabaseError('Administrator creation failed', error)
  console.log(`Administrator created: ${normalized} (${role}).`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
