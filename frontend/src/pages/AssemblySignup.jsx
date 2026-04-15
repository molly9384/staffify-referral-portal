/**
 * AssemblySignup.jsx
 *
 * Password-set form for new Assembly users.
 * Email is pre-filled and locked (confirmed from Assembly).
 * On success, auto-login and redirect to the client dashboard.
 */

import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export default function AssemblySignup() {
  const location = useLocation()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const { email, clientName } = location.state || {}

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Guard: must arrive here with email state from AssemblyWelcome
  useEffect(() => {
    if (!email) {
      navigate('/assembly', { replace: true })
    }
  }, [email, navigate])

  if (!email) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { data } = await axios.post(`${API_BASE}/auth/assembly-signup`, {
        email,
        full_name: fullName.trim(),
        password,
      })

      loginWithToken({
        access_token: data.access_token,
        token_type: data.token_type,
        role: data.role,
        user_id: data.user_id,
        full_name: data.full_name,
        client_id: data.client_id,
      })

      navigate('/client/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Create Your Account</h1>
          {clientName && (
            <p className="text-sm text-gray-500">{clientName}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email — locked */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Confirmed via Assembly — can't be changed here.</p>
          </div>

          {/* Full name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-sm mt-2"
            style={{ backgroundColor: '#1abde1' }}
          >
            {loading ? 'Creating your account…' : 'Create Account & Sign In →'}
          </button>
        </form>

      </div>
    </div>
  )
}
