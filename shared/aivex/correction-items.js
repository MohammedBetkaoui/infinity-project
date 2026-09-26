// The 8 fixed AIVEX correction items (api/_lib/admin-aivex-validation.js's
// CORRECTION_ITEMS, checked into the admin dashboard's "request corrections"
// modal) and what kind of fix each one takes: a text-field edit, or a
// document re-upload. One source of truth for both the candidate-facing
// resubmission endpoints and the admin review UI.
//
// Kept in manual sync with the `case` expression in the migration that
// populates aivex_correction_items.kind — the same convention already used
// for DOCUMENT_STATUSES between this shared/ tree and the SQL CHECK
// constraints (see contract-v4.js's own comment on that).
//
// Pure: no React, window, document, Supabase, process.env or network.

import { STUDENT_CARD_POLICY } from './contract-v4.js'

const frozen = (list) => Object.freeze([...list])

export const CORRECTION_ITEM_KIND = Object.freeze({
  'Team information': 'field',
  'Activities manager': 'field',
  'Delegation leader ID': 'document',
  'Driver ID': 'document',
  'Student card 01': 'document',
  'Student card 02': 'document',
  'Student card 03': 'document',
  'Signed and stamped form': 'document',
})

export const CORRECTION_ITEMS = frozen(Object.keys(CORRECTION_ITEM_KIND))

// document_key each document-kind item maps to (api/_lib/admin-aivex-
// validation.js's DOCUMENT_KEY_RE vocabulary) — absent for 'Signed and
// stamped form', whose document_key is versioned (signed-vN) at upload time,
// never fixed.
export const CORRECTION_ITEM_DOCUMENT_KEY = Object.freeze({
  'Delegation leader ID': 'delegation-leader',
  'Driver ID': 'driver',
  'Student card 01': 'student-1',
  'Student card 02': 'student-2',
  'Student card 03': 'student-3',
})

// The one document-kind item that goes through the NEW, self-service
// correction upload endpoints (api/aivex/magic-link/upload/init.js +
// finalize.js's correction branch): a student card. One shape for both the
// staging-manifest builder (api/_lib/aivex-direct-upload.js, before any
// bytes exist — policy is enough) and the finalize validator (api/_lib/
// aivex-validation-v4.js, once the real bytes are in hand — position
// decides the final storage path and DB row).
//
// Deliberately NOT 'Delegation leader ID' / 'Driver ID': those are identity
// documents (a national ID card image), and shared/aivex/contract-v4.js's
// own IDENTITY_CARD_POLICY comment is explicit that they are "never
// reachable through the candidate Magic Link" — a security boundary
// tests/aivex-identity-documents.test.mjs enforces by scanning every
// Magic-Link-reachable file for identity-card references. A team that needs
// one of those two corrected is directed to contact the organisers instead
// (see CorrectionRequestPanel.jsx); the admin applies the fix from their
// side. Nor 'Signed and stamped form': that keeps using the pre-existing
// signed-document upload flow, unrelated to this per-item mechanism.
const STUDENT_CARD_ITEM_RE = /^Student card 0([1-3])$/

export function correctionCardSpec(item) {
  const match = STUDENT_CARD_ITEM_RE.exec(item)
  return match ? { policy: STUDENT_CARD_POLICY, position: Number(match[1]) } : null
}
