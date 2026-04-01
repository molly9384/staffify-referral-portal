import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { changePassword, updateProfile } from '../../api/client'
import apiClient from '../../api/client'

export default function Settings() {
  const { user, refreshUser } = useAuth()

  // Hubstaff connection state
  const [hubstaffConnected, setHubstaffConnected] = useState(false)
  const [hubstaffChecking, setHubstaffChecking] = useState(true)

  useEffect(() => {
    // Check for redirect params from OAuth callback first
    const hash = window.location.hash
    if (hash.includes('hubstaff_connected=true')) {
      setHubstaffConnected(true)
      setHubstaffChecking(false)
      window.history.replaceState(null, '', window.location.pathname + '#/internal/settings')
      return
    }

    // Otherwise check current connection status from backend
    apiClient.get('/api/hubstaff/status').then(r => {
      setHubstaffConnected(r.data.connected)
    }).catch(() => {}).finally(() => setHubstaffChecking(false))
  }, [])

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  // Password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileLoading(true)
    try {
      const updates = { full_name: fullName }
      if (email) updates.email = email
      await updateProfile(updates)
      await refreshUser()
      setProfileSuccess('Profile updated successfully!')
      setEmail('')
    } catch (err) {
      setProfileError(err?.response?.data?.detail || 'Failed to update profile.')
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return }
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return }
    setPasswordLoading(true)
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword })
      setPasswordSuccess('Password updated successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err?.response?.data?.detail || 'Failed to update password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account preferences.</p>
      </div>

      {/* Profile Info Card */}
      <div className="card mb-6">
        <div className="card-header">
          <h2 className="text-base font-semibold text-gray-900">Profile</h2>
        </div>
        <div className="card-body">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-primary-700 text-lg font-semibold">
                {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{user?.full_name}</p>
              <p className="text-sm text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>

          {profileSuccess && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <p className="text-sm text-green-700">{profileSuccess}</p>
            </div>
          )}
          {profileError && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{profileError}</p>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">New Email Address <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder={user?.email || 'you@example.com'} />
            </div>
            <div className="pt-1">
              <button type="submit" disabled={profileLoading} className="btn-primary">
                {profileLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Integrations Card */}
      {user?.role === 'admin' && (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="text-base font-semibold text-gray-900">Integrations</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Hubstaff</p>
                <p className="text-xs text-gray-500 mt-0.5">Connect to pull invoices and VA data</p>
              </div>
              {hubstaffChecking ? (
                <span className="text-xs text-gray-400">Checking…</span>
              ) : hubstaffConnected ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Connected
                </span>
              ) : (
                <a
                  href={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '')}/hubstaff/connect`}
                  className="btn-primary text-xs"
                >
                  Connect Hubstaff
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change Password Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
        </div>
        <div className="card-body">
          {passwordSuccess && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <p className="text-sm text-green-700">{passwordSuccess}</p>
            </div>
          )}
          {passwordError && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{passwordError}</p>
            </div>
          )}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" placeholder="••••••••" />
            </div>
            <div>
              <label className="label">New Password</label>
              <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Min. 8 characters" />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" placeholder="••••••••" />
            </div>
            <div className="pt-1">
              <button type="submit" disabled={passwordLoading} className="btn-primary">
                {passwordLoading ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
