const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage, code: error?.code || 'database_error', databaseMessage: error?.message,
  })
}

const first = (value) => Array.isArray(value) ? value[0] : value

export function createEventInvitationDeliveryStore(supabase) {
  if (!supabase) throw Object.assign(new Error('event_invitation_delivery_store_unavailable'), { code: 'configuration_error' })
  return {
    async claimDeliveries({ leaseToken, limit, leaseSeconds, now }) {
      const { data, error } = await supabase.rpc('worker_claim_event_invitation_deliveries', {
        p_lease_token: leaseToken, p_limit: limit, p_lease_seconds: leaseSeconds, p_now: now.toISOString(),
      })
      if (error) fail('event_invitation_delivery_claim', error)
      return data || []
    },
    async ensureInvitationLink({ jobId, leaseToken, tokenHash, expiresAt, now }) {
      const { data, error } = await supabase.rpc('worker_ensure_event_invitation_link', {
        p_job_id: jobId, p_lease_token: leaseToken, p_token_hash: tokenHash,
        p_expires_at: expiresAt.toISOString(), p_now: now.toISOString(),
      })
      if (error) fail('event_invitation_delivery_link', error)
      return first(data)
    },
    async finishDelivery({ jobId, leaseToken, succeeded, errorCode = null, retryable = true, now }) {
      const { data, error } = await supabase.rpc('worker_finish_event_invitation_delivery', {
        p_job_id: jobId, p_lease_token: leaseToken, p_succeeded: succeeded,
        p_error_code: errorCode, p_retryable: retryable, p_now: now.toISOString(),
      })
      if (error) fail('event_invitation_delivery_finish', error)
      return first(data)
    },
    async claimBackfills({ leaseToken, limit, leaseSeconds, now }) {
      const { data, error } = await supabase.rpc('worker_claim_event_invitation_backfills', {
        p_lease_token: leaseToken, p_limit: limit, p_lease_seconds: leaseSeconds, p_now: now.toISOString(),
      })
      if (error) fail('event_invitation_backfill_claim', error)
      return data || []
    },
    async processBackfillPage({ jobId, leaseToken, pageSize, now }) {
      const { data, error } = await supabase.rpc('worker_process_event_invitation_backfill_page', {
        p_job_id: jobId, p_lease_token: leaseToken, p_page_size: pageSize, p_now: now.toISOString(),
      })
      if (error) fail('event_invitation_backfill_page', error)
      return first(data) || {}
    },
    async releaseBackfill({ jobId, leaseToken, errorCode, now }) {
      const { data, error } = await supabase.rpc('worker_release_event_invitation_backfill', {
        p_job_id: jobId, p_lease_token: leaseToken, p_error_code: errorCode, p_now: now.toISOString(),
      })
      if (error) fail('event_invitation_backfill_release', error)
      return Boolean(first(data))
    },
  }
}
