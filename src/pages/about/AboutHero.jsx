import AboutEmblem from './AboutEmblem'

export default function AboutHero() {
  return (
    <section className="about-page-hero" aria-labelledby="about-page-title">
      <div className="page-container">
        <div className="about-hero-rail">
          <span>About Infinity Club</span>
          <span>Faculty MI, Bordj Bou Arreridj</span>
        </div>
        <div className="about-hero-layout">
          <div className="about-hero-copy">
            <p className="about-hero-intro">A student club should feel like an open door.</p>
            <h1 id="about-page-title" aria-label="Built around the courage to try.">
              <span><span className="about-title-line">Built around</span></span>
              <span><span className="about-title-line">the courage</span></span>
              <span><span className="about-title-line">to try.</span></span>
            </h1>
            <p className="about-hero-summary">Infinity brings students together to explore technology, practise in public and turn early ideas into shared projects.</p>
            <a href="#about-story" className="about-inline-link">Step inside the club</a>
          </div>
          <AboutEmblem />
        </div>
        <dl className="about-hero-facts">
          <div><dt>Our place</dt><dd>Mohamed El Bachir El Ibrahimi University</dd></div>
          <div><dt>Our faculty</dt><dd>Mathematics and Computer Science</dd></div>
          <div><dt>Our promise</dt><dd>No Limits For Infiniters</dd></div>
        </dl>
      </div>
    </section>
  )
}
