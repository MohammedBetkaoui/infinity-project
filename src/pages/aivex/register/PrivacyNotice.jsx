import ApplicationConsent from '../../../components/forms/ApplicationConsent'

export default function PrivacyNotice({ consent, error, onConsent, t }) {
  return (
    <section className="axr-privacy" aria-labelledby="axr-privacy-title">
      <h3 id="axr-privacy-title">{t.privacyTitle}</h3>
      <div className="axr-privacy-body">
        <p>{t.privacyIntro}</p>
        <ul>
          <li>{t.privacyLi1}</li>
          <li>{t.privacyLi2}</li>
          <li>{t.privacyLi3}</li>
          <li>{t.privacyLi4}</li>
        </ul>
        <ApplicationConsent formId="axr" name="consent" checked={consent} error={error} onChange={(_, value) => onConsent(value)}>
          {t.consentText}
        </ApplicationConsent>
      </div>
    </section>
  )
}
