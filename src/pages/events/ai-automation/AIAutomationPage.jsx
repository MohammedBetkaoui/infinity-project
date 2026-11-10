import { useRef } from 'react'
import AIAutomationHero from './AIAutomationHero'
import AIAutomationStory from './AIAutomationStory'
import WorkshopMoments from './WorkshopMoments'
import WorkshopJourney from './WorkshopJourney'
import WorkshopGallery from './WorkshopGallery'
import AIAutomationClosing from './AIAutomationClosing'
import useAIAutomationMotion from './useAIAutomationMotion'
import './ai-automation.css'

export default function AIAutomationPage() {
  const pageRef = useRef(null)
  useAIAutomationMotion(pageRef)
  return <article ref={pageRef} id="ai-automation-page" className="ai-experience">
    <AIAutomationHero />
    <AIAutomationStory />
    <WorkshopMoments />
    <WorkshopJourney />
    <WorkshopGallery />
    <AIAutomationClosing />
  </article>
}
