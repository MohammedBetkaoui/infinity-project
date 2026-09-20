import InfinityClubMark from './InfinityClubMark'
import NavigationLink from './NavigationLink'

const home = { href: '#accueil', section: 'accueil', to: '/' }

export default function NavbarBrand({ onClick }) {
  return (
    <NavigationLink item={home} className="nav-brand" aria-label="Infinity Club - Home" onClick={onClick}>
      <span className="nav-brand-symbol" aria-hidden="true"><InfinityClubMark /></span>
      <span className="nav-brand-copy">
        <strong>INFINITY</strong>
        <span>MI Faculty · BBA</span>
      </span>
    </NavigationLink>
  )
}
