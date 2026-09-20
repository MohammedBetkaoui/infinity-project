import { useRef } from 'react'
import PageHero from '../../components/PageHero'
import TeamCarousel from './TeamCarousel'
import CommunityLife from './CommunityLife'
import CommunityInvitation from './CommunityInvitation'
import useCommunityScrollMotion from './useCommunityScrollMotion'
import './community.css'

export default function CommunityPage() {
  const pageRef = useRef(null)
  useCommunityScrollMotion(pageRef)

  return (
    <div id="community-page" ref={pageRef} className="community-page">
      <PageHero
        className="community-page-hero"
        title="Community"
        titleId="community-page-title"
        lead="It starts with the people."
        summary="Different interests, shared afternoons, things we could not have built alone. This is the community behind Infinity Club."
        href="#meet-infiniters"
        linkLabel="Meet the Infiniters"
      />
      <TeamCarousel />
      <CommunityLife />
      <CommunityInvitation />
    </div>
  )
}
