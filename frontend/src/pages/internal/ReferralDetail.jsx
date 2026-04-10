import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getReferral, getReferralCredits, updateReferralStatus, updateReferral,
  addVA, terminateVA, setEligibleVA, getHubstaffProjectMembers, getHubstaffOrgMembers,
  getHubstaffProjects, updateClient
} from '../../api/client'
import PipelineStage from '../../components/PipelineStage'
import VATimeline from '../../components/VATimeline'
import { statusBadge, formatDate, formatCurrency, PIPELINE_STATUSES } from '../../utils/format'

export default function ReferralDetail() {
  const { id } = useParams()
  const [referral, setReferral] = useState(null)
  const [credits, setCredits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modals
  const [showEditModal, setShowEditModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showAddVAModal, setShowAddVAModal] = useState(false)
  const [showTerminateModal, setShowTerminateModal] = useState(false)
  const [selectedVA, setSelectedVA] = useState(null)

  const [editForm, setEditForm] = useState({ referred_name: '', referred_company: '', referred_email: '', referred_phone: '', referred_website: '', referral_date: '' })
  const [editError, setEditError] = useState('')

  const [statusForm, setStatusForm] = useState({ status: '', notes: '', activation_date: '' })
  const [vaForm, setVAForm] = useState({ hubstaff_user_name: '', hubstaff_user_id: '', start_date: new Date().toISOString().split('T')[0] })
  const [projectMembers, setProjectMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [terminateForm, setTerminateForm] = useState({ end_date: new Date().toISOString().split('T')[0], pause_reason: 'VA terminated - sourcing replacement' })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const [ref, creds] = await Promise.all([getReferral(id), getReferralCredits(id)])
      setReferral(ref)
      setCredits(creds)
      setStatusForm((f) => ({ ...f, status: ref.status, activation_date: ref.activation_date || '' }))
    } catch {
      setError('Failed to load referral.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const [statusError, setStatusError] = useState('')

  const openEditModal = () => {
    setEditForm({
      referred_name: referral.referred_name || '',
      referred_company: referral.referred_company || '',
      referred_email: referral.referred_email || '',
      referred_phone: referral.referred_phone || '',
      referred_website: referral.referred_website || '',
      referral_date: referral.referral_date || '',
    })
    setEditError('')
    setShowEditModal(true)
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setEditError('')
    try {
      await updateReferral(id, {
        referred_name: editForm.referred_name || undefined,
        referred_company: editForm.referred_company || null,
        referred_email: editForm.referred_email || null,
        referred_phone: editForm.referred_phone || null,
        referred_website: editForm.referred_website || null,
        referral_date: editForm.referral_date || undefined,
      })
      await load()
      setShowEditModal(false)
    } catch (err) {
      setEditError(err?.response?.data?.detail || 'Failed to save changes.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusUpdate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setStatusError('')
    try {
      const payload = {
        ...statusForm,
        activation_date: statusForm.activation_date || null,
      }
      await updateReferralStatus(id, payload)
      await load()
      setShowStatusModal(false)
      // Auto-prompt Add VA modal when moving to Active
      if (payload.status === 'va_billing') {
        const updated = await getReferral(id)
        setTimeout(() => openAddVAModal(updated), 300)
      }
    } catch (err) {
      setStatusError(err?.response?.data?.detail || 'Failed to update status.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddVA = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await addVA(id, { ...vaForm, referral_id: id })
      await load()
      setShowAddVAModal(false)
      setVAForm({ hubstaff_user_name: '', hubstaff_user_id: '', start_date: new Date().toISOString().split('T')[0] })
      setProjectMembers([])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to add VA.')
    } finally {
      setSubmitting(false)
    }
  }

  const openAddVAModal = async (currentReferral) => {
    const ref = currentReferral || referral
    setVAForm({ hubstaff_user_name: '', hubstaff_user_id: '', start_date: new Date().toISOString().split('T')[0] })
    setProjectMembers([])
    setShowAddVAModal(true)
    setMembersLoading(true)
    try {
      let projectId = ref?.referred_client?.hubstaff_project_id

      // Auto-link project if client exists but no project is linked yet
      if (!projectId && ref?.referred_client?.id) {
        const clientName = (ref.referred_client.name || ref.referred_name || '').trim().toLowerCase()
        const firstWord = clientName.split(' ')[0]
        const projects = await getHubstaffProjects()
        const match =
          projects.find((p) => p.name.trim().toLowerCase() === clientName) ||
          projects.find((p) => firstWord && p.name.trim().toLowerCase().startsWith(firstWord))
        if (match) {
          await updateClient(ref.referred_client.id, {
            hubstaff_project_id: match.id,
            hubstaff_project_name: match.name,
          })
          projectId = match.id
          // Refresh referral so the link is reflected in state
          const updated = await getReferral(id)
          setReferral(updated)
        }
      }

      let members = []
      if (projectId) {
        members = await getHubstaffProjectMembers(projectId)
      }
      // Fall back to org members if project not linked or returned empty
      if (!members || members.length === 0) {
        members = await getHubstaffOrgMembers()
      }
      setProjectMembers(members.sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      // Fall back to manual entry
    } finally {
      setMembersLoading(false)
    }
  }

  const handleMemberSelect = (e) => {
    const memberId = e.target.value
    const member = projectMembers.find((m) => m.id === memberId)
    if (member) {
      setVAForm((f) => ({ ...f, hubstaff_user_name: member.name, hubstaff_user_id: member.id }))
    } else {
      setVAForm((f) => ({ ...f, hubstaff_user_name: '', hubstaff_user_id: '' }))
    }
  }

  const handleTerminate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await terminateVA(selectedVA.id, terminateForm)
      await load()
      setShowTerminateModal(false)
      setSelectedVA(null)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to terminate VA.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetEligible = async (vaId) => {
    try {
      await setEligibleVA(id, vaId)
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to set eligible VA.')
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 space-y-5">
        <div className="h-8 bg-gray-100 rounded w-48 animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!referral) {
    return (
      <div className="p-4 sm:p-8 text-center">
        <p className="text-gray-500">Referral not found.</p>
        <Link to="/internal/referrals" className="text-primary-600 hover:underline text-sm mt-2 inline-block">Back to Referrals</Link>
      </div>
    )
  }

  const badge = statusBadge(referral.status)
  const eligibleVA = referral.virtual_assistants?.find((v) => v.is_eligible && v.is_active)

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div>
          <Link to="/internal/referrals" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Referrals
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{referral.referred_name}</h1>
            <span className={`badge ${badge.className}`}>{badge.label}</span>
          </div>
          {referral.referred_email && <p className="text-gray-500 text-sm mt-0.5">{referral.referred_email}</p>}
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={openEditModal} className="btn-secondary">
            Edit Details
          </button>
          <button onClick={() => setShowStatusModal(true)} className="btn-primary">
            Update Status
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Pipeline Stepper */}
      <div className="card card-body">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline Progress</h2>
        <PipelineStage status={referral.status} />
      </div>

      {/* Contact Details */}
      <div className="card card-body">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Contact Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {referral.referred_company && (
            <div>
              <p className="text-xs text-gray-400">Company</p>
              <p className="text-gray-800 font-medium">{referral.referred_company}</p>
            </div>
          )}
          {referral.referred_email && (
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <a href={`mailto:${referral.referred_email}`} className="text-primary-600 hover:underline font-medium">{referral.referred_email}</a>
            </div>
          )}
          {referral.referred_phone && (
            <div>
              <p className="text-xs text-gray-400">Phone</p>
              <a href={`tel:${referral.referred_phone}`} className="text-gray-800 font-medium hover:text-primary-600">{referral.referred_phone}</a>
            </div>
          )}
          {referral.referred_website && (
            <div>
              <p className="text-xs text-gray-400">Website</p>
              <a href={referral.referred_website.startsWith('http') ? referral.referred_website : `https://${referral.referred_website}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">{referral.referred_website}</a>
            </div>
          )}
          {!referral.referred_company && !referral.referred_email && !referral.referred_phone && !referral.referred_website && (
            <p className="text-gray-400 italic text-sm col-span-3">No contact details provided.</p>
          )}
        </div>
        {referral.pipeline_notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Notes from referring client</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{referral.pipeline_notes}</p>
          </div>
        )}
      </div>

      {/* Client Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="card card-body space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Referring Client</h2>
          <p className="text-base font-medium text-gray-900">{referral.referring_client?.name ?? '—'}</p>
          <p className="text-sm text-gray-500">{referral.referring_client?.email ?? ''}</p>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Credits Earned</p>
              <p className="font-medium">{formatCurrency(referral.total_credits_earned)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Credits Applied</p>
              <p className="font-medium">{formatCurrency(referral.total_credits_applied)}</p>
            </div>
          </div>
        </div>

        <div className="card card-body space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Referred Client</h2>
          {referral.referred_client ? (
            <>
              <p className="text-base font-medium text-gray-900">{referral.referred_client.name}</p>
              {referral.referred_client.email && <p className="text-sm text-gray-500">{referral.referred_client.email}</p>}
            </>
          ) : ['contract_signed','va_hired','va_billing','active','paused','expired'].includes(referral.status) ? (
            <>
              <p className="text-base font-medium text-gray-900">{referral.referred_name}</p>
              <p className="text-xs text-gray-400 italic">Hubstaff profile created at VA Billing</p>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Not yet a client</p>
          )}
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Referral Date</p>
              <p className="font-medium">{formatDate(referral.referral_date)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Activation Date</p>
              <p className="font-medium">{formatDate(referral.activation_date)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* VA Timeline */}
      <div className="card card-body">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">12-Month Clock</h2>
          {eligibleVA && <span className="text-xs text-gray-500">Eligible VA: <strong>{eligibleVA.hubstaff_user_name}</strong></span>}
        </div>
        <VATimeline referral={referral} clockPeriods={[]} />
      </div>

      {/* Virtual Assistants */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Virtual Assistants</h2>
          <button onClick={openAddVAModal} className="btn-primary text-xs px-3 py-1.5">
            Add VA
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {referral.virtual_assistants?.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No VAs assigned yet.</div>
          ) : (
            referral.virtual_assistants?.map((va) => (
              <div key={va.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${va.is_eligible && va.is_active ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                    {va.hubstaff_user_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{va.hubstaff_user_name}</p>
                      {va.is_eligible && va.is_active && (
                        <span className="badge bg-primary-100 text-primary-700">Eligible</span>
                      )}
                      {!va.is_active && <span className="badge bg-gray-100 text-gray-500">Terminated</span>}
                    </div>
                    <p className="text-xs text-gray-400">
                      {formatDate(va.start_date)} {va.end_date ? `— ${formatDate(va.end_date)}` : '— present'}
                      {va.hubstaff_user_id && ` · HS ID: ${va.hubstaff_user_id}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!va.is_eligible && va.is_active && (
                    <button onClick={() => handleSetEligible(va.id)} className="btn-secondary text-xs px-2.5 py-1">
                      Set Eligible
                    </button>
                  )}
                  {va.is_active && (
                    <button
                      onClick={() => { setSelectedVA(va); setShowTerminateModal(true) }}
                      className="btn-danger text-xs px-2.5 py-1"
                    >
                      Terminate
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Credit History */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-base font-semibold text-gray-900">Credit History</h2>
        </div>
        {credits.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No credits recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Credit</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {credits.map((c) => {
                  const creditBadge = {
                    pending: 'bg-amber-100 text-amber-700',
                    applied: 'bg-green-100 text-green-700',
                    voided: 'bg-red-100 text-red-700',
                  }[c.status]
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-gray-700">{formatDate(c.period_start)} – {formatDate(c.period_end)}</td>
                      <td className="px-6 py-3">{Number(c.hours_worked).toFixed(2)}</td>
                      <td className="px-6 py-3 font-medium">{formatCurrency(c.credit_amount)}</td>
                      <td className="px-6 py-3"><span className={`badge ${creditBadge}`}>{c.status}</span></td>
                      <td className="px-6 py-3 text-gray-500">{c.qbo_invoice_id ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{formatDate(c.applied_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Edit Referral Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Edit Referral Details</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Contact Name</label>
                  <input type="text" className="input" required value={editForm.referred_name} onChange={(e) => setEditForm((f) => ({ ...f, referred_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Company</label>
                  <input type="text" className="input" placeholder="Acme Corp or N/A" value={editForm.referred_company} onChange={(e) => setEditForm((f) => ({ ...f, referred_company: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="email" className="input" placeholder="email@example.com" value={editForm.referred_email} onChange={(e) => setEditForm((f) => ({ ...f, referred_email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="tel" className="input" placeholder="(555) 000-0000" value={editForm.referred_phone} onChange={(e) => setEditForm((f) => ({ ...f, referred_phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" className="input" placeholder="example.com" value={editForm.referred_website} onChange={(e) => setEditForm((f) => ({ ...f, referred_website: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Referral Date</label>
                  <input type="date" className="input" required value={editForm.referral_date} onChange={(e) => setEditForm((f) => ({ ...f, referral_date: e.target.value }))} />
                </div>
              </div>
              {editError && (
                <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{editError}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">{submitting ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Update Status</h2>
              <button onClick={() => setShowStatusModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleStatusUpdate} className="p-6 space-y-4">
              <div>
                <label className="label">New Status</label>
                <select
                  className="input"
                  value={statusForm.status}
                  onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {PIPELINE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              {statusForm.status === 'va_billing' && (
                <div>
                  <label className="label">
                    Activation Date
                    <span className="text-gray-400 font-normal ml-1">(editable — when billing began)</span>
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={statusForm.activation_date}
                    onChange={(e) => setStatusForm((f) => ({ ...f, activation_date: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <label className="label">Notes (appended to log)</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Optional note about this status change…"
                  value={statusForm.notes}
                  onChange={(e) => setStatusForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              {statusError && (
                <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{statusError}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowStatusModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">{submitting ? 'Saving…' : 'Update'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add VA Modal */}
      {showAddVAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Add Virtual Assistant</h2>
              <button onClick={() => setShowAddVAModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddVA} className="p-6 space-y-4">
              {membersLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Loading project members from Hubstaff…
                </div>
              ) : projectMembers.length > 0 ? (
                <div>
                  <label className="label">Select VA from Hubstaff Project</label>
                  <select
                    className="input"
                    required
                    value={vaForm.hubstaff_user_id}
                    onChange={handleMemberSelect}
                  >
                    <option value="">Select a VA…</option>
                    {projectMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">VA Full Name</label>
                    <input
                      type="text"
                      className="input"
                      required
                      placeholder="Jane Smith"
                      value={vaForm.hubstaff_user_name}
                      onChange={(e) => setVAForm((f) => ({ ...f, hubstaff_user_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Hubstaff User ID (optional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. 1234567"
                      value={vaForm.hubstaff_user_id}
                      onChange={(e) => setVAForm((f) => ({ ...f, hubstaff_user_id: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={vaForm.start_date}
                  onChange={(e) => setVAForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddVAModal(false); setProjectMembers([]) }} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={submitting || membersLoading} className="btn-primary flex-1 justify-center">{submitting ? 'Adding…' : 'Add VA'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminate VA Modal */}
      {showTerminateModal && selectedVA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Terminate VA</h2>
              <button onClick={() => setShowTerminateModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleTerminate} className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Terminating <strong>{selectedVA.hubstaff_user_name}</strong>. If this is the eligible VA, the 12-month clock will be paused.</p>
              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={terminateForm.end_date}
                  onChange={(e) => setTerminateForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Pause Reason</label>
                <input
                  type="text"
                  className="input"
                  value={terminateForm.pause_reason}
                  onChange={(e) => setTerminateForm((f) => ({ ...f, pause_reason: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTerminateModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-danger flex-1 justify-center">{submitting ? 'Terminating…' : 'Terminate VA'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
