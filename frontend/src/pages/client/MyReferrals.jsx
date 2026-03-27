import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReferrals } from '../../api/client'
import { statusBadge, formatDate, formatCurrency } from '../../utils/format'

export default function MyReferrals() {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getReferrals()
        setReferrals(data)
      } catch {
        setError('Failed to load referrals.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Referrals</h1>
          <p className="text-gray-500 text-sm mt-1">Track the status of everyone you've referred to Staffify.</p>
        </div>
        <Link to="/client/referrals/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Refer Someone New
        </Link>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-48 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : referrals.length === 0 ? (
        <div className="card py-20 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-base font-semibold text-gray-700 mb-1">No referrals yet</h3>
          <p className="text-sm text-gray-500 mb-6">Know someone who could benefit from a Staffify virtual assistant? Refer them and earn $1/hour credit!</p>
          <Link to="/client/referrals/new" className="btn-primary inline-flex">Make Your First Referral</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {referrals.map((ref) => {
            const badge = statusBadge(ref.status)
            const eligibleVA = ref.virtual_assistants?.find((v) => v.is_eligible && v.is_active)
            const daysSinceActivation = ref.activation_date
              ? Math.floor((Date.now() - new Date(ref.activation_date)) / 86400000)
              : null

            return (
              <div key={ref.id} className="card p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-gray-900">{ref.referred_name}</h3>
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </div>
                    {ref.referred_email && <p className="text-sm text-gray-500">{ref.referred_email}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-primary-600">{formatCurrency(ref.total_credits_earned)}</p>
                    <p className="text-xs text-gray-400">total earned</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Referral Date</p>
                    <p className="font-medium text-gray-700">{formatDate(ref.referral_date)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">VA Assigned</p>
                    <p className="font-medium text-gray-700">{eligibleVA ? eligibleVA.hubstaff_user_name : '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Credits Applied</p>
                    <p className="font-medium text-gray-700">{formatCurrency(ref.total_credits_applied)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Days in Window</p>
                    <p className="font-medium text-gray-700">
                      {daysSinceActivation !== null ? `${Math.min(daysSinceActivation, 365)} / 365` : '—'}
                    </p>
                  </div>
                </div>

                {/* Simple progress bar for 12-month window */}
                {ref.activation_date && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>12-month earning window</span>
                      <span>{Math.min(daysSinceActivation, 365)} days used</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${Math.min((daysSinceActivation / 365) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
