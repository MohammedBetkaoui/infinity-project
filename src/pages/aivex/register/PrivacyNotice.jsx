import ApplicationConsent from '../../../components/forms/ApplicationConsent'

export default function PrivacyNotice({ consent, error, onConsent }) {
  return (
    <section className="axr-privacy" aria-labelledby="axr-privacy-title">
      <h3 id="axr-privacy-title">Privacy / Registration data</h3>
      <div className="axr-privacy-body">
        <p>Personal details and student card photos are collected only to:</p>
        <ul>
          <li>verify the identity of each participant;</li>
          <li>confirm their student status;</li>
          <li>confirm the team’s registration;</li>
          <li>handle AIVEX communications and organisation.</li>
        </ul>
        <ApplicationConsent formId="axr" name="consent" checked={consent} error={error} onChange={(_, value) => onConsent(value)}>
          I confirm these details are accurate and agree to their use for the purposes above. Participation is confirmed by the organising committee under the official AIVEX rules.
        </ApplicationConsent>
      </div>
    </section>
  )
}
