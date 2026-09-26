export const ADMIN_PEOPLE_ACTIONS = Object.freeze({
  members: ['update_profile', 'change_pole', 'promote_to_staff', 'set_status', 'add_note'],
  staff: ['assign_role', 'move_department', 'assign_project', 'change_availability', 'set_status', 'add_note'],
})

export function canAccessPeople(role) {
  return role === 'super_admin'
}

export function canManagePeople(role, kind, action) {
  return role === 'super_admin' && Boolean(ADMIN_PEOPLE_ACTIONS[kind]?.includes(action))
}

export function allowedPeopleActions(role, kind, record) {
  if (!record || !canAccessPeople(role)) return []
  return (ADMIN_PEOPLE_ACTIONS[kind] || []).filter((action) => {
    if (record.status === 'archived') return action === 'set_status' || action === 'add_note'
    return !(kind === 'members' && action === 'promote_to_staff' && record.has_staff_profile)
  })
}

export function canBulkManagePeople(role) {
  return role === 'super_admin'
}
