import { useRef } from 'react'
import SectionHeading from '../components/SectionHeading'
import WorkshopNotebook from '../components/WorkshopNotebook'
import useAboutMotion from '../hooks/useAboutMotion'

export default function About() {
  const sectionRef = useRef(null)
  useAboutMotion(sectionRef)

  return (
    <section id="a-propos" ref={sectionRef} className="about-section section-space">
      <div className="page-container about-layout">
        <WorkshopNotebook />
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
