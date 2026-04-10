import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'
import { sendReportEmail } from '../../api/client'
import { generateClientReportPDF } from '../../utils/reportPDF'

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

const CREDIT_STATUS_LABELS = {
  pending: 'Pending', eligible: 'Pending Payout', applied: 'Paid Out', voided: 'Voided',
}

const CREDIT_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700', eligible: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700', voided: 'bg-gray-100 text-gray-500',
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
            <button onClick={() => onSend(email)} disabled={sending || !email} className="btn-primary flex-1">
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

export default function ClientReports() {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')

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
    ? `${formatDate(startDate)} – ${formatDate(endDate || new Date().toISOString().slice(0, 10))}`
    : 'All time'

  const handleDownloadPDF = async () => {
    if (!report) return
    setPdfLoading(true)
    try {
      const doc = await generateClientReportPDF(report, dateRangeLabel, user?.full_name || 'Client')
      doc.save(`staffify-my-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  const handleSendEmail = async (email) => {
    if (!report || !email) return
    setEmailSending(true)
    setEmailError('')
    try {
      const doc = await generateClientReportPDF(report, dateRangeLabel, user?.full_name || 'Client')
      const filename = `staffify-my-report-${new Date().toISOString().slice(0, 10)}.pdf`
      const base64 = doc.output('datauristring').split(',')[1]
      await sendReportEmail({
        email,
        subject: `Staffify Referral Activity Report – ${dateRangeLabel}`,
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

      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
            <p className="text-gray-500 text-sm mt-1">View your referral activity and credit history.</p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Date filter */}
        <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="label">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
          </div>
          <button type="submit" className="btn-primary">Apply</button>
          {(startDate || endDate) && (
            <button type="button" onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700 underline">Clear</button>
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
                          <td className="px-6 py-3 text-gray-500 text-xs">{formatDate(c.period_start)} – {formatDate(c.period_end)}</td>
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
                          {formatCurrency(report.credits.reduce((s, c) => s + c.credit_amount, 0))}
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
