import { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX, INFINITY_CLUB_ASPECT } from '../../components/infinity-club-geometry.js'

const DEEP = '#002A1E'
const GREEN = '#094A36'
const CREAM = '#F6F3EA'
const MINT = '#8FD9B8'
const MINT_DEEP = '#0E6A4C'

const BADGE_WIDTH = 1200
const BADGE_HEIGHT = 1700
const BADGE_RADIUS = 62
const PANEL = { x: 48, y: 360, width: 1104, height: 1044, radius: 36 }
const PANEL_INNER = 964
const QR_CARD = { x: 330, y: 878, width: 540, height: 336, radius: 28, code: 256 }
const FONT_FAMILY = 'Inter, Arial, sans-serif'

export function workshopBadgeFileName(participantName) {
  const safeName = String(participantName || 'Participant')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'Participant'
  return `Infinity-Workshop-${safeName}.png`
}

export function eventSchedule(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const [day, month, year] = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Algiers',
  }).format(date).split(/[ ,]+/).filter(Boolean)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Algiers',
  }).format(date)
  return `${day} ${month.toUpperCase()} ${year} · ${time}`
}

const canvasFont = (weight, size) => `${weight} ${size}px ${FONT_FAMILY}`

const track = (context, value, { weight = 800, size, spacing = 0, color }, cx, y, align = 'center') => {
  context.font = canvasFont(weight, size)
  context.letterSpacing = `${spacing}px`
  context.fillStyle = color
  context.textAlign = align
  context.fillText(value, cx, y)
  context.letterSpacing = '0px'
}

const roundRect = (context, x, y, width, height, radius) => {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

export const fitLines = (context, value, maxWidth, maxLines = 2) => {
  const words = String(value || '').split(/\s+/).filter(Boolean)
  const lines = []
  for (const word of words) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word
    if (!lines.length || context.measureText(candidate).width <= maxWidth) {
      if (!lines.length) lines.push(word)
      else lines[lines.length - 1] = candidate
    } else if (lines.length < maxLines) lines.push(word)
    else {
      let final = `${lines.at(-1)} ${word}`
      while (final.length > 1 && context.measureText(`${final}…`).width > maxWidth) final = final.slice(0, -1)
      lines[lines.length - 1] = `${final.trim()}…`
      break
    }
  }
  return lines
}

const fitFont = (context, value, { maxWidth, maxLines, weight, startSize, minSize }) => {
  for (let size = startSize; size > minSize; size -= 2) {
    context.font = canvasFont(weight, size)
    const lines = fitLines(context, value, maxWidth, maxLines)
    const overflowing = lines.some((line) => context.measureText(line).width > maxWidth)
    if (!overflowing) return { size, lines }
  }
  context.font = canvasFont(weight, minSize)
  return { size: minSize, lines: fitLines(context, value, maxWidth, maxLines) }
}

const drawInfinityEmblem = (context, centerX, top, width, fillStyle, alpha = 1) => {
  const scale = width / (INFINITY_CLUB_ASPECT * 1274.55)
  const height = width / INFINITY_CLUB_ASPECT
  context.save()
  context.globalAlpha = alpha
  context.translate(centerX - width / 2, top)
  context.scale(scale, scale)
  context.fillStyle = fillStyle
  context.fill(new Path2D(INFINITY_CLUB_PATH))
  context.restore()
  return height
}

const ribbon = (context, pathPoints, width, stops) => {
  context.save()
  const gradient = context.createLinearGradient(-900, 0, 940, 0)
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color))
  context.strokeStyle = gradient
  context.lineWidth = width
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(...pathPoints[0])
  context.bezierCurveTo(...pathPoints[1], ...pathPoints[2], ...pathPoints[3])
  context.stroke()
  context.restore()
}

const paintArtwork = (context) => {
  const sweep = context.createLinearGradient(0, 0, BADGE_WIDTH * 0.35, BADGE_HEIGHT)
  sweep.addColorStop(0, DEEP)
  sweep.addColorStop(0.52, GREEN)
  sweep.addColorStop(0.8, '#063B2B')
  sweep.addColorStop(1, '#042018')
  context.fillStyle = sweep
  context.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT)

  const glowTop = context.createRadialGradient(1040, 30, 0, 1040, 30, 640)
  glowTop.addColorStop(0, 'rgba(143, 217, 184, 0.16)')
  glowTop.addColorStop(1, 'rgba(143, 217, 184, 0)')
  context.fillStyle = glowTop
  context.fillRect(0, 0, BADGE_WIDTH, 640)

  const glowBottom = context.createRadialGradient(200, 1620, 0, 200, 1620, 720)
  glowBottom.addColorStop(0, 'rgba(143, 217, 184, 0.10)')
  glowBottom.addColorStop(1, 'rgba(143, 217, 184, 0)')
  context.fillStyle = glowBottom
  context.fillRect(0, 1060, BADGE_WIDTH, BADGE_HEIGHT - 1060)

  for (const [offset, radiusValue] of [[-40, 318], [8, 262]]) {
    context.save()
    context.translate(offset, offset)
    context.strokeStyle = 'rgba(246, 243, 234, 0.06)'
    context.lineWidth = 2
    context.beginPath()
    context.arc(150, -50, radiusValue, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  context.save()
  context.translate(BADGE_WIDTH * 0.5, 140)
  context.rotate(-0.28)
  ribbon(context, [[-900, 60], [-280, -170], [200, 210], [920, -60]], 150, [
    [0, 'rgba(143, 217, 184, 0)'],
    [0.42, 'rgba(143, 217, 184, 0.20)'],
    [0.68, 'rgba(246, 243, 234, 0.12)'],
    [1, 'rgba(246, 243, 234, 0)'],
  ])
  context.restore()

  context.save()
  context.translate(BADGE_WIDTH * 0.44, 1660)
  context.rotate(0.24)
  ribbon(context, [[-880, 80], [-260, 190], [220, -110], [900, 100]], 120, [
    [0, 'rgba(143, 217, 184, 0)'],
    [0.5, 'rgba(143, 217, 184, 0.16)'],
    [0.78, 'rgba(246, 243, 234, 0.09)'],
    [1, 'rgba(246, 243, 234, 0)'],
  ])
  context.restore()

  drawInfinityEmblem(context, BADGE_WIDTH * 0.5, 1180, 940, CREAM, 0.05)
}

const paintHeader = (context) => {
  const cx = BADGE_WIDTH / 2
  drawInfinityEmblem(context, cx, 58, 182, CREAM)
  track(context, 'INFINITY CLUB', { weight: 800, size: 44, spacing: 12, color: CREAM }, cx, 220)
  track(context, 'OFFICIAL WORKSHOP PASS', { weight: 700, size: 20, spacing: 12, color: MINT }, cx, 258)
  track(context, 'MOHAMED EL BACHIR EL IBRAHIMI UNIVERSITY', { weight: 500, size: 15, spacing: 4.5, color: 'rgba(246, 243, 234, 0.64)' }, cx, 294)
  context.save()
  context.globalAlpha = 0.4
  context.fillStyle = MINT
  context.fillRect(cx - 64, 318, 128, 2)
  context.restore()
}

const paintFacts = (context, pass, titleBlock) => {
  const cx = BADGE_WIDTH / 2
  let y = titleBlock.lastBaseline + (titleBlock.lines.length === 3 ? 42 : 56)
  track(context, 'DATE', { weight: 700, size: 14, spacing: 7, color: MINT_DEEP }, cx, y)
  track(context, eventSchedule(pass.event.startsAt), { weight: 800, size: 30, spacing: 0.5, color: DEEP }, cx, y + 32)
  y += 74
  context.font = canvasFont(700, 24)
  const locationLines = fitLines(context, pass.event.location, PANEL_INNER, 2)
  track(context, 'LOCATION', { weight: 700, size: 14, spacing: 7, color: MINT_DEEP }, cx, y)
  context.font = canvasFont(700, 24)
  locationLines.forEach((line, index) => track(context, line, { weight: 700, size: 24, spacing: 0.4, color: 'rgba(0, 42, 30, 0.78)' }, cx, y + 32 + index * 32))
  return y + 32 + (locationLines.length - 1) * 32
}

const paintParticipant = (context, pass) => {
  const cx = BADGE_WIDTH / 2
  const roleBaseline = PANEL.y + PANEL.height - 34
  track(context, 'PARTICIPANT', { weight: 800, size: 17, spacing: 9, color: MINT_DEEP }, cx, roleBaseline)
  const name = fitFont(context, String(pass.participantName || 'Participant').toUpperCase(), {
    maxWidth: PANEL_INNER, maxLines: 2, weight: 800, startSize: 64, minSize: 40,
  })
  const lineHeight = Math.round(name.size * 1.16)
  name.lines.forEach((line, index) => track(context, line, { weight: 800, size: name.size, spacing: 1, color: DEEP }, cx, roleBaseline - 62 - (name.lines.length - 1 - index) * lineHeight))
}

const paintPanel = (context, pass, qrImage) => {
  roundRect(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, PANEL.radius)
  context.fillStyle = CREAM
  context.fill()

  const cx = BADGE_WIDTH / 2
  track(context, 'WORKSHOP', { weight: 800, size: 19, spacing: 9, color: MINT_DEEP }, cx, 428)
  const title = fitFont(context, pass.event.title, {
    maxWidth: PANEL_INNER, maxLines: 3, weight: 800, startSize: 54, minSize: 34,
  })
  const lineHeight = Math.round(title.size * 1.22)
  const firstBaseline = 488
  title.lines.forEach((line, index) => track(context, line, { weight: 800, size: title.size, spacing: 0.5, color: DEEP }, cx, firstBaseline + index * lineHeight))
  const titleBlock = {
    lines: title.lines,
    lastBaseline: firstBaseline + (title.lines.length - 1) * lineHeight,
  }
  paintFacts(context, pass, titleBlock)

  roundRect(context, QR_CARD.x, QR_CARD.y, QR_CARD.width, QR_CARD.height, QR_CARD.radius)
  context.save()
  context.shadowColor = 'rgba(0, 42, 30, 0.16)'
  context.shadowBlur = 42
  context.shadowOffsetY = 16
  context.fillStyle = '#FFFFFF'
  context.fill()
  context.restore()
  context.strokeStyle = 'rgba(0, 42, 30, 0.07)'
  context.lineWidth = 2
  roundRect(context, QR_CARD.x, QR_CARD.y, QR_CARD.width, QR_CARD.height, QR_CARD.radius)
  context.stroke()
  const qrLeft = cx - QR_CARD.code / 2
  const qrTop = QR_CARD.y + 30
  context.drawImage(qrImage, qrLeft, qrTop, QR_CARD.code, QR_CARD.code)
  track(context, 'SCAN AT CHECK-IN', { weight: 700, size: 19, spacing: 8, color: '#2E6B55' }, cx, qrTop + QR_CARD.code + 40)

  paintParticipant(context, pass)
}

const paintFooter = (context) => {
  const cx = BADGE_WIDTH / 2
  drawInfinityEmblem(context, cx, 1470, 104, MINT)
  track(context, 'NO LIMITS FOR INFINITERS', { weight: 800, size: 25, spacing: 11, color: 'rgba(246, 243, 234, 0.94)' }, cx, 1592)
}

const svgImage = async (svgElement, size) => {
  if (!(svgElement instanceof SVGElement)) throw new Error('badge_qr_unavailable')
  const clone = svgElement.cloneNode(true)
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(size))
  const source = new XMLSerializer().serializeToString(clone)
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'sync'
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('badge_qr_unavailable'))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadWorkshopBadgePng(pass, qrSvgElement) {
  if (!pass?.event?.title || !pass?.qrPayload) throw new Error('badge_data_unavailable')
  await document.fonts?.ready
  const qrImage = await svgImage(qrSvgElement, 560)
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1700
  const context = canvas.getContext('2d')
  if (!context) throw new Error('badge_canvas_unavailable')
  roundRect(context, 0, 0, canvas.width, canvas.height, BADGE_RADIUS)
  context.clip()
  paintArtwork(context)
  paintHeader(context)
  paintPanel(context, pass, qrImage)
  paintFooter(context)

  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('badge_export_failed')),
    'image/png', 1,
  ))
  const href = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = workshopBadgeFileName(pass.participantName)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }
}
