/**
 * AssemblyWelcome.jsx
 *
 * Welcome screen shown to first-time Assembly users.
 * Explains the $1/hr referral credit program and prompts them to set a password
 * to activate their Staffify Referral Portal account.
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export default function AssemblyWelcome() {
  const location = useLocation()
  const navigate = useNavigate()
  const { email, clientName } = location.state || {}

  // If someone lands here directly without state, send them back to entry
  useEffect(() => {
    if (!email) {
      navigate('/assembly', { replace: true })
    }
  }, [email, navigate])

  if (!email) return null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-lg w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to the Staffify Referral Portal!
          </h1>
          {clientName && (
            <p className="text-sm text-gray-500">
              We're setting up your account for <span className="font-medium text-gray-700">{clientName}</span>.
            </p>
          )}
        </div>

        {/* How it works */}
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-teal-700 uppercase tracking-wide mb-3">
            How It Works
          </h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">👥</span>
              <span className="text-sm text-gray-700">
                <strong>Refer a friend or colleague</strong> to Staffify — anyone who could benefit from a virtual assistant.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">💵</span>
              <span className="text-sm text-gray-700">
                Once they become an active client, you earn{' '}
                <strong className="text-teal-600">$1.00 per hour</strong> worked by their VA — applied directly to your invoice.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">📊</span>
              <span className="text-sm text-gray-700">
                <strong>Track everything</strong> — referral status, credits earned, and credit history — all in one place.
              </span>
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={() =>
              navigate('/assembly/signup', {
                state: { email, clientName },
              })
            }
            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-sm"
          >
            Set Up My Account →
          </button>
          <p className="text-xs text-gray-400 mt-3">
            Your email (<span className="text-gray-500">{email}</span>) is already confirmed from Assembly.
            You just need to create a password.
          </p>
        </div>

      </div>
    </div>
  )
}
