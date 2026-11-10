import { aiAutomationPhotos } from './aiAutomationMedia'
import WorkshopPhoto from './WorkshopPhoto'

function MomentPhoto({ id, number }) {
  const photo = aiAutomationPhotos[id]
  return <figure className="ai-moment-photo"><div className="ai-photo-mask"><div className="ai-photo-lens"><WorkshopPhoto photo={photo} /></div><span className="ai-photo-curtain" aria-hidden="true" /></div><figcaption><span className="ai-mono">{number} / {photo.category}</span><span>{photo.caption}</span></figcaption></figure>
}

export default function WorkshopMoments() {
  return <section id="ai-moments" className="ai-moments ai-section" aria-labelledby="ai-moments-title">
    <div className="ai-shell">
      <div className="ai-section-rail ai-mono"><span>02 / The human side</span><span>Infinity Club / In the room</span></div>
      <header className="ai-moments-heading"><h2 id="ai-moments-title" data-ai-heading>Inside the<br /><em>workshop.</em></h2><p>Real people. Real conversations.<br />Real learning.</p></header>
      <div className="ai-moment-pair">
        <div className="ai-moment-main"><MomentPhoto id="vector-search" number="01" /><div className="ai-moment-note"><span className="ai-mono">On the screen</span><h3>A question.<br />A path to an answer.</h3><p>Vector search, a document library, connected steps. On the projection, the ideas take a visible shape.</p></div></div>
        <div className="ai-moment-offset"><div className="ai-moment-note"><span className="ai-mono">Across the room</span><h3>Room to explain.<br />Space to listen.</h3><p>A gesture, an example, a different way to describe an idea. The photographs hold those small exchanges.</p></div><MomentPhoto id="explaining" number="02" /></div>
      </div>
      <div className="ai-moment-interlude"><p className="ai-mono">The most important connection</p><p className="ai-interlude-title" data-ai-heading>is still <em>human.</em></p><span aria-hidden="true" className="ai-interlude-line" /></div>
      <div className="ai-people-pair"><MomentPhoto id="listening" number="03" /><div><MomentPhoto id="sharing" number="04" /><p className="ai-people-note">Between the diagrams and the explanations: attention, conversation, and the people who make a workshop.</p></div></div>
    </div>
  </section>
}
