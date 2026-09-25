const fail = (stage, error) => {
  throw Object.assign(new Error(stage), { stage, code: error?.code || 'database_error' })
}

const firstRow = (data) => Array.isArray(data) ? data[0] : data

export function createAdminAuthStore(supabase) {
  if (!supabase) throw Object.assign(new Error('admin_store_unavailable'), { stage: 'configuration', code: 'configuration_error' })

  return {
    async consumeRateLimit(keyType, keyHash, policy, now) {
      const { data, error } = await supabase.rpc('admin_consume_login_rate_limit', {
        p_key_type: keyType,
        p_key_hash: keyHash,
        p_limit: policy.limit,
        p_window_seconds: Math.ceil(policy.windowMs / 1000),
        p_block_seconds: Math.ceil(policy.blockMs / 1000),
        p_now: now.toISOString(),
      })
      if (error) fail('rate_limit', error)
      const row = firstRow(data)
      return { allowed: row?.allowed === true, retryAfterSeconds: Number(row?.retry_after_seconds || 0) }
    },

    async findUser(usernameNormalized) {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, username, username_normalized, display_name, password_hash, role, is_active, failed_login_count, locked_until, password_changed_at')
        .eq('username_normalized', usernameNormalized)
        .maybeSingle()
      if (error) fail('user_lookup', error)
      return data
    },

    async recordLoginFailure(adminUserId, now) {
      const { data, error } = await supabase.rpc('admin_record_login_failure', {
        p_admin_user_id: adminUserId,
        p_now: now.toISOString(),
      })
      if (error) fail('login_failure', error)
      const row = firstRow(data)
      return {
        failureCount: Number(row?.failure_count || 0),
        lockedUntil: row?.locked_until || null,
        justLocked: row?.just_locked === true,
      }
    },

    async recordUnknownLoginFailure(now) {
      const { error } = await supabase.from('admin_auth_events').insert({
        admin_user_id: null,
        event_type: 'login_failure',
        created_at: now.toISOString(),
        metadata: {},
      })
      if (error) fail('login_failure_event', error)
    },

    async createLoginSession(adminUserId, tokenHash, expectedPasswordChangedAt, now, expiresAt) {
      const { data, error } = await supabase.rpc('admin_create_login_session', {
        p_admin_user_id: adminUserId,
        p_token_hash: tokenHash,
        p_expected_password_changed_at: expectedPasswordChangedAt,
        p_now: now.toISOString(),
        p_expires_at: expiresAt.toISOString(),
      })
      if (error) fail('session_create', error)
      return firstRow(data)
    },

    async findSession(tokenHash) {
      const { data, error } = await supabase
        .from('admin_sessions')
        .select(`
          id, admin_user_id, created_at, last_seen_at, expires_at, revoked_at,
          admin_user:admin_users!admin_sessions_admin_user_id_fkey(
            id, username, display_name, password_hash, role, is_active, password_changed_at
          )
        `)
        .eq('token_hash', tokenHash)
        .maybeSingle()
      if (error) fail('session_lookup', error)
      return data
    },

    async touchSession(sessionId, now) {
      const { error } = await supabase
        .from('admin_sessions')
        .update({ last_seen_at: now.toISOString() })
        .eq('id', sessionId)
        .is('revoked_at', null)
      if (error) fail('session_touch', error)
    },

    async revokeSession(sessionId, eventType, now) {
      const { data, error } = await supabase.rpc('admin_revoke_session', {
        p_session_id: sessionId,
        p_event_type: eventType,
        p_now: now.toISOString(),
      })
      if (error) fail('session_revoke', error)
      return firstRow(data) === true
    },

    async changePasswordAndRotate(adminUserId, currentSessionId, passwordHash, tokenHash, now, expiresAt) {
      const { data, error } = await supabase.rpc('admin_change_password_and_rotate', {
        p_admin_user_id: adminUserId,
        p_current_session_id: currentSessionId,
        p_password_hash: passwordHash,
        p_token_hash: tokenHash,
        p_now: now.toISOString(),
        p_expires_at: expiresAt.toISOString(),
      })
      if (error) fail('password_change', error)
      return firstRow(data)
    },
  }
}
