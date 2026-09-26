import { randomUUID } from 'node:crypto'
import {
  AIVEX_EDITION, IDENTITY_CARD_FIELDS, IDENTITY_CARD_POLICY, REGISTRATION_FILE_FIELDS, STUDENT_CARD_FIELDS,
  STUDENT_CARD_POLICY, canonicalCardMime,
} from '../../shared/aivex/contract-v4.js'
import { correctionCardSpec } from '../../shared/aivex/correction-items.js'
import {
  MAX_SIGNED_DOCUMENT_SIZE, SIGNED_DOCUMENT_BUCKET, SIGNED_DOCUMENT_TYPES, canonicalSignedDocumentMime,
} from '../../shared/aivex/signed-document-policy.js'
import { sanitizeOriginalFileName } from './aivex-signed-document-upload.js'
import { validateCorrectionCardV4, validateRegistrationFilesV4 } from './aivex-validation-v4.js'
import { validateSignedDocumentUpload } from './aivex-signed-document-validation.js'

const SESSIONS = 'aivex_upload_sessions'
export const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000
export const UPLOAD_SESSION_STALE_MS = 3 * 60 * 1000

export class DirectUploadError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
  }
}

const extensionOf = (filename) => /\.([a-z0-9]+)$/i.exec(String(filename || ''))?.[1].toLowerCase() || ''
const folderOf = (path) => path.slice(0, path.lastIndexOf('/'))
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1)

function normalizeHint(hint, policy, canonicalMime) {
  if (!hint || typeof hint !== 'object') return null
  const mime = canonicalMime(hint.mime)
  const type = policy.types[mime]
  const size = Number(hint.size)
  if (!type || !Number.isInteger(size) || size < 1 || size > policy.maxBytes) return null
  return { mime, extension: type.extension, size }
}

export function buildRegistrationUploadManifest(sessionId, hints) {
  if (!Array.isArray(hints) || hints.length !== REGISTRATION_FILE_FIELDS.length) return null
  const byField = new Map(hints.map((hint) => [hint?.field, hint]))
  if (byField.size !== REGISTRATION_FILE_FIELDS.length || [...byField.keys()].some((field) => !REGISTRATION_FILE_FIELDS.includes(field))) return null
  const folder = `staging/registration/${sessionId}`
  const manifest = []
  for (const field of REGISTRATION_FILE_FIELDS) {
    const student = STUDENT_CARD_FIELDS.includes(field)
    const policy = student ? STUDENT_CARD_POLICY : IDENTITY_CARD_POLICY
    const normalized = normalizeHint(byField.get(field), policy, canonicalCardMime)
    if (!normalized) return null
    manifest.push({
      field,
      bucket: policy.bucket,
      path: `${folder}/${field}.${normalized.extension}`,
      ...normalized,
    })
  }
  return manifest
}

export function buildSignedDocumentUploadManifest(sessionId, hint) {
  const mime = canonicalSignedDocumentMime(hint?.mime)
  const type = SIGNED_DOCUMENT_TYPES[mime]
  const size = Number(hint?.size)
  const originalFileName = sanitizeOriginalFileName(hint?.name)
  if (!type || !Number.isInteger(size) || size < 1 || size > MAX_SIGNED_DOCUMENT_SIZE) return null
  if (!type.extensions.includes(extensionOf(originalFileName))) return null
  return [{
    field: 'file',
    bucket: SIGNED_DOCUMENT_BUCKET,
    path: `staging/signed/${sessionId}/document.${type.extension}`,
    mime,
    extension: type.extension,
    size,
    originalFileName,
  }]
}

// A correction item's replacement student card (the only document-kind item
// with a self-service upload — see correctionCardSpec's own comment for why
// the two identity-document items and the signed form are not built here).
// `itemId` (the aivex_correction_items row id) travels as the manifest's
// `field`, exactly how the registration manifest above carries a field name:
// it is how the finalize handler later knows which item and, via
// `position`, which final storage path and DB row to write to.
export function buildCorrectionCardUploadManifest(sessionId, itemId, item, hint) {
  const spec = correctionCardSpec(item)
  if (!spec) return null
  const normalized = normalizeHint(hint, spec.policy, canonicalCardMime)
  if (!normalized) return null
  return [{
    field: itemId,
    bucket: spec.policy.bucket,
    path: `staging/corrections/${sessionId}/student-${spec.position}.${normalized.extension}`,
    position: spec.position,
    ...normalized,
  }]
}

export function createSupabaseUploadSessionStore(supabase) {
  const storage = (bucket) => supabase.storage.from(bucket)
  return {
    async findRegistrationSession(submissionId, fingerprint, now) {
      const { data, error } = await supabase.from(SESSIONS).select('*')
        .eq('kind', 'registration').eq('submission_id', submissionId).eq('payload_fingerprint', fingerprint)
        .in('status', ['initialized', 'failed', 'finalizing']).gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new DirectUploadError('session-lookup', error)
      return data
    },
    async findSignedSession(registrationId, uploadId, now) {
      const { data, error } = await supabase.from(SESSIONS).select('*')
        .eq('kind', 'signed_document').eq('registration_id', registrationId).eq('upload_id', uploadId)
        .in('status', ['initialized', 'failed', 'finalizing']).gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new DirectUploadError('session-lookup', error)
      return data
    },
    async findCorrectionSession(registrationId, uploadId, now) {
      const { data, error } = await supabase.from(SESSIONS).select('*')
        .eq('kind', 'correction_document').eq('registration_id', registrationId).eq('upload_id', uploadId)
        .in('status', ['initialized', 'failed', 'finalizing']).gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new DirectUploadError('session-lookup', error)
      return data
    },
    async createSession(row) {
      const { data, error } = await supabase.from(SESSIONS).insert(row).select('*').single()
      if (error) throw new DirectUploadError('session-create', error)
      return data
    },
    async loadSession(id) {
      const { data, error } = await supabase.from(SESSIONS).select('*').eq('id', id).maybeSingle()
      if (error) throw new DirectUploadError('session-load', error)
      return data
    },
    async markFinalizing(id, staleBefore) {
      const claim = async (narrow) => {
        const query = supabase.from(SESSIONS).update({ status: 'finalizing' }).eq('id', id)
        const { data, error } = await narrow(query).select('id')
        if (error) throw new DirectUploadError('session-claim', error)
        return data.length > 0
      }
      return await claim((query) => query.in('status', ['initialized', 'failed']))
        || claim((query) => query.eq('status', 'finalizing').lt('updated_at', staleBefore.toISOString()))
    },
    async markCompleted(id, now) {
      const { error } = await supabase.from(SESSIONS).update({ status: 'completed', completed_at: now.toISOString() }).eq('id', id)
      if (error) throw new DirectUploadError('session-complete', error)
    },
    async markFailed(id) {
      const { error } = await supabase.from(SESSIONS).update({ status: 'failed' }).eq('id', id)
      if (error) throw new DirectUploadError('session-fail', error)
    },
    async signedCapabilities(manifest) {
      const capabilities = []
      for (const item of manifest) {
        const { data, error } = await storage(item.bucket).createSignedUploadUrl(item.path, { upsert: false })
        if (error || !data?.signedUrl) throw new DirectUploadError('signed-upload-url', error)
        const { data: listed, error: listError } = await storage(item.bucket).list(folderOf(item.path), { limit: 100 })
        if (listError) throw new DirectUploadError('staging-list', listError)
        capabilities.push({ field: item.field, signedUrl: data.signedUrl, alreadyUploaded: listed.some((entry) => entry.name === nameOf(item.path)) })
      }
      return capabilities
    },
    async inspectManifest(manifest) {
      const files = new Map()
      const groups = new Map()
      for (const item of manifest) {
        const key = `${item.bucket}\n${folderOf(item.path)}`
        if (!groups.has(key)) groups.set(key, { bucket: item.bucket, folder: folderOf(item.path), items: [] })
        groups.get(key).items.push(item)
      }
      for (const group of groups.values()) {
        const { data: listed, error: listError } = await storage(group.bucket).list(group.folder, { limit: 100 })
        if (listError) throw new DirectUploadError('staging-list', listError)
        const expectedNames = new Set(group.items.map((item) => nameOf(item.path)))
        if (listed.some((entry) => !expectedNames.has(entry.name))) {
          return { ok: false, status: 400, reason: 'unexpected_file' }
        }
        for (const item of group.items) {
          const listedObject = listed.find((entry) => entry.name === nameOf(item.path))
          if (!listedObject) return { ok: false, status: 400, reason: 'missing_file', field: item.field }
          const { data: blob, error } = await storage(item.bucket).download(item.path)
          if (error || !blob) return { ok: false, status: 400, reason: 'missing_file', field: item.field }
          const buffer = Buffer.from(await blob.arrayBuffer())
          if (buffer.length !== item.size) return { ok: false, status: buffer.length > item.size ? 413 : 400, reason: 'object_size_mismatch', field: item.field }
          const metadataMime = listedObject.metadata?.mimetype || blob.type || ''
          files.set(item.field, { buffer, size: buffer.length, mimeType: metadataMime, filename: nameOf(item.path) })
        }
      }
      return { ok: true, files }
    },
    async removeStaging(manifest) {
      const groups = new Map()
      for (const item of manifest) {
        if (!groups.has(item.bucket)) groups.set(item.bucket, [])
        groups.get(item.bucket).push(item.path)
      }
      for (const [bucket, paths] of groups) {
        const { error } = await storage(bucket).remove(paths)
        if (error) throw new DirectUploadError('staging-cleanup', error)
      }
    },
  }
}

export async function verifyRegistrationStaging(store, session, students) {
  const manifest = session.expected_files
  if (!Array.isArray(manifest) || manifest.length !== REGISTRATION_FILE_FIELDS.length) return { ok: false, status: 400, reason: 'invalid_session' }
  const inspected = await store.inspectManifest(manifest)
  if (!inspected.ok) return inspected
  const validated = await validateRegistrationFilesV4(students, inspected.files)
  if (!validated.ok) return { ...validated, reason: 'invalid_file' }
  return {
    ok: true,
    cards: validated.cards.map((card) => ({ ...card, sourcePath: manifest.find((item) => item.field === card.field).path })),
    identityCards: validated.identityCards.map((card) => ({ ...card, sourcePath: manifest.find((item) => item.field === card.field).path })),
  }
}

export async function verifySignedDocumentStaging(store, session) {
  const manifest = session.expected_files
  if (!Array.isArray(manifest) || manifest.length !== 1 || manifest[0].field !== 'file') return { ok: false, status: 400, reason: 'invalid_session' }
  const inspected = await store.inspectManifest(manifest)
  if (!inspected.ok) return inspected
  const file = inspected.files.get('file')
  const validated = await validateSignedDocumentUpload(file)
  if (!validated.ok) return { ...validated, reason: 'invalid_file' }
  return { ok: true, file: { ...validated, filename: manifest[0].originalFileName, sourcePath: manifest[0].path } }
}

// `item` (the correction's label, e.g. 'Student card 02') is passed in by
// the caller, which already loaded the aivex_correction_items row fresh
// (never trusted from the session alone) — the manifest's own `field` is
// only the item's id, used to fetch that row, not to re-derive its label.
export async function verifyCorrectionUploadStaging(store, session, item) {
  const manifest = session.expected_files
  if (!Array.isArray(manifest) || manifest.length !== 1) return { ok: false, status: 400, reason: 'invalid_session' }
  const inspected = await store.inspectManifest(manifest)
  if (!inspected.ok) return inspected
  const file = inspected.files.get(manifest[0].field)
  const validated = await validateCorrectionCardV4(item, file)
  if (!validated.ok) return { ...validated, reason: 'invalid_file' }
  return { ok: true, file: { ...validated, sourcePath: manifest[0].path, bucket: manifest[0].bucket } }
}

export const newUploadSessionId = () => randomUUID()

export function sessionExpiry(now = new Date()) {
  return new Date(now.getTime() + UPLOAD_SESSION_TTL_MS)
}

export function sessionIsUsable(session, kind, now = new Date()) {
  return Boolean(session && session.kind === kind && new Date(session.expires_at).getTime() > now.getTime())
}

export function directUploadEditionIsCurrent(edition) {
  return Number(edition) === AIVEX_EDITION
}
