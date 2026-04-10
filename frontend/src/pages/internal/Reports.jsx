import { useState, useEffect } from 'react'
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

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-primary-600' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-primary-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function SortHeader({ label, col, sortBy, sortDir, onSort }) {
  const isActive = sortBy === col
  return (
    <th
      onClick={() => onSort(col)}
      className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === 'desc' ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'} />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
          </svg>
        )}
      </span>
    </th>
  )
}

export default function AdminReports() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState('referrals_sent')
  const [sortDir, setSortDir] = useState('desc')

  const fetchReport = async (start, end) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (start) params.start_date = start
      if (end) params.end_date = end
      const res = await apiClient.get('/reports/admin', { params })
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

  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortBy(col); setSortDir('desc') }
  }

  const sortedReferrers = report?.top_referrers
    ? [...report.top_referrers].sort((a, b) => {
        const mult = sortDir === 'desc' ? -1 : 1
        return mult * ((a[sortBy] || 0) - (b[sortBy] || 0))
      })
    : []

  const dateRangeLabel = report?.date_range?.start
    ? `${formatDate(report.date_range.start)} – ${formatDate(report.date_range.end)}`
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

      <div className="p-8 max-w-5xl">

        {/* Print-only header */}
        <div className="hidden print-header mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Staffify Referral Report</h1>
          <p className="text-sm text-gray-500 mt-1">{dateRangeLabel}</p>
        </div>

        {/* Page header */}
        <div className="flex items-start justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-500 text-sm mt-1">View referral activity, top referrers, and credit totals.</p>
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

        {/* Date range shown when printing */}
        {(startDate || endDate) && (
          <p className="text-sm text-gray-500 mb-4 hidden print-header">{dateRangeLabel}</p>
        )}

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
              <SummaryCard label="Referring Clients" value={report.summary.total_clients} />
              <SummaryCard label="Total Referrals" value={report.summary.total_referrals} />
              <SummaryCard label="Active Referrals" value={report.summary.active_referrals} highlight />
              <SummaryCard label="Credits Earned" value={formatCurrency(report.summary.total_credits_earned)} />
              <SummaryCard label="Credits Applied" value={formatCurrency(report.summary.total_credits_applied)} />
            </div>

            {/* Top Referrers */}
            <div className="card mb-6">
              <div className="card-header">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Top Referrers</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Click column headers to sort</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                {sortedReferrers.length === 0 ? (
                  <p className="text-sm text-gray-500 px-6 py-8 text-center">No referral data for the selected period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                        <SortHeader label="Referrals Sent" col="referrals_sent" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader label="Active" col="active_referrals" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader label="Credits Earned" col="credits_earned" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader label="Credits Applied" col="credits_applied" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedReferrers.map((r, i) => (
                        <tr key={r.client_id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-semibold flex-shrink-0">
                                {i + 1}
                              </span>
                              {r.client_name}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-700">{r.referrals_sent}</td>
                          <td className="px-6 py-3">
                            {r.active_referrals > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                {r.active_referrals}
                              </span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-gray-700">{formatCurrency(r.credits_earned)}</td>
                          <td className="px-6 py-3 text-gray-700">{formatCurrency(r.credits_applied)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Pipeline Breakdown */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Pipeline Breakdown</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Referrals by current status</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                {report.pipeline.length === 0 ? (
                  <p className="text-sm text-gray-500 px-6 py-8 text-center">No data for the selected period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">% of Total</th>
                        <th className="px-6 py-3 w-48"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...report.pipeline]
                        .sort((a, b) => b.count - a.count)
                        .map((row) => {
                          const pct = report.summary.total_referrals > 0
                            ? Math.round((row.count / report.summary.total_referrals) * 100)
                            : 0
                          return (
                            <tr key={row.status} className="hover:bg-gray-50">
                              <td className="px-6 py-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600'}`}>
                                  {STATUS_LABELS[row.status] || row.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-gray-700 font-medium">{row.count}</td>
                              <td className="px-6 py-3 text-gray-500">{pct}%</td>
                              <td className="px-6 py-3 no-print">
                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                  <div
                                    className="bg-primary-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
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
