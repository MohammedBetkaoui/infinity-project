import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLogin from './auth/AdminLogin'
import AuthGuard from './auth/AuthGuard'
import AuthProvider from './auth/AuthProvider'
import AdminShell from './components/AdminShell'
import ToastProvider from './components/ToastProvider'
import EventsPage from './pages/EventsPage'
import JoinRequestsPage from './pages/JoinRequestsPage'
import './admin.css'

// Mounted from App.jsx at /admin/* and deliberately kept outside
// AnimationProvider: the public site's Lenis smooth scroll and custom
// cursor would fight with scrollable panels and dense tables here.
export default function AdminApp() {
  return (
    <AuthProvider>
      <ToastProvider>
        {/* Absolute paths: this tree is mounted directly from App.jsx, not
            through a parent <Route>, so relative paths would resolve
            against "/" and send /admin/login into the guarded splat. */}
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<AuthGuard><AdminShell /></AuthGuard>}>
            <Route path="/admin" element={<Navigate to="/admin/demandes" replace />} />
            <Route path="/admin/demandes" element={<JoinRequestsPage />} />
            <Route path="/admin/evenements" element={<EventsPage />} />
            <Route path="/admin/*" element={<Navigate to="/admin/demandes" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
