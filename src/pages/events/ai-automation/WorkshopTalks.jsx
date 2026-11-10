import ChromeText from './ChromeText'
import PhotoCard from './PhotoCard'
import { aiAutomationEvent, aiAutomationPhotos as photos } from './aiAutomationMedia'

const talks = aiAutomationEvent.days[0]

export default function WorkshopTalks() {
  return (
    <section id="ai-talks" className="ai-talks ai-section" aria-labelledby="ai-talks-title">
      <div className="ai-shell">
        <div className="ai-section-rail ai-mono"><span>03 / {talks.label} — {talks.title}</span><span>Infinity Club / In the room</span></div>
        <header className="ai-talks-heading">
          <h2 id="ai-talks-title" data-ai-heading>Inside the<br /><em>talks.</em></h2>
          <p>{talks.summary}<br /><span>Real people. Real conversations. Real learning.</span></p>
        </header>

        <div className="ai-talks-pair">
          <div className="ai-talks-main">
            <PhotoCard photo={photos['vector-search']} index="01" data-ai-flip sizes="(max-width: 767px) 88vw, 46vw" />
            <div className="ai-note"><span className="ai-mono">On the screen</span><h3>A question.<br />A path to an answer.</h3><p>Vector search, a document library, connected steps. On the projection, the ideas take a visible shape.</p></div>
          </div>
          <div className="ai-talks-offset">
            <div className="ai-note"><span className="ai-mono">Across the room</span><h3>Room to explain.<br />Space to listen.</h3><p>A gesture, an example, a different way to describe an idea. The photographs hold those small exchanges.</p></div>
            <PhotoCard photo={photos.explaining} index="02" data-ai-flip sizes="(max-width: 767px) 80vw, 36vw" />
          </div>
        </div>

        <div className="ai-interlude">
          <p className="ai-mono">The most important connection</p>
          <p className="ai-interlude-title" aria-label="is still human.">
            <span aria-hidden="true">is still </span><ChromeText text="human." className="ai-interlude-chrome" />
          </p>
          <span aria-hidden="true" className="ai-interlude-line" />
        </div>

        <ol className="ai-talks-hand" aria-label="People of the talks">
          {['listening', 'in-the-room', 'sharing'].map((id, index) => (
            <li key={id} style={{ '--fan': index - 1 }}><PhotoCard photo={photos[id]} index={`0${index + 3}`} data-ai-flip sizes="(max-width: 767px) 80vw, 30vw" /></li>
          ))}
        </ol>
        <p className="ai-talks-note">Between the diagrams and the explanations: attention, conversation, and the people who make a workshop.</p>
      </div>
    </section>
  )
}
