import { createServerSupabaseClient } from './aivex-server.js'
import { createAdminActivityStore } from './admin-activity-store.js'

const ACTION_LABELS = Object.freeze({
  start_review: 'Application moved to review',
  schedule_interview: 'Interview scheduled',
  accept_member: 'Member application accepted',
  accept_staff: 'Staff application accepted',
  change_staff_department: 'Staff department changed',
  decline: 'Application declined',
  archive: 'Application archived',
  add_note: 'Internal note added',
  create_profile: 'Directory profile created',
  update_profile: 'Profile updated',
  change_pole: 'Member pole changed',
  promote_to_staff: 'Member promoted to staff',
  set_status: 'Profile status changed',
  assign_role: 'Staff role assigned',
  move_department: 'Staff department changed',
  assign_project: 'Project assigned',
  change_availability: 'Availability updated',
  verify_activity_official: 'Activities manager reviewed',
  verify_document: 'AIVEX document verified',
  invalidate_document: 'AIVEX document marked invalid',
  request_corrections: 'AIVEX corrections requested',
  resolve_correction_item: 'AIVEX correction reviewed',
  extend_correction_deadline: 'AIVEX correction deadline extended',
  validate_file: 'AIVEX team accepted',
  reject_registration: 'AIVEX registration rejected',
  cancel_registration: 'AIVEX registration cancelled',
  confidential_document_opened: 'Confidential document opened',
  official_document_downloaded: 'Official document downloaded',
  aivex_team_arrival_confirmed: 'AIVEX team arrival confirmed',
  aivex_team_marked_absent: 'AIVEX team marked absent',
  aivex_team_attendance_reset: 'AIVEX attendance reset',
  aivex_campaign_settings_updated: 'AIVEX campaign settings updated',
  aivex_purge_started: 'AIVEX data purge started',
  aivex_storage_purge_completed: 'AIVEX storage purge completed',
  aivex_storage_purge_incomplete: 'AIVEX storage purge incomplete',
  staff_confirmation_invited: 'Staff confirmation invited',
  stable_staff_confirmation_link_created: 'Stable Staff link created',
  staff_link_regenerated: 'Staff private link regenerated',
  staff_link_blocked: 'Staff private link blocked',
  staff_link_unblocked: 'Staff private link unblocked',
  staff_confirmation_deadline_extended: 'Staff confirmation deadline extended',
  staff_confirmation_revision_requested: 'Staff confirmation revision requested',
  staff_membership_confirmed: 'Staff membership confirmed',
  staff_confirmation_invitation_revoked: 'Staff confirmation invitation revoked',
  staff_link_revealed: 'Staff private link revealed',
  staff_link_csv_exported: 'Staff private links exported',
  event_created: 'Event created',
  event_updated: 'Event updated',
  members_invited: 'Members invited to event',
  organizer_added: 'Event organizer added',
  organizer_removed: 'Event organizer removed',
  scanner_access_prepared: 'Scanner access prepared',
  scanner_access_revoked: 'Scanner access revoked',
  invitation_sent: 'Workshop invitation sent',
  invitation_resent: 'Workshop invitation resent',
  participant_registered: 'Workshop participant registered',
  scanner_access_generated: 'Private scanner access generated',
  scanner_access_regenerated: 'Private scanner access regenerated',
  participant_checked_in: 'Workshop participant checked in',
  attendance_finalized: 'Workshop attendance finalized',
  workshop_status_changed: 'Workshop status changed',
})

const OBJECT_LABELS = Object.freeze({
  join_application: 'Application',
  aivex_registration: 'AIVEX',
  aivex_document: 'AIVEX document',
  club_member: 'Member',
  club_staff: 'Staff',
  aivex_settings: 'AIVEX settings',
  staff_link_export: 'Administration',
  club_event: 'Event',
})

const text = (value, fallback, max = 240) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || fallback).slice(0, max)
}
const number = (value) => Math.max(0, Number(value) || 0)
const actionLabel = (value) => ACTION_LABELS[value] || text(value, 'Administrative action', 80)
  .replaceAll('_', ' ')
  .replace(/^./, (letter) => letter.toUpperCase())
const objectLabel = (value) => OBJECT_LABELS[value] || 'Administration'

export function createAdminActivityService({ store } = {}) {
  if (!store) {
    throw Object.assign(new Error('admin_activity_store_required'), {
      stage: 'configuration', code: 'configuration_error',
    })
  }

  return {
    async list(options) {
      const result = await store.list(options)
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw Object.assign(new Error('admin_activity_invalid_payload'), {
          stage: 'admin_activity_list', code: 'invalid_payload',
        })
      }
      const rows = Array.isArray(result.rows) ? result.rows.slice(0, options.limit) : []
      const total = number(result?.pagination?.total)
      const actors = Array.isArray(result?.facets?.actors)
        ? result.facets.actors.slice(0, 200).map((value) => text(value, 'Infinity Administration', 120))
        : []
      const actions = Array.isArray(result?.facets?.actions)
        ? result.facets.actions.slice(0, 200).map((value) => ({ key: text(value, 'administrative_action', 80), label: actionLabel(value) }))
        : []
      const objectTypes = Array.isArray(result?.facets?.objectTypes)
        ? result.facets.objectTypes.slice(0, 20).map((value) => ({ key: text(value, 'administration', 40), label: objectLabel(value) }))
        : []

      return {
        generatedAt: result.generatedAt || new Date().toISOString(),
        data: rows.map((row) => ({
          id: text(row?.id, 'activity', 64),
          actionKey: text(row?.action, 'administrative_action', 80),
          action: actionLabel(row?.action),
          entity: text(row?.subject, 'Administrative record', 240),
          actor: text(row?.actor, 'Infinity Administration', 120),
          objectTypeKey: text(row?.objectType, 'administration', 40),
          objectType: objectLabel(row?.objectType),
          sensitivity: row?.sensitivity === 'confidential' ? 'confidential' : 'standard',
          at: row?.createdAt || null,
          note: text(row?.note, '', 2000),
        })),
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.max(1, Math.ceil(total / options.limit)),
        },
        summary: {
          recordedActions: number(result?.summary?.recordedActions),
          confidentialEvents: number(result?.summary?.confidentialEvents),
          administrators: number(result?.summary?.administrators),
        },
        facets: { actors: [...new Set(actors)].sort(), actions, objectTypes },
      }
    },
  }
}

export function createServerAdminActivityService() {
  return createAdminActivityService({
    store: createAdminActivityStore(createServerSupabaseClient()),
  })
}
