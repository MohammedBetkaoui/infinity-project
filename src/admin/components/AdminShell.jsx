import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3, Bell, CalendarDays, ChevronsLeft, ChevronsRight, ExternalLink,
  LogOut, Menu, PanelsTopLeft, Search, Settings, UserRound, Users,
} from 'lucide-react'
import InfinityMark from '../../components/InfinityMark'
import { useAuth } from '../auth/authContext'

const COLLAPSE_KEY = 'infinity-admin-collapsed'

const NAV = [
  {
    label: 'Pilotage',
    items: [
      { to: '/admin/demandes', icon: Users, label: 'Demandes', count: 9 },
      { to: '/admin/evenements', icon: CalendarDays, label: 'Événements', count: 8 },
    ],
  },
  {
    label: 'Bientôt',
    items: [
      { to: '/admin/membres', icon: UserRound, label: 'Membres', soon: true },
      { to: '/admin/statistiques', icon: BarChart3, label: 'Statistiques', soon: true },
      { to: '/admin/reglages', icon: Settings, label: 'Réglages', soon: true },
    ],
  },
]

export default function AdminShell() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [drawer, setDrawer] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const searchRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    document.title = 'Infinity Control'
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, String(collapsed))
    } catch {
      // Storage can be unavailable; the layout still works for this session.
    }
  }, [collapsed])

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const initials = (session?.user?.user_metadata?.full_name || session?.user?.email || 'IC')
    .split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  const leave = async () => {
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="ad-root" data-collapsed={collapsed || undefined} data-drawer={drawer || undefined}>
      <div className="ad-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside className="ad-sidebar">
        <div className="ad-sidebar-head">
          <span className="ad-brand-mark" aria-hidden="true"><InfinityMark /></span>
          <span className="ad-brand-text">
            <strong>Infinity</strong>
            <span>Control</span>
          </span>
        </div>

        <nav className="ad-nav" aria-label="Navigation principale">
          {NAV.map(({ label, items }) => (
            <div key={label} className="ad-nav-section">
              <p className="ad-nav-label">{label}</p>
              {items.map(({ to, icon: Icon, label: item, count, soon }) => (
                soon ? (
                  <span key={to} className="ad-nav-link" data-soon="true" title="Bientôt disponible">
                    <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                    <span>{item}</span>
                  </span>
                ) : (
                  <NavLink key={to} to={to} className="ad-nav-link" title={item} onClick={() => setDrawer(false)}>
                    <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                    <span>{item}</span>
                    {count != null && <span className="ad-nav-count">{count}</span>}
                  </NavLink>
                )
              ))}
            </div>
          ))}
        </nav>

        <div className="ad-sidebar-foot">
          <button type="button" className="ad-collapse" onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}>
            {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
            <span>Replier</span>
          </button>
        </div>
      </aside>

      <div className="ad-main">
        <header className="ad-topbar">
          <button type="button" className="ad-burger" onClick={() => setDrawer(true)} aria-label="Ouvrir la navigation">
            <Menu size={17} />
          </button>

          <div className="ad-search">
            <Search size={15} aria-hidden="true" />
            <input ref={searchRef} type="search" placeholder="Rechercher une demande, un événement..."
              aria-label="Recherche globale" />
            <kbd>⌘K</kbd>
          </div>

          <div className="ad-topbar-spacer" />

          <a className="ad-icon-btn" href="/" target="_blank" rel="noreferrer" title="Voir le site public"
            aria-label="Ouvrir le site public dans un nouvel onglet">
            <ExternalLink size={16} />
          </a>
          <button type="button" className="ad-icon-btn" data-dot="true" aria-label="Notifications">
            <Bell size={16} />
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button type="button" className="ad-profile" onClick={() => setMenuOpen((value) => !value)}
              aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="ad-avatar" aria-hidden="true">{initials}</span>
              <span className="ad-profile-info" style={{ textAlign: 'left' }}>
                <span className="ad-profile-name">{session?.user?.user_metadata?.full_name}</span>
                <span className="ad-profile-role">{session?.user?.user_metadata?.role}</span>
              </span>
            </button>

            {menuOpen && (
              <div className="ad-menu" role="menu">
                <button type="button" className="ad-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                  <PanelsTopLeft size={14} /> Mon profil
                </button>
                <button type="button" className="ad-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                  <Settings size={14} /> Réglages
                </button>
                <div className="ad-menu-sep" />
                <button type="button" className="ad-menu-item" data-danger="true" role="menuitem" onClick={leave}>
                  <LogOut size={14} /> Se déconnecter
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="ad-scroll">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
