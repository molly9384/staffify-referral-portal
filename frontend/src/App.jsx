import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ProtectedRoute from './components/ProtectedRoute'

// Internal pages
import InternalLayout from './components/InternalLayout'
import Dashboard from './pages/internal/Dashboard'
import Referrals from './pages/internal/Referrals'
import ReferralDetail from './pages/internal/ReferralDetail'
import Clients from './pages/internal/Clients'
import Credits from './pages/internal/Credits'
import Settings from './pages/internal/Settings'

// Client portal pages
import ClientLayout from './components/ClientLayout'
import ClientDashboard from './pages/client/ClientDashboard'
import MyReferrals from './pages/client/MyReferrals'
import NewReferral from './pages/client/NewReferral'
import MyCredits from './pages/portal/MyCredits'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'client') return <Navigate to="/client/dashboard" replace />
  return <Navigate to="/internal/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Internal routes (admin + staff) */}
      <Route
        path="/internal"
        element={
          <ProtectedRoute allowedRoles={['admin', 'staff']}>
            <InternalLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="referrals" element={<Referrals />} />
        <Route path="referrals/:id" element={<ReferralDetail />} />
        <Route path="clients" element={<Clients />} />
        <Route path="credits" element={<Credits />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Client portal routes */}
      <Route
        path="/client"
        element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ClientDashboard />} />
        <Route path="referrals" element={<MyReferrals />} />
        <Route path="referrals/new" element={<NewReferral />} />
        <Route path="credits" element={<MyCredits />} />
      </Route>

      {/* Legacy /portal/* aliases → redirect to /client/* */}
      <Route path="/portal/*" element={<Navigate to="/client/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
