import { useRef } from 'react'
import AIAutomationHero from './AIAutomationHero'
import EventDeal from './EventDeal'
import AIAutomationStory from './AIAutomationStory'
import WorkshopTalks from './WorkshopTalks'
import WorkshopLab from './WorkshopLab'
import WorkshopJourney from './WorkshopJourney'
import WorkshopGallery from './WorkshopGallery'
import AIAutomationClosing from './AIAutomationClosing'
import useAIAutomationMotion from './useAIAutomationMotion'
import './ai-automation.css'

// The page follows the workshop film: a tunnel of cards, the Infinity card,
// the deal, two days of photographs, and the final burst of light.
export default function AIAutomationPage() {
  const pageRef = useRef(null)
  useAIAutomationMotion(pageRef)
  return (
    <article ref={pageRef} id="ai-automation-page" className="ai-experience">
      <AIAutomationHero />
      <EventDeal />
      <AIAutomationStory />
      <WorkshopTalks />
      <WorkshopLab />
      <WorkshopJourney />
      <WorkshopGallery />
      <AIAutomationClosing />
    </article>
  )
}
