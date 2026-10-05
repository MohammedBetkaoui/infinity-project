const captions = [
  'A question becomes a brief: make workshop registration easier on a phone.',
  'A first version makes the registration steps visible and ready to test.',
  'Share the working page, the build notes and what to improve next.',
]

export default function AboutProcessScene({ stage }) {
  return (
    <figure className="about-process-scene" data-stage={stage}>
      <div className="about-method-example-label"><span>Illustrative example</span><span>Workshop sign-up</span></div>
      <div className="about-method-artifact" aria-hidden="true">
        <div className="about-method-paper-back" />
        {stage === 0 && (
          <div className="about-method-paper about-method-brief">
            <div className="about-method-paper-top"><span>01 / Working brief</span><span>Infinity</span></div>
            <span className="about-method-handnote">Start here.</span>
            <h4>A place<br />in the workshop.</h4>
            <div className="about-method-brief-question"><span>The question</span><p>How can students sign up in a few clear steps?</p></div>
            <div className="about-method-brief-bottom"><span>Clear information</span><span>Easy on a phone</span></div>
          </div>
        )}
        {stage === 1 && (
          <div className="about-method-paper about-method-prototype">
            <div className="about-method-paper-top"><span>02 / First version</span><span>v.01</span></div>
            <div className="about-method-wireframe">
              <span className="about-method-wireframe-kicker">Infinity / Workshops</span>
              <h4>Save your place.</h4>
              <div className="about-method-wireframe-field"><span>Your name</span><i /></div>
              <div className="about-method-wireframe-field"><span>Email address</span><i /></div>
              <div className="about-method-wireframe-submit">Join the workshop<span>↗</span></div>
            </div>
            <p className="about-method-test-note"><span>Test note</span>Is the next step clear?</p>
          </div>
        )}
        {stage === 2 && (
          <div className="about-method-paper about-method-handover">
            <div className="about-method-paper-top"><span>03 / Project handover</span><span>Infinity</span></div>
            <span className="about-method-handover-label">Made to be shared</span>
            <h4>Over to<br />the next person.</h4>
            <div className="about-method-deliverables">
              <div><span>01</span><strong>The working page</strong><i>↗</i></div>
              <div><span>02</span><strong>Build & setup notes</strong><i>↗</i></div>
              <div><span>03</span><strong>What comes next</strong><i>↗</i></div>
            </div>
            <span className="about-method-handover-signoff">Demonstrate. Document. Pass it on.</span>
          </div>
        )}
      </div>
      <figcaption>{captions[stage]}</figcaption>
    </figure>
  )
}
