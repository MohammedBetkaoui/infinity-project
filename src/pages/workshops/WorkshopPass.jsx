import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Download, MapPin } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import InfinityClubMark from '../../components/InfinityClubMark.jsx'
import { downloadWorkshopBadgePng, eventSchedule } from './workshopBadge.js'
import { WORKSHOP_BADGE } from './workshopBadgeTheme.js'

const BADGE = WORKSHOP_BADGE

// Display-only helpers that mirror the canvas layout maths so the web badge
// and the downloaded PNG break lines, size fonts and scale the QR identically.
const wrapLines = (measure, text, maxWidth, maxLines) => {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  for (const word of words) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word
    if (!lines.length || measure.measureText(candidate).width <= maxWidth) {
      if (!lines.length) lines.push(word)
      else lines[lines.length - 1] = candidate
    } else if (lines.length < maxLines) lines.push(word)
    else {
      let last = `${lines.at(-1)} ${word}`
      while (last.length > 1 && measure.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
      lines[lines.length - 1] = `${last.trim()}…`
      break
    }
  }
  return lines
}

const fitText = (measure, text, { maxWidth, maxLines, startSize, minSize, weight = 800 }) => {
  for (let size = startSize; size > minSize; size -= 2) {
    measure.font = `${weight} ${size}px Inter, Arial, sans-serif`
    const lines = wrapLines(measure, text, maxWidth, maxLines)
    if (lines.every((line) => measure.measureText(line).width <= maxWidth)) return { size, lines }
  }
  measure.font = `${weight} ${minSize}px Inter, Arial, sans-serif`
  return { size: minSize, lines: wrapLines(measure, text, maxWidth, maxLines) }
}

const cqw = (design) => `${(design / 10.54).toFixed(3)}cqw`

function usePassLayout(frameRef, pass) {
  const [layout, setLayout] = useState(null)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const measure = document.createElement('canvas').getContext('2d')
    if (!measure) return
    const compute = () => {
      if (!frame.clientWidth) return null
      const title = String(pass.event.title || '').toUpperCase()
      let titleFit = fitText(measure, title, {
        maxWidth: BADGE.contentWidth, maxLines: 3, startSize: BADGE.title.startSize, minSize: BADGE.title.minSize,
      })
      if (titleFit.lines.length >= 3) {
        titleFit = fitText(measure, title, {
          maxWidth: BADGE.contentWidth, maxLines: 3, startSize: BADGE.title.secondTierSize, minSize: BADGE.title.minSize,
        })
      }
      const name = String(pass.participantName || 'Participant').toUpperCase()
      const nameFit = fitText(measure, name, {
        maxWidth: BADGE.name.maxWidth, maxLines: 2, startSize: BADGE.name.startSize, minSize: BADGE.name.minSize,
      })
      const locationFit = fitText(measure, pass.event.location || '', {
        maxWidth: BADGE.meta.locationMaxWidth, maxLines: 2, startSize: BADGE.meta.valueSize, minSize: 20, weight: 700,
      })
      const titleLine = Math.round(titleFit.size * BADGE.title.lineFactor)
      const titleLast = BADGE.title.firstBaseline + (titleFit.lines.length - 1) * titleLine
      const nameLine = Math.round(nameFit.size * BADGE.name.lineFactor)
      const nameTop = BADGE.name.lastBaseline - (nameFit.lines.length - 1) * nameLine
      const cardLimit = nameTop - BADGE.name.labelGap - BADGE.name.cardGap
      let metaGap = BADGE.name.metaGap
      let metaBaseline = titleLast + metaGap
      const overflow = metaBaseline + BADGE.meta.valueGap + BADGE.qr.topGap + BADGE.qr.minCardHeight - cardLimit
      if (overflow > 0) {
        metaGap = Math.max(46, metaGap - overflow)
        metaBaseline = titleLast + metaGap
      }
      const valueBottom = metaBaseline + BADGE.meta.valueGap + (locationFit.lines.length - 1) * Math.round(locationFit.size * 1.24)
      const cardTop = valueBottom + BADGE.qr.topGap
      const cardH = Math.max(BADGE.qr.minCardHeight, Math.min(BADGE.qr.maxCardHeight, cardLimit - cardTop))
      return {
        titleSize: cqw(titleFit.size), titleLine: cqw(Math.round(titleFit.size * BADGE.title.lineFactor)), titleLines: titleFit.lines,
        nameSize: cqw(nameFit.size), nameLine: cqw(nameLine), nameLines: nameFit.lines,
        locSize: cqw(locationFit.size), locLine: cqw(Math.round(locationFit.size * 1.24)), locLines: locationFit.lines,
        metaGap: cqw(metaGap), cardH: cqw(cardH),
        qrCode: cqw(cardH - BADGE.qr.topInset - BADGE.qr.gapToScan - 14),
      }
    }
    const apply = () => setLayout(compute())
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frameRef, pass.event?.title, pass.event?.location, pass.participantName])
  return layout
}

export default function WorkshopPass({ pass }) {
  const frameRef = useRef(null)
  const qrRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const layout = usePassLayout(frameRef, pass)
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    setDownloadError('')
    try { await downloadWorkshopBadgePng(pass, qrRef.current?.querySelector('svg')) }
    catch { setDownloadError('The badge could not be downloaded. Please try again.') }
    finally { setDownloading(false) }
  }
  const panelVars = layout ? {
    '--pass-title-size': layout.titleSize, '--pass-title-line': layout.titleLine,
    '--pass-name-size': layout.nameSize, '--pass-name-line': layout.nameLine,
    '--pass-loc-size': layout.locSize, '--pass-loc-line': layout.locLine,
    '--pass-meta-gap': layout.metaGap, '--pass-card-h': layout.cardH, '--pass-qr-code': layout.qrCode,
  } : undefined
  return <>
    <div className="workshop-pass-frame" ref={frameRef}>
      <article className="workshop-pass" style={panelVars} aria-label="Infinity Club digital workshop pass">
        <div className="workshop-pass__artwork" aria-hidden="true">
          <span className="workshop-pass__ribbon workshop-pass__ribbon--one"/>
          <span className="workshop-pass__ribbon workshop-pass__ribbon--two"/>
          <span className="workshop-pass__ribbon workshop-pass__ribbon--three"/>
          <span className="workshop-pass__hairline workshop-pass__hairline--one"/>
          <span className="workshop-pass__hairline workshop-pass__hairline--two"/>
          <span className="workshop-pass__watermark"><InfinityClubMark/></span>
          <span className="workshop-pass__watermark workshop-pass__watermark--small"><InfinityClubMark/></span>
        </div>
        <header className="workshop-pass__header">
          <InfinityClubMark className="workshop-pass__emblem"/>
          <b className="workshop-pass__club">Infinity Club</b>
          <small className="workshop-pass__type">Official Workshop Pass</small>
          <span className="workshop-pass__university">Mohamed El Bachir El Ibrahimi University</span>
        </header>
        <section className="workshop-pass__panel">
          <section className="workshop-pass__event">
            <p className="workshop-pass__label"><span>Workshop</span></p>
            <h1>{layout?.titleLines
              ? layout.titleLines.map((line, index) => <span key={index} className="workshop-pass__line">{line}</span>)
              : pass.event.title}
            </h1>
            <div className="workshop-pass__facts" role="list">
              <p className="workshop-pass__fact" role="listitem">
                <span className="workshop-pass__chip"><CalendarDays/></span>
                <span className="workshop-pass__fact-text"><b>Date</b><strong>{eventSchedule(pass.event.startsAt)}</strong></span>
              </p>
              <i className="workshop-pass__separator" aria-hidden="true"/>
              <p className="workshop-pass__fact" role="listitem">
                <span className="workshop-pass__chip"><MapPin/></span>
                <span className="workshop-pass__fact-text"><b>Location</b><strong>{layout?.locLines
                  ? layout.locLines.map((line, index) => <span key={index} className="workshop-pass__line">{line}</span>)
                  : pass.event.location}
                </strong></span>
              </p>
            </div>
          </section>
          <section className="workshop-pass__qr">
            <div className="workshop-pass__qr-code" ref={qrRef}><QRCodeSVG value={pass.qrPayload} size={308} level="M" marginSize={2}/></div>
            <small className="workshop-pass__scan">Scan at check-in</small>
          </section>
          <section className="workshop-pass__participant">
            <p className="workshop-pass__label"><span>Participant</span></p>
            <h2>{layout?.nameLines
              ? layout.nameLines.map((line, index) => <span key={index} className="workshop-pass__line">{line}</span>)
              : pass.participantName}
            </h2>
          </section>
        </section>
        <footer className="workshop-pass__footer">
          <span className="workshop-pass__footer-mark" aria-hidden="true"><InfinityClubMark/></span>
          <span className="workshop-pass__slogan">No Limits For Infiniters</span>
        </footer>
      </article>
    </div>
    <button className="workshop-pass-download" type="button" disabled={downloading} onClick={download} aria-label="Download badge as PNG image"><Download size={18}/>{downloading ? 'Preparing badge…' : 'Download badge'}</button>
    {downloadError && <p className="workshop-pass-download-error" role="alert">{downloadError}</p>}
  </>
}
