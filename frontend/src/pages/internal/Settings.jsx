import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { changePassword, updateProfile } from '../../api/client'
import apiClient from '../../api/client'

const TEST_EMAILS = [
  { type: 'referral_confirmation', label: 'Referral Confirmation', desc: 'Sent to a client when they submit a referral.' },
  { type: 'welcome_self_registered', label: 'Welcome (Self-Registered)', desc: 'Sent when a client creates their own account.' },
  { type: 'welcome_admin_created', label: 'Welcome (Admin-Created)', desc: 'Sent when you create an account for a client.' },
  { type: 'referral_active', label: 'Referral Active', desc: 'Sent when a referral starts generating credits.' },
  { type: 'referral_paused', label: 'Referral Paused', desc: 'Sent when a referral is paused.' },
  { type: 'referral_reinstated', label: 'Referral Reinstated', desc: 'Sent when a paused referral becomes active again.' },
  { type: 'pending_credits', label: 'Pending Credits Statement', desc: 'Bi-weekly statement of new pending credits.' },
  { type: 'applied_credits', label: 'Applied Credits Statement', desc: 'Sent when credits are applied to an invoice.' },
  { type: 'invite', label: 'User Invitation', desc: 'Sent when you invite someone to the portal.' },
]

export default function Settings() {
  const { user, refreshUser } = useAuth()

  // Hubstaff connection state
  const [hubstaffConnected, setHubstaffConnected] = useState(false)
  const [hubstaffChecking, setHubstaffChecking] = useState(true)
  const [hubstaffError, setHubstaffError] = useState('')

  // QBO connection state
  const [qboConnected, setQboConnected] = useState(false)
  const [qboChecking, setQboChecking] = useState(true)
  const [qboError, setQboError] = useState('')

  useEffect(() => {
    const hash = window.location.hash

    // Handle Hubstaff OAuth callback
    if (hash.includes('hubstaff_connected=true')) {
      setHubstaffConnected(true)
      setHubstaffChecking(false)
      window.history.replaceState(null, '', window.location.pathname + '#/internal/settings')
      apiClient.get('/qbo/status').then(r => setQboConnected(r.data.connected)).catch(() => {}).finally(() => setQboChecking(false))
      return
    }
    if (hash.includes('hubstaff_error=')) {
      const match = hash.match(/hubstaff_error=([^&]*)/)
      setHubstaffError(match ? decodeURIComponent(match[1]) : 'Unknown error')
      setHubstaffChecking(false)
      window.history.replaceState(null, '', window.location.pathname + '#/internal/settings')
      apiClient.get('/qbo/status').then(r => setQboConnected(r.data.connected)).catch(() => {}).finally(() => setQboChecking(false))
      return
    }

    // Handle QBO OAuth callback
    if (hash.includes('qbo_connected=true')) {
      setQboConnected(true)
      setQboChecking(false)
      window.history.replaceState(null, '', window.location.pathname + '#/internal/settings')
      apiClient.get('/hubstaff/status').then(r => setHubstaffConnected(r.data.connected)).catch(() => {}).finally(() => setHubstaffChecking(false))
      return
    }
    if (hash.includes('qbo_error=')) {
      const match = hash.match(/qbo_error=([^&]*)/)
      setQboError(match ? decodeURIComponent(match[1]) : 'Unknown error')
      setQboChecking(false)
      window.history.replaceState(null, '', window.location.pathname + '#/internal/settings')
      apiClient.get('/hubstaff/status').then(r => setHubstaffConnected(r.data.connected)).catch(() => {}).finally(() => setHubstaffChecking(false))
      return
    }

    // Otherwise check both connection statuses
    apiClient.get('/hubstaff/status').then(r => setHubstaffConnected(r.data.connected)).catch(() => {}).finally(() => setHubstaffChecking(false))
    apiClient.get('/qbo/status').then(r => setQboConnected(r.data.connected)).catch(() => {}).finally(() => setQboChecking(false))
  }, [])

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  // Test email state
  const [testEmailSending, setTestEmailSending] = useState(null)
  const [testEmailResults, setTestEmailResults] = useState({}) // type → 'sent' | 'error'

  const handleSendTestEmail = async (type) => {
    setTestEmailSending(type)
    setTestEmailResults((prev) => ({ ...prev, [type]: null }))
    try {
      await apiClient.post(`/auth/test-email?email_type=${type}`)
      setTestEmailResults((prev) => ({ ...prev, [type]: 'sent' }))
    } catch {
      setTestEmailResults((prev) => ({ ...prev, [type]: 'error' }))
    } finally {
      setTestEmailSending(null)
    }
  }

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
      {(user?.role === 'admin' || user?.role === 'owner') && (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="text-base font-semibold text-gray-900">Integrations</h2>
          </div>
          <div className="card-body space-y-4">
            {hubstaffError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-700">Hubstaff connection failed</p>
                <p className="text-xs text-red-600 mt-1 font-mono break-all">{hubstaffError}</p>
              </div>
            )}
            {qboError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-700">QuickBooks connection failed</p>
                <p className="text-xs text-red-600 mt-1 font-mono break-all">{qboError}</p>
              </div>
            )}

            {/* Hubstaff row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Hubstaff</p>
                <p className="text-xs text-gray-500 mt-0.5">Connect to pull invoices and VA data</p>
              </div>
              {hubstaffChecking ? (
                <span className="text-xs text-gray-400">Checking…</span>
              ) : hubstaffConnected ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Connected
                  </span>
                  <a href={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '')}/hubstaff/connect`} className="text-xs text-gray-400 hover:text-gray-600 underline">
                    Reconnect
                  </a>
                </div>
              ) : (
                <a href={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '')}/hubstaff/connect`} className="btn-primary text-xs">
                  Connect Hubstaff
                </a>
              )}
            </div>

            <div className="border-t border-gray-100" />

            {/* QuickBooks row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">QuickBooks Online</p>
                <p className="text-xs text-gray-500 mt-0.5">Connect to apply referral credits to invoices</p>
              </div>
              {qboChecking ? (
                <span className="text-xs text-gray-400">Checking…</span>
              ) : qboConnected ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Connected
                  </span>
                  <a href={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '')}/api/qbo/auth`} className="text-xs text-gray-400 hover:text-gray-600 underline">
                    Reconnect
                  </a>
                </div>
              ) : (
                <a href={`${import.meta.env.VITE_API_BASE_URL?.replace('/api', '')}/api/qbo/auth`} className="btn-primary text-xs">
                  Connect QuickBooks
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Emails Card */}
      {(user?.role === 'admin' || user?.role === 'owner') && (
        <div className="card mb-6">
          <div className="card-header">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Test Emails</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sends a test copy to <strong>{user?.email}</strong> with a [TEST] prefix in the subject.</p>
            </div>
          </div>
          <div className="card-body">
            <div className="space-y-2">
              {TEST_EMAILS.map((item) => {
                const result = testEmailResults[item.type]
                const sending = testEmailSending === item.type
                return (
                  <div key={item.type} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {result === 'sent' && (
                        <span className="text-xs text-green-600 font-medium">Sent ✓</span>
                      )}
                      {result === 'error' && (
                        <span className="text-xs text-red-500 font-medium">Failed</span>
                      )}
                      <button
                        onClick={() => handleSendTestEmail(item.type)}
                        disabled={!!testEmailSending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        {sending ? (
                          <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Sending…
                          </>
                        ) : 'Send Test'}
                      </button>
                    </div>
                  </div>
                )
              })}
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
