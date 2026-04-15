/**
 * AssemblyEntry.jsx
 *
 * Landing page loaded when the referral portal is opened inside Assembly as a Custom App.
 * Assembly passes an encrypted ?token= in the URL. This page:
 *   1. Sends the token to the backend to decrypt + look up the client
 *   2. If existing user  → auto-login and redirect to dashboard
 *   3. If new user       → redirect to AssemblyWelcome with their email
 *   4. On error          → show a friendly message
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export default function AssemblyEntry() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setError('No token provided. Please open this page from within Assembly.')
      return
    }

    async function handleToken() {
      try {
        const { data } = await axios.post(
          `${API_BASE}/auth/assembly-token`,
          null,
          { params: { token } }
        )

        if (data.status === 'existing_user') {
          // Auto-login and go straight to dashboard
          loginWithToken({
            access_token: data.access_token,
            token_type: data.token_type,
            role: data.role,
            user_id: data.user_id,
            full_name: data.full_name,
            client_id: data.client_id,
          })
          navigate('/client/dashboard', { replace: true })
        } else if (data.status === 'new_user') {
          // New user — go to welcome/signup flow
          navigate('/assembly/welcome', {
            replace: true,
            state: { email: data.email, clientName: data.client_name },
          })
        } else {
          setError('Unexpected response from server. Please try again.')
        }
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || 'Something went wrong.'
        setError(msg)
      }
    }

    handleToken()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Unable to sign you in</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <p className="text-xs text-gray-400">
            Need help? Contact{' '}
            <a href="mailto:hello@gostaffify.com" className="text-teal-500 hover:underline">
              hello@gostaffify.com
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">Signing you in…</p>
      </div>
    </div>
  )
}
