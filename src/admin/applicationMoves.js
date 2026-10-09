// Stage moves offered by the Applications board. Each move is exactly an
// action the decision bar of the application dossier already offers, with the
// same title, fields and danger flag, and the server still checks every action.
export const BOARD_STAGES = Object.freeze(['New', 'In review', 'Interview', 'Accepted', 'Declined', 'Archived'])

export const INTERVIEW_FIELDS = Object.freeze([
  { name: 'interviewAt', label: 'Interview date and time', type: 'datetime-local', required: true },
  { name: 'interviewLocation', label: 'Location / meeting room', required: true },
])

export function applicationMove(record, target) {
  if (!record || record.status === target) return null
  const can = (action) => !record.allowedActions || record.allowedActions.includes(action)
  const closed = ['Accepted', 'Declined', 'Archived'].includes(record.status)
  const acceptAction = record.type === 'Staff' ? 'accept_staff' : 'accept_member'
  switch (target) {
    case 'In review':
      return can('start_review') && !['In review', 'Accepted', 'Archived'].includes(record.status)
        ? { title: 'Move application to review', action: 'start_review' } : null
    case 'Interview':
      return can('schedule_interview') && !closed
        ? { title: 'Schedule interview', action: 'schedule_interview', fields: INTERVIEW_FIELDS } : null
    case 'Accepted':
      return can(acceptAction) && !['Accepted', 'Archived'].includes(record.status)
        ? { title: record.type === 'Staff' ? 'Accept into staff' : 'Accept as member', action: acceptAction } : null
    case 'Declined':
      return can('decline') && !['Declined', 'Archived'].includes(record.status)
        ? { title: 'Decline application', action: 'decline', danger: true } : null
    case 'Archived':
      return can('archive') && record.status !== 'Archived'
        ? { title: 'Archive application', action: 'archive', danger: true } : null
    default:
      return null
  }
}

export function applicationActionPayload(actionName, values, detail) {
  if (actionName === 'schedule_interview') return { scheduledAt: new Date(values.interviewAt).toISOString(), location: values.interviewLocation }
  if (actionName === 'change_staff_department') return { department: values.track }
  if (actionName === 'request_staff_confirmation_revision') return {
    revisionMessage: values.revisionMessage,
    confirmationUpdatedAt: detail?.staffConfirmation?.updatedAt,
  }
  if (['regenerate_staff_confirmation_link', 'revoke_staff_confirmation', 'confirm_staff_membership'].includes(actionName)) {
    return { confirmationUpdatedAt: detail?.staffConfirmation?.updatedAt }
  }
  return {}
}
