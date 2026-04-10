import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getReferrals, getCreditSummary } from '../../api/client'
import StatCard from '../../components/StatCard'
import { formatDate, formatCurrency } from '../../utils/format'

// Client-facing status map
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

export default function ClientDashboard() {
  const { user } = useAuth()
  const [referrals, setReferrals] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [refs, sum] = await Promise.all([getReferrals(), getCreditSummary()])
        setReferrals(refs)
        setSummary(sum)
      } catch {
        setError('Failed to load your dashboard.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const recentReferrals = [...referrals]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  return (
    <div className="p-4 sm:p-8">
      {/* Welcome */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.full_name?.split(' ')[0]}!</h1>
        <p className="text-gray-500 text-sm mt-1">Here's an overview of your referral activity.</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard
          label="My Referrals"
          value={loading ? null : referrals.length}
          loading={loading}
          color="primary"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Credits Earned"
          value={summary ? formatCurrency(summary.total_earned) : null}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Credits Applied"
          value={summary ? formatCurrency(summary.total_applied) : null}
          loading={loading}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Credits Pending"
          value={summary ? formatCurrency(Number(summary.total_pending) + Number(summary.total_eligible ?? 0)) : null}
          loading={loading}
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Credit explanation */}
      <div className="mb-8 rounded-xl bg-primary-50 border border-primary-100 p-5">
        <h3 className="text-sm font-semibold text-primary-800 mb-1">How Referral Credits Work</h3>
        <p className="text-sm text-primary-700">
          You earn <strong>$1.00 per hour</strong> worked by your referred client's virtual assistant.
          Credits are calculated bi-weekly and applied as a discount to your next invoice.
          Your earning window is <strong>12 months</strong> from the date your referred client's first invoice is paid.
        </p>
      </div>

      {/* Recent Referrals */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Referrals</h2>
          <div className="flex items-center gap-3">
            <Link to="/client/referrals" className="text-sm text-primary-600 hover:text-primary-700 font-medium">View all</Link>
            <Link to="/client/referrals/new" className="btn-primary text-xs px-3 py-1.5">
              + Refer Someone
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="card-body space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentReferrals.length === 0 ? (
          <div className="card-body py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500">You haven't made any referrals yet.</p>
            <Link to="/client/referrals/new" className="btn-primary mt-4 inline-flex">Refer Someone Now</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentReferrals.map((ref) => {
              const badge = clientStatusBadge(ref.status)
              return (
                <div key={ref.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-900">{ref.referred_name}</p>
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-gray-400">Referred {formatDate(ref.referral_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(ref.total_credits_earned)}</p>
                    <p className="text-xs text-gray-400">earned</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
