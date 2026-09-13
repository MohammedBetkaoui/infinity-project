import { useEffect } from 'react'
import PageHero from '../../components/PageHero'
import TeamCarousel from './TeamCarousel'
import CommunityLife from './CommunityLife'
import CommunityInvitation from './CommunityInvitation'
import './community.css'

export default function CommunityPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Community | Infinity Club'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div id="community-page" className="community-page">
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
