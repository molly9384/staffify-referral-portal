import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AcceptInvite from './pages/AcceptInvite'
import ProtectedRoute from './components/ProtectedRoute'
import AssemblyEntry from './pages/AssemblyEntry'
import AssemblyWelcome from './pages/AssemblyWelcome'
import AssemblySignup from './pages/AssemblySignup'

// Internal pages
import InternalLayout from './components/InternalLayout'
import Dashboard from './pages/internal/Dashboard'
import Referrals from './pages/internal/Referrals'
import ReferralDetail from './pages/internal/ReferralDetail'
import Clients from './pages/internal/Clients'
import Credits from './pages/internal/Credits'
import Settings from './pages/internal/Settings'
import PortalUsers from './pages/internal/PortalUsers'
import AdminReports from './pages/internal/Reports'

// Client portal pages
import ClientLayout from './components/ClientLayout'
import ClientDashboard from './pages/client/ClientDashboard'
import MyReferrals from './pages/client/MyReferrals'
import NewReferral from './pages/client/NewReferral'
import MyCredits from './pages/client/MyCredits'
import ClientSettings from './pages/client/ClientSettings'
import Policy from './pages/client/Policy'
import ClientReports from './pages/client/Reports'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'client') return <Navigate to="/client/dashboard" replace />
  return <Navigate to="/internal/dashboard" replace />
}

function RootOrAssembly() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('token')) return <AssemblyEntry />
  return <RootRedirect />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootOrAssembly />} />
      <Route path="/assembly/welcome" element={<AssemblyWelcome />} />
      <Route path="/assembly/signup" element={<AssemblySignup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />

      {/* Internal routes (admin + staff) */}
      <Route
        path="/internal"
        element={
          <ProtectedRoute allowedRoles={['admin', 'staff', 'owner']}>
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
        <Route path="portal-users" element={<PortalUsers />} />
        <Route path="reports" element={<AdminReports />} />
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
        <Route path="settings" element={<ClientSettings />} />
        <Route path="policy" element={<Policy />} />
        <Route path="reports" element={<ClientReports />} />
      </Route>

      {/* Legacy /portal/* aliases → redirect to /client/* */}
      <Route path="/portal/*" element={<Navigate to="/client/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
