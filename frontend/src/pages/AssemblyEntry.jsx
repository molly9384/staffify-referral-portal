/**
 * AssemblyEntry — handles the token handshake when the referral portal
 * is loaded inside the Assembly iFrame.
 *
 * Assembly appends ?token=... to the URL automatically. This component:
 *   1. Reads the token from the URL query string
 *   2. Sends it to the backend to decrypt + look up the client by email
 *   3a. Existing client → auto-login → /client/dashboard
 *   3b. New client → /assembly/welcome (signup flow)
 *   4. No token → redirect to /login
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assemblyExchangeToken } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function AssemblyEntry() {
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    assemblyExchangeToken(token)
      .then((data) => {
        if (data.status === 'authenticated') {
          loginWithToken(data)
          navigate('/client/dashboard', { replace: true })
        } else {
          navigate('/assembly/welcome', {
            replace: true,
            state: { email: data.email, name: data.name, assemblyToken: token },
          })
        }
      })
      .catch((err) => {
        console.error('Assembly token exchange failed:', err)
        setError('Something went wrong loading your portal. Please contact Staffify.')
      })
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          <p className="text-red-500 font-medium mb-2">Unable to load portal</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <p className="text-sm text-gray-500">Loading your portal…</p>
      </div>
    </div>
  )
}
