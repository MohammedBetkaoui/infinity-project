import { hashAdminPassword } from '../api/_lib/admin-password.js'
import {
  collectPassword, collectUsername, createAdminCliClient, loadLocalServerEnv, safeDatabaseError,
} from './_lib/admin-cli.mjs'

loadLocalServerEnv()

try {
  const supabase = createAdminCliClient()
  const { normalized } = await collectUsername()
  const { data: user, error: findError } = await supabase
    .from('admin_users')
    .select('id')
    .eq('username_normalized', normalized)
    .maybeSingle()
  if (findError) safeDatabaseError('Administrator lookup failed', findError)
  if (!user) throw new Error('Administrator not found.')

  const password = await collectPassword()
  const passwordHash = await hashAdminPassword(password)
  const changedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('admin_users')
    .update({ password_hash: passwordHash, password_changed_at: changedAt, failed_login_count: 0, locked_until: null })
    .eq('id', user.id)
  if (updateError) safeDatabaseError('Password reset failed', updateError)
  const { error: revokeError } = await supabase
    .from('admin_sessions')
    .update({ revoked_at: changedAt })
    .eq('admin_user_id', user.id)
    .is('revoked_at', null)
  if (revokeError) safeDatabaseError('Session revocation failed', revokeError)
  const { error: eventError } = await supabase.from('admin_auth_events').insert({
    admin_user_id: user.id,
    event_type: 'password_changed',
    created_at: changedAt,
    metadata: { source: 'operator_reset' },
  })
  if (eventError) safeDatabaseError('Password audit event failed', eventError)
  console.log(`Password reset and active sessions revoked for ${normalized}.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
