import { useRef, useSyncExternalStore } from 'react'
import { preload } from 'react-dom'
import AIAutomationHero from './AIAutomationHero'
import EventDeal from './EventDeal'
import AIAutomationStory from './AIAutomationStory'
import WorkshopTalks from './WorkshopTalks'
import WorkshopLab from './WorkshopLab'
import WorkshopJourney from './WorkshopJourney'
import WorkshopGallery from './WorkshopGallery'
import AIAutomationClosing from './AIAutomationClosing'
import useAIAutomationMotion from './useAIAutomationMotion'
import { perfTier, subscribeTier } from './perfTier'
import './ai-automation.css'

// The back of the deck serves the hero card, the canvas sprites and every
// card back: fetch it once, early and at high priority.
const DECK_BACK = '/assets/workshops/infinity-deck-card.webp'

// The page follows the workshop film: a tunnel of cards, the Infinity card,
// the deal, two days of photographs, and the final burst of light.
export default function AIAutomationPage() {
  preload(DECK_BACK, { as: 'image', fetchPriority: 'high' })
  const pageRef = useRef(null)
  // 'high' | 'mid' | 'low': the CSS reads it as data-perf, the motion as a function.
  const tier = useSyncExternalStore(subscribeTier, perfTier, () => 'high')
  useAIAutomationMotion(pageRef, tier)
  return (
    <article ref={pageRef} id="ai-automation-page" className="ai-experience" data-perf={tier}>
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
