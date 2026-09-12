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
          <SectionHeading tone="light" title="Come for the tech. Stay for the people." description="Infinity Club is the scientific club of the Faculty of Mathematics and Computer Science at Mohamed El Bachir El Ibrahimi University. A place for BBA students to learn from each other and bring their projects to life." />
          <div className="about-principles">
            <p><strong>Learn by doing.</strong> From development to design, we get hands-on with the work.</p>
            <p><strong>Work through it together.</strong> A question, a roadblock, an idea: there is someone to talk it through with.</p>
            <p><strong>Turn “what if” into something real.</strong> A workshop, a team and a first step to get started.</p>
          </div>
          <a href="#communaute" className="text-link light-link">Meet the Infinity community</a>
        </div>
      </div>
    </section>
  )
}
