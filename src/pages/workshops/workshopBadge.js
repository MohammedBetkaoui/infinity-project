const badgeDate = (value) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Algiers',
}).format(new Date(value))

export function workshopBadgeFileName(participantName) {
  const safeName = String(participantName || 'Participant')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'Participant'
  return `Infinity-Workshop-${safeName}.png`
}

const roundRect = (context, x, y, width, height, radius) => {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

const fitLines = (context, value, maxWidth, maxLines = 2) => {
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

const svgImage = async (svgElement) => {
  if (!(svgElement instanceof SVGElement)) throw new Error('badge_qr_unavailable')
  const clone = svgElement.cloneNode(true)
  clone.setAttribute('width', '440')
  clone.setAttribute('height', '440')
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
  const qrImage = await svgImage(qrSvgElement)
  const canvas = document.createElement('canvas')
  canvas.width = 1800
  canvas.height = 1200
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('badge_canvas_unavailable')

  context.fillStyle = '#100d1c'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const glow = context.createRadialGradient(260, 120, 20, 260, 120, 800)
  glow.addColorStop(0, '#7f5cff')
  glow.addColorStop(1, '#100d1c')
  context.globalAlpha = 0.5
  context.fillStyle = glow
  context.fillRect(0, 0, canvas.width, 1200)
  context.globalAlpha = 1

  roundRect(context, 90, 70, 1620, 1060, 54)
  context.fillStyle = '#f8f7ff'
  context.fill()
  roundRect(context, 90, 70, 1620, 180, 54)
  const brand = context.createLinearGradient(90, 70, 1710, 250)
  brand.addColorStop(0, '#5430e8')
  brand.addColorStop(1, '#8c55ff')
  context.fillStyle = brand
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = '700 92px Arial, sans-serif'
  context.fillText('∞', 150, 194)
  context.font = '800 42px Arial, sans-serif'
  context.fillText('Infinity Club', 260, 155)
  context.font = '700 21px Arial, sans-serif'
  context.letterSpacing = '7px'
  context.fillText('WORKSHOP PASS', 260, 202)
  context.letterSpacing = '0px'

  context.fillStyle = '#5b35f2'
  context.font = '800 22px Arial, sans-serif'
  context.fillText('ADMIT ONE PARTICIPANT', 160, 340)
  context.fillStyle = '#17132b'
  context.font = '800 70px Arial, sans-serif'
  fitLines(context, pass.event.title, 920, 2).forEach((line, index) => context.fillText(line, 160, 430 + index * 82))
  context.font = '800 48px Arial, sans-serif'
  fitLines(context, pass.participantName, 920, 2).forEach((line, index) => context.fillText(line, 160, 650 + index * 56))
  context.fillStyle = '#5b35f2'
  context.font = '800 25px Arial, sans-serif'
  context.fillText('Participant', 160, 760)

  roundRect(context, 1240, 310, 390, 450, 30)
  context.fillStyle = '#ffffff'
  context.fill()
  context.strokeStyle = '#ded9ed'
  context.lineWidth = 3
  context.stroke()
  context.drawImage(qrImage, 1265, 330, 340, 340)
  context.fillStyle = '#625c70'
  context.font = '600 18px Arial, sans-serif'
  context.textAlign = 'center'
  context.fillText('Present this code at check-in', 1435, 715)
  context.textAlign = 'left'

  context.strokeStyle = '#ded9ed'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(160, 850)
  context.lineTo(1630, 850)
  context.stroke()
  context.fillStyle = '#777083'
  context.font = '700 19px Arial, sans-serif'
  context.fillText('DATE', 160, 910)
  context.fillText('LOCATION', 900, 910)
  context.fillStyle = '#17132b'
  context.font = '700 27px Arial, sans-serif'
  fitLines(context, badgeDate(pass.event.startsAt), 620, 2).forEach((line, index) => context.fillText(line, 160, 955 + index * 34))
  fitLines(context, pass.event.location, 650, 2).forEach((line, index) => context.fillText(line, 900, 955 + index * 34))

  context.fillStyle = '#17132b'
  context.fillRect(90, 1040, 1620, 90)
  context.fillStyle = '#ffffff'
  context.font = '800 26px Arial, sans-serif'
  context.textAlign = 'center'
  context.fillText('No Limits For Infiniters', 900, 1097)

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
