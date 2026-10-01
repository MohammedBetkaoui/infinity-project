import PageHero from '../../components/PageHero'
import { poles } from '../../data/siteData'
import { communityPortraits } from './communityData'

const communityFacts = [
  { value: String(communityPortraits.length).padStart(2, '0'), label: 'Team portraits' },
  { value: String(poles.length).padStart(2, '0'), label: 'Fields connected' },
  { value: '01', label: 'Shared community' },
]

export default function CommunityHero() {
  return (
    <PageHero
      className="community-page-hero page-hero-editorial page-hero-editorial-wide"
      title="Community"
      titleId="community-page-title"
      shaderVariant="community"
      eyebrow="The people make the place"
      railLabel="Infinity Club / Community"
      railMeta="Different talents · One direction"
      lead="It starts with the people."
      summary="Different interests, shared afternoons and things we could not have built alone. This is the community behind Infinity Club."
      href="#meet-infiniters"
      linkLabel="Meet the Infiniters"
      facts={communityFacts}
      signature="Learn · Contribute · Belong"
    />
  )
}
