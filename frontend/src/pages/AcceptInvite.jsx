import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getInvite, acceptInvite } from '../api/client'

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!token) {
      setLoadError('No invite token found. Please use the link from your invitation email.')
      setLoading(false)
      return
    }
    getInvite(token)
      .then((data) => {
        setInvite(data)
        if (data.full_name) setFullName(data.full_name)
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail || 'This invite is invalid or has expired.'
        setLoadError(msg)
      })
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      await acceptInvite({ token, full_name: fullName, password })
      navigate('/login?invited=1')
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || 'Failed to create account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Staffify" className="h-8 mx-auto mb-4" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />)}
            </div>
          ) : loadError ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900">Invalid Invite</h2>
              <p className="text-sm text-gray-500">{loadError}</p>
              <button onClick={() => navigate('/login')} className="btn-primary w-full justify-center mt-2">
                Go to Login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-gray-900">Accept your invitation</h1>
                <p className="text-sm text-gray-500 mt-1">
                  You've been invited to join as a <strong className="capitalize">{invite?.role}</strong>.
                  Set your name and password to get started.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    className="input bg-gray-50 cursor-not-allowed"
                    value={invite?.email || ''}
                    disabled
                    readOnly
                  />
                </div>
                <div>
                  <label className="label">Full Name</label>
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    required
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    className="input"
                    required
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {submitError && (
                  <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {submitError}
                  </div>
                )}

                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center mt-2">
                  {submitting ? 'Creating account…' : 'Create Account & Sign In'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
