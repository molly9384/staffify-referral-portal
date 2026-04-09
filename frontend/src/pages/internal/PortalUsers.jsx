import { useEffect, useState } from 'react'
import { getPortalUsers, deletePortalUser } from '../../api/client'
import apiClient from '../../api/client'
import { formatDate } from '../../utils/format'

export default function PortalUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('active') // 'active' | 'archived'
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
    const matchesTab = tab === 'active' ? u.is_active : !u.is_active
    const q = search.toLowerCase()
    const matchesSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.client_name || '').toLowerCase().includes(q)
    return matchesTab && matchesSearch
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

  const activeCount = users.filter((u) => u.is_active).length
  const archivedCount = users.filter((u) => !u.is_active).length

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Client Portal Users</h1>
        <p className="text-gray-500 text-sm mt-1">Manage client portal accounts. Archive preserves all referral and credit data.</p>
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
          placeholder="Search by name, email, or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[
          { key: 'active', label: 'Active', count: activeCount },
          { key: 'archived', label: 'Archived', count: archivedCount },
        ].map((t) => (
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
              {search ? 'No users match your search.' : tab === 'active' ? 'No active portal users.' : 'No archived users.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{u.full_name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{u.email}</td>
                    <td className="px-6 py-3.5 text-gray-500">{u.client_name || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-3.5 text-right flex items-center justify-end gap-4">
                      {tab === 'active' ? (
                        <button
                          onClick={() => handleArchive(u.id)}
                          disabled={actionUserId === u.id}
                          className="text-amber-600 hover:text-amber-700 font-medium text-sm disabled:opacity-40"
                        >
                          {actionUserId === u.id ? 'Archiving…' : 'Archive'}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestore(u.id)}
                            disabled={actionUserId === u.id}
                            className="text-primary-600 hover:text-primary-700 font-medium text-sm disabled:opacity-40"
                          >
                            {actionUserId === u.id ? 'Restoring…' : 'Restore'}
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={actionUserId === u.id}
                            className="text-red-500 hover:text-red-700 font-medium text-sm disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      )}
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
