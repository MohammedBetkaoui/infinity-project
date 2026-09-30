import { useRef } from 'react'
import TeamCarousel from './TeamCarousel'
import CommunityHero from './CommunityHero'
import CommunityLife from './CommunityLife'
import CommunityInvitation from './CommunityInvitation'
import useCommunityScrollMotion from './useCommunityScrollMotion'
import './community.css'

export default function CommunityPage() {
  const pageRef = useRef(null)
  useCommunityScrollMotion(pageRef)

  return (
    <div id="community-page" ref={pageRef} className="community-page">
      <CommunityHero />
      <TeamCarousel />
      <CommunityLife />
      <CommunityInvitation />
    </div>
  )
}
