import { useState, useEffect } from 'react'
import apiClient from '../../api/client'
import { getClients, sendReportEmail } from '../../api/client'
import { generateAdminReportPDF } from '../../utils/reportPDF'

const STATUS_LABELS = {
  referred: 'Referred', contacted: 'Contacted', call_scheduled: 'Call Scheduled',
  contract_signed: 'Contract Signed', va_hired: 'VA Hired', va_billing: 'VA Billing',
  active: 'Active', paused: 'Paused', expired: 'Expired', ceased: 'Ceased',
}

const STATUS_COLORS = {
  referred: 'bg-blue-100 text-blue-700', contacted: 'bg-indigo-100 text-indigo-700',
  call_scheduled: 'bg-violet-100 text-violet-700', contract_signed: 'bg-purple-100 text-purple-700',
  va_hired: 'bg-amber-100 text-amber-700', va_billing: 'bg-orange-100 text-orange-700',
  active: 'bg-green-100 text-green-700', paused: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-gray-100 text-gray-600', ceased: 'bg-red-100 text-red-700',
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  const active = sortBy === col
  return (
    <th onClick={() => onSort(col)} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none">
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
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

function EmailModal({ onClose, onSend, sending, sent, error }) {
  const [email, setEmail] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Email Report</h3>
        <p className="text-sm text-gray-500 mb-4">The report PDF will be sent as an attachment.</p>
        {sent ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200 mb-4">
            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <p className="text-sm text-green-700">Report sent successfully!</p>
          </div>
        ) : (
          <>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <label className="label">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mb-4"
              placeholder="recipient@example.com"
              autoFocus
            />
          </>
        )}
        <div className="flex gap-3">
          {!sent && (
            <button
              onClick={() => onSend(email)}
              disabled={sending || !email}
              className="btn-primary flex-1 flex items-center justify-center"
            >
              {sending ? 'Sending…' : 'Send Report'}
            </button>
          )}
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            {sent ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminReports() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState('referrals_sent')
  const [sortDir, setSortDir] = useState('desc')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [expandedReferrer, setExpandedReferrer] = useState(null)

  useEffect(() => {
    getClients().then(setClients).catch(() => {})
    fetchReport('', '', '')
  }, [])

  const fetchReport = async (start, end, cid) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (start) params.start_date = start
      if (end) params.end_date = end
      if (cid) params.client_id = cid
      const res = await apiClient.get('/reports/admin', { params })
      setReport(res.data)
    } catch {
      setError('Failed to load report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = (e) => {
    e.preventDefault()
    fetchReport(startDate, endDate, clientId)
  }

  const handleClear = () => {
    setStartDate('')
    setEndDate('')
    setClientId('')
    fetchReport('', '', '')
  }

  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortBy(col); setSortDir('desc') }
  }

  const selectedClient = clients.find((c) => c.id === clientId)

  const dateRangeLabel = startDate
    ? `${formatDate(startDate)} – ${formatDate(endDate || new Date().toISOString().slice(0, 10))}`
    : 'All time'

  const handleDownloadPDF = async () => {
    if (!report) return
    setPdfLoading(true)
    setPdfError('')
    try {
      const doc = await generateAdminReportPDF(report, dateRangeLabel, selectedClient?.name)
      const filename = `staffify-report-${new Date().toISOString().slice(0, 10)}.pdf`
      doc.save(filename)
    } catch (err) {
      console.error('PDF generation failed:', err)
      setPdfError('PDF generation failed: ' + (err?.message || 'Unknown error'))
    } finally {
      setPdfLoading(false)
    }
  }

  const handleSendEmail = async (email) => {
    if (!report || !email) return
    setEmailSending(true)
    setEmailError('')
    try {
      const doc = await generateAdminReportPDF(report, dateRangeLabel, selectedClient?.name)
      const filename = `staffify-report-${new Date().toISOString().slice(0, 10)}.pdf`
      const pdfBlob = doc.output('datauristring')
      const base64 = pdfBlob.split(',')[1]
      await sendReportEmail({
        email,
        subject: `Staffify Referral Report – ${dateRangeLabel}`,
        filename,
        pdf_base64: base64,
      })
      setEmailSent(true)
    } catch {
      setEmailError('Failed to send. Please try again.')
    } finally {
      setEmailSending(false)
    }
  }

  const sortedReferrers = report?.top_referrers
    ? [...report.top_referrers].sort((a, b) => {
        const mult = sortDir === 'desc' ? -1 : 1
        return mult * ((a[sortBy] || 0) - (b[sortBy] || 0))
      })
    : []

  return (
    <>
      {showEmailModal && (
        <EmailModal
          onClose={() => { setShowEmailModal(false); setEmailSent(false); setEmailError('') }}
          onSend={handleSendEmail}
          sending={emailSending}
          sent={emailSent}
          error={emailError}
        />
      )}

      <div className="p-4 sm:p-8 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-500 text-sm mt-1">View referral activity, top referrers, and credit totals.</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => { setEmailSent(false); setEmailError(''); setShowEmailModal(true) }}
              disabled={!report || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={!report || loading || pdfLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>
        {pdfError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{pdfError}</div>
        )}

        {/* Filters */}
        <form onSubmit={handleApply} className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-6">
          <div>
            <label className="label">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input w-full sm:w-auto" />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input w-full sm:w-auto" />
          </div>
          <button type="submit" className="btn-primary w-full sm:w-auto">Apply</button>
          {(startDate || endDate || clientId) && (
            <button type="button" onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700 underline self-center sm:self-auto">Clear</button>
          )}
        </form>

        {/* Active filter pills */}
        {(clientId || startDate) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedClient && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium border border-primary-200">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                {selectedClient.name}
              </span>
            )}
            {startDate && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                {dateRangeLabel}
              </span>
            )}
          </div>
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
                  <p className="text-sm text-gray-500 px-6 py-8 text-center">No referral data for the selected filters.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                        <SortHeader label="Referrals Sent" col="referrals_sent" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader label="Active" col="active_referrals" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader label={startDate ? 'Credits Applied (Period)' : 'Credits Applied'} col="credits_applied" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedReferrers.map((r, i) => (
                        <>
                          <tr key={r.client_id} className="hover:bg-gray-50">
                            <td className="px-6 py-3 font-medium text-gray-900">
                              <span className="inline-flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-semibold flex-shrink-0">{i + 1}</span>
                                {r.client_name}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-700">{r.referrals_sent}</td>
                            <td className="px-6 py-3">
                              {r.active_referrals > 0 ? (
                                <button
                                  onClick={() => setExpandedReferrer(expandedReferrer === r.client_id ? null : r.client_id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                >
                                  {r.active_referrals}
                                  <svg className={`w-3 h-3 transition-transform ${expandedReferrer === r.client_id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              ) : <span className="text-gray-400">0</span>}
                            </td>
                            <td className="px-6 py-3 text-gray-700">{formatCurrency(r.credits_applied)}</td>
                          </tr>
                          {expandedReferrer === r.client_id && r.active_referral_details?.length > 0 && (
                            <tr key={`${r.client_id}-details`} className="bg-green-50/50">
                              <td colSpan={5} className="px-6 py-3">
                                <div className="space-y-1.5">
                                  {r.active_referral_details.map((ref) => (
                                    <div key={ref.referral_id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-white rounded-lg border border-green-100">
                                      <div>
                                        <span className="font-medium text-gray-900">{ref.referred_name}</span>
                                        {ref.activation_date && (
                                          <span className="text-xs text-gray-400 ml-2">since {formatDate(ref.activation_date)}</span>
                                        )}
                                      </div>
                                      <div className="flex gap-6 text-xs text-gray-500">
                                        <span><span className="font-medium text-gray-700">{formatCurrency(ref.credits_earned)}</span> earned</span>
                                        <span><span className="font-medium text-gray-700">{formatCurrency(ref.credits_applied)}</span> applied</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
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
                  <p className="text-sm text-gray-500 px-6 py-8 text-center">No data for the selected filters.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">% of Total</th>
                        <th className="px-6 py-3 w-48" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...report.pipeline].sort((a, b) => b.count - a.count).map((row) => {
                        const pct = report.summary.total_referrals > 0
                          ? Math.round((row.count / report.summary.total_referrals) * 100) : 0
                        return (
                          <tr key={row.status} className="hover:bg-gray-50">
                            <td className="px-6 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600'}`}>
                                {STATUS_LABELS[row.status] || row.status}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-700 font-medium">{row.count}</td>
                            <td className="px-6 py-3 text-gray-500">{pct}%</td>
                            <td className="px-6 py-3">
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
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
