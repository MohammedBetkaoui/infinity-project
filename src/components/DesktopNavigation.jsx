import { navigation } from '../data/siteData'
import NavigationLink from './NavigationLink'

export default function DesktopNavigation({ activeHref }) {
  return (
    <ul className="nav-links">
      {navigation.map((item) => (
        <li key={item.href}>
          <NavigationLink item={item} className="nav-link"
            aria-current={activeHref === item.href ? (item.section ? 'location' : 'page') : undefined}>
            {item.label}
          </NavigationLink>
        </li>
      ))}
    </ul>
  )
}
