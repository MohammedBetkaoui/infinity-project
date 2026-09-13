import { useEffect, useRef } from 'react'
import PageHero from '../../components/PageHero'
import CommunityPortraits from './CommunityPortraits'
import CommunityLife from './CommunityLife'
import CommunityInvitation from './CommunityInvitation'
import useCommunityMotion from './useCommunityMotion'
import './community.css'

export default function CommunityPage() {
  const pageRef = useRef(null)
  useCommunityMotion(pageRef)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Community | Infinity Club'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div ref={pageRef} id="community-page" className="community-page">
      <PageHero
        className="community-page-hero"
        title="Community"
        titleId="community-page-title"
        lead="It starts with the people."
        summary="Different interests, shared afternoons, things we could not have built alone. This is the community behind Infinity Club."
        href="#meet-infiniters"
        linkLabel="Meet the Infiniters"
      />
      <CommunityPortraits />
      <CommunityLife />
      <CommunityInvitation />
    </div>
  )
}
