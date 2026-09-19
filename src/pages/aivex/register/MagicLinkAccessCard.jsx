import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Lock, ShieldCheck } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

// Post-registration access card: the candidate's way back into their AIVEX
// file later, from any device (api/aivex/magic-link/verify.js answers it).
//
// The Magic Link is a bearer credential, so it is used here exactly as the
// registration API returned it and nowhere else: never rebuilt from parts,
// never parsed, never written to localStorage / sessionStorage / a cookie,
// never logged, and never sent anywhere. The QR code is rendered from it in
// the browser by qrcode.react (no network, no remote QR service), so the
// link never leaves this page — the candidate's phone reads it off screen.
//
// Nothing here re-fetches or re-derives the link: it lives in this tab's
// memory for as long as the success screen is open, and that is all.

const FEEDBACK_MS = 4000
const QR_SIZE = 188
// The QR specification's quiet zone. qrcode.react defaults marginSize to 0,
// which scans badly against a page background — 4 modules is the standard.
const QR_QUIET_ZONE_MODULES = 4

export default function MagicLinkAccessCard({ magicLink, t }) {
  const [copyState, setCopyState] = useState('') // '' | 'copied' | 'failed'
  const feedbackTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), [])

  const copy = async () => {
    window.clearTimeout(feedbackTimer.current)
    try {
      // Clipboard API only — the value copied is the untouched link.
      await navigator.clipboard.writeText(magicLink)
      setCopyState('copied')
    } catch {
      // No Clipboard API (insecure context), or the user denied it. The
      // reason is never surfaced: the button and the QR code both still work.
      setCopyState('failed')
    }
    feedbackTimer.current = window.setTimeout(() => setCopyState(''), FEEDBACK_MS)
  }

  return (
    <section className="axr-access" aria-labelledby="axr-access-title">
      <div className="axr-access-head">
        <h3 id="axr-access-title"><Lock size={15} aria-hidden="true" />{t.accessTitle}</h3>
        <p>{t.accessLead}</p>
      </div>

      <p className="axr-access-cta">
        <a className="af-button af-button-primary" href={magicLink}>
          <ShieldCheck size={15} aria-hidden="true" /> {t.accessOpen}
        </a>
      </p>

      <figure className="axr-access-qr">
        <span className="axr-access-qr-frame">
          <QRCodeSVG
            value={magicLink}
            size={QR_SIZE}
            level="M"
            marginSize={QR_QUIET_ZONE_MODULES}
            bgColor="#ffffff"
            fgColor="#111111"
            role="img"
            aria-label={t.accessQrAlt}
          />
        </span>
        <figcaption>{t.accessQrHint}</figcaption>
      </figure>

      <div className="axr-access-copy">
        <button type="button" className="af-button af-button-secondary" onClick={copy}>
          {copyState === 'copied'
            ? <Check size={14} aria-hidden="true" />
            : <Copy size={14} aria-hidden="true" />}
          {t.accessCopy}
        </button>
        {/* Always present, so a screen reader announces the result in place
            rather than having a live region appear from nowhere. */}
        <p className="axr-access-feedback" data-state={copyState || undefined} role="status" aria-live="polite">
          {copyState === 'copied' && t.accessCopied}
          {copyState === 'failed' && t.accessCopyFailed}
        </p>
      </div>

      <p className="axr-access-warning">{t.accessWarning}</p>
    </section>
  )
}
