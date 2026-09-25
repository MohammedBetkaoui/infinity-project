import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const output = '.browser-admin-audit/reports'
const targets = await fetch('http://127.0.0.1:9223/json/list').then((response) => response.json())
const page = targets.find((entry) => entry.type === 'page')
assert(page, 'Headless Chrome page is available')
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
const errors = []
let sequence = 0
let auditAuthenticated = false
const auditApplication = (id, name, reference) => ({
  id,
  ref: reference,
  name,
  initials: name.split(' ').map((part) => part[0]).slice(0, 2).join(''),
  email: `${name.toLowerCase().replaceAll(' ', '.')}@example.dz`,
  phone: '+213 555 00 00 00',
  level: 'L3',
  speciality: 'Computer science',
  type: 'Member',
  track: 'AI Engineering',
  experience: 'Building projects',
  availability: 'A few hours each week',
  date: '2026-09-25T08:30:00.000Z',
  submittedAt: '2026-09-25T08:30:00.000Z',
  status: 'New',
  statusKey: 'new',
  source: 'Infinity Join form',
  form: 'JOIN-2',
  consent: true,
  updatedAt: '2026-09-25T08:30:00.000Z',
  requestMessage: '',
  allowedActions: ['start_review', 'schedule_interview', 'request_information', 'accept_member', 'decline', 'archive', 'add_note'],
  history: [{ title: 'Application received', actor: 'Infinity Join form', at: '2026-09-25T08:30:00.000Z', kind: 'Submission' }],
})
const auditApplications = [
  auditApplication('11111111-1111-4111-8111-111111111111', 'Lina Bensaid', 'JOIN-26-A1B2C3'),
  auditApplication('22222222-2222-4222-8222-222222222222', 'Yacine Saidi', 'JOIN-26-D4E5F6'),
]
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id)
    clearTimeout(timer)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value || arg.description).join(' '))
  if (message.method === 'Fetch.requestPaused') {
    const { requestId, request } = message.params
    const requestUrl = new URL(request.url)
    const path = requestUrl.pathname
    let statusCode = 404
    let payload = { success: false }
    if (path === '/api/admin/auth/session') {
      statusCode = auditAuthenticated ? 200 : 401
      payload = auditAuthenticated
        ? { authenticated: true, user: { id: 'audit-user', username: 'audit.admin', displayName: 'Audit Administrator', role: 'super_admin' } }
        : { authenticated: false }
    } else if (path === '/api/admin/auth/login' && request.method === 'POST') {
      auditAuthenticated = true
      statusCode = 200
      payload = { success: true, user: { id: 'audit-user', username: 'audit.admin', displayName: 'Audit Administrator', role: 'super_admin' } }
    } else if (path === '/api/admin/auth/logout' && request.method === 'POST') {
      auditAuthenticated = false
      statusCode = 200
      payload = { success: true }
    } else if (path === '/api/admin/auth/change-password' && request.method === 'POST') {
      statusCode = auditAuthenticated ? 200 : 401
      payload = auditAuthenticated ? { success: true } : { success: false }
    } else if (path === '/api/admin/applications' && request.method === 'GET') {
      const status = requestUrl.searchParams.get('status')
      const visible = auditApplications.filter((application) => !status || application.statusKey === status)
      const counts = Object.fromEntries(['new', 'in_review', 'interview', 'accepted', 'declined', 'archived'].map((key) => [key, auditApplications.filter((application) => application.statusKey === key).length]))
      statusCode = auditAuthenticated ? 200 : 401
      payload = auditAuthenticated ? {
        success: true,
        data: visible,
        pagination: { page: 1, limit: 12, total: visible.length, pages: 1 },
        counts,
        facets: { specialities: ['Computer science'] },
      } : { success: false }
    } else if (/^\/api\/admin\/applications\/[0-9a-f-]+$/i.test(path) && request.method === 'GET') {
      const id = path.split('/').at(-1)
      const application = auditApplications.find((item) => item.id === id)
      statusCode = auditAuthenticated && application ? 200 : auditAuthenticated ? 404 : 401
      payload = application ? { success: true, application } : { success: false }
    } else if (/^\/api\/admin\/applications\/[0-9a-f-]+\/actions$/i.test(path) && request.method === 'POST') {
      const id = path.split('/').at(-2)
      const application = auditApplications.find((item) => item.id === id)
      const body = JSON.parse(request.postData || '{}')
      if (auditAuthenticated && application) {
        if (body.action === 'accept_member') {
          application.status = 'Accepted'
          application.statusKey = 'accepted'
          application.updatedAt = '2026-09-26T09:00:00.000Z'
          application.allowedActions = ['archive', 'add_note']
          application.history.push({ title: 'Accepted as member', actor: 'Audit Administrator', at: application.updatedAt, kind: 'Administration' })
        }
        statusCode = 200
        payload = { success: true, application }
      } else {
        statusCode = auditAuthenticated ? 404 : 401
        payload = { success: false }
      }
    }
    socket.send(JSON.stringify({
      id: ++sequence,
      method: 'Fetch.fulfillRequest',
      params: {
        requestId,
        responseCode: statusCode,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Cache-Control', value: 'no-store' },
        ],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      },
    }))
  }
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 15000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (expression) => {
  for (let index = 0; index < 50; index++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}
const navigate = async (path) => {
  await send('Page.navigate', { url: `http://127.0.0.1:5173${path}` })
  await waitFor('document.readyState === "complete" && Boolean(document.body.innerText.trim())')
  await evaluate('document.fonts.ready.then(() => true)')
  await pause(250)
}
const clickText = (text) => evaluate(`(() => { const node = [...document.querySelectorAll('button,a')].find((item) => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node) throw new Error('Missing control: ' + ${JSON.stringify(text)}); node.click(); return true })()`)
const viewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
const screenshot = async (name, full = false) => {
  const params = { format: 'png', captureBeyondViewport: full }
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics')
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 }
  }
  const { data } = await send('Page.captureScreenshot', params)
  await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'))
}
const report = {}

try {
  await mkdir(output, { recursive: true })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/admin/*', requestStage: 'Request' }] })
  await viewport(1440, 1000)
  await navigate('/admin/overview')
  await waitFor('location.pathname === "/admin/login" && Boolean(document.querySelector(".adm-login-form"))')
  report.unauthenticatedGuard = await evaluate(`({
    path: location.pathname,
    returnTo: new URLSearchParams(location.search).get('returnTo'),
    dashboardVisible: Boolean(document.querySelector('.adm-kpi-grid'))
  })`)
  assert.deepEqual(report.unauthenticatedGuard, { path: '/admin/login', returnTo: '/admin/overview', dashboardVisible: false })
  await navigate('/admin/login')
  await evaluate(`localStorage.removeItem('infinity-administration-demo-v3')`)
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && Boolean(document.querySelector(".adm-login-form"))')
  report.login = await evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.innerText,
    usernameAutocomplete: document.querySelector('input[name="username"]')?.autocomplete,
    passwordAutocomplete: document.querySelector('input[name="password"]')?.autocomplete,
    content: document.body.innerText.length,
    overflow: document.documentElement.scrollWidth > innerWidth,
    errorOverlay: Boolean(document.querySelector('vite-error-overlay'))
  })`)
  assert.match(report.login.heading, /people/i)
  assert.equal(report.login.usernameAutocomplete, 'username')
  assert.equal(report.login.passwordAutocomplete, 'current-password')
  assert(!report.login.overflow && !report.login.errorOverlay)
  await screenshot('login-desktop')

  await evaluate(`(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    const username = document.querySelector('input[name="username"]')
    const password = document.querySelector('input[name="password"]')
    setValue.call(username, 'audit.admin')
    username.dispatchEvent(new Event('input', { bubbles: true }))
    setValue.call(password, 'audit-only-not-a-real-password')
    password.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.adm-login-form').requestSubmit()
    return true
  })()`)
  await waitFor('location.pathname === "/admin/overview" && Boolean(document.querySelector(".adm-kpi-grid"))')
  report.overview = await evaluate(`({
    heading: document.querySelector('h1')?.textContent,
    kpis: document.querySelectorAll('.adm-kpi').length,
    panels: document.querySelectorAll('.adm-overview-layout > .adm-panel').length,
    sidebar: Math.round(document.querySelector('.adm-sidebar').getBoundingClientRect().width),
    topbar: Math.round(document.querySelector('.adm-topbar').getBoundingClientRect().height),
    overflow: document.documentElement.scrollWidth > innerWidth
  })`)
  assert.deepEqual(report.overview, { heading: 'Overview', kpis: 6, panels: 6, sidebar: 260, topbar: 72, overflow: false })
  await screenshot('overview-desktop', true)

  await navigate('/admin/applications')
  assert(await evaluate('document.querySelectorAll(".adm-table tbody tr").length > 0'))
  await evaluate('document.querySelector(".adm-table input[type=checkbox]").click()')
  assert(await evaluate('Boolean(document.querySelector(".adm-bulk"))'))
  await evaluate('document.querySelector(".adm-record-link").click()')
  await waitFor('Boolean(document.querySelector(".adm-drawer"))')
  await pause(300)
  report.candidateDrawer = await evaluate(`({
    title: document.querySelector('.adm-drawer__head h2')?.innerText,
    width: Math.round(document.querySelector('.adm-drawer').getBoundingClientRect().width),
    steps: document.querySelectorAll('.adm-candidate-progress li').length,
    sections: document.querySelectorAll('.adm-candidate-section').length,
    actions: document.querySelectorAll('.adm-candidate-actionbar button').length,
    overflow: document.querySelector('.adm-drawer').scrollWidth > document.querySelector('.adm-drawer').clientWidth
  })`)
  assert.deepEqual(report.candidateDrawer, { title: 'Application review', width: 710, steps: 4, sections: 6, actions: 6, overflow: false })
  await screenshot('application-drawer-desktop')
  await clickText('Accept as member')
  await waitFor('Boolean(document.querySelector(".adm-modal"))')
  await evaluate(`(() => { const field = document.querySelector('.adm-modal textarea[name="reason"]'); field.value = 'Strong fit for the autumn member programme.' })()`)
  await clickText('Confirm action')
  await waitFor('!document.querySelector(".adm-modal") && document.querySelector(".adm-drawer").innerText.includes("Accepted")')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor('!document.querySelector(".adm-drawer")')

  await navigate('/admin/members')
  await waitFor('document.querySelectorAll(".adm-people-card").length > 0')
  report.memberCards = await evaluate(`({
    cards: document.querySelectorAll('.adm-people-card').length,
    columns: getComputedStyle(document.querySelector('.adm-people-card-grid')).gridTemplateColumns.split(' ').length,
    quickFilters: document.querySelectorAll('.adm-quick-filter').length,
    defaultView: document.querySelector('.adm-view-toggle button[aria-label="Card view"]').getAttribute('aria-pressed'),
    pageOverflow: document.documentElement.scrollWidth > innerWidth
  })`)
  assert.deepEqual(report.memberCards, { cards: 6, columns: 3, quickFilters: 3, defaultView: 'true', pageOverflow: false })
  await screenshot('members-cards-desktop', true)
  await evaluate(`document.querySelector('.adm-view-toggle button[aria-label="Table view"]').click()`)
  await waitFor('document.querySelectorAll(".adm-people-table-view tbody tr").length > 0')
  assert(await evaluate('Boolean(document.querySelector(".adm-directory-register-head"))'))
  await screenshot('members-table-desktop', true)
  await navigate('/admin/staff')
  assert(await evaluate('document.querySelectorAll(".adm-department-map article").length === 3'))
  await waitFor('document.querySelectorAll(".adm-people-card").length > 0')
  report.staffCards = await evaluate(`({
    cards: document.querySelectorAll('.adm-people-card').length,
    columns: getComputedStyle(document.querySelector('.adm-people-card-grid')).gridTemplateColumns.split(' ').length,
    assignments: document.querySelectorAll('.adm-staff-assignment').length,
    quickFilters: document.querySelectorAll('.adm-quick-filter').length,
    pageOverflow: document.documentElement.scrollWidth > innerWidth
  })`)
  assert.deepEqual(report.staffCards, { cards: 6, columns: 3, assignments: 6, quickFilters: 3, pageOverflow: false })
  await screenshot('staff-cards-desktop', true)
  await evaluate(`(() => { const select = document.querySelector('.adm-quick-filter select[aria-label="Status"]'); select.value = 'Active'; select.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  await waitFor('document.querySelectorAll(".adm-filter-chips button").length === 1')
  assert(await evaluate('document.querySelector(".adm-active-filters").innerText.includes("Active")'))
  await evaluate('document.querySelector(".adm-clear-filters").click()')
  await evaluate(`document.querySelector('.adm-view-toggle button[aria-label="Table view"]').click()`)
  await waitFor('document.querySelectorAll(".adm-people-table-view tbody tr").length > 0')
  await screenshot('staff-table-desktop', true)
  await navigate('/admin/activity')
  assert(await evaluate('Boolean(document.querySelector(".adm-activity-table")) || document.body.innerText.includes("Activity")'))
  await navigate('/admin/settings')
  assert(await evaluate('document.body.innerText.includes("Workspace essentials")'))

  await navigate('/admin/aivex')
  await waitFor('document.querySelectorAll(".adm-aivex-card").length > 0')
  report.aivexCards = await evaluate(`({
    cards: document.querySelectorAll('.adm-aivex-card').length,
    columns: getComputedStyle(document.querySelector('.adm-aivex-card-grid')).gridTemplateColumns.split(' ').length,
    stages: document.querySelectorAll('.adm-aivex-card:first-child .adm-aivex-card__journey > div').length,
    checkpoints: document.querySelectorAll('.adm-aivex-card__checkpoint').length,
    defaultView: document.querySelector('.adm-view-toggle button[aria-label="Card view"]').getAttribute('aria-pressed'),
    overflow: document.documentElement.scrollWidth > innerWidth
  })`)
  assert.deepEqual(report.aivexCards, { cards: 6, columns: 2, stages: 5, checkpoints: 6, defaultView: 'true', overflow: false })
  await screenshot('aivex-cards-desktop', true)
  await evaluate(`document.querySelector('.adm-view-toggle button[aria-label="Table view"]').click()`)
  await waitFor('document.querySelectorAll(".adm-aivex-table-view tbody tr").length > 0')
  report.aivexTable = await evaluate(`(() => {
    const wrap = document.querySelector('.adm-aivex-table-view')
    return {
      rows: document.querySelectorAll('.adm-aivex-table-view tbody tr').length,
      columns: document.querySelectorAll('.adm-aivex-table-view thead th').length,
      registerHead: Boolean(document.querySelector('.adm-aivex-register-head')),
      internalOverflow: wrap.scrollWidth > wrap.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth
    }
  })()`)
  assert(report.aivexTable.rows === 6 && report.aivexTable.columns === 10 && report.aivexTable.registerHead && !report.aivexTable.pageOverflow)
  await screenshot('aivex-table-desktop', true)

  await navigate('/admin/aivex/nova')
  assert(await evaluate('document.querySelectorAll(".adm-team-timeline button").length === 5'))
  await clickText('Documents')
  await waitFor('Boolean(document.querySelector(".adm-file-category"))')
  assert(await evaluate('document.querySelectorAll(".adm-file-category").length === 4'))
  await clickText('Open securely')
  await waitFor('Boolean(document.querySelector(".adm-document-specimen"))')
  assert(await evaluate('document.body.innerText.includes("NO REAL IDENTITY DATA")'))
  await screenshot('secure-viewer-desktop')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor('!document.querySelector(".adm-document-specimen")')
  await clickText('Verification')
  await waitFor('document.querySelectorAll(".adm-checklist label").length === 10')
  await screenshot('aivex-verification-desktop')

  await navigate('/admin/aivex?lang=ar')
  await waitFor('document.querySelectorAll(".adm-aivex-card").length > 0')
  report.aivexArabicDesktop = await evaluate(`(() => {
    const app = document.querySelector('.adm-app')
    const page = document.querySelector('.adm-aivex-page')
    const sidebar = document.querySelector('.adm-sidebar')
    const workspace = document.querySelector('.adm-workspace')
    const sidebarRect = sidebar.getBoundingClientRect()
    const workspaceRect = workspace.getBoundingClientRect()
    return {
      appDir: app.getAttribute('dir'),
      pageDir: page.getAttribute('dir'),
      language: app.getAttribute('lang'),
      heading: document.querySelector('h1')?.innerText,
      activeLanguage: document.querySelector('.adm-aivex-language button[aria-pressed="true"]')?.innerText,
      arabicPipeline: document.querySelector('.adm-status-pipeline')?.innerText.includes('قيد المراجعة'),
      arabicSidebar: /[\u0600-\u06ff]/.test(sidebar.innerText),
      sidebarX: Math.round(sidebarRect.x),
      sidebarWidth: Math.round(sidebarRect.width),
      sidebarRightGap: Math.round(innerWidth - sidebarRect.right),
      workspaceRight: Math.round(workspaceRect.right),
      overlap: workspaceRect.right > sidebarRect.left + 1,
      cards: document.querySelectorAll('.adm-aivex-card').length,
      overflow: document.documentElement.scrollWidth > innerWidth
    }
  })()`)
  assert.equal(report.aivexArabicDesktop.appDir, 'rtl')
  assert.equal(report.aivexArabicDesktop.pageDir, 'rtl')
  assert.equal(report.aivexArabicDesktop.language, 'ar')
  assert.equal(report.aivexArabicDesktop.heading, 'ملفات AIVEX')
  assert.equal(report.aivexArabicDesktop.activeLanguage, 'ع')
  assert(report.aivexArabicDesktop.arabicPipeline && report.aivexArabicDesktop.arabicSidebar)
  assert(report.aivexArabicDesktop.cards > 0 && !report.aivexArabicDesktop.overflow && !report.aivexArabicDesktop.overlap)
  assert.equal(report.aivexArabicDesktop.sidebarWidth, 260)
  // Headless Chrome may reserve a 9px vertical scrollbar gutter. The sidebar
  // must remain flush with the usable viewport, within that browser gutter.
  assert(Math.abs(report.aivexArabicDesktop.sidebarRightGap) <= 10)
  assert(Math.abs(report.aivexArabicDesktop.sidebarX - (1440 - 260)) <= 10)
  assert(report.aivexArabicDesktop.workspaceRight <= report.aivexArabicDesktop.sidebarX)
  await screenshot('aivex-arabic-desktop', true)

  await evaluate(`document.querySelector('.adm-aivex-card footer button').click()`)
  await waitFor('location.pathname.startsWith("/admin/aivex/") && new URLSearchParams(location.search).get("lang") === "ar"')
  await waitFor('Boolean(document.querySelector(".adm-tabs"))')
  report.aivexArabicNavigation = await evaluate(`({
    path: location.pathname,
    search: location.search,
    dir: document.querySelector('.adm-app')?.getAttribute('dir'),
    arabicTabs: document.querySelector('.adm-tabs')?.innerText.includes('التحقق') && document.querySelector('.adm-tabs')?.innerText.includes('الوثائق'),
    backLink: document.querySelector('.adm-back-link')?.innerText
  })`)
  assert.equal(report.aivexArabicNavigation.search, '?lang=ar')
  assert.equal(report.aivexArabicNavigation.dir, 'rtl')
  assert(report.aivexArabicNavigation.arabicTabs)
  assert.match(report.aivexArabicNavigation.backLink, /كل ملفات AIVEX/)

  await navigate('/admin/aivex/nova?lang=ar')
  await waitFor('document.querySelectorAll(".adm-team-timeline button").length === 5')
  await clickText('التحقق')
  await waitFor('document.querySelectorAll(".adm-checklist label").length === 10')
  report.aivexArabicVerification = await evaluate(`({
    title: document.querySelector('.adm-verification-layout .adm-section-heading h2')?.innerText,
    checks: document.querySelectorAll('.adm-checklist label').length,
    decision: document.querySelector('.adm-decision-panel')?.innerText.includes('قرار الملف'),
    correctionAction: document.querySelector('.adm-decision-panel')?.innerText.includes('طلب تصحيحات'),
    overflow: document.documentElement.scrollWidth > innerWidth
  })`)
  assert.deepEqual(report.aivexArabicVerification, { title: 'قائمة التحقق الإداري', checks: 10, decision: true, correctionAction: true, overflow: false })
  await screenshot('aivex-arabic-verification-desktop', true)

  await clickText('طلب تصحيحات')
  await waitFor('Boolean(document.querySelector(".adm-modal"))')
  report.aivexArabicCorrection = await evaluate(`({
    title: document.querySelector('.adm-modal h2')?.innerText,
    legend: document.querySelector('.adm-modal legend')?.innerText,
    fields: document.querySelectorAll('.adm-modal textarea, .adm-modal input[type="date"]').length,
    direction: getComputedStyle(document.querySelector('.adm-modal')).direction,
    overflow: document.querySelector('.adm-modal').scrollWidth > document.querySelector('.adm-modal').clientWidth
  })`)
  assert.deepEqual(report.aivexArabicCorrection, { title: 'طلب تصحيحات', legend: 'العناصر المطلوب تصحيحها', fields: 3, direction: 'rtl', overflow: false })
  await screenshot('aivex-arabic-correction-desktop')
  await evaluate(`(() => { const button = [...document.querySelectorAll('.adm-modal button')].find((item) => item.textContent.trim() === 'إلغاء'); if (!button) throw new Error('Missing modal cancel'); button.click(); return true })()`)
  await waitFor('!document.querySelector(".adm-modal")')

  await clickText('الوثائق')
  await waitFor('document.querySelectorAll(".adm-file-category").length === 4')
  await clickText('فتح آمن')
  await waitFor('Boolean(document.querySelector(".adm-document-specimen"))')
  report.aivexArabicViewer = await evaluate(`({
    title: document.querySelector('.adm-modal h2')?.innerText,
    confidential: document.querySelector('.adm-viewer-heading')?.innerText.includes('سري'),
    note: document.querySelector('.adm-modal textarea')?.getAttribute('placeholder'),
    specimen: Boolean(document.querySelector('.adm-document-specimen')),
    arabicContent: /[\u0600-\u06ff]/.test(document.querySelector('.adm-modal')?.innerText || ''),
    overflow: document.querySelector('.adm-modal').scrollWidth > document.querySelector('.adm-modal').clientWidth
  })`)
  assert.equal(report.aivexArabicViewer.title, 'وثيقة سرية')
  assert(report.aivexArabicViewer.confidential && report.aivexArabicViewer.specimen && report.aivexArabicViewer.arabicContent && !report.aivexArabicViewer.overflow)
  assert.match(report.aivexArabicViewer.note, /سجّل|نتيجة|مراجعة/)
  await screenshot('aivex-arabic-viewer-desktop')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor('!document.querySelector(".adm-document-specimen")')

  await viewport(1024, 900)
  await navigate('/admin/overview')
  report.tablet = await evaluate(`({ sidebar: Math.round(document.querySelector('.adm-sidebar').getBoundingClientRect().width), overflow: document.documentElement.scrollWidth > innerWidth, kpis: document.querySelectorAll('.adm-kpi').length })`)
  assert.deepEqual(report.tablet, { sidebar: 76, overflow: false, kpis: 6 })
  await screenshot('overview-tablet')

  await viewport(390, 844, true)
  await navigate('/admin/applications')
  report.mobile = await evaluate(`({
    overflow: document.documentElement.scrollWidth > innerWidth,
    menuButton: getComputedStyle(document.querySelector('.adm-menu-trigger')).display,
    rows: document.querySelectorAll('.adm-table tbody tr').length,
    rowDisplay: getComputedStyle(document.querySelector('.adm-table tbody tr')).display,
    minButtons: [...document.querySelectorAll('.adm-topbar button')].filter((button) => button.getClientRects().length).every((button) => button.getBoundingClientRect().height >= 44)
  })`)
  console.log('Mobile check:', JSON.stringify(report.mobile))
  assert(!report.mobile.overflow && report.mobile.menuButton !== 'none' && report.mobile.rows > 0 && report.mobile.rowDisplay === 'grid' && report.mobile.minButtons)
  await evaluate('document.querySelector(".adm-record-link").click()')
  await waitFor('Boolean(document.querySelector(".adm-candidate-dossier"))')
  await pause(300)
  report.mobileCandidate = await evaluate(`(() => {
    const drawer = document.querySelector('.adm-drawer')
    const actionButtons = [...document.querySelectorAll('.adm-candidate-actionbar button')].filter((button) => button.getClientRects().length)
    return {
      width: Math.round(drawer.getBoundingClientRect().width),
      steps: document.querySelectorAll('.adm-candidate-progress li').length,
      sections: document.querySelectorAll('.adm-candidate-section').length,
      actionTargets: actionButtons.every((button) => button.getBoundingClientRect().height >= 44),
      overflow: drawer.scrollWidth > drawer.clientWidth
    }
  })()`)
  assert.deepEqual(report.mobileCandidate, { width: 390, steps: 4, sections: 6, actionTargets: true, overflow: false })
  await screenshot('application-drawer-mobile')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor('!document.querySelector(".adm-drawer")')
  await evaluate('document.querySelector(".adm-menu-trigger").click()')
  await waitFor('document.querySelector(".adm-sidebar").classList.contains("is-mobile-open")')
  await pause(300)
  assert(await evaluate('document.querySelector(".adm-sidebar nav").getBoundingClientRect().width > 0'))
  report.mobileMenu = await evaluate(`(() => { const rect = document.querySelector('.adm-sidebar').getBoundingClientRect(); return { innerWidth, x: rect.x, width: rect.width, transform: getComputedStyle(document.querySelector('.adm-sidebar')).transform, scrollX } })()`)
  console.log('Mobile menu:', JSON.stringify(report.mobileMenu))
  assert(report.mobileMenu.x === 0 && report.mobileMenu.width >= 280)
  await screenshot('applications-mobile')
  await clickText('AIVEX')
  await waitFor('location.pathname === "/admin/aivex"')
  await pause(300)
  await waitFor('document.querySelectorAll(".adm-aivex-card").length > 0')
  report.mobileAivex = await evaluate(`({
    overflow: document.documentElement.scrollWidth > innerWidth,
    cards: document.querySelectorAll('.adm-aivex-card').length,
    columns: getComputedStyle(document.querySelector('.adm-aivex-card-grid')).gridTemplateColumns.split(' ').length,
    searchHeight: Math.round(document.querySelector('.adm-toolbar > .adm-search').getBoundingClientRect().height),
    tableRows: document.querySelectorAll('.adm-aivex-table-view tbody tr').length,
    viewToggle: Boolean(document.querySelector('.adm-view-toggle')),
    actionTargets: [...document.querySelectorAll('.adm-aivex-card > footer button')].every((button) => button.getBoundingClientRect().height >= 44)
  })`)
  assert(!report.mobileAivex.overflow && report.mobileAivex.cards > 0 && report.mobileAivex.columns === 1 && report.mobileAivex.searchHeight <= 48 && report.mobileAivex.tableRows === 0 && !report.mobileAivex.viewToggle && report.mobileAivex.actionTargets)
  await screenshot('aivex-cards-mobile', true)

  await navigate('/admin/aivex?lang=ar')
  await waitFor('document.querySelectorAll(".adm-aivex-card").length > 0')
  report.mobileAivexArabic = await evaluate(`(() => {
    const sidebar = document.querySelector('.adm-sidebar')
    const sidebarRect = sidebar.getBoundingClientRect()
    const workspace = document.querySelector('.adm-workspace')
    return {
      dir: document.querySelector('.adm-app')?.getAttribute('dir'),
      language: document.querySelector('.adm-app')?.getAttribute('lang'),
      heading: document.querySelector('h1')?.innerText,
      activeLanguage: document.querySelector('.adm-aivex-language button[aria-pressed="true"]')?.innerText,
      overflow: document.documentElement.scrollWidth > innerWidth,
      cards: document.querySelectorAll('.adm-aivex-card').length,
      columns: getComputedStyle(document.querySelector('.adm-aivex-card-grid')).gridTemplateColumns.split(' ').length,
      tableRows: document.querySelectorAll('.adm-aivex-table-view tbody tr').length,
      viewToggle: Boolean(document.querySelector('.adm-view-toggle')),
      workspaceMarginRight: Math.round(parseFloat(getComputedStyle(workspace).marginRight)),
      sidebarClosedX: Math.round(sidebarRect.x),
      sidebarWidth: Math.round(sidebarRect.width),
      cardActions: [...document.querySelectorAll('.adm-aivex-card > footer button')].every((button) => button.getBoundingClientRect().height >= 44)
    }
  })()`)
  assert.equal(report.mobileAivexArabic.dir, 'rtl')
  assert.equal(report.mobileAivexArabic.language, 'ar')
  assert.equal(report.mobileAivexArabic.heading, 'ملفات AIVEX')
  assert.equal(report.mobileAivexArabic.activeLanguage, 'ع')
  assert(!report.mobileAivexArabic.overflow && report.mobileAivexArabic.cards > 0 && report.mobileAivexArabic.columns === 1)
  assert.equal(report.mobileAivexArabic.tableRows, 0)
  assert.equal(report.mobileAivexArabic.viewToggle, false)
  assert.equal(report.mobileAivexArabic.workspaceMarginRight, 0)
  assert(report.mobileAivexArabic.sidebarClosedX >= 389 && report.mobileAivexArabic.sidebarWidth >= 280 && report.mobileAivexArabic.cardActions)
  await screenshot('aivex-arabic-cards-mobile', true)

  await evaluate('document.querySelector(".adm-menu-trigger").click()')
  await waitFor('document.querySelector(".adm-sidebar").classList.contains("is-mobile-open")')
  await pause(300)
  report.mobileAivexArabicMenu = await evaluate(`(() => {
    const sidebar = document.querySelector('.adm-sidebar')
    const rect = sidebar.getBoundingClientRect()
    return {
      x: Math.round(rect.x),
      rightGap: Math.round(innerWidth - rect.right),
      width: Math.round(rect.width),
      direction: getComputedStyle(sidebar).direction,
      translated: sidebar.innerText.includes('مساحة النادي') && sidebar.innerText.includes('تسجيل الخروج'),
      activeAivex: document.querySelector('.adm-sidebar a.is-aivex.is-active')?.innerText.includes('AIVEX'),
      overflow: document.documentElement.scrollWidth > innerWidth
    }
  })()`)
  assert.equal(report.mobileAivexArabicMenu.rightGap, 0)
  assert.equal(report.mobileAivexArabicMenu.x + report.mobileAivexArabicMenu.width, 390)
  assert.equal(report.mobileAivexArabicMenu.direction, 'rtl')
  assert(report.mobileAivexArabicMenu.translated && report.mobileAivexArabicMenu.activeAivex && !report.mobileAivexArabicMenu.overflow)
  await screenshot('aivex-arabic-sidebar-mobile')
  await evaluate('document.querySelector(".adm-sidebar-mobile-close").click()')
  await waitFor('!document.querySelector(".adm-sidebar").classList.contains("is-mobile-open")')
  await pause(300)
  assert(await evaluate('document.querySelector(".adm-sidebar").getBoundingClientRect().x >= innerWidth - 1'))

  await navigate('/admin/members')
  await waitFor('document.querySelectorAll(".adm-people-card").length > 0')
  report.mobileMembers = await evaluate(`({
    overflow: document.documentElement.scrollWidth > innerWidth,
    cards: document.querySelectorAll('.adm-people-card').length,
    columns: getComputedStyle(document.querySelector('.adm-people-card-grid')).gridTemplateColumns.split(' ').length,
    searchHeight: Math.round(document.querySelector('.adm-toolbar > .adm-search').getBoundingClientRect().height),
    tableRows: document.querySelectorAll('.adm-people-table-view tbody tr').length,
    viewToggle: Boolean(document.querySelector('.adm-view-toggle')),
    actionTargets: [...document.querySelectorAll('.adm-people-card > footer button')].every((button) => button.getBoundingClientRect().height >= 44)
  })`)
  assert(!report.mobileMembers.overflow && report.mobileMembers.cards > 0 && report.mobileMembers.columns === 1 && report.mobileMembers.searchHeight <= 48 && report.mobileMembers.tableRows === 0 && !report.mobileMembers.viewToggle && report.mobileMembers.actionTargets)
  await screenshot('members-cards-mobile', true)

  await navigate('/admin/staff')
  await waitFor('document.querySelectorAll(".adm-people-card").length > 0')
  report.mobileStaff = await evaluate(`({
    overflow: document.documentElement.scrollWidth > innerWidth,
    cards: document.querySelectorAll('.adm-people-card').length,
    columns: getComputedStyle(document.querySelector('.adm-people-card-grid')).gridTemplateColumns.split(' ').length,
    searchHeight: Math.round(document.querySelector('.adm-toolbar > .adm-search').getBoundingClientRect().height),
    assignments: document.querySelectorAll('.adm-staff-assignment').length,
    tableRows: document.querySelectorAll('.adm-people-table-view tbody tr').length,
    viewToggle: Boolean(document.querySelector('.adm-view-toggle'))
  })`)
  assert(!report.mobileStaff.overflow && report.mobileStaff.cards > 0 && report.mobileStaff.columns === 1 && report.mobileStaff.searchHeight <= 48 && report.mobileStaff.assignments > 0 && report.mobileStaff.tableRows === 0 && !report.mobileStaff.viewToggle)
  await screenshot('staff-cards-mobile', true)

  report.errors = errors
  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
  console.log('PASS: protected admin login, overview, applications, AIVEX viewer, desktop, tablet and mobile')
} finally {
  socket.close()
}
