import { useEffect, useState } from 'react'
import { getClients, createClient, updateClient, deleteClient, getHubstaffProjects, lookupQBOCustomer } from '../../api/client'
import { formatDate } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'

export default function Clients() {
  const { isOwner } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [deletingClient, setDeletingClient] = useState(null)
  const [projects, setProjects] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [qboLooking, setQboLooking] = useState(false)
  const [qboStatus, setQboStatus] = useState('') // 'found' | 'not_found' | ''

  const emptyForm = {
    name: '',
    email: '',
    qbo_customer_id: '',
    hubstaff_project_id: '',
    hubstaff_project_name: '',
    assembly_company_id: '',
    is_active: true,
  }
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients([...data].sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setError('Failed to load clients.')
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async () => {
    try {
      const ps = await getHubstaffProjects()
      setProjects([...ps].sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      // Projects are optional - don't block the modal
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingClient(null)
    setForm(emptyForm)
    setQboStatus('')
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
      assembly_company_id: client.assembly_company_id || '',
      is_active: client.is_active,
    })
    setQboStatus(client.qbo_customer_id ? 'found' : '')
    setShowModal(true)
    loadProjects()
  }

  const handleDelete = async () => {
    if (!deletingClient) return
    setSubmitting(true)
    try {
      await deleteClient(deletingClient.id)
      setDeletingClient(null)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to delete client.')
      setDeletingClient(null)
    } finally {
      setSubmitting(false)
    }
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
        assembly_company_id: form.assembly_company_id || null,
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

  const handleProjectChange = async (e) => {
    const pid = e.target.value
    const project = projects.find((p) => p.id === pid)
    const projectName = project?.name || ''

    // If editing and re-selecting the same project (by ID or name), preserve existing QBO data
    const sameAsOriginal =
      editingClient && (
        pid === editingClient.hubstaff_project_id ||
        projectName.trim().toLowerCase() === (editingClient.name || '').trim().toLowerCase()
      )
    if (sameAsOriginal && editingClient.qbo_customer_id) {
      setForm((f) => ({
        ...f,
        hubstaff_project_id: pid,
        hubstaff_project_name: projectName,
        name: projectName,
        qbo_customer_id: editingClient.qbo_customer_id,
        email: editingClient.email || '',
      }))
      setQboStatus('found')
      return
    }

    setForm((f) => ({
      ...f,
      hubstaff_project_id: pid,
      hubstaff_project_name: projectName,
      name: projectName,
      // Reset QBO fields until lookup completes
      qbo_customer_id: '',
      email: '',
    }))
    setQboStatus('')

    if (!projectName) return

    // Auto-lookup QBO customer by name
    setQboLooking(true)
    try {
      const result = await lookupQBOCustomer(projectName)
      if (result.found) {
        setForm((f) => ({
          ...f,
          qbo_customer_id: result.customer.id,
          email: result.customer.email || '',
        }))
        setQboStatus('found')
      } else {
        setQboStatus('not_found')
      }
    } catch {
      setQboStatus('not_found')
    } finally {
      setQboLooking(false)
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 text-sm mt-1">Manage all Staffify clients.</p>
        </div>
        <button onClick={openCreate} className="btn-primary self-start sm:self-auto">
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
                    <td className="px-6 py-3.5 text-right flex items-center justify-end gap-4">
                      <button onClick={() => openEdit(client)} className="text-primary-600 hover:text-primary-700 font-medium text-sm">
                        Edit
                      </button>
                      {isOwner && (
                        <button onClick={() => setDeletingClient(client)} className="text-red-500 hover:text-red-700 font-medium text-sm">
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirm Modal */}
      {deletingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Delete Client</h2>
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <strong>{deletingClient.name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setDeletingClient(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleDelete} disabled={submitting} className="btn-danger flex-1 justify-center">
                {submitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <label className="label">Hubstaff Project</label>
                  <select className="input" required value={form.hubstaff_project_id} onChange={handleProjectChange}>
                    <option value="">Select a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    {form.hubstaff_project_id && !projects.find((p) => p.id === form.hubstaff_project_id) && (
                      <option value={form.hubstaff_project_id}>{form.hubstaff_project_name || form.hubstaff_project_id}</option>
                    )}
                  </select>
                </div>

                {/* QBO lookup status */}
                {qboLooking && (
                  <div className="col-span-2 flex items-center gap-2 text-xs text-gray-500">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Looking up QuickBooks customer…
                  </div>
                )}
                {!qboLooking && qboStatus === 'found' && (
                  <div className="col-span-2 flex items-center gap-2 text-xs text-green-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    QuickBooks customer matched — ID and email auto-filled
                  </div>
                )}
                {!qboLooking && qboStatus === 'not_found' && (
                  <div className="col-span-2 flex items-center gap-2 text-xs text-amber-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    No QBO customer found with this name — you can enter the ID manually below
                  </div>
                )}

                <div>
                  <label className="label">QBO Customer ID <span className="text-gray-400 font-normal">(auto-filled)</span></label>
                  <input type="text" className="input" placeholder="Auto-filled from QBO" value={form.qbo_customer_id} onChange={(e) => setForm((f) => ({ ...f, qbo_customer_id: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email <span className="text-gray-400 font-normal">(auto-filled)</span></label>
                  <input type="email" className="input" placeholder="Auto-filled from QBO" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>

                <div className="col-span-2">
                  <label className="label">
                    Assembly Company ID
                    <span className="text-gray-400 font-normal ml-1">(for hours widget)</span>
                  </label>
                  <input
                    type="text"
                    className="input font-mono"
                    placeholder="e.g. comp_abc123"
                    value={form.assembly_company_id}
                    onChange={(e) => setForm((f) => ({ ...f, assembly_company_id: e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Found in Assembly → Company Settings → Company ID. Required for the hours &amp; invoices widget.
                  </p>
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
                <button type="submit" disabled={submitting || qboLooking} className="btn-primary flex-1 justify-center">{submitting ? 'Saving…' : 'Save Client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
