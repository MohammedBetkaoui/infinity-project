// Display guidance only. Permissions and final acceptance remain server-owned.
export function aivexDateLabel(value, language = 'en') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-DZ' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

export function aivexFilePresentation(team) {
  if (['Rejected', 'Cancelled'].includes(team.registration)) {
    return { label: team.registration, tone: 'neutral', title: 'This file is closed', copy: 'No further review is required. You can consult the file and its history.', action: 'View history', tab: 'History' }
  }
  if (team.document === 'Validated') {
    return { label: 'Team accepted', tone: 'success', title: 'Team accepted', copy: 'All required checks are complete. The team is accepted for AIVEX.', action: 'View history', tab: 'History' }
  }
  if (team.correctionRequest || team.document === 'Corrections needed') {
    if (!team.correctionRequest) {
      return { label: 'Corrections requested', tone: 'warning', title: 'Follow up corrections', copy: 'Open the file to see the requested items and their progress.', action: 'Follow up corrections', tab: 'Verification' }
    }
    const submitted = team.correctionRequest?.itemStatuses?.some((item) => item.status === 'submitted')
    return { label: submitted ? 'Corrections to review' : 'Corrections requested', tone: 'warning', title: submitted ? 'Review the corrections received' : 'Waiting for corrections', copy: submitted ? 'New information or documents are ready for your review below.' : 'Check the requested items and their deadline in the follow-up below.', action: 'Follow up corrections', tab: 'Verification' }
  }
  if (team.reviewSummary?.readyForFinalValidation) {
    return { label: 'Ready for decision', tone: 'success', title: 'Ready for final acceptance', copy: 'All required checks are complete. An administrator can now accept this team.', action: 'Review & decision', tab: 'Verification' }
  }
  if (team.document === 'Awaiting signature') {
    return { label: 'Awaiting signature', tone: 'neutral', title: 'Waiting for the signed form', copy: 'The team must return the form signed and stamped by its institution.', action: 'View documents', tab: 'Documents' }
  }
  if (['Not generated', 'Generating', 'Generation issue', 'Expired'].includes(team.document)) {
    const needsAttention = ['Generation issue', 'Expired'].includes(team.document)
    return { label: needsAttention ? 'Form needs attention' : 'Form preparation', tone: needsAttention ? 'warning' : 'neutral', title: 'Check the participation form', copy: 'Open Documents to check the form availability before the team signs it.', action: 'View documents', tab: 'Documents' }
  }
  return { label: team.document === 'Signed document received' ? 'Ready to review' : 'Under review', tone: 'info', title: 'Review the team file', copy: 'Check the team details and documents below, then make the final decision.', action: 'Review this file', tab: 'Verification' }
}
