/**
 * AssemblyWelcome — landing page shown to Assembly clients who don't yet
 * have a Staffify referral portal account.
 *
 * Explains the referral program and invites them to create an account.
 * Receives { email, name, assemblyToken } via React Router state.
 */

import { Navigate, useLocation, useNavigate } from 'react-router-dom'

export default function AssemblyWelcome() {
  const { state } = useLocation()
  const navigate = useNavigate()

  if (!state?.email) {
    return <Navigate to="/login" replace />
  }

  const firstName = state.name?.split(' ')[0] || 'there'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
            <span className="text-3xl">👋</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hey {firstName}, welcome to Staffify Referrals!
          </h1>
          <p className="text-gray-500 mt-2 text-sm leading-relaxed">
            Know someone who could benefit from a virtual assistant? Refer them to Staffify
            and earn credits toward your own invoices — automatically.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">How it works</h2>

          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">💰</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">Earn $1.00 per billable hour</p>
              <p className="text-gray-500 text-xs mt-0.5">
                You earn $1 for every hour billed by the first VA hired by your referral. Hours add up fast.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">📅</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">12-month credit window</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Credits accumulate for 12 months from when your referral's VA starts. The clock pauses
                if a VA is replaced — you never lose time unfairly.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🧾</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">Applied to your next invoice</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Once your referral's invoice is paid, your credit is automatically applied
                to your next Staffify invoice. No chasing, no paperwork.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center space-y-3">
          <p className="text-sm text-gray-600">
            Set up your account in under a minute. Your email{' '}
            <span className="font-medium text-gray-900">({state.email})</span> is already
            confirmed — just choose a password.
          </p>
          <button
            onClick={() => navigate('/assembly/signup', { state })}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            Get Started →
          </button>
        </div>

      </div>
    </div>
  )
}
