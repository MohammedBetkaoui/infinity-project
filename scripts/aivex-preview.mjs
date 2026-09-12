import { writeFile } from 'node:fs/promises'

const tabs = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json())
const socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => { socket.onopen = resolve })
let sequence = 0
const pending = new Map()
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (!pending.has(message.id)) return
  const { resolve, reject, timer } = pending.get(message.id)
  clearTimeout(timer)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
try {
  await send('Emulation.setDeviceMetricsOverride', { width: Number(process.argv[3]) || 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:5173/aivex' })
  await new Promise(resolve => setTimeout(resolve, 4600))
  console.log(await send('Runtime.evaluate', { expression: `JSON.stringify({ title: document.title, text: document.body.innerText.slice(0, 400), error: !!document.querySelector('vite-error-overlay'), overflow: document.documentElement.scrollWidth > innerWidth, handoff: document.querySelector('.aivex-loader')?.dataset.handoff, audit: window.__handoff && {...window.__handoff,samples:window.__handoff.samples.slice(-2)} })`, returnByValue: true }))
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile('.browser-motion-audit/aivex-preview.png', Buffer.from(data, 'base64'))
} finally { socket.close() }
