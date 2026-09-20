import { useEffect, useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { toneFor } from './statusModel'

const FEEDBACK_MS = 2500

// Who this file belongs to, and where it stands, at a glance: the team name
// is the title (it is what the candidate recognises), the status is a badge,
// and the reference is a copyable chip.
//
// The reference is an identifier, never a credential — copying it is
// harmless, and it opens nothing on its own (only the Magic Link does).
export default function DossierHeader({ data, t }) {
  const [copy, setCopy] = useState('') // '' | 'copied' | 'failed'
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copyReference = async () => {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(data.reference)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
    timer.current = window.setTimeout(() => setCopy(''), FEEDBACK_MS)
  }

  return (
    <header className="axs-head">
      <div className="axs-head-top">
        <span className="axs-kicker">{t.validKicker}</span>
        <span className="axs-badge" data-tone={toneFor(data.documentStatus)}>
          {t.documentStatus[data.documentStatus] || data.documentStatus}
        </span>
      </div>

      <h1 id="axs-title">{data.teamName}</h1>

      <div className="axs-ref">
        <span className="axs-ref-label">{t.fieldReference}</span>
        <code dir="ltr">{data.reference}</code>
        <button type="button" className="axs-ref-copy" onClick={copyReference} aria-label={t.copyReference} data-state={copy || undefined}>
          {copy === 'copied' && <Check size={15} strokeWidth={2.4} aria-hidden="true" />}
          {copy === 'failed' && <X size={15} strokeWidth={2.4} aria-hidden="true" />}
          {!copy && <Copy size={15} aria-hidden="true" />}
        </button>
        {/* Announced, not shown: the icon change is the visual feedback, and
            a text label appearing here would make the chip jump. */}
        <span className="axs-sr-only" role="status" aria-live="polite">
          {copy === 'copied' && t.referenceCopied}
          {copy === 'failed' && t.referenceCopyFailed}
        </span>
      </div>

      <dl className="axs-facts">
        <div className="axs-fact axs-fact-wide"><dt>{t.fieldInstitution}</dt><dd>{data.institutionName}</dd></div>
        <div className="axs-fact"><dt>{t.fieldWilaya}</dt><dd>{data.wilayaName}</dd></div>
        <div className="axs-fact"><dt>{t.fieldStudents}</dt><dd>{t.studentsValue({ count: data.studentCount })}</dd></div>
        <div className="axs-fact"><dt>{t.fieldRegistrationStatus}</dt><dd>{t.registrationStatus[data.registrationStatus] || data.registrationStatus}</dd></div>
      </dl>
    </header>
  )
}
