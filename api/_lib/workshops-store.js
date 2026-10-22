const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage, code: error?.code || error?.statusCode || 'database_error', databaseMessage: error?.message,
  })
}
const first = (value) => Array.isArray(value) ? value[0] : value

export function createWorkshopsStore(supabase) {
  if (!supabase) fail('workshops_store_unavailable', { code: 'configuration_error' })
  return {
    async openInvitation({ tokenHash, now }) {
      const { data, error } = await supabase.rpc('public_open_event_invitation', {
        p_token_hash: tokenHash, p_now: now.toISOString(),
      })
      if (error) fail('workshop_invitation_open', error)
      return first(data) || null
    },
    async register({ invitationTokenHash, firstName, lastName, qrTokenHash, qrCredentialVersion, qrDerivationVersion, qrExpiresAt, now }) {
      const { data, error } = await supabase.rpc('public_register_event_participant', {
        p_invitation_token_hash: invitationTokenHash, p_first_name: firstName, p_last_name: lastName,
        p_qr_token_hash: qrTokenHash, p_qr_credential_version: qrCredentialVersion,
        p_qr_derivation_version: qrDerivationVersion, p_qr_expires_at: qrExpiresAt.toISOString(), p_now: now.toISOString(),
      })
      if (error) fail('workshop_registration', error)
      return first(data)
    },
    async exchangeScanner({ accessTokenHash, sessionTokenHash, sessionExpiresAt, now }) {
      const { data, error } = await supabase.rpc('public_exchange_event_scanner_token', {
        p_access_token_hash: accessTokenHash, p_session_token_hash: sessionTokenHash,
        p_session_expires_at: sessionExpiresAt.toISOString(), p_now: now.toISOString(),
      })
      if (error) fail('workshop_scanner_exchange', error)
      return first(data)
    },
    async scannerContext({ sessionTokenHash, now }) {
      const { data, error } = await supabase.rpc('public_event_scanner_context', {
        p_session_token_hash: sessionTokenHash, p_now: now.toISOString(),
      })
      if (error) fail('workshop_scanner_context', error)
      return first(data)
    },
    async checkIn({ sessionTokenHash, qrTokenHash, now }) {
      const { data, error } = await supabase.rpc('public_check_in_event_participant', {
        p_session_token_hash: sessionTokenHash, p_qr_token_hash: qrTokenHash, p_now: now.toISOString(),
      })
      if (error) fail('workshop_check_in', error)
      return first(data)
    },
  }
}

