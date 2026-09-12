import { ChartNoAxesCombined, Check, FileText, ScanEye } from 'lucide-react'
import { projectDirections } from './aivexData'

function DocumentStudy() {
  return (
    <div className="ax-document-study" aria-hidden="true">
      <div className="ax-source-sheet"><FileText size={22} strokeWidth={1.3} /><span>Une source</span><i /><i /><i className="ax-source-highlight" /><i /><i /></div>
      <svg className="ax-document-wire" viewBox="0 0 180 150" preserveAspectRatio="none" fill="none">
        <path className="ax-brief-wire-guide" d="M0 110H36Q48 110 48 98V43Q48 31 60 31H112Q124 31 124 43V76Q124 88 136 88H180" />
        <path className="ax-brief-wire" pathLength="1" d="M0 110H36Q48 110 48 98V43Q48 31 60 31H112Q124 31 124 43V76Q124 88 136 88H180" />
      </svg>
      <span className="ax-document-node"><Check size={16} strokeWidth={1.5} /></span>
      <div className="ax-answer-sheet"><span>Une réponse</span><strong>Lisible.<br />Vérifiable.</strong><p>Revenir au passage source</p><i /></div>
      <p className="ax-study-caption">Le résultat compte. Son origine aussi.</p>
    </div>
  )
}

export default function AivexChallenge() {
  const [featured, ...others] = projectDirections
  return (
    <section className="ax-challenge" id="defi" aria-labelledby="ax-challenge-title" tabIndex={-1}>
      <div className="ax-container">
        <div className="ax-challenge-heading">
          <h2 id="ax-challenge-title">Un vrai besoin.<br />Un projet qui y répond.</h2>
          <div><p>Le point de départ n’est pas forcément un modèle spectaculaire. C’est parfois une tâche que l’on aimerait rendre plus simple, plus claire ou plus accessible.</p><a href="#preparation" className="ax-text-link">Préparer mon idée</a></div>
        </div>
        <div className="ax-project-board">
          <article className="ax-project-feature">
            <div className="ax-project-feature-copy"><p className="ax-project-angle">{featured.angle}</p><h3>{featured.title}</h3><p>{featured.description}</p><blockquote>{featured.question}</blockquote></div>
            <DocumentStudy />
          </article>
          <div className="ax-project-notes">
            {others.map((item, index) => {
              const Icon = index === 0 ? ScanEye : ChartNoAxesCombined
              return <article className="ax-project-note" key={item.id}>
                <div className="ax-project-note-top"><Icon size={24} strokeWidth={1.3} aria-hidden="true" /><p>{item.angle}</p></div>
                <h3>{item.title}</h3><p>{item.description}</p><blockquote>{item.question}</blockquote>
              </article>
            })}
          </div>
        </div>
        <p className="ax-editorial-note"><strong>Des pistes, pas des sujets imposés.</strong> Ces exemples sont proposés pour nourrir ta réflexion. Les thèmes et contraintes officiels seront définis dans le règlement d’AIVEX.</p>
      </div>
    </section>
  )
}
