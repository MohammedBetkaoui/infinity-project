import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'

const MotionLink = motion.create(Link)

export default function NavigationLink({ item, animated = false, children, ...props }) {
  const { pathname } = useLocation()
  const localAnchor = pathname === '/' && item.section
  const Component = animated ? (localAnchor ? motion.a : MotionLink) : (localAnchor ? 'a' : Link)
  const destination = localAnchor ? { href: `#${item.section}` } : { to: item.to }

  return <Component {...destination} {...props}>{children}</Component>
}
