import { ShieldCheck } from 'lucide-react'
import InfinityClubMark from '../../../components/InfinityClubMark.jsx'

export default function ScannerHeader({ eventTitle, location, organizerName }) {
  return (
    <header className="scanner-header">
      <div className="scanner-header__event">
        <div className="scanner-brand">
          <InfinityClubMark className="scanner-brand__mark" />
          <span>Infinity Club · Check-in</span>
        </div>
        <h1>{eventTitle}</h1>
        <p>{location}</p>
      </div>
      <div className="scanner-identity">
        <ShieldCheck aria-hidden="true" />
        <span>
          <small>Authorized scanner</small>
          <b>{organizerName}</b>
        </span>
      </div>
    </header>
  )
}
