export const AIVEX_BUSINESS_TIME_ZONE = 'Africa/Algiers'
export const AIVEX_BUSINESS_UTC_OFFSET = '+01:00'

const LANGUAGE_LOCALES = Object.freeze({
  en: 'en-US',
  fr: 'fr-FR',
  ar: 'ar-DZ-u-nu-latn',
})

const ALGIERS_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA-u-nu-latn', {
  timeZone: AIVEX_BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const pad = (value) => String(value).padStart(2, '0')

function validInstant(value) {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function algiersParts(value) {
  const date = validInstant(value)
  if (!date) return null
  const parts = Object.fromEntries(
    ALGIERS_PARTS_FORMATTER.formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: part }) => [type, part]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function offsetFor(value, parts) {
  const date = validInstant(value)
  if (!date || !parts) return null
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const instantAtSecond = Math.floor(date.getTime() / 1000) * 1000
  const minutes = Math.round((localAsUtc - instantAtSecond) / 60000)
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

export function formatAlgiersTimestamp(value) {
  const date = validInstant(value)
  const parts = algiersParts(date)
  if (!date || !parts) return ''
  const offset = offsetFor(date, parts)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${offset}`
}

// Administrative mutations deliberately accept only an explicit Algeria
// offset. A browser-local or offset-free value is never silently reinterpreted.
export function parseAlgiersTimestamp(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+01:00$/)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match.map(Number)
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59 || second > 59) return null
  const date = new Date(Date.UTC(year, month - 1, day, hour - 1, minute, second))
  return formatAlgiersTimestamp(date) === value ? date : null
}

export function splitAlgiersTimestamp(value) {
  const timestamp = formatAlgiersTimestamp(value)
  if (!timestamp) return { date: '', time: '' }
  return { date: timestamp.slice(0, 10), time: timestamp.slice(11, 19) }
}

export function combineAlgiersDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return ''
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(String(time || ''))) return ''
  const withSeconds = time.length === 5 ? `${time}:00` : time
  const timestamp = `${date}T${withSeconds}${AIVEX_BUSINESS_UTC_OFFSET}`
  return parseAlgiersTimestamp(timestamp) ? timestamp : ''
}

export function campaignStatusFor(settings, now = new Date()) {
  if (!settings || settings.registrationEnabled !== true) return 'disabled'
  const opens = validInstant(settings.registrationOpenAt)
  const closes = validInstant(settings.registrationCloseAt)
  const clock = validInstant(now)
  if (!opens || !closes || !clock || closes.getTime() <= opens.getTime()) return 'disabled'
  if (clock.getTime() < opens.getTime()) return 'not_open'
  if (clock.getTime() > closes.getTime()) return 'closed'
  return 'open'
}

export function formatCampaignDate(value, language = 'en') {
  const date = validInstant(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language] || LANGUAGE_LOCALES.en, {
    timeZone: AIVEX_BUSINESS_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatCampaignDateTime(value, language = 'en') {
  const date = validInstant(value)
  if (!date) return ''
  const locale = language === 'en' ? 'en-GB' : (LANGUAGE_LOCALES[language] || 'en-GB')
  return new Intl.DateTimeFormat(locale, {
    timeZone: AIVEX_BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}
