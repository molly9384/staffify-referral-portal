import { useEffect, useState } from 'react'
import { getCredits, getCreditSummary } from '../../api/client'
import { formatDate, formatCurrency } from '../../utils/format'

const CLIENT_CREDIT_STATUS = {
  pending:  { label: 'Pending',       className: 'bg-amber-100 text-amber-700',  description: 'Waiting for invoice payment' },
  eligible: { label: 'Pending Payout', className: 'bg-blue-100 text-blue-700',   description: 'Ready to apply to your invoice' },
  applied:  { label: 'Paid Out',       className: 'bg-green-100 text-green-700', description: 'Applied to your invoice' },
  voided:   { label: 'Voided',         className: 'bg-gray-100 text-gray-500',   description: '' },
}

export default function MyCredits() {
  const [credits, setCredits] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [c, s] = await Promise.all([getCredits(), getCreditSummary()])
        setCredits(c.filter((cr) => cr.status !== 'voided'))
        setSummary(s)
      } catch {
        setError('Failed to load credits.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalPendingPayout = summary
    ? Number(summary.total_pending) + Number(summary.total_eligible)
    : 0

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Credits</h1>
        <p className="text-gray-500 text-sm mt-1">Track your referral credit balance and payout history.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500 font-medium">Total Earned</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">
            {loading ? '—' : formatCurrency(summary?.total_earned)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 font-medium">Pending Payout</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {loading ? '—' : formatCurrency(totalPendingPayout)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Applied to upcoming invoice</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 font-medium">Total Paid Out</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {loading ? '—' : formatCurrency(summary?.total_applied)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{summary?.applied_count ?? 0} payment{summary?.applied_count !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* How credits work */}
      <div className="rounded-xl bg-primary-50 border border-primary-100 p-5">
        <h3 className="text-sm font-semibold text-primary-800 mb-1">How credits are paid out</h3>
        <p className="text-sm text-primary-700">
          Credits are calculated bi-weekly based on hours worked by your referred client's VA ($1.00/hr).
          Once their invoice is paid, your credits are automatically applied as a discount on your next Staffify invoice.
        </p>
      </div>

      {/* Credits table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />)}
          </div>
        ) : credits.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500">No credits yet.</p>
            <p className="text-xs text-gray-400 mt-1">Credits appear once your referred client's VA starts working.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referral</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credit</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Paid Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {credits.map((credit) => {
                  const s = CLIENT_CREDIT_STATUS[credit.status] || CLIENT_CREDIT_STATUS.pending
                  return (
                    <tr key={credit.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-gray-900">{credit.referral?.referred_name ?? '—'}</p>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium tabular-nums text-gray-900">
                        {formatCurrency(credit.credit_amount)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`badge ${s.className}`}>{s.label}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 text-sm">
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
    </div>
  )
}
