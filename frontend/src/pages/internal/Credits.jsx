import { useEffect, useState } from 'react'
import { getCredits, getCreditSummary, pullCredits, verifyCredits, applyCredits, updateCredit, recalculateCredit, deleteCredit, markCreditEligible, restoreCredit } from '../../api/client'
import CreditSummaryComponent from '../../components/CreditSummary'
import { formatDate, formatCurrency } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'

const STATUS_TABS = [
  { key: 'all', label: 'All Credits' },
  { key: 'pending', label: 'Pending' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'applied', label: 'Applied' },
  { key: 'voided', label: 'Voided' },
]

function EditCreditModal({ credit, onClose, onSaved }) {
  const [amount, setAmount] = useState(Number(credit.credit_amount).toFixed(2))
  const [notes, setNotes] = useState(credit.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateCredit(credit.id, { credit_amount: parseFloat(amount), notes })
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Edit Credit</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
            <p className="font-medium text-gray-700">{credit.referral?.referred_name}</p>
            {credit.hubstaff_invoice_number && (
              <p className="text-xs mt-0.5">Invoice #{credit.hubstaff_invoice_number}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="label">Credit Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
            <p className="text-xs text-gray-400 mt-1">Original: {formatCurrency(credit.credit_amount)} ({Number(credit.hours_worked).toFixed(2)} hrs × $1.00/hr)</p>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              rows={3}
              placeholder="Reason for adjustment…"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Credits() {
  const { isOwner } = useAuth()
  const [credits, setCredits] = useState([])
  const [summary, setSummary] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [pullRunning, setPullRunning] = useState(false)
  const [verifyRunning, setVerifyRunning] = useState(false)
  const [applyRunning, setApplyRunning] = useState(false)
  const [editingCredit, setEditingCredit] = useState(null)
  const [recalculating, setRecalculating] = useState(null) // credit id
  const [deletingCredit, setDeletingCredit] = useState(null) // credit id awaiting confirm

  const load = async () => {
    setLoading(true)
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {}
      const data = await getCredits(params)
      // Hide voided from the "All" tab — they're only visible under the Voided tab
      setCredits(activeTab === 'all' ? data.filter((c) => c.status !== 'voided') : data)
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

  const handlePullCredits = async () => {
    setPullRunning(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await pullCredits()
      setSuccessMsg(result.detail || result.message)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Pull credits failed.')
    } finally {
      setPullRunning(false)
    }
  }

  const handleVerifyCredits = async () => {
    setVerifyRunning(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await verifyCredits()
      setSuccessMsg(result.detail || result.message)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Verify credits failed.')
    } finally {
      setVerifyRunning(false)
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

  const handleMarkEligible = async (creditId) => {
    try {
      await markCreditEligible(creditId)
      setSuccessMsg('Credit marked eligible.')
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to mark eligible.')
    }
  }

  const handleRestoreCredit = async (creditId) => {
    try {
      await restoreCredit(creditId)
      setSuccessMsg('Credit restored to eligible — it will be applied on the next apply run.')
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to restore credit.')
    }
  }

  const handleDelete = async (creditId) => {
    try {
      await deleteCredit(creditId)
      setDeletingCredit(null)
      setSuccessMsg('Credit deleted.')
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to delete credit.')
      setDeletingCredit(null)
    }
  }

  const handleRecalculate = async (creditId) => {
    setRecalculating(creditId)
    setError('')
    setSuccessMsg('')
    try {
      await recalculateCredit(creditId)
      setSuccessMsg('Credit recalculated from Hubstaff invoice.')
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Recalculation failed.')
    } finally {
      setRecalculating(null)
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {editingCredit && (
        <EditCreditModal
          credit={editingCredit}
          onClose={() => setEditingCredit(null)}
          onSaved={async () => {
            setEditingCredit(null)
            setSuccessMsg('Credit updated.')
            await Promise.all([load(), loadSummary()])
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credits</h1>
          <p className="text-gray-500 text-sm mt-1">Manage referral credit accrual and QBO application.</p>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-3 self-start sm:self-auto">
            <button onClick={handlePullCredits} disabled={pullRunning} className="btn-secondary">
              {pullRunning ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {pullRunning ? 'Pulling…' : 'Pull Credits'}
            </button>
            <button onClick={handleVerifyCredits} disabled={verifyRunning} className="btn-secondary">
              {verifyRunning ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              )}
              {verifyRunning ? 'Verifying…' : 'Verify Credits'}
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
        )}
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
            <p className="text-xs text-gray-400 mt-1">Click "Pull Credits" to pull credits from Hubstaff invoices.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referred Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credit</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Applied</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {credits.map((credit) => {
                  const statusClass = {
                    pending: 'bg-amber-100 text-amber-700',
                    eligible: 'bg-blue-100 text-blue-700',
                    applied: 'bg-green-100 text-green-700',
                    voided: 'bg-red-100 text-red-700',
                  }[credit.status]
                  const isRecalculating = recalculating === credit.id
                  return (
                    <tr key={credit.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-gray-900">{credit.referral?.referred_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">→ {credit.referral?.referring_client?.name ?? '—'}</p>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 font-mono text-xs">
                        {credit.hubstaff_invoice_number ? `#${credit.hubstaff_invoice_number}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums">{Number(credit.hours_worked).toFixed(2)}</td>
                      <td className="px-6 py-3.5 text-right font-medium tabular-nums">{formatCurrency(credit.credit_amount)}</td>
                      <td className="px-6 py-3.5">
                        <span className={`badge ${statusClass}`}>{credit.status}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-400 text-xs">
                        {credit.applied_date ? formatDate(credit.applied_date) : '—'}
                        {credit.qbo_invoice_id && (
                          <p className="font-mono text-gray-300">{credit.qbo_invoice_id}</p>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {credit.status === 'voided' && (
                            <button
                              onClick={() => handleRestoreCredit(credit.id)}
                              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Restore to eligible so it applies on the next run"
                            >
                              Restore
                            </button>
                          )}
                          {credit.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setEditingCredit(credit)}
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                                title="Edit credit amount"
                              >
                                Edit
                              </button>
                              {credit.hubstaff_invoice_id && (
                                <button
                                  onClick={() => handleRecalculate(credit.id)}
                                  disabled={isRecalculating}
                                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                                  title="Recalculate from Hubstaff invoice"
                                >
                                  {isRecalculating ? (
                                    <svg className="w-3 h-3 animate-spin mr-1" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                  ) : null}
                                  {isRecalculating ? 'Recalc…' : 'Recalc'}
                                </button>
                              )}
                              <button
                                onClick={() => handleMarkEligible(credit.id)}
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                title="Manually mark as eligible (for testing)"
                              >
                                Mark Eligible
                              </button>
                            </>
                          )}
                          {isOwner && (
                            deletingCredit === credit.id ? (
                              <span className="flex items-center gap-1">
                                <span className="text-xs text-gray-500 mr-0.5">Delete?</span>
                                <button
                                  onClick={() => handleDelete(credit.id)}
                                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeletingCredit(null)}
                                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeletingCredit(credit.id)}
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                title="Delete credit entry"
                              >
                                Delete
                              </button>
                            )
                          )}
                        </div>
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
