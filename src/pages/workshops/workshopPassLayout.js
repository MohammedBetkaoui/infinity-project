// Pure layout planner for the official Infinity Club Workshop Pass.
// The canvas PNG render (workshopBadge.js), the web badge (WorkshopPass.jsx)
// and the Node tests all call planWorkshopPass with an injected measure
// function — one number set, so both surfaces break lines, size fonts and
// place the QR card pixel-identically on the 1054x1493 design grid.
import { WORKSHOP_BADGE as BADGE } from './workshopBadgeTheme.js'

const round = Math.round

export const passWords = (value) => String(value || '').split(/\s+/).filter(Boolean)

// Greedy word packing on styled (uppercase) words; when the final allowed
// line would overflow, its last word is char-truncated with an ellipsis so
// every produced line stays inside maxWidth.
const packWords = (measureLine, words, maxWidth, maxLines) => {
  const groups = []
  let current = []
  let truncated = false
  const lineText = (indices, extra) => [...indices.map((index) => words[index]), ...(extra ? [extra] : [])].join(' ')
  for (let index = 0; index < words.length; index++) {
    if (!current.length) {
      current.push(index)
      continue
    }
    if (measureLine(lineText([...current, index])) <= maxWidth) {
      current.push(index)
      continue
    }
    if (groups.length < maxLines - 1) {
      groups.push({ words: current })
      current = [index]
      continue
    }
    truncated = true
    let suffix = words[index]
    while (suffix.length > 1 && measureLine(`${lineText(current)} ${suffix}…`) > maxWidth) suffix = suffix.slice(0, -1)
    groups.push({ words: current, ellipsis: `${suffix}…` })
    current = []
    break
  }
  if (current.length) groups.push({ words: current })
  return { groups, truncated }
}

const renderGroups = (groups, words) => groups.map((group) =>
  [...group.words.map((index) => words[index]), ...(group.ellipsis ? [group.ellipsis] : [])].join(' '))

const fitText = (measure, words, { weight, spacing = 0, startSize, minSize, maxWidth, maxLines, step = 2 }) => {
  for (let size = startSize; size >= minSize; size -= step) {
    const measureLine = (text) => measure(text, weight, size, spacing)
    const packed = packWords(measureLine, words, maxWidth, maxLines)
    if (!packed.truncated) return { size, ...packed }
  }
  return { size: minSize, ...packWords((text) => measure(text, weight, minSize, spacing), words, maxWidth, maxLines) }
}

// Name prefers one clean line when it still reads large; otherwise the
// largest two-line arrangement that fits the participant width.
const fitName = (measure, words) => {
  const options = { weight: 800, spacing: BADGE.name.nameSpacing, startSize: BADGE.name.startSize, minSize: BADGE.name.minSize, maxWidth: BADGE.name.maxWidth }
  const single = fitText(measure, words, { ...options, maxLines: 1 })
  if (single.size >= BADGE.name.singleLineFloor) return single
  return fitText(measure, words, { ...options, maxLines: 2 })
}

export function planWorkshopPass(measure, input = {}) {
  const titleWords = passWords(input.title).map((word) => word.toUpperCase())
  const nameWords = passWords(input.name || 'Participant').map((word) => word.toUpperCase())
  const locationWords = passWords(input.location)

  const locationFit = locationWords.length
    ? fitText(measure, locationWords, { weight: 700, spacing: BADGE.meta.valueSpacing, startSize: BADGE.meta.valueSize, minSize: 20, maxWidth: BADGE.meta.locationMaxWidth, maxLines: 2 })
    : { size: BADGE.meta.valueSize, groups: [], truncated: false }

  const locationLine = round(locationFit.size * BADGE.meta.valueLineFactor)
  const locLines = renderGroups(locationFit.groups, locationWords)
  const locLineCount = Math.max(1, locLines.length)
  const extraLines = (locLineCount - 1) * locationLine

  // Participant chain is bottom-anchored, so any title candidate knows the
  // exact ceiling under which the QR card must finish.
  const nameFit = fitName(measure, nameWords)
  const nameLine = round(nameFit.size * BADGE.name.lineFactor)
  const nameFirstBaseline = BADGE.name.lastBaseline - (nameFit.groups.length - 1) * nameLine
  const nameCapTop = nameFirstBaseline - round(nameFit.size * BADGE.name.capFactor)
  const labelBaseline = nameCapTop - BADGE.name.labelGap
  const labelCapTop = labelBaseline - round(BADGE.name.labelSize * BADGE.name.capFactor)
  const qrBottomMax = labelCapTop - BADGE.name.participantTopGap

  const cardFull = BADGE.qr.topInset + BADGE.qr.codeSize + BADGE.qr.gapToScan + BADGE.qr.scanHeight
  const candidates = BADGE.title.tiers.map((tier) =>
    fitText(measure, titleWords, { weight: 800, spacing: 0.5, startSize: tier, minSize: BADGE.title.minSize, maxWidth: BADGE.title.maxWidth, maxLines: 3 }))

  const cardOf = (candidate) => {
    const titleLine = round(candidate.size * BADGE.title.lineFactor)
    const titleLast = BADGE.title.firstBaseline + (candidate.groups.length - 1) * titleLine
    const extraLines = (locLineCount - 1) * locationLine
    let metaGap = BADGE.meta.metaGap
    let valueGap = BADGE.meta.valueGap
    let topGap = BADGE.qr.topGap
    let cardTop = titleLast + metaGap + valueGap + extraLines + topGap
    const available = qrBottomMax - cardTop
    const need = cardFull - available
    let cardHeight
    if (need <= 0) {
      cardHeight = cardFull
    } else if (need <= BADGE.qr.topGap - BADGE.qr.topGapFloor + BADGE.meta.metaGap - BADGE.meta.metaGapFloor + BADGE.meta.valueGap - BADGE.meta.valueGapFloor) {
      const topSqueeze = Math.min(need, BADGE.qr.topGap - BADGE.qr.topGapFloor)
      const metaSqueeze = Math.min(need - topSqueeze, BADGE.meta.metaGap - BADGE.meta.metaGapFloor)
      const valueSqueeze = Math.min(need - topSqueeze - metaSqueeze, BADGE.meta.valueGap - BADGE.meta.valueGapFloor)
      topGap -= topSqueeze
      metaGap -= metaSqueeze
      valueGap -= valueSqueeze
      cardHeight = cardFull
    } else {
      topGap = BADGE.qr.topGapFloor
      metaGap = BADGE.meta.metaGapFloor
      valueGap = BADGE.meta.valueGapFloor
      cardHeight = null
    }
    cardTop = titleLast + metaGap + valueGap + extraLines + topGap
    if (cardHeight === null) cardHeight = Math.min(cardFull, qrBottomMax - cardTop)
    const code = Math.min(BADGE.qr.codeSize, cardHeight - BADGE.qr.topInset - BADGE.qr.gapToScan - BADGE.qr.scanHeight)
    return { ...candidate, metaGap, valueGap, topGap, cardTop, cardHeight, code, available }
  }

  const scored = candidates.map(cardOf)
  const wanted = scored.filter((lane) => !lane.truncated && lane.cardHeight >= BADGE.qr.minCardHeight)
  const ranked = (lane) => lane.cardTop
  const chosen = (wanted.length
    ? wanted.sort((a, b) => b.size - a.size)
    : scored.slice().sort((a, b) => ranked(a) - ranked(b) || b.size - a.size))[0]

  const titleLines = renderGroups(chosen.groups, titleWords)
  const titleLine = round(chosen.size * BADGE.title.lineFactor)
  const titleLast = BADGE.title.firstBaseline + (chosen.groups.length - 1) * titleLine
  const metaLabelBaseline = titleLast + chosen.metaGap
  const valueBaseline = metaLabelBaseline + chosen.valueGap
  const valueBottom = valueBaseline + extraLines
  const qrTop = chosen.cardTop + BADGE.qr.topInset
  const scanBaseline = qrTop + chosen.code + BADGE.qr.gapToScan + round(BADGE.qr.scanSize * BADGE.name.capFactor)
  const nameLines = renderGroups(nameFit.groups, nameWords)

  return {
    title: { size: chosen.size, line: titleLine, lines: titleLines, firstBaseline: BADGE.title.firstBaseline, lastBaseline: titleLast },
    meta: { labelBaseline: metaLabelBaseline, valueBaseline, valueBottom, locationSize: locationFit.size, locationLine, locLines },
    qr: { cardTop: chosen.cardTop, cardHeight: chosen.cardHeight, cardBottom: chosen.cardTop + chosen.cardHeight, code: chosen.code, qrTop, scanBaseline, topGap: chosen.topGap },
    name: { size: nameFit.size, line: nameLine, lines: nameLines, firstBaseline: nameFirstBaseline, lastBaseline: BADGE.name.lastBaseline, capTop: nameCapTop, labelBaseline, labelCapTop },
  }
}
