import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { changePassword, updateProfile } from '../../api/client'

export default function ClientSettings() {
  const { user, refreshUser } = useAuth()

  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

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
    <div className="p-4 sm:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Update your portal login details.</p>
      </div>

      <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
        Your login email can be updated here independently of your billing profile on file with Staffify.
      </div>

      {/* Profile Card */}
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
              <p className="text-sm text-gray-500">Client</p>
            </div>
          </div>

          {profileSuccess && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <p className="text-sm text-green-700">{profileSuccess}</p>
            </div>
          )}
          {profileError && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{profileError}</p>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">New Login Email <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
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
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
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
