import { Braces, PenTool } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'

export default function About() {
  return (
    <section id="a-propos" className="about-section section-space">
      <div className="page-container about-layout">
        <div className="workshop-notes">
          <div className="notebook-sheet">
            <div className="notebook-header"><span>Dans le carnet d’un Infiniter</span><Braces size={20} /></div>
            <p className="notebook-title">Une idée ne devrait<br />pas rester <span>une idée.<svg viewBox="0 0 260 20" aria-hidden="true"><path d="M3 12Q116 0 253 7M18 17Q141 9 242 13" /></svg></span></p>
            <div className="notebook-flow"><span>Imaginer</span><i /><span>Essayer</span><i /><span>Partager</span></div>
            <p className="notebook-note">Un peu de code, quelques croquis,<br />beaucoup de questions.</p>
          </div>
          <div className="workshop-sticky"><PenTool size={20} /><p>Pas besoin de tout savoir.<br /><strong>On est là pour apprendre.</strong></p></div>
          <p className="workshop-caption">Notre terrain de jeu : la tech. Notre point d’ancrage : BBA.</p>
        </div>
        <div className="about-copy">
          <SectionHeading tone="light" title="On vient pour la tech. On reste pour les gens." description="Infinity Club, c’est le club scientifique de la Faculté des Mathématiques et Informatique de l’Université Mohamed El Bachir El Ibrahimi. Un endroit où les étudiants de BBA peuvent apprendre les uns des autres et donner forme à leurs projets." />
          <div className="about-principles">
            <p><strong>Apprendre en faisant.</strong> Du développement au design, on met les mains dans le projet.</p>
            <p><strong>Avancer ensemble.</strong> Une question, un blocage, une idée : il y a quelqu’un avec qui en parler.</p>
            <p><strong>Passer du « et si » au concret.</strong> Un atelier, une équipe et un premier pas pour se lancer.</p>
          </div>
          <a href="#communaute" className="text-link light-link">Rencontrer l’esprit Infinity</a>
        </div>
      </div>
    </section>
  )
}
