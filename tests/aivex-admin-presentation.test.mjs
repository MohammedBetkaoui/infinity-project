import assert from 'node:assert/strict'
import test from 'node:test'
import { aivexDateLabel, aivexFilePresentation } from '../src/admin/aivexPresentation.js'
import { AIVEX_ARABIC_COPY } from '../src/admin/AivexI18n.js'

test('administrative dates are readable and localized without shifting a date-only deadline', () => {
  assert.equal(aivexDateLabel('2026-10-02'), '2 Oct 2026')
  assert.equal(aivexDateLabel('2026-10-02T23:59:59.999Z'), '2 Oct 2026')
  assert.doesNotMatch(aivexDateLabel('2026-10-02', 'ar'), /[a-z]/i)
  assert.equal(aivexDateLabel(null), '—')
  assert.equal(aivexDateLabel('invalid'), '—')
})

test('closed files never prompt the administrator to resume review or accept a team', () => {
  for (const registration of ['Rejected', 'Cancelled']) {
    const state = aivexFilePresentation({ registration, document: 'Under review', reviewSummary: { readyForFinalValidation: true } })
    assert.equal(state.label, registration)
    assert.equal(state.tab, 'History')
  }
  assert.equal(aivexFilePresentation({ document: 'Validated' }).label, 'Team accepted')
})

test('an active correction takes priority over readiness and distinguishes received items from waiting', () => {
  // List records do not include per-item statuses: do not claim the team is still waiting.
  assert.equal(aivexFilePresentation({ document: 'Corrections needed' }).title, 'Follow up corrections')
  const team = { document: 'Under review', reviewSummary: { readyForFinalValidation: true }, correctionRequest: { itemStatuses: [{ status: 'open' }] } }
  assert.equal(aivexFilePresentation(team).title, 'Waiting for corrections')
  team.correctionRequest.itemStatuses[0].status = 'submitted'
  assert.equal(aivexFilePresentation(team).title, 'Review the corrections received')
  assert.equal(aivexFilePresentation(team).tab, 'Verification')
})

test('receipt and a 100% list score do not claim final acceptance', () => {
  const received = aivexFilePresentation({ document: 'Signed document received', completeness: 100 })
  assert.equal(received.label, 'Ready to review')
  const ready = aivexFilePresentation({ document: 'Under review', reviewSummary: { readyForFinalValidation: true } })
  assert.equal(ready.label, 'Ready for decision')
  assert.equal(ready.tab, 'Verification')
})

test('unavailable forms guide the administrator to documents instead of final acceptance', () => {
  for (const document of ['Not generated', 'Generating', 'Generation issue', 'Expired']) {
    const state = aivexFilePresentation({ document })
    assert.equal(state.tab, 'Documents')
    assert.equal(state.tone, ['Generation issue', 'Expired'].includes(document) ? 'warning' : 'neutral')
  }
})

test('guidance for every visible state has Arabic translations', () => {
  const teams = [
    ...['Rejected', 'Cancelled'].map((registration) => ({ registration })),
    ...['Validated', 'Corrections needed', 'Awaiting signature', 'Not generated', 'Generating', 'Generation issue', 'Expired', 'Signed document received', 'Under review'].map((document) => ({ document })),
    { correctionRequest: { itemStatuses: [{ status: 'submitted' }] } },
    { correctionRequest: { itemStatuses: [{ status: 'open' }] } },
    { reviewSummary: { readyForFinalValidation: true } },
  ]
  for (const team of teams) {
    const state = aivexFilePresentation(team)
    for (const key of ['label', 'title', 'copy', 'action']) assert(AIVEX_ARABIC_COPY[state[key]], state[key])
  }
})
