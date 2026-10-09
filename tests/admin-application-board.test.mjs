import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { allowedApplicationActions } from '../api/_lib/admin-applications-permissions.js'
import { BOARD_STAGES, applicationActionPayload, applicationMove } from '../src/admin/applicationMoves.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const STATUS_LABELS = Object.freeze({
  new: 'New', in_review: 'In review', interview: 'Interview',
  accepted: 'Accepted', declined: 'Declined', archived: 'Archived',
})

const recordFor = (role, statusKey, joinType) => ({
  status: STATUS_LABELS[statusKey],
  type: joinType === 'staff' ? 'Staff' : 'Member',
  allowedActions: allowedApplicationActions(role, { status: statusKey, join_type: joinType }),
})

test('the Applications board only offers moves the server already allows', () => {
  for (const statusKey of Object.keys(STATUS_LABELS)) {
    for (const joinType of ['member', 'staff']) {
      const record = recordFor('super_admin', statusKey, joinType)
      for (const stage of BOARD_STAGES) {
        const move = applicationMove(record, stage)
        if (!move) continue
        assert.ok(record.allowedActions.includes(move.action), `${record.status} → ${stage} must use an allowed action`)
        assert.notEqual(stage, record.status, 'dropping on the current stage is not a move')
        assert.notEqual(stage, 'New', 'nothing moves an application back to New')
      }
    }
  }
})

test('board moves mirror the decision bar of the application dossier', () => {
  const record = recordFor('super_admin', 'new', 'staff')
  assert.deepEqual(applicationMove(record, 'In review'), { title: 'Move application to review', action: 'start_review' })
  assert.equal(applicationMove(record, 'Interview').action, 'schedule_interview')
  assert.deepEqual(applicationMove(record, 'Interview').fields.map((field) => field.name), ['interviewAt', 'interviewLocation'])
  assert.equal(applicationMove(record, 'Accepted'), null, 'Staff acceptance is available only after a submitted confirmation')
  assert.deepEqual(applicationMove(record, 'Declined'), { title: 'Decline application', action: 'decline', danger: true })
  assert.deepEqual(applicationMove(record, 'Archived'), { title: 'Archive application', action: 'archive', danger: true })
  assert.equal(applicationMove(recordFor('super_admin', 'new', 'member'), 'Accepted').action, 'accept_member')
  // Closed applications can only be archived, exactly like the dossier.
  for (const statusKey of ['accepted', 'declined']) {
    const closed = recordFor('super_admin', statusKey, 'member')
    assert.deepEqual(BOARD_STAGES.filter((stage) => applicationMove(closed, stage)), ['Archived'])
  }
  assert.deepEqual(BOARD_STAGES.filter((stage) => applicationMove(recordFor('super_admin', 'archived', 'member'), stage)), [])
  // Roles without application rights get no move at all.
  for (const role of ['administrator', 'reviewer']) {
    assert.deepEqual(BOARD_STAGES.filter((stage) => applicationMove(recordFor(role, 'new', 'member'), stage)), [])
  }
})

test('board drops reuse the confirmation dialog and the manual action payload', async () => {
  const [board, page] = await Promise.all([read('src/admin/ApplicationsBoard.jsx'), read('src/admin/ApplicationsPage.jsx')])
  assert.match(board, /<ActionDialog/)
  assert.match(board, /reason: false, description: false/)
  assert.match(board, /expectedUpdatedAt: pending\.record\.updatedAt/)
  assert.match(page, /payload: applicationActionPayload\(action\.applicationAction, values, detail\)/)
  assert.deepEqual(applicationActionPayload('schedule_interview', { interviewAt: '2026-10-08T14:30', interviewLocation: 'Room 12' }).location, 'Room 12')
  assert.deepEqual(applicationActionPayload('start_review', {}), {})
  assert.doesNotMatch(`${board}\n${page}`, /localStorage|sessionStorage/)
})
