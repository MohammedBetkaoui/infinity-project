import { createServerSupabaseClient } from './aivex-server.js'
import { createAdminOverviewStore } from './admin-overview-store.js'

const counts = Object.freeze({
  newApplications: 0,
  pendingApplications: 0,
  activeMembers: 0,
  activeStaff: 0,
  aivexTeams: 0,
  filesToVerify: 0,
  connectedDepartments: 0,
})

const priorities = Object.freeze({
  newApplications: 0,
  interviewsToSchedule: 0,
  signedDocuments: 0,
  correctionsDue: 0,
  generationIssues: 0,
})

const community = Object.freeze({
  members: 0,
  staff: 0,
  pending: 0,
  studyLevels: { licence: 0, master: 0, engineer: 0, other: 0 },
})

const aivexPipeline = Object.freeze({
  registered: 0,
  formReady: 0,
  signedDocument: 0,
  organizerReview: 0,
  validated: 0,
})

const number = (value) => Math.max(0, Number(value) || 0)
const numberObject = (source, fallback) => Object.fromEntries(
  Object.keys(fallback).map((key) => [key, number(source?.[key])]),
)

export function createAdminOverviewService({ store } = {}) {
  if (!store) {
    throw Object.assign(new Error('admin_overview_store_required'), {
      stage: 'configuration',
      code: 'configuration_error',
    })
  }

  return {
    async dashboard(edition = 2) {
      const result = await store.dashboard(edition)
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw Object.assign(new Error('admin_overview_invalid_payload'), {
          stage: 'admin_overview_dashboard',
          code: 'invalid_payload',
        })
      }
      const studyLevels = numberObject(result?.community?.studyLevels, community.studyLevels)
      return {
        generatedAt: result?.generatedAt || new Date().toISOString(),
        edition: number(result?.edition) || edition,
        stats: numberObject(result?.stats, counts),
        priorities: numberObject(result?.priorities, priorities),
        community: {
          ...numberObject(result?.community, community),
          studyLevels,
        },
        departments: Array.isArray(result?.departments)
          ? result.departments.slice(0, 12).map((department) => ({
              key: String(department?.key || ''),
              active: number(department?.active),
              waiting: number(department?.waiting),
            }))
          : [],
        aivexPipeline: numberObject(result?.aivexPipeline, aivexPipeline),
        series: Array.isArray(result?.series)
          ? result.series.slice(-6).map((point) => ({
              startDate: point?.startDate || null,
              endDate: point?.endDate || null,
              member: number(point?.member),
              staff: number(point?.staff),
              aivex: number(point?.aivex),
            }))
          : [],
        activity: Array.isArray(result?.activity)
          ? result.activity.slice(0, 8).map((entry) => ({
              action: String(entry?.action || 'administrative_action'),
              subject: String(entry?.subject || 'Administrative record'),
              actor: String(entry?.actor || 'Infinity Administration'),
              objectType: String(entry?.objectType || 'administration'),
              sensitivity: entry?.sensitivity === 'confidential' ? 'confidential' : 'standard',
              createdAt: entry?.createdAt || null,
            }))
          : [],
      }
    },
  }
}

export function createServerAdminOverviewService() {
  return createAdminOverviewService({
    store: createAdminOverviewStore(createServerSupabaseClient()),
  })
}
