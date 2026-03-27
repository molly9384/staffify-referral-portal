import { useEffect, useState } from 'react'
import { getClients, createClient, updateClient, getHubstaffProjects } from '../../api/client'
import { formatDate } from '../../utils/format'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [projects, setProjects] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const emptyForm = {
    name: '',
    email: '',
    qbo_customer_id: '',
    hubstaff_project_id: '',
    hubstaff_project_name: '',
    is_active: true,
  }
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
    } catch {
      setError('Failed to load clients.')
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async () => {
    try {
      const ps = await getHubstaffProjects()
      setProjects(ps)
    } catch {
      // Projects are optional - don't block the modal
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingClient(null)
    setForm(emptyForm)
    setShowModal(true)
    loadProjects()
  }

  const openEdit = (client) => {
    setEditingClient(client)
    setForm({
      name: client.name,
      email: client.email,
      qbo_customer_id: client.qbo_customer_id || '',
      hubstaff_project_id: client.hubstaff_project_id || '',
      hubstaff_project_name: client.hubstaff_project_name || '',
      is_active: client.is_active,
    })
    setShowModal(true)
    loadProjects()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        qbo_customer_id: form.qbo_customer_id || null,
        hubstaff_project_id: form.hubstaff_project_id || null,
        hubstaff_project_name: form.hubstaff_project_name || null,
      }
      if (editingClient) {
        await updateClient(editingClient.id, payload)
      } else {
        await createClient(payload)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save client.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleProjectChange = (e) => {
    const pid = e.target.value
    const project = projects.find((p) => p.id === pid)
    setForm((f) => ({
      ...f,
      hubstaff_project_id: pid,
      hubstaff_project_name: project?.name || f.hubstaff_project_name,
    }))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 text-sm mt-1">Manage all Staffify clients.</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-sm text-gray-500">No clients yet. Add your first client.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">QBO ID</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hubstaff Project</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{client.name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{client.email}</td>
                    <td className="px-6 py-3.5 text-gray-500 font-mono text-xs">{client.qbo_customer_id || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-500">{client.hubstaff_project_name || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`badge ${client.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {client.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-400 text-xs">{formatDate(client.created_at)}</td>
                    <td className="px-6 py-3.5 text-right">
                      <button onClick={() => openEdit(client)} className="text-primary-600 hover:text-primary-700 font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">{editingClient ? 'Edit Client' : 'Add Client'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Company Name</label>
                  <input type="text" className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">Email</label>
                  <input type="email" className="input" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">QBO Customer ID</label>
                  <input type="text" className="input" placeholder="Optional" value={form.qbo_customer_id} onChange={(e) => setForm((f) => ({ ...f, qbo_customer_id: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Hubstaff Project</label>
                  <select className="input" value={form.hubstaff_project_id} onChange={handleProjectChange}>
                    <option value="">Select project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    {form.hubstaff_project_id && !projects.find((p) => p.id === form.hubstaff_project_id) && (
                      <option value={form.hubstaff_project_id}>{form.hubstaff_project_name || form.hubstaff_project_id}</option>
                    )}
                  </select>
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_active"
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">Client is active</label>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">{submitting ? 'Saving…' : 'Save Client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
