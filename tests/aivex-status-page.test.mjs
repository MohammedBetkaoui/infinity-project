// The candidate status page's presentation layer: the pure model behind the
// progress tracker / badge / panel choice, and the strings every state needs
// in FR / EN / AR. (No jsdom in this project's toolchain — components are
// covered by the static checks in aivex-signed-document.test.mjs and by the
// manual browser pass; what can run under `node --test` lives here.)

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { UPLOAD_ELIGIBLE_DOCUMENT_STATUSES } from '../shared/aivex/signed-document-policy.js'
import { statusStrings } from '../src/pages/aivex/status/statusI18n.js'
import {
  PROGRESS_STEPS, formatFileSize, formatReceivedAt, isImageFile, progressFor, stageFor, toneFor,
} from '../src/pages/aivex/status/statusModel.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const ALL_DOCUMENT_STATUSES = [
  'not_generated', 'generating', 'awaiting_signature', 'signed_document_uploaded', 'under_review',
  'changes_required', 'validated', 'generation_failed', 'expired',
]

test('progressFor: always four steps, in order, each with a known state', () => {
  for (const status of [...ALL_DOCUMENT_STATUSES, 'something_new', undefined, null]) {
    const steps = progressFor(status)
    assert.deepEqual(steps.map((step) => step.id), [...PROGRESS_STEPS])
    for (const { state } of steps) assert.ok(['done', 'current', 'attention', 'upcoming'].includes(state), `${status}: ${state}`)
  }
})

test('progressFor: at most one step is "current", and nothing after the current step is "done"', () => {
  for (const status of ALL_DOCUMENT_STATUSES) {
    const states = progressFor(status).map((step) => step.state)
    assert.ok(states.filter((state) => state === 'current').length <= 1, status)
    const current = states.indexOf('current')
    if (current !== -1) assert.ok(!states.slice(current + 1).includes('done'), `${status}: ${states}`)
  }
})

test('progressFor: the candidate always sees their registration as done (the link resolved)', () => {
  for (const status of [...ALL_DOCUMENT_STATUSES, 'something_new']) assert.equal(progressFor(status)[0].state, 'done', status)
})

test('progressFor: a received signed document is NOT presented as reviewed or validated', () => {
  const byId = Object.fromEntries(progressFor('signed_document_uploaded').map((step) => [step.id, step.state]))
  assert.equal(byId.signed, 'done')
  assert.equal(byId.review, 'upcoming', 'received != validated')
  assert.notEqual(progressFor('awaiting_signature')[2].state, 'done')
  // Only a genuinely validated file completes the last step.
  for (const status of ALL_DOCUMENT_STATUSES) {
    assert.equal(progressFor(status)[3].state === 'done', status === 'validated', status)
  }
})

test('progressFor: problems are flagged, not hidden', () => {
  assert.equal(progressFor('generation_failed')[1].state, 'attention')
  assert.equal(progressFor('changes_required')[2].state, 'attention')
  assert.equal(progressFor('expired')[2].state, 'attention')
})

test('progressFor: an unknown status claims nothing beyond the registration', () => {
  assert.deepEqual(progressFor('brand_new_status').map((step) => step.state), ['done', 'upcoming', 'upcoming', 'upcoming'])
})

test('toneFor: action for the signature step, success only for received/validated, issue for problems', () => {
  assert.equal(toneFor('awaiting_signature'), 'action')
  assert.equal(toneFor('signed_document_uploaded'), 'success')
  assert.equal(toneFor('validated'), 'success')
  for (const status of ['generation_failed', 'changes_required', 'expired']) assert.equal(toneFor(status), 'issue', status)
  for (const status of ['not_generated', 'generating', 'under_review', 'something_new']) assert.equal(toneFor(status), 'pending', status)
})

test('stageFor: the two upload stages are exactly the statuses the server accepts an upload for', () => {
  const uploadStages = ALL_DOCUMENT_STATUSES.filter((status) => ['sign', 'received'].includes(stageFor(status)))
  assert.deepEqual([...uploadStages].sort(), [...UPLOAD_ELIGIBLE_DOCUMENT_STATUSES].sort())
  assert.equal(stageFor('awaiting_signature'), 'sign')
  assert.equal(stageFor('signed_document_uploaded'), 'received')
  assert.equal(stageFor('not_generated'), 'preparing')
  assert.equal(stageFor('generating'), 'preparing')
  assert.equal(stageFor('generation_failed'), 'retry')
  for (const status of ['under_review', 'changes_required', 'validated', 'expired', 'something_new']) assert.equal(stageFor(status), 'other', status)
})

test('formatFileSize: KB under a megabyte, one-decimal MB above, never empty', () => {
  const units = { sizeUnitKb: 'KB', sizeUnit: 'MB' }
  assert.equal(formatFileSize(0, units), '0 KB')
  assert.equal(formatFileSize(NaN, units), '0 KB')
  assert.equal(formatFileSize(1, units), '1 KB', 'a tiny file is not shown as 0')
  assert.equal(formatFileSize(2048, units), '2 KB')
  assert.equal(formatFileSize(1024 * 1024, units), '1.0 MB')
  assert.equal(formatFileSize(3.5 * 1024 * 1024, units), '3.5 MB')
  assert.equal(formatFileSize(1024 * 1024, { sizeUnitKb: 'Ko', sizeUnit: 'Mo' }), '1.0 Mo')
})

test('formatReceivedAt: formats a real timestamp per language, and returns "" for garbage', () => {
  const iso = '2026-09-21T13:32:00.000Z'
  for (const lang of ['en', 'fr', 'ar']) {
    const text = formatReceivedAt(iso, lang)
    assert.equal(typeof text, 'string')
    assert.ok(text.length > 5, `${lang}: ${text}`)
  }
  assert.match(formatReceivedAt(iso, 'fr'), /septembre/)
  assert.match(formatReceivedAt(iso, 'en'), /September/)
  assert.equal(formatReceivedAt('not a date', 'fr'), '')
  assert.equal(formatReceivedAt(undefined, 'en'), '')
  assert.ok(formatReceivedAt(iso, 'xx').length > 5, 'an unknown language falls back rather than throwing')
})

test('isImageFile: images by MIME type or extension, PDFs and nothing are not', () => {
  assert.equal(isImageFile({ type: 'image/png', name: 'a' }), true)
  assert.equal(isImageFile({ type: '', name: 'scan.JPG' }), true)
  assert.equal(isImageFile({ type: '', name: 'scan.jpeg' }), true)
  assert.equal(isImageFile({ type: 'application/pdf', name: 'a.pdf' }), false)
  assert.equal(isImageFile(null), false)
  assert.equal(isImageFile(undefined), false)
})

// ---------------------------------------------------------------------------
// Strings: the same keys in every language, and nothing implying validation.
// ---------------------------------------------------------------------------

// Strings that take a value (a date, a count) are functions returning text.
const PARAMETERISED = { uploadReceivedOn: { date: '21 Sep' }, studentsValue: { count: 3 } }

const STRING_KEYS = [
  'headerLabel', 'retryButton', 'copyReference', 'referenceCopied', 'referenceCopyFailed', 'progressTitle',
  'nextStepTitle', 'stepDownloadTitle', 'stepSignTitle', 'stepSignText', 'preparingTitle', 'refreshButton',
  'refreshing', 'refreshFailed', 'retryTitle', 'retryText', 'officialFormTitle', 'sizeUnit', 'sizeUnitKb',
  'uploadDropTitle', 'uploadDropActive', 'uploadDropOr', 'uploadRemove', 'uploadProcessing',
  'newVersionTitle', 'newVersionHint', 'helpText', 'privateNote', 'fieldReference', 'fieldInstitution',
  'fieldWilaya', 'fieldStudents', 'fieldRegistrationStatus', 'validKicker',
]

test('status strings: every new key exists, as a non-empty string, in EN, FR and AR', () => {
  for (const [lang, strings] of Object.entries(statusStrings)) {
    for (const key of STRING_KEYS) {
      assert.equal(typeof strings[key], 'string', `${lang}.${key}`)
      assert.ok(strings[key].trim().length > 0, `${lang}.${key} is empty`)
    }
    for (const [key, args] of Object.entries(PARAMETERISED)) {
      assert.equal(typeof strings[key], 'function', `${lang}.${key}`)
      assert.match(strings[key](args), /21 Sep|3/, `${lang}.${key} uses its value`)
    }
    for (const id of PROGRESS_STEPS) assert.ok(strings.steps[id], `${lang}.steps.${id}`)
    for (const state of ['done', 'current', 'upcoming', 'attention']) assert.ok(strings.stepState[state], `${lang}.stepState.${state}`)
  }
})

test('status strings: every document status has a label in every language, and every language has the same keys', () => {
  const reference = Object.keys(statusStrings.en).sort()
  for (const [lang, strings] of Object.entries(statusStrings)) {
    assert.deepEqual(Object.keys(strings).sort(), reference, `${lang} has the same keys as en`)
    for (const status of ALL_DOCUMENT_STATUSES) assert.ok(strings.documentStatus[status], `${lang}.documentStatus.${status}`)
  }
})

test('status strings: "received" wording never claims the document was checked or validated', () => {
  for (const [lang, strings] of Object.entries(statusStrings)) {
    const received = [
      strings.uploadSuccessTitle, strings.uploadReceivedTitle, strings.uploadReceivedNote, strings.uploadReceivedOn({ date: '' }),
      strings.documentStatus.signed_document_uploaded,
    ].join(' ')
    assert.doesNotMatch(received, /valid[ée]|validated|approved|approuv|مصادَق|مقبول|تم التحقق/i, lang)
  }
})

test('the help line reuses the shared Instagram URL, and the page never invents a contact channel', async () => {
  const notices = await read('src/pages/aivex/status/StatusNotices.jsx')
  assert.match(notices, /import \{ INSTAGRAM_URL \} from '\.\.\/aivexData'/, 'the handle comes from the shared AIVEX data, not a second copy')
  assert.match(notices, /rel="noreferrer noopener"/, 'the token-bearing URL is never sent as a referrer')
  assert.doesNotMatch(notices, /mailto:|tel:|whatsapp/i, 'no contact channel the organisers have not published')
})

// ---------------------------------------------------------------------------
// The upload stays private to the browser: no storage, no logging, no
// third-party request carrying the Magic Link.
// ---------------------------------------------------------------------------

const withoutComments = (source) => source
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n')

test('status page components never persist, log or beacon anything', async () => {
  const files = [
    'AivexStatusPage.jsx', 'DossierHeader.jsx', 'OfficialFormPanel.jsx', 'ProgressTracker.jsx', 'ReceivedPanel.jsx',
    'SignaturePanel.jsx', 'SignedDocumentDropzone.jsx', 'StatusNotices.jsx', 'statusModel.js', 'useAivexStatus.js',
  ]
  for (const file of files) {
    const code = withoutComments(await read(`src/pages/aivex/status/${file}`))
    assert.doesNotMatch(code, /sessionStorage|indexedDB|document\.cookie/, file)
    assert.doesNotMatch(code, /console\.(log|error|warn|info|debug)/, file)
    assert.doesNotMatch(code, /sendBeacon|gtag|dataLayer|analytics/i, file)
    // Only the page's own language preference may ever be written to storage.
    if (file !== 'AivexStatusPage.jsx') assert.doesNotMatch(code, /localStorage|\.setItem\(/, file)
  }
  const page = withoutComments(await read('src/pages/aivex/status/AivexStatusPage.jsx'))
  assert.deepEqual(page.match(/\.setItem\([^)]*\)/g), ['.setItem(REGISTER_LANG_STORAGE_KEY, lang)'], 'the only write is the language preference')
})

test('the upload sends the file to this site\'s own endpoint only, with a per-file idempotency id', async () => {
  const hook = withoutComments(await read('src/pages/aivex/status/useAivexStatus.js'))
  assert.match(hook, /const UPLOAD_ENDPOINT = '\/api\/aivex\/magic-link\/upload'/)
  assert.match(hook, /request\.open\('POST', UPLOAD_ENDPOINT\)/)
  assert.doesNotMatch(hook, /https?:\/\//, 'no absolute URL: nothing leaves this origin')
  assert.match(hook, /createSubmissionId/, 'the uploadId is generated per picked file')
  assert.match(hook, /upload\.onprogress/, 'progress is the real transfer, not a fake timer')
})
