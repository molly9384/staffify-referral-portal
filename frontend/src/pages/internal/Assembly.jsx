import { useState } from 'react'
import { syncVas } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function AssemblyPage() {
  const { user } = useAuth()
  const [vasRunning, setVasRunning] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')

  const isOwner = user?.role === 'owner'

  if (!isOwner) {
    return (
      <div className="p-8">
        <p className="text-gray-500 text-sm">You don't have permission to view this page.</p>
      </div>
    )
  }

  const handleSyncVas = async () => {
    setVasRunning(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await syncVas()
      setSuccessMsg(result.message || 'VA sync completed successfully.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'VA sync failed.')
    } finally {
      setVasRunning(false)
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Assembly</h1>
        <p className="text-gray-500 text-sm mt-1">Manage Assembly integrations and sync settings.</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}
      {successMsg && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{successMsg}</div>
      )}

      {/* VA Sync */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-base font-semibold text-gray-900">VA Sync</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Syncs Hubstaff project members to the "Current VA(s)" field on each Assembly company. Runs automatically every 15 minutes.
          </p>
        </div>
        <div className="card-body">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-gray-600 space-y-1.5">
              <p><span className="font-medium text-gray-700">Active VAs assigned</span> → comma-separated names</p>
              <p><span className="font-medium text-gray-700">Project exists, no VAs</span> → <em>*Sourcing Replacement*</em></p>
              <p><span className="font-medium text-gray-700">No Hubstaff project</span> → <em>*New Client - Sourcing*</em></p>
              <p className="text-xs text-gray-400 pt-1">Skips: Staffify (internal), Patrick - Hephaestus Innovation</p>
            </div>
            <button
              onClick={handleSyncVas}
              disabled={vasRunning}
              className="btn-secondary flex-shrink-0 flex items-center gap-2"
            >
              {vasRunning ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {vasRunning ? 'Syncing…' : 'Sync VAs Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
