const safeProviderId = (value) => String(value || '').trim().slice(0, 255) || null

function formatWorkshopDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Algiers',
  }).format(new Date(value))
}

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function workshopInvitationEmail(input) {
  const title = escapeHtml(input.eventTitle)
  const recipient = escapeHtml(input.memberName)
  const schedule = escapeHtml(formatWorkshopDate(input.startsAt))
  const location = escapeHtml(input.location)
  const speaker = escapeHtml(input.speakerName)
  const url = escapeHtml(input.registrationUrl)
  return {
    subject: `${input.eventTitle} · Infinity Club workshop invitation`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#17132b"><div style="max-width:620px;margin:auto;padding:32px 20px"><div style="background:#5b35f2;color:white;border-radius:20px;padding:28px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase">Infinity Club</p><h1 style="margin:0;font-size:28px">${title}</h1></div><div style="background:white;border-radius:20px;padding:28px;margin-top:12px"><p>Hello ${recipient},</p><p>You are privately invited to this Infinity Club workshop.</p><p><strong>Date:</strong> ${schedule}<br><strong>Location:</strong> ${location}<br><strong>Facilitator:</strong> ${speaker}</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#5b35f2;color:white;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Register and get my pass</a></p><p style="font-size:13px;color:#68627d">This link is personal. Do not forward it.</p><p style="margin-top:28px;font-weight:700">No Limits For Infiniters</p></div></div></body></html>`,
    text: `Infinity Club\n\nHello ${input.memberName},\n\nYou are invited to ${input.eventTitle}.\nDate: ${formatWorkshopDate(input.startsAt)}\nLocation: ${input.location}\nFacilitator: ${input.speakerName}\n\nRegister: ${input.registrationUrl}\n\nThis link is personal. Do not forward it.\nNo Limits For Infiniters`,
  }
}

export function createWorkshopEmailProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const provider = String(env.EVENTS_EMAIL_PROVIDER || '').trim().toLowerCase()
  if (!provider) return { configured: false, name: 'none', async send() { return { ok: false, reason: 'not_configured' } } }
  if (provider !== 'resend') return { configured: false, name: provider, async send() { return { ok: false, reason: 'unsupported_provider' } } }
  const apiKey = String(env.RESEND_API_KEY || '').trim()
  const from = String(env.EVENTS_EMAIL_FROM || '').trim()
  if (!apiKey || !from) return { configured: false, name: provider, async send() { return { ok: false, reason: 'not_configured' } } }
  return {
    configured: true,
    name: provider,
    async send({ to, subject, html, text }) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, html, text }),
          signal: controller.signal,
        })
        const body = await response.json().catch(() => null)
        return response.ok && body?.id
          ? { ok: true, messageId: safeProviderId(body.id) }
          : { ok: false, reason: `provider_${response.status}` }
      } catch (error) {
        return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

