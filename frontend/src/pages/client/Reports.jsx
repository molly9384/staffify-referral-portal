import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'

const STATUS_LABELS = {
  referred: 'Referred',
  contacted: 'Contacted',
  call_scheduled: 'Call Scheduled',
  contract_signed: 'Contract Signed',
  va_hired: 'VA Hired',
  va_billing: 'VA Billing',
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
  ceased: 'Ceased',
}

const STATUS_COLORS = {
  referred: 'bg-blue-100 text-blue-700',
  contacted: 'bg-indigo-100 text-indigo-700',
  call_scheduled: 'bg-violet-100 text-violet-700',
  contract_signed: 'bg-purple-100 text-purple-700',
  va_hired: 'bg-amber-100 text-amber-700',
  va_billing: 'bg-orange-100 text-orange-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-gray-100 text-gray-600',
  ceased: 'bg-red-100 text-red-700',
}

const CREDIT_STATUS_LABELS = {
  pending: 'Pending',
  eligible: 'Pending Payout',
  applied: 'Paid Out',
  voided: 'Voided',
}

const CREDIT_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  eligible: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
  voided: 'bg-gray-100 text-gray-500',
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function SummaryCard({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-primary-600' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-primary-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ClientReports() {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchReport = async (start, end) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (start) params.start_date = start
      if (end) params.end_date = end
      const res = await apiClient.get('/reports/client', { params })
      setReport(res.data)
    } catch {
      setError('Failed to load report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReport('', '') }, [])

  const handleApply = (e) => {
    e.preventDefault()
    fetchReport(startDate, endDate)
  }

  const handleClear = () => {
    setStartDate('')
    setEndDate('')
    fetchReport('', '')
  }

  const dateRangeLabel = startDate
    ? `${formatDate(startDate)} – ${formatDate(endDate || 'today')}`
    : 'All time'

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-header { display: block !important; }
          aside { display: none !important; }
          main { overflow: visible !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="p-8 max-w-4xl">

        {/* Print-only header */}
        <div className="hidden print-header mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Referral Activity Report</h1>
          <p className="text-sm text-gray-500 mt-1">{user?.full_name} · {dateRangeLabel}</p>
        </div>

        {/* Page header */}
        <div className="flex items-start justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
            <p className="text-gray-500 text-sm mt-1">View your referral activity and credit history.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
        </div>

        {/* Date filter */}
        <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3 mb-6 no-print">
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary">Apply</button>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </form>

        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading report…
          </div>
        )}

        {error && !loading && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        {report && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <SummaryCard label="Total Referrals" value={report.summary.total_referrals} />
              <SummaryCard label="Active Referrals" value={report.summary.active_referrals} highlight />
              <SummaryCard label="Credits Earned" value={formatCurrency(report.summary.credits_earned)} />
              <SummaryCard label="Pending" value={formatCurrency(report.summary.credits_pending)} sub="Not yet applied" />
              <SummaryCard label="Total Applied" value={formatCurrency(report.summary.credits_applied)} sub="Applied to invoices" />
            </div>

            {/* Referrals table */}
            <div className="card mb-6">
              <div className="card-header">
                <h2 className="text-base font-semibold text-gray-900">My Referrals</h2>
              </div>
              <div className="overflow-x-auto">
                {report.referrals.length === 0 ? (
                  <p className="text-sm text-gray-500 px-6 py-8 text-center">No referrals found for the selected period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Referred Person</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Credits Earned</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Credits Applied</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.referrals.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{r.referred_name}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[r.status] || r.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-500">{formatDate(r.referral_date)}</td>
                          <td className="px-6 py-3 text-gray-700">{formatCurrency(r.credits_earned)}</td>
                          <td className="px-6 py-3 text-gray-700">{formatCurrency(r.credits_applied)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Credits itemized */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Credit Detail</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Itemized credit entries by billing period</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                {report.credits.length === 0 ? (
                  <p className="text-sm text-gray-500 px-6 py-8 text-center">No credit entries for the selected period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Referral</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Billing Period</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Applied</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.credits.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{c.referral_name}</td>
                          <td className="px-6 py-3 text-gray-500 text-xs">
                            {formatDate(c.period_start)} – {formatDate(c.period_end)}
                          </td>
                          <td className="px-6 py-3 text-gray-700">{Number(c.hours_worked).toFixed(1)}</td>
                          <td className="px-6 py-3 font-medium text-gray-900">{formatCurrency(c.credit_amount)}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CREDIT_STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                              {CREDIT_STATUS_LABELS[c.status] || c.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-500">{formatDate(c.applied_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-700">Total</td>
                        <td className="px-6 py-3 text-sm font-bold text-gray-900">
                          {formatCurrency(report.credits.reduce((sum, c) => sum + c.credit_amount, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
