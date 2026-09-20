import { Ban, CircleAlert, Link2Off, LifeBuoy, Lock, RefreshCw, TimerOff, TriangleAlert } from 'lucide-react'
import { INSTAGRAM_URL } from '../aivexData'

// The organisers' handle, derived from the one Instagram URL the AIVEX pages
// already share (aivexData.js) rather than typed a second time.
const INSTAGRAM_HANDLE = `@${INSTAGRAM_URL.replace(/\/+$/, '').split('/').pop()}`

// While the link is being checked: the outline of the page it is about to
// become, so nothing jumps when the real content arrives.
export function StatusSkeleton({ t }) {
  return (
    <div className="axs-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="axs-sr-only">{t.loadingTitle} {t.loadingText}</span>
      <span className="axs-skel axs-skel-kicker" />
      <span className="axs-skel axs-skel-title" />
      <span className="axs-skel axs-skel-ref" />
      <span className="axs-skel axs-skel-facts" />
      <div className="axs-skel-steps">
        {[0, 1, 2, 3].map((index) => (
          <div key={index}><span className="axs-skel axs-skel-dot" /><span className="axs-skel axs-skel-line" /></div>
        ))}
      </div>
      <span className="axs-skel axs-skel-panel" />
    </div>
  )
}

// Instagram is where the organisers say they are reachable (the AIVEX FAQ:
// "Message Infinity Club directly on Instagram"). noreferrer keeps this
// private page's URL — which carries the Magic Link — out of the request.
export function HelpLine({ t }) {
  return (
    <p className="axs-help">
      <LifeBuoy size={15} aria-hidden="true" />
      <span>
        {t.helpText}{' '}
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener"><bdi dir="ltr">{INSTAGRAM_HANDLE}</bdi></a>
      </span>
    </p>
  )
}

export function StatusFooter({ t }) {
  return (
    <footer className="axs-foot">
      <HelpLine t={t} />
      <p className="axs-private"><Lock size={15} aria-hidden="true" /><span>{t.privateNote}</span></p>
    </footer>
  )
}

const NOTICES = {
  invalid: { Icon: Link2Off, tone: 'neutral', title: 'invalidTitle', text: 'invalidText' },
  expired: { Icon: TimerOff, tone: 'warn', title: 'expiredTitle', text: 'expiredText' },
  revoked: { Icon: Ban, tone: 'warn', title: 'revokedTitle', text: 'revokedText' },
  registration_not_found: { Icon: CircleAlert, tone: 'neutral', title: 'notFoundTitle', text: 'notFoundText' },
  server_error: { Icon: TriangleAlert, tone: 'issue', title: 'serverErrorTitle', text: 'serverErrorText' },
}

// The states in which the link does not open a file. A dead end is the worst
// experience this page can give, so each one says what happened and what to
// do next: try again when it is a hiccup, reach the organisers otherwise.
export function StatusNotice({ kind, onRetry, t }) {
  const { Icon, tone, title, text } = NOTICES[kind] || NOTICES.server_error
  return (
    <section className="axs-notice" aria-labelledby="axs-notice-title">
      <span className="axs-notice-icon" data-tone={tone} aria-hidden="true"><Icon size={28} strokeWidth={1.7} /></span>
      <h1 id="axs-notice-title">{t[title]}</h1>
      <p>{t[text]}</p>
      {kind === 'server_error' && (
        <div className="axs-notice-actions">
          <button type="button" className="af-button af-button-primary" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" /> {t.retryButton}
          </button>
        </div>
      )}
      <footer className="axs-foot axs-foot-notice"><HelpLine t={t} /></footer>
    </section>
  )
}
