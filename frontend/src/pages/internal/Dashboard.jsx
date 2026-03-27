import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReferrals, getCreditSummary } from '../../api/client'
import StatCard from '../../components/StatCard'
import { statusBadge, formatDate, formatCurrency } from '../../utils/format'

export default function Dashboard() {
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
      } catch (err) {
        setError('Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeReferrals = referrals.filter((r) => r.status === 'active').length
  const recentReferrals = [...referrals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of referral activity and credits.</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Total Active Referrals"
          value={loading ? null : activeReferrals}
          loading={loading}
          color="primary"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Credits Earned (All Time)"
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
          label="Credits Pending Application"
          value={summary ? formatCurrency(summary.total_pending) : null}
          sub={summary ? `${summary.pending_count} pending` : null}
          loading={loading}
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Credits Applied"
          value={summary ? formatCurrency(summary.total_applied) : null}
          loading={loading}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Recent Referrals */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Referrals</h2>
          <Link to="/internal/referrals" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="card-body space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentReferrals.length === 0 ? (
          <div className="card-body py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500">No referrals yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referred</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referring Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credits</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentReferrals.map((ref) => {
                  const badge = statusBadge(ref.status)
                  return (
                    <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-gray-900">{ref.referred_name}</p>
                        {ref.referred_email && <p className="text-xs text-gray-400">{ref.referred_email}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">{ref.referring_client?.name ?? '—'}</td>
                      <td className="px-6 py-3.5">
                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500">{formatDate(ref.referral_date)}</td>
                      <td className="px-6 py-3.5 font-medium text-gray-900">{formatCurrency(ref.total_credits_earned)}</td>
                      <td className="px-6 py-3.5 text-right">
                        <Link to={`/internal/referrals/${ref.id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
