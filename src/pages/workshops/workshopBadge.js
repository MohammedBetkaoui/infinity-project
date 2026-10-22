import { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX, INFINITY_CLUB_ASPECT } from '../../components/infinity-club-geometry.js'
import { WORKSHOP_BADGE } from './workshopBadgeTheme.js'

const { colors: C, panel: PANEL, header: HEADER, footer: FOOTER, title: TITLE, meta: META, qr: QR, name: NAME } = WORKSHOP_BADGE
const BADGE_WIDTH = WORKSHOP_BADGE.width
const BADGE_HEIGHT = WORKSHOP_BADGE.height
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
  return `${day} ${month.toUpperCase()} ${year} • ${time}`
}

const canvasFont = (weight, size) => `${weight} ${size}px ${FONT_FAMILY}`

const setFont = (context, weight, size, spacing = 0) => {
  context.font = canvasFont(weight, size)
  context.letterSpacing = `${spacing}px`
}

const track = (context, value, { weight, size, spacing = 0, color }, cx, y, align = 'center') => {
  setFont(context, weight, size, spacing)
  context.fillStyle = color
  context.textAlign = align
  context.fillText(value, cx, y)
  context.letterSpacing = '0px'
}

const roundRect = (context, x, y, width, height, radius) => {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

const hair = (context, x1, x2, y, color, lineWidth = 2) => {
  context.save()
  context.strokeStyle = color
  context.lineWidth = lineWidth
  context.beginPath()
  context.moveTo(x1, y)
  context.lineTo(x2, y)
  context.stroke()
  context.restore()
}

const vline = (context, x, y1, y2, color, lineWidth = 2) => {
  context.save()
  context.strokeStyle = color
  context.lineWidth = lineWidth
  context.beginPath()
  context.moveTo(x, y1)
  context.lineTo(x, y2)
  context.stroke()
  context.restore()
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

const glow = (context, x, y, radius, color) => {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT)
}

const paintArtwork = (context) => {
  const sweep = context.createLinearGradient(0, 0, BADGE_WIDTH * 0.34, BADGE_HEIGHT)
  sweep.addColorStop(0, C.deep)
  sweep.addColorStop(0.52, C.green)
  sweep.addColorStop(0.82, '#063B2B')
  sweep.addColorStop(1, '#04241A')
  context.fillStyle = sweep
  context.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT)

  glow(context, 890, 40, 620, 'rgba(143, 217, 184, 0.15)')
  glow(context, 130, 1400, 640, 'rgba(143, 217, 184, 0.10)')
  glow(context, 960, 1240, 460, 'rgba(216, 197, 138, 0.05)')

  for (const [offsetX, offsetY, radiusValue, alphaValue] of [
    [-60, -70, 340, 0.05], [40, 30, 300, 0.04],
  ]) {
    context.save()
    context.translate(offsetX, offsetY)
    context.strokeStyle = `rgba(246, 243, 234, ${alphaValue})`
    context.lineWidth = 2
    context.beginPath()
    context.arc(150, -50, radiusValue, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  context.save()
  context.translate(BADGE_WIDTH * 0.5, 148)
  context.rotate(-0.26)
  ribbon(context, [[-920, 60], [-280, -170], [200, 210], [940, -60]], 150, [
    [0, 'rgba(143, 217, 184, 0)'],
    [0.42, 'rgba(143, 217, 184, 0.20)'],
    [0.68, 'rgba(246, 243, 234, 0.12)'],
    [1, 'rgba(246, 243, 234, 0)'],
  ])
  context.restore()

  context.save()
  context.translate(BADGE_WIDTH * 0.46, 1680)
  context.rotate(0.24)
  ribbon(context, [[-880, 80], [-260, 190], [220, -110], [900, 100]], 120, [
    [0, 'rgba(143, 217, 184, 0)'],
    [0.5, 'rgba(143, 217, 184, 0.16)'],
    [0.78, 'rgba(246, 243, 234, 0.09)'],
    [1, 'rgba(246, 243, 234, 0)'],
  ])
  context.restore()

  context.save()
  context.translate(BADGE_WIDTH * 0.12, 640)
  context.rotate(0.62)
  ribbon(context, [[-560, 0], [-160, -120], [160, 140], [560, 20]], 96, [
    [0, 'rgba(216, 197, 138, 0)'],
    [0.46, 'rgba(216, 197, 138, 0.10)'],
    [0.8, 'rgba(246, 243, 234, 0.06)'],
    [1, 'rgba(246, 243, 234, 0)'],
  ])
  context.restore()

  hair(context, 250, 900, 168, C.goldHairline, 2)
  hair(context, 120, 640, 1306, C.goldHairline, 2)
  vline(context, 962, 60, 300, 'rgba(216, 197, 138, 0.35)', 2)

  drawInfinityEmblem(context, BADGE_WIDTH * 0.5, 1090, 940, C.cream, 0.045)
  drawInfinityEmblem(context, 918, 190, 240, C.mint, 0.05)
}

const drawSideLines = (context, value, { baseline, color, lineColor, gap, length, weight, size, spacing }) => {
  const text = String(value).toUpperCase()
  const width = measuredWidth(context, { weight, size, spacing }, text)
  const centerY = baseline - size * 0.32
  for (const side of [-1, 1]) {
    const start = BADGE_WIDTH / 2 + side * (width / 2 + gap)
    hair(context, start, start + side * length, centerY, lineColor, 2)
  }
  track(context, text, { weight, size, spacing, color }, BADGE_WIDTH / 2, baseline)
}

const measuredWidth = (context, { weight, size, spacing = 0 }, value) => {
  setFont(context, weight, size, spacing)
  const width = context.measureText(value).width
  context.letterSpacing = '0px'
  return width
}

const chip = (context, centerX, centerY, diameter) => {
  const radius = diameter / 2
  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.fillStyle = C.white
  context.fill()
  context.strokeStyle = 'rgba(9, 74, 54, 0.55)'
  context.lineWidth = 2
  context.stroke()
  context.restore()
}

const calendarIcon = (context, centerX, centerY) => {
  context.save()
  context.translate(centerX, centerY)
  context.strokeStyle = C.green
  context.fillStyle = C.green
  context.lineWidth = 2.4
  context.lineCap = 'round'
  context.beginPath()
  context.roundRect(-8, -5.5, 16, 13, 3)
  context.moveTo(-8, -0.5)
  context.lineTo(8, -0.5)
  context.stroke()
  context.beginPath()
  context.moveTo(-4, -8)
  context.lineTo(-4, -4)
  context.moveTo(4, -8)
  context.lineTo(4, -4)
  context.stroke()
  context.beginPath()
  context.arc(0, 2.4, 1.6, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

const pinIcon = (context, centerX, centerY) => {
  context.save()
  context.translate(centerX, centerY)
  context.strokeStyle = C.green
  context.lineWidth = 2.4
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(0, 8)
  context.bezierCurveTo(-6.5, 1.5, -6.5, -3.4, -6.5, -4.4)
  context.arc(0, -4.4, 6.5, Math.PI, 0, false)
  context.bezierCurveTo(6.5, -3.4, 6.5, 1.5, 0, 8)
  context.stroke()
  context.beginPath()
  context.arc(0, -4.2, 2.2, 0, Math.PI * 2)
  context.fillStyle = C.green
  context.fill()
  context.restore()
}

const paintMeta = (context, labelBaseline, pass) => {
  const cx = BADGE_WIDTH / 2
  const columns = [
    { center: cx - META.columnSpread, label: 'DATE', icon: calendarIcon },
    { center: cx + META.columnSpread, label: 'LOCATION', icon: pinIcon },
  ]
  const locationFit = fitFont(context, pass.event.location || '', {
    maxWidth: META.locationMaxWidth, maxLines: 2, weight: 700, startSize: META.valueSize, minSize: 20,
  })
  const lineStep = Math.round(locationFit.size * 1.24)
  let valueBottom = labelBaseline + META.valueGap
  columns.forEach((column, index) => {
    const labelWidth = measuredWidth(context, { weight: 800, size: META.labelSize, spacing: META.labelSpacing }, column.label)
    const groupWidth = META.chipDiameter + META.chipGap + labelWidth
    const left = column.center - groupWidth / 2
    chip(context, left + META.chipDiameter / 2, labelBaseline - 10, META.chipDiameter)
    column.icon(context, left + META.chipDiameter / 2, labelBaseline - 10)
    track(context, column.label, { weight: 800, size: META.labelSize, spacing: META.labelSpacing, color: C.mintDeep }, left + META.chipDiameter + META.chipGap, labelBaseline, 'left')
    const valueLines = index === 0 ? [eventSchedule(pass.event.startsAt)] : locationFit.lines
    valueLines.forEach((line, lineIndex) => {
      const baseline = labelBaseline + META.valueGap + lineIndex * lineStep
      track(context, line, { weight: 700, size: index === 0 ? META.valueSize : locationFit.size, spacing: 0.4, color: lineIndex ? C.inkSoft : C.deep }, left + META.chipDiameter + META.chipGap, baseline, 'left')
    })
    valueBottom = Math.max(valueBottom, labelBaseline + META.valueGap + (valueLines.length - 1) * lineStep)
  })
  vline(context, cx, labelBaseline - 34, valueBottom + 10, C.inkFaint, 2)
  return valueBottom
}

const paintPanel = (context, pass, qrImage) => {
  roundRect(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, PANEL.radius)
  context.fillStyle = C.cream
  context.fill()
  roundRect(context, PANEL.x + 10, PANEL.y + 10, PANEL.width - 20, PANEL.height - 20, PANEL.radius - 8)
  context.save()
  context.strokeStyle = C.goldSoft
  context.lineWidth = 2.5
  context.stroke()
  context.restore()

  const cx = BADGE_WIDTH / 2
  drawSideLines(context, 'WORKSHOP', {
    baseline: TITLE.labelBaseline, color: C.mintDeep, lineColor: 'rgba(14, 106, 76, 0.32)',
    gap: TITLE.sideLineGap, length: TITLE.sideLineLength, weight: 800, size: TITLE.labelSize, spacing: TITLE.labelSpacing,
  })

  const titleValue = String(pass.event.title || '').toUpperCase()
  let titleFit = fitFont(context, titleValue, {
    maxWidth: WORKSHOP_BADGE.contentWidth, maxLines: 3, weight: 800,
    startSize: TITLE.startSize, minSize: TITLE.minSize,
  })
  if (titleFit.lines.length >= 3) {
    titleFit = fitFont(context, titleValue, {
      maxWidth: WORKSHOP_BADGE.contentWidth, maxLines: 3, weight: 800,
      startSize: TITLE.secondTierSize, minSize: TITLE.minSize,
    })
  }
  const titleLine = Math.round(titleFit.size * TITLE.lineFactor)
  titleFit.lines.forEach((line, index) => {
    track(context, line, { weight: 800, size: titleFit.size, spacing: 0.5, color: C.deep }, cx, TITLE.firstBaseline + index * titleLine)
  })
  const titleLast = TITLE.firstBaseline + (titleFit.lines.length - 1) * titleLine

  const nameValue = String(pass.participantName || 'Participant').toUpperCase()
  const nameFit = fitFont(context, nameValue, {
    maxWidth: NAME.maxWidth, maxLines: 2, weight: 800,
    startSize: NAME.startSize, minSize: NAME.minSize,
  })
  const nameLine = Math.round(nameFit.size * NAME.lineFactor)
  const nameTop = NAME.lastBaseline - (nameFit.lines.length - 1) * nameLine
  const participantLabelBaseline = nameTop - NAME.labelGap
  const cardLimit = participantLabelBaseline - NAME.cardGap

  let metaGap = NAME.metaGap
  let metaLabelBaseline = titleLast + metaGap
  let cardTopInitial = metaLabelBaseline + META.valueGap + 46
  const overflow = cardTopInitial + QR.minCardHeight - cardLimit
  if (overflow > 0) {
    metaGap = Math.max(46, metaGap - overflow)
    metaLabelBaseline = titleLast + metaGap
  }
  const valueBottom = paintMeta(context, metaLabelBaseline, pass)
  const cardTop = valueBottom + QR.topGap
  const cardHeight = Math.max(QR.minCardHeight, Math.min(QR.maxCardHeight, cardLimit - cardTop))
  const cardX = cx - QR.cardWidth / 2

  roundRect(context, cardX, cardTop, QR.cardWidth, cardHeight, QR.cardRadius)
  context.save()
  context.shadowColor = 'rgba(0, 42, 30, 0.15)'
  context.shadowBlur = 34
  context.shadowOffsetY = 14
  context.fillStyle = C.white
  context.fill()
  context.restore()
  roundRect(context, cardX, cardTop, QR.cardWidth, cardHeight, QR.cardRadius)
  context.strokeStyle = 'rgba(0, 42, 30, 0.07)'
  context.lineWidth = 2
  context.stroke()

  const code = cardHeight - QR.topInset - QR.gapToScan - 14
  const qrTop = cardTop + QR.topInset
  context.drawImage(qrImage, cx - code / 2, qrTop, code, code)
  track(context, 'SCAN AT CHECK-IN', { weight: 700, size: QR.scanSize, spacing: QR.scanSpacing, color: C.scanInk }, cx, qrTop + code + QR.gapToScan)

  drawSideLines(context, 'PARTICIPANT', {
    baseline: participantLabelBaseline, color: C.mintDeep, lineColor: 'rgba(14, 106, 76, 0.32)',
    gap: NAME.sideLineGap, length: NAME.sideLineLength, weight: 800, size: NAME.labelSize, spacing: NAME.labelSpacing,
  })
  nameFit.lines.forEach((line, index) => {
    track(context, line, { weight: 800, size: nameFit.size, spacing: 1, color: C.deep }, cx, nameTop + index * nameLine)
  })
}

const paintHeader = (context) => {
  const cx = BADGE_WIDTH / 2
  drawInfinityEmblem(context, cx, HEADER.emblemTop, HEADER.emblemWidth, C.cream)
  track(context, 'INFINITY CLUB', { weight: 800, size: HEADER.clubSize, spacing: HEADER.clubSpacing, color: C.cream }, cx, HEADER.clubBaseline)
  drawSideLines(context, 'OFFICIAL WORKSHOP PASS', {
    baseline: HEADER.passBaseline, color: C.mint, lineColor: 'rgba(143, 217, 184, 0.5)',
    gap: TITLE.sideLineGap + 4, length: 118, weight: 700, size: HEADER.passSize, spacing: HEADER.passSpacing,
  })
  track(context, 'MOHAMED EL BACHIR EL IBRAHIMI UNIVERSITY', { weight: 500, size: HEADER.universitySize, spacing: HEADER.universitySpacing, color: 'rgba(246, 243, 234, 0.62)' }, cx, HEADER.universityBaseline)
}

const paintFooter = (context) => {
  const cx = BADGE_WIDTH / 2
  drawInfinityEmblem(context, cx, FOOTER.emblemTop, FOOTER.emblemWidth, C.mint)
  drawSideLines(context, 'NO LIMITS FOR INFINITERS', {
    baseline: FOOTER.sloganBaseline, color: 'rgba(246, 243, 234, 0.94)', lineColor: 'rgba(216, 197, 138, 0.65)',
    gap: FOOTER.sideLineGap, length: FOOTER.sideLineLength, weight: 800, size: FOOTER.sloganSize, spacing: FOOTER.sloganSpacing,
  })
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
  const qrImage = await svgImage(qrSvgElement, 640)
  const canvas = document.createElement('canvas')
  canvas.width = WORKSHOP_BADGE.canvasWidth
  canvas.height = WORKSHOP_BADGE.canvasHeight
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('badge_canvas_unavailable')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.scale(WORKSHOP_BADGE.scale, WORKSHOP_BADGE.scale)
  roundRect(context, 0, 0, WORKSHOP_BADGE.width, WORKSHOP_BADGE.height, WORKSHOP_BADGE.radius)
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
