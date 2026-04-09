import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPortalUsers, deletePortalUser, sendInvite, getClients, impersonateUser } from '../../api/client'
import apiClient from '../../api/client'
import { formatDate } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'

const INTERNAL_ROLES = ['owner', 'admin', 'staff']

const ROLE_OPTIONS_OWNER = [
  { value: 'client', label: 'Client' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]
const ROLE_OPTIONS_ADMIN = [
  { value: 'client', label: 'Client' },
]

export default function PortalUsers() {
  const { isOwner, startImpersonation } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('clients') // 'clients' | 'internal' | 'archived'
  const [actionUserId, setActionUserId] = useState(null)

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'client', client_id: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteError, setInviteError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [data, cls] = await Promise.all([getPortalUsers(), getClients()])
      setUsers(data)
      setClients(cls)
    } catch {
      setError('Failed to load portal users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openInvite = () => {
    setInviteForm({ email: '', full_name: '', role: 'client', client_id: '' })
    setInviteError('')
    setInviteSuccess('')
    setShowInvite(true)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    try {
      const payload = {
        email: inviteForm.email,
        full_name: inviteForm.full_name || null,
        role: inviteForm.role,
        client_id: inviteForm.client_id || null,
      }
      await sendInvite(payload)
      setInviteSuccess(`Invitation sent to ${inviteForm.email}!`)
      setInviteForm({ email: '', full_name: '', role: 'client', client_id: '' })
    } catch (err) {
      setInviteError(err?.response?.data?.detail || 'Failed to send invite.')
    } finally {
      setInviting(false)
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    const matchesSearch = !q
      || u.full_name.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || (u.client_name || '').toLowerCase().includes(q)
      || (u.role || '').toLowerCase().includes(q)

    if (tab === 'clients') return u.is_active && u.role === 'client' && matchesSearch
    if (tab === 'internal') return u.is_active && INTERNAL_ROLES.includes(u.role) && matchesSearch
    if (tab === 'archived') return !u.is_active && matchesSearch
    return false
  })

  const handleArchive = async (userId) => {
    setActionUserId(userId)
    try {
      await apiClient.patch(`/auth/portal-users/${userId}/archive`)
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: false } : u))
    } catch {
      setError('Failed to archive user.')
    } finally {
      setActionUserId(null)
    }
  }

  const handleRestore = async (userId) => {
    setActionUserId(userId)
    try {
      await apiClient.patch(`/auth/portal-users/${userId}/restore`)
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: true } : u))
    } catch {
      setError('Failed to restore user.')
    } finally {
      setActionUserId(null)
    }
  }

  const handleDelete = async (userId) => {
    if (!window.confirm('Permanently delete this user? This cannot be undone.')) return
    setActionUserId(userId)
    try {
      await deletePortalUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch {
      setError('Failed to delete user.')
    } finally {
      setActionUserId(null)
    }
  }

  const clientCount = users.filter((u) => u.is_active && u.role === 'client').length
  const internalCount = users.filter((u) => u.is_active && INTERNAL_ROLES.includes(u.role)).length
  const archivedCount = users.filter((u) => !u.is_active).length

  const handleViewAsClient = async (userId) => {
    try {
      const data = await impersonateUser(userId)
      startImpersonation(data)
      navigate('/client/dashboard')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not start client view.')
    }
  }

  const roleBadgeClass = (role) => ({
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-blue-100 text-blue-700',
    staff: 'bg-gray-100 text-gray-600',
    client: 'bg-green-100 text-green-700',
  }[role] || 'bg-gray-100 text-gray-500')

  const tabs = [
    { key: 'clients', label: 'Clients', count: clientCount },
    { key: 'internal', label: 'Internal Users', count: internalCount },
    { key: 'archived', label: 'Archived', count: archivedCount },
  ]

  const emptyMessages = {
    clients: 'No active client accounts.',
    internal: 'No internal users yet.',
    archived: 'No archived users.',
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portal Users</h1>
          <p className="text-gray-500 text-sm mt-1">Manage all portal accounts. Archive preserves all referral and credit data.</p>
        </div>
        <button onClick={openInvite} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Invite User
        </button>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          className="input pl-9"
          placeholder="Search by name, email, company, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${tab === t.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">
              {search ? 'No users match your search.' : emptyMessages[tab]}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  {tab === 'clients' && (
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                  )}
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{u.full_name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{u.email}</td>
                    {tab === 'clients' && (
                      <td className="px-6 py-3.5 text-gray-500">{u.client_name || '—'}</td>
                    )}
                    <td className="px-6 py-3.5">
                      <span className={`badge capitalize ${roleBadgeClass(u.role)}`}>{u.role}</span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-4">
                        {tab === 'archived' ? (
                          <>
                            <button
                              onClick={() => handleRestore(u.id)}
                              disabled={actionUserId === u.id}
                              className="text-primary-600 hover:text-primary-700 font-medium text-sm disabled:opacity-40"
                            >
                              {actionUserId === u.id ? 'Restoring…' : 'Restore'}
                            </button>
                            {isOwner && (
                              <button
                                onClick={() => handleDelete(u.id)}
                                disabled={actionUserId === u.id}
                                className="text-red-500 hover:text-red-700 font-medium text-sm disabled:opacity-40"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {u.role === 'client' && (
                              <button
                                onClick={() => handleViewAsClient(u.id)}
                                className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                              >
                                View as Client
                              </button>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => handleArchive(u.id)}
                                disabled={actionUserId === u.id}
                                className="text-amber-600 hover:text-amber-700 font-medium text-sm disabled:opacity-40"
                              >
                                {actionUserId === u.id ? 'Archiving…' : 'Archive'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Invite User</h2>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteSuccess ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">{inviteSuccess}</p>
                <p className="text-xs text-gray-500">They'll receive an email with a link to set their password. The invite expires in 7 days.</p>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setInviteSuccess(''); }} className="btn-secondary flex-1 justify-center">Send Another</button>
                  <button onClick={() => setShowInvite(false)} className="btn-primary flex-1 justify-center">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="p-6 space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    className="input"
                    required
                    placeholder="name@example.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Full Name <span className="text-gray-400 font-normal">(optional — they can fill this in)</span></label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Jane Smith"
                    value={inviteForm.full_name}
                    onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select
                    className="input"
                    required
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value, client_id: '' }))}
                  >
                    {(isOwner ? ROLE_OPTIONS_OWNER : ROLE_OPTIONS_ADMIN).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {inviteForm.role === 'client' && (
                  <div>
                    <label className="label">Link to Client <span className="text-gray-400 font-normal">(optional)</span></label>
                    <select
                      className="input"
                      value={inviteForm.client_id}
                      onChange={(e) => setInviteForm((f) => ({ ...f, client_id: e.target.value }))}
                    >
                      <option value="">Select a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary flex-1 justify-center">
                    Cancel
                  </button>
                  <button type="submit" disabled={inviting} className="btn-primary flex-1 justify-center">
                    {inviting ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
