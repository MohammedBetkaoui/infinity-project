// AIVEX Magic Link — Supabase-backed store, same small-interface-over-one-
// client shape as createSupabaseDocumentStore (api/_lib/aivex-document-
// store.js) and createSupabaseRegistrationStore (api/_lib/aivex-
// registration-v4.js): a StoreError carrying a stage + code, nothing else.
//
// Every query here is server-side only (the caller always holds the
// service-role client) — the browser never talks to aivex_magic_links
// directly, and RLS denies anon/authenticated by default anyway (see the
// migration).

const MAGIC_LINKS = 'aivex_magic_links'
const REGISTRATIONS = 'aivex_registrations'
const CORRECTIONS = 'aivex_correction_requests'
const CORRECTION_ITEMS = 'aivex_correction_items'

export class MagicLinkStoreError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
  }
}

export function createSupabaseMagicLinkStore(supabase) {
  return {
    // Rotation: revoke every still-active link for this registration, then
    // insert the new one. Two plain statements rather than one transaction
    // (this client has no cross-statement transaction primitive) — a crash
    // between them leaves at most an extra revoked row behind, never two
    // simultaneously active links for the same registration, and never a
    // registration left with no way to get a working link (the next call
    // retries the same two steps).
    async createOrRotate(registrationId, { tokenHash, expiresAt, createdIpHash, userAgentHash, now }) {
      const { error: revokeError } = await supabase.from(MAGIC_LINKS)
        .update({ revoked_at: now.toISOString() })
        .eq('registration_id', registrationId)
        .is('revoked_at', null)
      if (revokeError) throw new MagicLinkStoreError('revoke-previous', revokeError)

      const { data, error } = await supabase.from(MAGIC_LINKS)
        .insert({
          registration_id: registrationId,
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
          created_ip_hash: createdIpHash,
          user_agent_hash: userAgentHash,
        })
        .select('id')
        .single()
      if (error) throw new MagicLinkStoreError('insert', error)
      return data.id
    },
    // Never selects the token itself back (there is nothing to select —
    // only the hash is stored) — just enough to decide validity
    // (api/_lib/aivex-magic-link.js's resolveMagicLink) and to locate the
    // registration.
    async findByTokenHash(tokenHash) {
      const { data, error } = await supabase.from(MAGIC_LINKS)
        .select('id, registration_id, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle()
      if (error) throw new MagicLinkStoreError('find', error)
      return data
    },
    // Best-effort from the caller's side (verify/download never fail the
    // response over this write failing) — just a "was this link actually
    // used" signal for a possible future admin view.
    async touchLastUsed(id, now) {
      const { error } = await supabase.from(MAGIC_LINKS).update({ last_used_at: now.toISOString() }).eq('id', id)
      if (error) throw new MagicLinkStoreError('touch', error)
    },
    // Candidate-safe projection only (api/aivex/magic-link/verify.js's own
    // comment lists what must never appear here): no internal id beyond
    // what identifies the row to the caller who already proved possession
    // of the token, no student rows, no card paths, no other registration.
    async loadCandidateRegistration(registrationId) {
      const { data, error } = await supabase.from(REGISTRATIONS)
        .select('reference, team_name, institution_name, wilaya_name, student_count, registration_status, document_status')
        .eq('id', registrationId)
        .maybeSingle()
      if (error) throw new MagicLinkStoreError('load-registration', error)
      return data
    },
    // The one open (unresolved) correction request for this registration, if
    // any, with its per-item status — same candidate-safe projection rule as
    // above: the team's own message, deadline and each item's live status
    // (needed to know which items still need the team's action vs. already
    // submitted/verified), never `internal_note` (admin-only), the reviewer,
    // or a rejected attempt's review_note.
    async latestOpenCorrection(registrationId) {
      const { data, error } = await supabase.from(CORRECTIONS)
        .select('id, team_message, due_at')
        .eq('registration_id', registrationId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new MagicLinkStoreError('load-correction', error)
      if (!data) return null

      const { data: items, error: itemsError } = await supabase.from(CORRECTION_ITEMS)
        .select('id, item, kind, status')
        .eq('correction_request_id', data.id)
      if (itemsError) throw new MagicLinkStoreError('load-correction-items', itemsError)

      return { message: data.team_message, deadline: data.due_at, items: items || [] }
    },
  }
}
