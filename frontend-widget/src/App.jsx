import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

function getToken() {
  return new URLSearchParams(window.location.search).get('token') || ''
}

// ── Individual hours card ─────────────────────────────────────────────────────
function HoursCard({ block, accent }) {
  const hasVAs = block.by_va && block.by_va.length > 0

  const accentStyles = {
    today:   { bar: 'bg-primary-600', text: 'text-primary-700', light: 'bg-primary-50', dot: 'bg-primary-400' },
    week:    { bar: 'bg-primary-500', text: 'text-primary-700', light: 'bg-primary-50', dot: 'bg-primary-400' },
    period:  { bar: 'bg-primary-700', text: 'text-primary-800', light: 'bg-primary-50', dot: 'bg-primary-500' },
  }
  const s = accentStyles[accent] || accentStyles.today

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Colored top bar */}
      <div className={`${s.bar} px-5 py-4`}>
        <p className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-1">
          {block.label}
        </p>
        <p className="text-white text-3xl font-bold leading-none">
          {block.total_formatted}
        </p>
        {block.total_seconds === 0 && (
          <p className="text-white/60 text-xs mt-1">No hours tracked yet</p>
        )}
      </div>

      {/* VA breakdown — always visible */}
      {hasVAs && (
        <div className="divide-y divide-gray-50">
          {block.by_va.map((va) => (
            <div key={va.name} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-7 h-7 rounded-full ${s.light} flex-shrink-0 flex items-center justify-center`}>
                  <span className={`${s.text} text-xs font-bold`}>
                    {va.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-700 truncate">{va.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <span className={`text-sm font-bold ${s.text}`}>{va.formatted}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function App() {
  const token = getToken()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/widget/hours?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Error ${res.status}`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e.message || 'Failed to load hours.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans bg-gray-50">
        <p className="text-sm text-gray-400">This widget must be opened from Assembly.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-sm font-bold text-gray-900 tracking-wide uppercase">
            VA Hours
            {data?.client_name && (
              <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">
                — {data.client_name}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {loading && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden shadow-sm">
                <div className="h-20 bg-primary-200 animate-pulse" />
                <div className="bg-white p-4 space-y-3">
                  {[1, 2].map((j) => (
                    <div key={j} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 px-5 py-4">
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <button
              onClick={load}
              className="mt-2 text-xs font-semibold text-red-500 hover:text-red-700 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <HoursCard block={data.today} accent="today" />
            <HoursCard block={data.this_week} accent="week" />
            <HoursCard block={data.billing_period} accent="period" />
          </>
        )}
      </div>
    </div>
  )
}
