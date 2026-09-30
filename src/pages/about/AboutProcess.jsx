import AboutProcessScene from './AboutProcessScene'

const stages = [
  { title: 'Question', text: 'Start with what you want to understand, improve or make possible.', note: 'A conversation, a sketch, a problem worth solving.' },
  { title: 'Prototype', text: 'Work beside other students, test an approach and learn from what doesn’t work.', note: 'A first version gives everyone something to work with.' },
  { title: 'Shared project', text: 'Document the result, pass the knowledge on and give the idea a useful next life.', note: 'A demonstration, a workshop or a starting point for someone else.' },
]

export default function AboutProcess() {
  return (
    <section className="about-process" aria-labelledby="about-process-title">
      <div className="page-container">
        <p className="about-section-index about-section-index-dark" data-animated-text=""><span>02 / Method</span><span>From curiosity to contribution</span></p>
        <header className="about-process-header">
          <div>
            <p className="about-process-overline" data-animated-text="">How we work</p>
            <h2 id="about-process-title">An idea grows<br />when it circulates.</h2>
          </div>
          <p>Our role is to make the next useful step easier to take together. Here is how a question can become something the whole club learns from.</p>
        </header>
        <div className="about-process-track">
          <AboutProcessScene />
          <ol className="about-process-stages">
            {stages.map((stage, index) => (
              <li key={stage.title}>
                <span className="about-stage-number" aria-hidden="true">0{index + 1}</span>
                <div>
                  <span className="about-stage-label">Stage {index + 1}</span>
                  <h3>{stage.title}</h3>
                  <p>{stage.text}</p>
                  <p className="about-stage-note">{stage.note}</p>
                </div>
                <span className="about-stage-progress" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
