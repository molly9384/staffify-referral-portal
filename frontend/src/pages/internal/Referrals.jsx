import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReferrals, getClients, createReferral } from '../../api/client'
import { statusBadge, STATUS_CONFIG, formatDate, formatCurrency } from '../../utils/format'

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'referred', label: 'Referred' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'call_scheduled', label: 'Call Sched.' },
  { key: 'contract_signed', label: 'Signed' },
  { key: 'va_hired', label: 'VA Hired' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'expired', label: 'Expired' },
]

export default function Referrals() {
  const [referrals, setReferrals] = useState([])
  const [clients, setClients] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ referring_client_id: '', referred_name: '', referred_email: '', referral_date: new Date().toISOString().split('T')[0] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {}
      const [refs, cls] = await Promise.all([getReferrals(params), getClients()])
      setReferrals(refs)
      setClients(cls)
    } catch {
      setError('Failed to load referrals.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeTab])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createReferral(form)
      setShowModal(false)
      setForm({ referring_client_id: '', referred_name: '', referred_email: '', referral_date: new Date().toISOString().split('T')[0] })
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create referral.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
          <p className="text-gray-500 text-sm mt-1">Track all referral pipeline activity.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Referral
        </button>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
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

      {/* Referral Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">No referrals found</p>
            <p className="text-xs text-gray-400 mt-1">
              {activeTab !== 'all' ? 'Try a different status filter.' : 'Click "Add Referral" to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referred Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referring Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Eligible VA</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referral Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credits</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referrals.map((ref) => {
                  const badge = statusBadge(ref.status)
                  const eligibleVA = ref.virtual_assistants?.find((v) => v.is_eligible && v.is_active)
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
                      <td className="px-6 py-3.5 text-gray-600">{eligibleVA?.hubstaff_user_name ?? '—'}</td>
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

      {/* Add Referral Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">New Referral</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="label">Referring Client</label>
                <select
                  className="input"
                  required
                  value={form.referring_client_id}
                  onChange={(e) => setForm((f) => ({ ...f, referring_client_id: e.target.value }))}
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Referred Name / Company</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. Acme Corp"
                  value={form.referred_name}
                  onChange={(e) => setForm((f) => ({ ...f, referred_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Referred Email (optional)</label>
                <input
                  type="email"
                  className="input"
                  placeholder="contact@example.com"
                  value={form.referred_email}
                  onChange={(e) => setForm((f) => ({ ...f, referred_email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Referral Date</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.referral_date}
                  onChange={(e) => setForm((f) => ({ ...f, referral_date: e.target.value }))}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
                  {submitting ? 'Creating…' : 'Create Referral'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
