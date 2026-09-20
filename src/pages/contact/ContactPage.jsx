import { useRef } from 'react'
import ContactHero from './ContactHero'
import ContactDirectory from './ContactDirectory'
import ContactClosing from './ContactClosing'
import useContactMotion from './useContactMotion'
import './contact.css'

export default function ContactPage() {
  const pageRef = useRef(null)
  useContactMotion(pageRef)

  return (
    <div id="contact-page" ref={pageRef} className="contact-page">
      <ContactHero />
      <ContactDirectory />
      <ContactClosing />
    </div>
  )
}
