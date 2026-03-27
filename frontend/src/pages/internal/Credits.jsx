import { useEffect, useState } from 'react'
import { getCredits, getCreditSummary, runCreditAutomation, applyCredits } from '../../api/client'
import CreditSummaryComponent from '../../components/CreditSummary'
import { formatDate, formatCurrency } from '../../utils/format'

const STATUS_TABS = [
  { key: 'all', label: 'All Credits' },
  { key: 'pending', label: 'Pending' },
  { key: 'applied', label: 'Applied' },
  { key: 'voided', label: 'Voided' },
]

export default function Credits() {
  const [credits, setCredits] = useState([])
  const [summary, setSummary] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [automationRunning, setAutomationRunning] = useState(false)
  const [applyRunning, setApplyRunning] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {}
      const data = await getCredits(params)
      setCredits(data)
    } catch {
      setError('Failed to load credits.')
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

  const handleRunAutomation = async () => {
    setAutomationRunning(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await runCreditAutomation()
      setSuccessMsg(result.detail || result.message)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Credit automation failed.')
    } finally {
      setAutomationRunning(false)
    }
  }

  const handleApplyCredits = async () => {
    setApplyRunning(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await applyCredits()
      setSuccessMsg(result.detail || result.message)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to apply credits.')
    } finally {
      setApplyRunning(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credits</h1>
          <p className="text-gray-500 text-sm mt-1">Manage referral credit accrual and QBO application.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleRunAutomation} disabled={automationRunning} className="btn-secondary">
            {automationRunning ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {automationRunning ? 'Running…' : 'Run Automation'}
          </button>
          <button onClick={handleApplyCredits} disabled={applyRunning} className="btn-primary">
            {applyRunning ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {applyRunning ? 'Applying…' : 'Apply Credits to QBO'}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}
      {successMsg && (
        <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{successMsg}</div>
      )}

      {/* Summary Cards */}
      <CreditSummaryComponent summary={summary} loading={summaryLoading} />

      {/* Tabs */}
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

      {/* Credits Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : credits.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500">No credits found.</p>
            <p className="text-xs text-gray-400 mt-1">Run the automation to calculate credits for active referrals.</p>
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
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {credits.map((credit) => {
                  const statusClass = {
                    pending: 'bg-amber-100 text-amber-700',
                    applied: 'bg-green-100 text-green-700',
                    voided: 'bg-red-100 text-red-700',
                  }[credit.status]
                  return (
                    <tr key={credit.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-gray-900">
                        {credit.referral?.referred_name ?? '—'}
                        <p className="text-xs text-gray-400 font-normal">
                          Ref: {credit.referral?.referring_client?.name ?? '—'}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-gray-600 text-xs">
                        {formatDate(credit.period_start)} –<br />{formatDate(credit.period_end)}
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums">{Number(credit.hours_worked).toFixed(2)}</td>
                      <td className="px-6 py-3.5 text-right font-medium tabular-nums">{formatCurrency(credit.credit_amount)}</td>
                      <td className="px-6 py-3.5">
                        <span className={`badge ${statusClass}`}>{credit.status}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 font-mono text-xs">{credit.qbo_invoice_id ?? '—'}</td>
                      <td className="px-6 py-3.5 text-gray-400 text-xs">{formatDate(credit.applied_date)}</td>
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
