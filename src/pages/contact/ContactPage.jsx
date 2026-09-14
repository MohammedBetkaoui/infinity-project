import { useEffect, useRef } from 'react'
import ContactHero from './ContactHero'
import ContactDirectory from './ContactDirectory'
import ContactClosing from './ContactClosing'
import useContactMotion from './useContactMotion'
import './contact.css'

export default function ContactPage() {
  const pageRef = useRef(null)
  useContactMotion(pageRef)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Contact | Infinity Club'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div id="contact-page" ref={pageRef} className="contact-page">
      <ContactHero />
      <ContactDirectory />
      <ContactClosing />
    </div>
  )
}
