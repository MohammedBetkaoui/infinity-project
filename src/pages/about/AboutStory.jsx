import FmiLogo from '../../components/FmiLogo'

const principles = [
  ['Learn by making', 'A workshop becomes useful when everyone leaves with something tested, not only something heard.'],
  ['Ask without pretending', 'Beginners and experienced members can work at the same table when questions are treated with respect.'],
  ['Share the next step', 'Knowledge moves through the club when one member helps another continue the work.'],
]

export default function AboutStory() {
  return (
    <section id="about-story" className="about-story" aria-labelledby="about-story-title">
      <div className="page-container about-story-layout">
        <aside className="about-story-margin">
          <span className="about-story-brand" aria-hidden="true"><FmiLogo /></span>
          <p>Rooted in our faculty.<br />Open to what comes next.</p>
          <span className="about-story-rule" aria-hidden="true" />
          <p className="about-story-location">Bordj Bou Arreridj<br />Algeria</p>
        </aside>
        <div className="about-story-copy">
          <h2 id="about-story-title">The point is not to know everything before you begin.</h2>
          <div className="about-story-prose">
            <p>Infinity Club is the scientific and technology club of the Faculty of Mathematics and Computer Science at Mohamed El Bachir El Ibrahimi University in Bordj Bou Arreridj.</p>
            <p>We create room for students to meet around a real question, learn a tool together and keep going long enough for an idea to take shape.</p>
          </div>
          <div className="about-principle-ledger">
            {principles.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </div>
      </div>
    </section>
  )
}
