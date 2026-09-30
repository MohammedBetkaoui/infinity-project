import FmiLogo from '../../components/FmiLogo'

const principles = [
  ['Learn by making', 'A workshop becomes useful when everyone leaves with something tested, not only something heard.'],
  ['Ask without pretending', 'Beginners and experienced members can work at the same table when questions are treated with respect.'],
  ['Share the next step', 'Knowledge moves through the club when one member helps another continue the work.'],
]

export default function AboutStory() {
  return (
    <section id="about-story" className="about-story" aria-labelledby="about-story-title">
      <div className="page-container">
        <p className="about-section-index" data-animated-text=""><span>01 / Manifesto</span><span>Who we are</span></p>
        <div className="about-story-layout">
          <aside className="about-story-margin">
            <figure className="about-story-portrait">
              <img src="/infinity/IMG_0199.JPG" width="720" height="480" loading="lazy" alt="Infinity Club members together in a university classroom." />
              <figcaption data-animated-text=""><span>Infinity Club community</span><span>BBA · Algeria</span></figcaption>
            </figure>
            <div className="about-story-faculty">
              <span className="about-story-brand" aria-hidden="true"><FmiLogo /></span>
              <p>Rooted in our faculty.<br />Open to what comes next.</p>
            </div>
          </aside>
          <div className="about-story-copy">
            <p className="about-story-overline" data-animated-text="">A place to begin, practise and contribute</p>
          <h2 id="about-story-title">The point is not to know everything before you begin.</h2>
          <div className="about-story-prose">
            <p>Infinity Club is the scientific and technology club of the Faculty of Mathematics and Computer Science at Mohamed El Bachir El Ibrahimi University in Bordj Bou Arreridj.</p>
            <p>We create room for students to meet around a real question, learn a tool together and keep going long enough for an idea to take shape.</p>
          </div>
          <div className="about-principle-ledger">
            {principles.map(([title, text], index) => (
              <article key={title}>
                <span className="about-principle-number" aria-hidden="true">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="about-story-signals" data-animated-text="" aria-label="Infinity Club qualities">
            <span>Student-led</span><span>Cross-disciplinary</span><span>Open to every level</span>
          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
