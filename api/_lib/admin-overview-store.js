const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
    databaseMessage: error?.message,
  })
}

export function createAdminOverviewStore(supabase) {
  if (!supabase) {
    throw Object.assign(new Error('admin_overview_store_unavailable'), {
      stage: 'configuration',
      code: 'configuration_error',
    })
  }

  return {
    async dashboard(edition = 2) {
      const { data, error } = await supabase.rpc('admin_get_overview_dashboard', {
        p_aivex_edition: edition,
      })
      if (error) fail('admin_overview_dashboard', error)
      return data
    },
  }
}
