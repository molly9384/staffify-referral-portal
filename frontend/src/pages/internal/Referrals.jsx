import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReferrals, getClients, createReferral, updateReferral, archiveReferral, restoreReferral, deleteReferral, linkClients, getHubstaffOrgMembers } from '../../api/client'
import { statusBadge, formatDate, formatCurrency } from '../../utils/format'
import { getSeenReferralIds, markReferralsAsSeen } from '../../utils/storage'
import { useAuth } from '../../context/AuthContext'

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'referred', label: 'Referred' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'call_scheduled', label: 'Call Sched.' },
  { key: 'contract_signed', label: 'Signed' },
  { key: 'va_hired', label: 'VA Hired' },
  { key: 'va_billing', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'expired', label: 'Expired' },
]

export default function Referrals() {
  const { isOwner } = useAuth()
  // Snapshot which IDs were unseen when this page loaded, before InternalLayout marks them all seen
  const [unseenOnArrival] = useState(() => {
    const seen = getSeenReferralIds()
    return (id) => !seen.has(id)
  })
  const [referrals, setReferrals] = useState([])
  const [clients, setClients] = useState([])
  const [viewArchived, setViewArchived] = useState(false)
  const [statusTab, setStatusTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ referring_client_id: '', referred_name: '', referred_email: '', referral_date: new Date().toISOString().split('T')[0] })
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editReferral, setEditReferral] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkForm, setLinkForm] = useState({
    referring_client_id: '',
    referred_client_id: '',
    referral_date: today,
    activation_date: today,
    status: 'va_billing',
    notes: '',
    vas: [{ hubstaff_user_id: '', hubstaff_user_name: '', start_date: today }],
  })
  const [linkSubmitting, setLinkSubmitting] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [orgMembers, setOrgMembers] = useState([])
  const [orgMembersLoading, setOrgMembersLoading] = useState(false)

  const ACTIVE_STATUSES = ['va_billing', 'active', 'paused', 'expired', 'ceased']

  const openLinkModal = async () => {
    setLinkForm({
      referring_client_id: '',
      referred_client_id: '',
      referral_date: today,
      activation_date: today,
      status: 'va_billing',
      notes: '',
      vas: [{ hubstaff_user_id: '', hubstaff_user_name: '', start_date: today }],
    })
    setLinkError('')
    setShowLinkModal(true)
    // Pre-fetch Hubstaff members
    if (orgMembers.length === 0) {
      setOrgMembersLoading(true)
      try {
        const members = await getHubstaffOrgMembers()
        setOrgMembers(members)
      } catch {
        // Non-fatal — VA section will fall back to text input
      } finally {
        setOrgMembersLoading(false)
      }
    }
  }

  const handleLinkVAChange = (index, field, value) => {
    setLinkForm((f) => {
      const vas = [...f.vas]
      if (field === 'member') {
        // value is a member object {id, name} or empty string
        vas[index] = { ...vas[index], hubstaff_user_id: value?.id || '', hubstaff_user_name: value?.name || '' }
      } else {
        vas[index] = { ...vas[index], [field]: value }
      }
      return { ...f, vas }
    })
  }

  const handleLinkAddVA = () => {
    setLinkForm((f) => ({ ...f, vas: [...f.vas, { hubstaff_user_id: '', hubstaff_user_name: '', start_date: today }] }))
  }

  const handleLinkRemoveVA = (index) => {
    setLinkForm((f) => ({ ...f, vas: f.vas.filter((_, i) => i !== index) }))
  }

  const handleLinkSubmit = async (e) => {
    e.preventDefault()
    setLinkSubmitting(true)
    setLinkError('')
    try {
      const isActiveStatus = ACTIVE_STATUSES.includes(linkForm.status)
      const payload = {
        referring_client_id: linkForm.referring_client_id,
        referred_client_id: linkForm.referred_client_id,
        referral_date: linkForm.referral_date,
        status: linkForm.status,
        notes: linkForm.notes || null,
        activation_date: isActiveStatus && linkForm.activation_date ? linkForm.activation_date : null,
        vas: linkForm.status === 'va_billing'
          ? linkForm.vas.filter((v) => v.hubstaff_user_name.trim()).map((v) => ({
              hubstaff_user_id: v.hubstaff_user_id || null,
              hubstaff_user_name: v.hubstaff_user_name,
              start_date: v.start_date,
              is_eligible: true,
            }))
          : null,
      }
      await linkClients(payload)
      setShowLinkModal(false)
      load()
    } catch (err) {
      setLinkError(err?.response?.data?.detail || 'Failed to link clients.')
    } finally {
      setLinkSubmitting(false)
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (viewArchived) params.archived = true
      else if (statusTab !== 'all') params.status = statusTab
      const [refs, cls] = await Promise.all([getReferrals(params), getClients()])
      setReferrals(refs)
      setClients(cls)
    } catch {
      setError('Failed to load referrals.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [viewArchived, statusTab])

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

  const handleArchive = async (id) => {
    setActionLoading(id)
    try {
      await archiveReferral(id)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to archive referral.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRestore = async (id) => {
    setActionLoading(id)
    try {
      await restoreReferral(id)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to restore referral.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id) => {
    setActionLoading(id)
    try {
      await deleteReferral(id)
      setDeleteConfirm(null)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to delete referral.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleEditOpen = (ref) => {
    setEditReferral(ref)
    setEditForm({
      referred_name: ref.referred_name || '',
      referred_company: ref.referred_company || '',
      referred_email: ref.referred_email || '',
      referred_phone: ref.referred_phone || '',
      referred_website: ref.referred_website || '',
      referral_date: ref.referral_date || '',
    })
    setEditError('')
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    setEditSubmitting(true)
    setEditError('')
    try {
      await updateReferral(editReferral.id, {
        referred_name: editForm.referred_name || undefined,
        referred_company: editForm.referred_company || null,
        referred_email: editForm.referred_email || null,
        referred_phone: editForm.referred_phone || null,
        referred_website: editForm.referred_website || null,
        referral_date: editForm.referral_date || undefined,
      })
      setEditReferral(null)
      load()
    } catch (err) {
      setEditError(err?.response?.data?.detail || 'Failed to save changes.')
    } finally {
      setEditSubmitting(false)
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
          <p className="text-gray-500 text-sm mt-1">Track all referral pipeline activity.</p>
        </div>
        {!viewArchived && (
          <div className="flex gap-2 self-start sm:self-auto">
            <button onClick={openLinkModal} className="btn-secondary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Link Existing Clients
            </button>
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Referral
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Active / Archived toggle */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => { setViewArchived(false); setStatusTab('all') }}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${!viewArchived ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          Active
        </button>
        <button
          onClick={() => setViewArchived(true)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewArchived ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          Archived
        </button>
      </div>

      {/* Status Tabs (active view only) */}
      {!viewArchived && (
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusTab === tab.key
                  ? 'bg-primary-100 text-primary-700 border border-primary-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

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
              {viewArchived ? 'No archived referrals.' : statusTab !== 'all' ? 'Try a different status filter.' : 'Click "Add Referral" to get started.'}
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
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referral Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credits</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referrals.map((ref) => {
                  const badge = statusBadge(ref.status)
                  const busy = actionLoading === ref.id
                  const isNew = ref.status === 'referred' && unseenOnArrival(ref.id)
                  return (
                    <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{ref.referred_name}</p>
                          {isNew && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-primary-100 text-primary-700">
                              New
                            </span>
                          )}
                        </div>
                        {ref.referred_company && <p className="text-xs text-gray-400">{ref.referred_company}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">{ref.referring_client?.name ?? '—'}</td>
                      <td className="px-6 py-3.5">
                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500">{formatDate(ref.referral_date)}</td>
                      <td className="px-6 py-3.5 font-medium text-gray-900">{formatCurrency(ref.total_credits_earned)}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-3">
                          {viewArchived ? (
                            <>
                              <button
                                onClick={() => handleRestore(ref.id)}
                                disabled={busy}
                                className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                              >
                                {busy ? '…' : 'Restore'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(ref.id)}
                                disabled={busy}
                                className="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <Link to={`/internal/referrals/${ref.id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                                View
                              </Link>
                              <button
                                onClick={() => handleEditOpen(ref)}
                                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                              >
                                Edit
                              </button>
                              {isOwner && (
                                <button
                                  onClick={() => handleArchive(ref.id)}
                                  disabled={busy}
                                  className="text-sm text-gray-400 hover:text-gray-600 font-medium disabled:opacity-50"
                                >
                                  {busy ? '…' : 'Archive'}
                                </button>
                              )}
                            </>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Delete referral?</h2>
            <p className="text-sm text-gray-500 mb-6">This will permanently delete the referral and all associated data. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading === deleteConfirm}
                className="flex-1 justify-center inline-flex items-center px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === deleteConfirm ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Referral Modal */}
      {editReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Edit Referral</h2>
              <button onClick={() => setEditReferral(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-4">
              <div>
                <label className="label">Referred Name</label>
                <input
                  type="text"
                  className="input"
                  required
                  value={editForm.referred_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, referred_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Company (optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Acme Corp"
                  value={editForm.referred_company}
                  onChange={(e) => setEditForm((f) => ({ ...f, referred_company: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Email (optional)</label>
                <input
                  type="email"
                  className="input"
                  placeholder="contact@example.com"
                  value={editForm.referred_email}
                  onChange={(e) => setEditForm((f) => ({ ...f, referred_email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Phone (optional)</label>
                <input
                  type="tel"
                  className="input"
                  placeholder="+1 (555) 000-0000"
                  value={editForm.referred_phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, referred_phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Website (optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="https://example.com"
                  value={editForm.referred_website}
                  onChange={(e) => setEditForm((f) => ({ ...f, referred_website: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Referral Date</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={editForm.referral_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, referral_date: e.target.value }))}
                />
              </div>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditReferral(null)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting} className="btn-primary flex-1 justify-center">
                  {editSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Existing Clients Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Link Existing Clients</h2>
                <p className="text-xs text-gray-400 mt-0.5">Backfill a referral between two clients already in the system</p>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleLinkSubmit} className="p-6 space-y-4 overflow-y-auto">
              {/* Referring client */}
              <div>
                <label className="label">Referring Client <span className="text-red-400">*</span></label>
                <select
                  className="input"
                  required
                  value={linkForm.referring_client_id}
                  onChange={(e) => setLinkForm((f) => ({ ...f, referring_client_id: e.target.value }))}
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Referred client */}
              <div>
                <label className="label">Referred Client <span className="text-red-400">*</span></label>
                <select
                  className="input"
                  required
                  value={linkForm.referred_client_id}
                  onChange={(e) => setLinkForm((f) => ({ ...f, referred_client_id: e.target.value }))}
                >
                  <option value="">Select client…</option>
                  {clients
                    .filter((c) => c.id !== linkForm.referring_client_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="label">Status <span className="text-red-400">*</span></label>
                <select
                  className="input"
                  value={linkForm.status}
                  onChange={(e) => setLinkForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUS_TABS.filter((t) => t.key !== 'all').map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Referral Date */}
              <div>
                <label className="label">Referral Date <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  className="input"
                  required
                  value={linkForm.referral_date}
                  onChange={(e) => setLinkForm((f) => ({ ...f, referral_date: e.target.value }))}
                />
              </div>

              {/* Activation Date — shown for active-stage statuses */}
              {ACTIVE_STATUSES.includes(linkForm.status) && (
                <div>
                  <label className="label">Activation Date</label>
                  <input
                    type="date"
                    className="input"
                    value={linkForm.activation_date}
                    onChange={(e) => setLinkForm((f) => ({ ...f, activation_date: e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">When did this client start billing? Used to calculate the 12-month credit window.</p>
                </div>
              )}

              {/* VA Section — shown only for Active status */}
              {linkForm.status === 'va_billing' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">Virtual Assistants</label>
                    <button
                      type="button"
                      onClick={handleLinkAddVA}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      + Add another VA
                    </button>
                  </div>
                  {linkForm.vas.map((va, i) => (
                    <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 space-y-2">
                        {orgMembersLoading ? (
                          <div className="h-9 bg-gray-200 rounded animate-pulse" />
                        ) : orgMembers.length > 0 ? (
                          <select
                            className="input text-sm"
                            value={va.hubstaff_user_id || ''}
                            onChange={(e) => {
                              const member = orgMembers.find((m) => m.id === e.target.value)
                              handleLinkVAChange(i, 'member', member || null)
                            }}
                          >
                            <option value="">Select VA from Hubstaff…</option>
                            {orgMembers.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="input text-sm"
                            placeholder="VA name"
                            value={va.hubstaff_user_name}
                            onChange={(e) => handleLinkVAChange(i, 'hubstaff_user_name', e.target.value)}
                          />
                        )}
                        <input
                          type="date"
                          className="input text-sm"
                          required={linkForm.status === 'va_billing'}
                          value={va.start_date}
                          onChange={(e) => handleLinkVAChange(i, 'start_date', e.target.value)}
                        />
                      </div>
                      {linkForm.vas.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleLinkRemoveVA(i)}
                          className="text-gray-400 hover:text-red-500 mt-1 flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="label">Notes (optional)</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder="Any context about this referral…"
                  value={linkForm.notes}
                  onChange={(e) => setLinkForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {linkError && <p className="text-sm text-red-600">{linkError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowLinkModal(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={linkSubmitting} className="btn-primary flex-1 justify-center">
                  {linkSubmitting ? 'Linking…' : 'Link Clients'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
