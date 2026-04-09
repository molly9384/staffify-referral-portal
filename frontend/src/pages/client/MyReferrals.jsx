import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReferrals } from '../../api/client'
import { formatDate, formatCurrency } from '../../utils/format'

// Client-facing status map — hides internal pipeline stages
const CLIENT_STATUS = {
  referred:        { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  contacted:       { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  call_scheduled:  { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  contract_signed: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  va_hired:        { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  va_billing:      { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  active:          { label: 'Active',      className: 'bg-green-100 text-green-700' },
  paused:          { label: 'Paused',      className: 'bg-amber-100 text-amber-700' },
  expired:         { label: 'Expired',     className: 'bg-red-100 text-red-700' },
  ceased:          { label: 'Expired',     className: 'bg-red-100 text-red-700' },
}

function clientStatusBadge(status) {
  return CLIENT_STATUS[status] || { label: 'In Progress', className: 'bg-blue-100 text-blue-700' }
}

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
            const badge = clientStatusBadge(ref.status)
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
                    <p className="text-xs text-gray-400">Referred {formatDate(ref.referral_date)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-primary-600">{formatCurrency(ref.total_credits_earned)}</p>
                    <p className="text-xs text-gray-400">total earned</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Credits Earned</p>
                    <p className="font-medium text-gray-700">{formatCurrency(ref.total_credits_earned)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Credits Paid Out</p>
                    <p className="font-medium text-gray-700">{formatCurrency(ref.total_credits_applied)}</p>
                  </div>
                </div>

                {/* 12-month earning window — only shown once referral is active */}
                {ref.activation_date && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>12-month earning window</span>
                      <span>{Math.min(daysSinceActivation, 365)} / 365 days</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${daysSinceActivation >= 365 ? 'bg-red-400' : 'bg-primary-500'}`}
                        style={{ width: `${Math.min((daysSinceActivation / 365) * 100, 100)}%` }}
                      />
                    </div>
                    {daysSinceActivation >= 365 && (
                      <p className="text-xs text-red-500 mt-1">Earning window closed</p>
                    )}
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
