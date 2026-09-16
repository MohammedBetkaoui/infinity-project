import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'

export default function AuthGuard({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="ad-login" role="status" aria-live="polite">
        <span className="ad-sk" style={{ width: 132, height: 13 }} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  return children
}
