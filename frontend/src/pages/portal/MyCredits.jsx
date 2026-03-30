import { useEffect, useState } from 'react'
import { getCredits, getCreditSummary } from '../../api/client'
import { formatDate, formatCurrency } from '../../utils/format'

export default function MyCredits() {
  const [credits, setCredits] = useState([])
  const [summary, setSummary] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState('')

  const STATUS_TABS = [
    { key: 'all', label: 'All Credits' },
    { key: 'pending', label: 'Pending' },
    { key: 'applied', label: 'Applied' },
  ]

  const load = async () => {
    setLoading(true)
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {}
      const data = await getCredits(params)
      setCredits(data)
    } catch {
      setError('Failed to load your credits.')
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    setSummaryLoading(true)
    try {
      const data = await getCreditSummary()
      setSummary(data)
    } catch {
      // Non-fatal
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => { load() }, [activeTab])
  useEffect(() => { loadSummary() }, [])

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Credits</h1>
        <p className="text-gray-500 text-sm mt-1">Track your referral credits — earned, applied to your invoices, and pending.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5">
              <div className="h-4 bg-gray-100 rounded animate-pulse w-24 mb-3" />
              <div className="h-7 bg-gray-100 rounded animate-pulse w-20" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5">
            <p className="text-sm text-gray-500 font-medium">Total Earned</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">{formatCurrency(summary.total_earned)}</p>
            <p className="text-xs text-gray-400 mt-0.5">across all referrals</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500 font-medium">Pending Application</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">{formatCurrency(summary.total_pending)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {summary.pending_count} credit{summary.pending_count !== 1 ? 's' : ''} awaiting your next invoice
            </p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500 font-medium">Total Applied</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(summary.total_applied)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {summary.applied_count} credit{summary.applied_count !== 1 ? 's' : ''} applied to invoices
            </p>
          </div>
        </div>
      ) : null}

      {/* How credits work */}
      <div className="rounded-xl bg-primary-50 border border-primary-100 p-5">
        <h3 className="text-sm font-semibold text-primary-800 mb-1">How credits are applied</h3>
        <p className="text-sm text-primary-700">
          Credits are calculated every two weeks based on hours worked by your referred client's virtual assistant.
          Pending credits are automatically applied as a line item discount on your next Staffify invoice — they
          cannot exceed your invoice total. Credits expire after your 12-month earning window closes.
        </p>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Credits Table / Cards */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : credits.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">No credits yet</p>
            <p className="text-xs text-gray-400 mt-1">
              {activeTab !== 'all'
                ? 'No credits with this status.'
                : 'Credits will appear here once your referred client\'s VA starts billing.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referral</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credit</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Applied Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {credits.map((credit) => {
                  const statusConfig = {
                    pending: { className: 'bg-amber-100 text-amber-700', label: 'Pending' },
                    applied: { className: 'bg-green-100 text-green-700', label: 'Applied' },
                    voided:  { className: 'bg-red-100 text-red-700',    label: 'Voided' },
                  }[credit.status] || { className: 'bg-gray-100 text-gray-700', label: credit.status }

                  return (
                    <tr key={credit.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-gray-900">
                        {credit.referral?.referred_name ?? '—'}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600 text-xs">
                        {formatDate(credit.period_start)}
                        <br />
                        {formatDate(credit.period_end)}
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-gray-700">
                        {Number(credit.hours_worked).toFixed(2)} hrs
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums text-gray-900">
                        {formatCurrency(credit.credit_amount)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`badge ${statusConfig.className}`}>{statusConfig.label}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-400 text-xs">
                        {credit.applied_date ? formatDate(credit.applied_date) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Breakdown by referral (summary) */}
      {!loading && credits.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-base font-semibold text-gray-900">Breakdown by Referral</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {(() => {
              // Group credits by referral
              const byReferral = credits.reduce((acc, c) => {
                const key = c.referral?.referred_name ?? 'Unknown'
                if (!acc[key]) acc[key] = { name: key, total: 0, pending: 0, applied: 0, count: 0 }
                acc[key].total += Number(c.credit_amount)
                acc[key].count += 1
                if (c.status === 'pending') acc[key].pending += Number(c.credit_amount)
                if (c.status === 'applied') acc[key].applied += Number(c.credit_amount)
                return acc
              }, {})

              return Object.values(byReferral).map((r) => (
                <div key={r.name} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.count} credit period{r.count !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-6 text-sm">
                    {r.pending > 0 && (
                      <div className="text-right">
                        <p className="font-medium text-amber-600">{formatCurrency(r.pending)}</p>
                        <p className="text-xs text-gray-400">pending</p>
                      </div>
                    )}
                    {r.applied > 0 && (
                      <div className="text-right">
                        <p className="font-medium text-green-600">{formatCurrency(r.applied)}</p>
                        <p className="text-xs text-gray-400">applied</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{formatCurrency(r.total)}</p>
                      <p className="text-xs text-gray-400">total</p>
                    </div>
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
