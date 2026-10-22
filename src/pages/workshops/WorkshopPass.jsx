import { useRef, useState } from 'react'
import { CalendarDays, Download, MapPin } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import InfinityClubMark from '../../components/InfinityClubMark.jsx'
import { downloadWorkshopBadgePng, eventSchedule } from './workshopBadge.js'

export default function WorkshopPass({ pass }) {
  const qrRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    setDownloadError('')
    try { await downloadWorkshopBadgePng(pass, qrRef.current?.querySelector('svg')) }
    catch { setDownloadError('The badge could not be downloaded. Please try again.') }
    finally { setDownloading(false) }
  }
  return <>
    <article className="workshop-pass" aria-label="Infinity Club digital workshop pass">
      <div className="workshop-pass__artwork" aria-hidden="true">
        <span className="workshop-pass__ribbon workshop-pass__ribbon--one"/>
        <span className="workshop-pass__ribbon workshop-pass__ribbon--two"/>
        <InfinityClubMark className="workshop-pass__watermark"/>
      </div>
      <header className="workshop-pass__header">
        <InfinityClubMark className="workshop-pass__emblem"/>
        <b className="workshop-pass__club">Infinity Club</b>
        <small className="workshop-pass__type">Official Workshop Pass</small>
        <span className="workshop-pass__university">Mohamed El Bachir El Ibrahimi University</span>
      </header>
      <section className="workshop-pass__panel">
        <section className="workshop-pass__event">
          <p className="workshop-pass__kicker">Workshop</p>
          <h1>{pass.event.title}</h1>
          <p className="workshop-pass__fact"><CalendarDays size={15}/><span>{eventSchedule(pass.event.startsAt)}</span></p>
          <p className="workshop-pass__fact"><MapPin size={15}/><span>{pass.event.location}</span></p>
        </section>
        <section className="workshop-pass__qr">
          <div className="workshop-pass__qr-code" ref={qrRef}><QRCodeSVG value={pass.qrPayload} size={264} level="M" marginSize={2}/></div>
          <small className="workshop-pass__scan">Scan at check-in</small>
        </section>
        <section className="workshop-pass__participant">
          <h2>{pass.participantName}</h2>
          <p className="workshop-pass__role">Participant</p>
        </section>
      </section>
      <footer className="workshop-pass__footer">
        <span aria-hidden="true"><InfinityClubMark className="workshop-pass__footer-mark"/></span>
        <span className="workshop-pass__slogan">No Limits For Infiniters</span>
      </footer>
    </article>
    <button className="workshop-pass-download" type="button" disabled={downloading} onClick={download} aria-label="Download badge as PNG image"><Download size={18}/>{downloading ? 'Preparing badge…' : 'Download badge'}</button>
    {downloadError && <p className="workshop-pass-download-error" role="alert">{downloadError}</p>}
  </>
}
