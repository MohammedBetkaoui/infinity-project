import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../../components/InfinityClubMark'
import AivexLogoMark from '../AivexLogoMark'
import CompetitionRegistration from './CompetitionRegistration'
import '../../../components/forms/application-form.css'
import './aivex-register.css'

export default function AivexRegisterPage() {
  useEffect(() => {
    const html = document.documentElement
    const previousPage = html.dataset.page
    const previousTitle = document.title
    const favicon = document.querySelector('link[rel="icon"]')
    const previousIcon = favicon?.getAttribute('href')
    html.dataset.page = 'aivex'
    document.title = 'Register your team | AIVEX, second edition'
    favicon?.setAttribute('href', '/assets/aivex-favicon.svg')
    return () => {
      if (previousPage) html.dataset.page = previousPage
      else delete html.dataset.page
      document.title = previousTitle
      if (favicon && previousIcon) favicon.setAttribute('href', previousIcon)
    }
  }, [])

  return (
    <div className="ax-registration-page">
      <a className="axr-skip" href="#aivex-registration-form">Skip to registration form</a>
      <header className="axr-header">
        <div className="axr-container axr-header-inner">
          <Link to="/aivex" className="axr-brand" aria-label="Back to the AIVEX event page"><AivexLogoMark /><span>Registration desk</span></Link>
          <Link to="/aivex" className="axr-back"><ArrowLeft size={14} aria-hidden="true" /> Event page</Link>
        </div>
      </header>

      <main className="axr-main">
        <CompetitionRegistration />
      </main>

      <footer className="axr-footer"><div className="axr-container"><span>AIVEX / Second edition</span><span className="axr-footer-mi"><InfinityClubMark className="axr-footer-mi-mark" />Organised by Infinity Club, BBA</span></div></footer>
    </div>
  )
}
