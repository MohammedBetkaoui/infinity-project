import { MapPin, ShieldCheck } from 'lucide-react'
import InfinityClubMark from '../../../components/InfinityClubMark.jsx'

export default function ScannerHeader({ eventTitle, location, checkInOpen, online }) {
  const statusLabel = !online ? 'Offline' : checkInOpen ? 'Ready for check-in' : 'Waiting for workshop'

  return (
    <header className="scanner-header">
      <div className="scanner-header__brand">
        <a className="scanner-brand" href="/" aria-label="Infinity Club home">
          <InfinityClubMark className="scanner-brand__mark" />
          <span>Infinity Club</span>
        </a>
        <span className="scanner-header__tool"><ShieldCheck aria-hidden="true" />Workshop scanner</span>
      </div>
      <div className="scanner-header__event">
        <span className={`scanner-live-state ${checkInOpen && online ? 'is-ready' : ''} ${!online ? 'is-offline' : ''}`}>
          <i aria-hidden="true" />{statusLabel}
        </span>
        <h1>{eventTitle}</h1>
        <p><MapPin aria-hidden="true" />{location || 'Location to be confirmed'}</p>
      </div>
    </header>
  )
}
