import { useEffect, useState } from 'react'
import { getPortalUsers, deletePortalUser } from '../../api/client'
import apiClient from '../../api/client'
import { formatDate } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'

const INTERNAL_ROLES = ['owner', 'admin', 'staff']

export default function PortalUsers() {
  const { isOwner } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('clients') // 'clients' | 'internal' | 'archived'
  const [actionUserId, setActionUserId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getPortalUsers()
      setUsers(data)
    } catch {
      setError('Failed to load portal users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Portal Users</h1>
        <p className="text-gray-500 text-sm mt-1">Manage all portal accounts. Archive preserves all referral and credit data.</p>
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
                          isOwner && (
                            <button
                              onClick={() => handleArchive(u.id)}
                              disabled={actionUserId === u.id}
                              className="text-amber-600 hover:text-amber-700 font-medium text-sm disabled:opacity-40"
                            >
                              {actionUserId === u.id ? 'Archiving…' : 'Archive'}
                            </button>
                          )
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
    </div>
  )
}
