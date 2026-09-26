// Presentation logic for the candidate status page. Pure: no React, no DOM,
// no network — so it runs under `node --test` and the components stay thin.
//
// Everything here is derived from document_status, the one field the server
// already owns (see docs/aivex-data-contract-v4.md, §10). Nothing here
// decides what a candidate is ALLOWED to do: upload eligibility stays with
// shared/aivex/signed-document-policy.js, which the server enforces too.

export const PROGRESS_STEPS = Object.freeze(['registered', 'form', 'signed', 'review'])

// document_status -> the state of each of the four steps above.
//   done       finished
//   current    where the file is right now
//   attention  stuck until somebody acts (a failed generation, a change asked for)
//   upcoming   not reached yet
const PROGRESS = {
  not_generated: ['done', 'current', 'upcoming', 'upcoming'],
  generating: ['done', 'current', 'upcoming', 'upcoming'],
  generation_failed: ['done', 'attention', 'upcoming', 'upcoming'],
  awaiting_signature: ['done', 'done', 'current', 'upcoming'],
  // Received is NOT reviewed: the review step stays "upcoming" until an
  // organiser actually moves the file (nothing in the application does yet).
  signed_document_uploaded: ['done', 'done', 'done', 'upcoming'],
  under_review: ['done', 'done', 'done', 'current'],
  changes_required: ['done', 'done', 'attention', 'upcoming'],
  validated: ['done', 'done', 'done', 'done'],
  expired: ['done', 'done', 'attention', 'upcoming'],
}
// A status this page has never heard of still shows a truthful minimum: the
// registration exists (the token resolved), nothing else is claimed.
const UNKNOWN_PROGRESS = ['done', 'upcoming', 'upcoming', 'upcoming']

export function progressFor(documentStatus) {
  const states = PROGRESS[documentStatus] || UNKNOWN_PROGRESS
  return PROGRESS_STEPS.map((id, index) => ({ id, state: states[index] }))
}

// Colour family of the status badge: pending (grey), action (amber — the
// candidate has something to do), success (green), issue (red).
const TONES = {
  not_generated: 'pending',
  generating: 'pending',
  generation_failed: 'issue',
  awaiting_signature: 'action',
  signed_document_uploaded: 'success',
  under_review: 'pending',
  changes_required: 'issue',
  validated: 'success',
  expired: 'issue',
}
export const toneFor = (documentStatus) => TONES[documentStatus] || 'pending'

// One candidate-facing dossier state, derived only from the two server-owned
// statuses returned by the Magic Link endpoint. Closed decisions take
// priority, and a team is called accepted only when both the registration and
// the administrative document have reached their final states.
export function dossierStateFor(registrationStatus, documentStatus) {
  if (registrationStatus === 'rejected') return { key: 'rejected', tone: 'issue' }
  if (registrationStatus === 'cancelled') return { key: 'cancelled', tone: 'issue' }
  if (documentStatus === 'changes_required') return { key: 'changes_required', tone: 'issue' }
  if (documentStatus === 'generation_failed') return { key: 'generation_issue', tone: 'issue' }
  if (documentStatus === 'expired') return { key: 'expired', tone: 'issue' }
  if (registrationStatus === 'approved' && documentStatus === 'validated') return { key: 'accepted', tone: 'success' }
  if (documentStatus === 'awaiting_signature') return { key: 'action_required', tone: 'action' }
  if (documentStatus === 'signed_document_uploaded') return { key: 'received', tone: 'success' }
  if (documentStatus === 'under_review' || ['under_review', 'approved'].includes(registrationStatus)) {
    return { key: 'under_review', tone: 'pending' }
  }
  if (['not_generated', 'generating'].includes(documentStatus)) return { key: 'preparing', tone: 'pending' }
  if (registrationStatus === 'submitted') return { key: 'submitted', tone: 'pending' }
  return { key: 'unknown', tone: 'pending' }
}

// Which panel the page leads with. 'sign' and 'received' are the two that
// can upload (the same two statuses shared/aivex/signed-document-policy.js
// lists); the rest are informational.
export function stageFor(documentStatus) {
  switch (documentStatus) {
    case 'awaiting_signature': return 'sign'
    case 'signed_document_uploaded': return 'received'
    case 'changes_required': return 'sign'
    case 'not_generated':
    case 'generating': return 'preparing'
    case 'generation_failed': return 'retry'
    default: return 'other' // under_review, validated, expired
  }
}

const DATE_LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-DZ' }

// "21 septembre 2026 à 15:32", in the reader's own time zone. Empty string
// for anything that is not a real date, so the caller can simply omit it.
export function formatReceivedAt(value, lang) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[lang] || DATE_LOCALES.en, { dateStyle: 'long', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ')
  }
}

// "21 septembre 2026", the correction deadline (a date, not a timestamp — no
// time-of-day to show).
export function formatCorrectionDeadline(value, lang) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[lang] || DATE_LOCALES.en, { dateStyle: 'long', timeZone: 'UTC' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

// `units` = { sizeUnitKb, sizeUnit } from the language strings.
export function formatFileSize(bytes, units) {
  if (!(bytes > 0)) return `0 ${units.sizeUnitKb}`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${units.sizeUnitKb}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${units.sizeUnit}`
}

export const isImageFile = (file) => /^image\//.test(file?.type || '') || /\.(jpe?g|png)$/i.test(file?.name || '')
