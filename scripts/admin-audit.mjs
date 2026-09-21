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
  await viewport(1440, 1000)
  await navigate('/admin/login')
  await evaluate(`localStorage.removeItem('infinity-administration-demo-v3')`)
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && Boolean(document.querySelector(".adm-login"))')
  report.login = await evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.innerText,
    content: document.body.innerText.length,
    overflow: document.documentElement.scrollWidth > innerWidth,
    errorOverlay: Boolean(document.querySelector('vite-error-overlay'))
  })`)
  assert.match(report.login.heading, /people/i)
  assert(!report.login.overflow && !report.login.errorOverlay)
  await screenshot('login-desktop')

  await clickText('Enter demo workspace')
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
  assert(await evaluate('document.querySelector(".adm-drawer").innerText.includes("Candidate file")'))
  await screenshot('application-drawer-desktop')
  await clickText('Accept as member')
  await waitFor('Boolean(document.querySelector(".adm-modal"))')
  await evaluate(`(() => { const field = document.querySelector('.adm-modal textarea[name="reason"]'); field.value = 'Strong fit for the autumn member programme.' })()`)
  await clickText('Confirm action')
  await waitFor('!document.querySelector(".adm-modal") && document.querySelector(".adm-drawer").innerText.includes("Accepted")')
  await waitFor(`JSON.parse(localStorage.getItem('infinity-administration-demo-v3')).members.some((record) => record.name === 'Lina Bensaid')`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await waitFor('!document.querySelector(".adm-drawer")')

  await navigate('/admin/members')
  assert(await evaluate(`JSON.parse(localStorage.getItem('infinity-administration-demo-v3')).members.some((record) => record.name === 'Lina Bensaid')`))
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
  assert(await evaluate('document.body.innerText.includes("Accept as member")'))
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
  console.log('PASS: admin login, overview, applications, AIVEX viewer, desktop, tablet and mobile')
} finally {
  socket.close()
}
