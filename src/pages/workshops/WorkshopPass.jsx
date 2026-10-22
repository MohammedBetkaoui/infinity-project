import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Download, MapPin } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import InfinityClubMark from '../../components/InfinityClubMark.jsx'
import { downloadWorkshopBadgePng, eventSchedule } from './workshopBadge.js'
import { WORKSHOP_BADGE } from './workshopBadgeTheme.js'
import { planWorkshopPass } from './workshopPassLayout.js'

const BADGE = WORKSHOP_BADGE
const cqw = (design) => `${(design / 10.54).toFixed(3)}cqw`

// The web badge consumes the exact same layout plan as the downloaded PNG:
// one planner, one set of numbers, so line breaks, font sizes and the QR
// card are identical on both surfaces.
function usePassLayout(pass) {
  const [plan, setPlan] = useState(null)
  const eventTitle = pass.event?.title
  const eventLocation = pass.event?.location
  const participantName = pass.participantName
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return undefined
    const measure = (text, weight, size, spacing = 0) => {
      context.font = `${weight} ${size}px Inter, Arial, sans-serif`
      context.letterSpacing = `${spacing}px`
      const width = context.measureText(text).width
      context.letterSpacing = '0px'
      return width
    }
    let cancelled = false
    const compute = () => {
      if (cancelled) return
      setPlan(planWorkshopPass(measure, { title: eventTitle, name: participantName, location: eventLocation }))
    }
    compute()
    document.fonts?.ready?.then(compute)
    return () => { cancelled = true }
  }, [eventTitle, eventLocation, participantName])
  return plan
}

export default function WorkshopPass({ pass }) {
  const qrRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const plan = usePassLayout(pass)
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    setDownloadError('')
    try { await downloadWorkshopBadgePng(pass, qrRef.current?.querySelector('svg')) }
    catch { setDownloadError('The badge could not be downloaded. Please try again.') }
    finally { setDownloading(false) }
  }
  const panelVars = plan ? {
    '--pass-title-size': cqw(plan.title.size), '--pass-title-line': cqw(plan.title.line),
    '--pass-name-size': cqw(plan.name.size), '--pass-name-line': cqw(plan.name.line),
    '--pass-loc-size': cqw(plan.meta.locationSize), '--pass-loc-line': cqw(plan.meta.locationLine),
    '--pass-meta-gap': cqw(plan.meta.labelBaseline - plan.title.lastBaseline),
    '--pass-qr-gap': cqw(plan.qr.topGap),
    '--pass-card-h': cqw(plan.qr.cardHeight), '--pass-qr-code': cqw(plan.qr.code),
  } : undefined
  return <>
    <div className="workshop-pass-frame">
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
            <h1>{plan?.title.lines.length
              ? plan.title.lines.map((line, index) => <span key={index} className="workshop-pass__line">{line}</span>)
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
                <span className="workshop-pass__fact-text"><b>Location</b><strong>{plan?.meta.locLines.length
                  ? plan.meta.locLines.map((line, index) => <span key={index} className="workshop-pass__line">{line}</span>)
                  : pass.event.location}
                </strong></span>
              </p>
            </div>
          </section>
          <section className="workshop-pass__qr">
            <div className="workshop-pass__qr-code" ref={qrRef}><QRCodeSVG value={pass.qrPayload} size={420} level="M" marginSize={2}/></div>
            <small className="workshop-pass__scan">Scan at check-in</small>
          </section>
          <section className="workshop-pass__participant">
            <p className="workshop-pass__label"><span>Participant</span></p>
            <h2>{plan?.name.lines.length
              ? plan.name.lines.map((line, index) => <span key={index} className="workshop-pass__line">{line}</span>)
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
