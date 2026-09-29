export const ADMIN_PREFERENCE_DEFAULTS = Object.freeze({
  tableDensity: 'comfortable',
  reviewNotificationsEnabled: true,
  viewerTimeoutSeconds: 120,
  reducedMotion: false,
})

const REVIEW_DOCUMENT_STATUSES = new Set([
  'signed_document_uploaded', 'under_review', 'changes_required', 'generation_failed',
])

export const normalizeAdminPreferences = (value) => ({
  tableDensity: ['comfortable', 'compact'].includes(value?.tableDensity)
    ? value.tableDensity
    : ADMIN_PREFERENCE_DEFAULTS.tableDensity,
  reviewNotificationsEnabled: typeof value?.reviewNotificationsEnabled === 'boolean'
    ? value.reviewNotificationsEnabled
    : ADMIN_PREFERENCE_DEFAULTS.reviewNotificationsEnabled,
  viewerTimeoutSeconds: [60, 120, 300].includes(value?.viewerTimeoutSeconds)
    ? value.viewerTimeoutSeconds
    : ADMIN_PREFERENCE_DEFAULTS.viewerTimeoutSeconds,
  reducedMotion: typeof value?.reducedMotion === 'boolean'
    ? value.reducedMotion
    : ADMIN_PREFERENCE_DEFAULTS.reducedMotion,
})

export function reviewQueueItems(records) {
  return (records || [])
    .filter((record) => (
      REVIEW_DOCUMENT_STATUSES.has(record.documentKey)
      && !['rejected', 'cancelled'].includes(record.registrationKey)
    ))
    .map((record) => ({
      reference: record.ref,
      teamName: record.name,
      status: record.documentKey,
      label: record.documentKey === 'generation_failed' ? 'Generation issue'
        : record.documentKey === 'changes_required' ? 'Corrections awaiting review'
          : record.documentKey === 'signed_document_uploaded' ? 'Signed document received'
            : 'Items awaiting review',
    }))
}
