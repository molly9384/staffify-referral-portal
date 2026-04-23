import { useState, useEffect, useCallback } from 'react'

// API base: use env var in prod, fall back to relative path (dev proxy)
const API_BASE = import.meta.env.VITE_API_URL || ''

function getToken() {
  return new URLSearchParams(window.location.search).get('token') || ''
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    paid:    'bg-green-100 text-green-700',
    sent:    'bg-blue-100 text-blue-700',
    draft:   'bg-gray-100 text-gray-600',
    overdue: 'bg-red-100 text-red-700',
    void:    'bg-gray-100 text-gray-400',
    voided:  'bg-gray-100 text-gray-400',
  }
  const cls = map[(status || '').toLowerCase()] ?? 'bg-gray-100 text-gray-500'
  const label = status
    ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
    : '—'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ── Hours block card ──────────────────────────────────────────────────────────
function HoursCard({ block }) {
  const [expanded, setExpanded] = useState(false)
  const hasVAs = block.by_va && block.by_va.length > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{block.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{block.total_formatted}</p>
        </div>
        {hasVAs && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {expanded && hasVAs && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {block.by_va.map((va) => (
            <div key={va.name} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center">
                  <span className="text-primary-700 text-xs font-semibold">
                    {va.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-gray-700 truncate">{va.name}</span>
              </div>
              <span className="text-sm font-medium text-gray-900 ml-4 flex-shrink-0">{va.formatted}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Hours tab ─────────────────────────────────────────────────────────────────
function HoursTab({ token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
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

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button onClick={load} className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium">
          Try again
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="p-4 space-y-3">
      <HoursCard block={data.today} />
      <HoursCard block={data.this_week} />
      <HoursCard block={data.billing_period} />
      <p className="text-center text-xs text-gray-400 pt-1">
        Tap any card to see hours by VA
      </p>
    </div>
  )
}

// ── Invoices tab ──────────────────────────────────────────────────────────────
function InvoicesTab({ token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/widget/invoices?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Error ${res.status}`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e.message || 'Failed to load invoices.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const handleDownload = (invoiceId, invoiceNumber) => {
    const url = `${API_BASE}/api/widget/invoices/${invoiceId}/pdf?token=${encodeURIComponent(token)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const formatDate = (str) => {
    if (!str) return '—'
    try {
      return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return str
    }
  }

  const formatAmount = (amount, currency) => {
    if (amount == null) return '—'
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    if (isNaN(num)) return amount
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(num)
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button onClick={load} className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium">
          Try again
        </button>
      </div>
    )
  }

  if (!data) return null

  const invoices = data.invoices || []

  if (invoices.length === 0) {
    return (
      <div className="p-8 text-center">
        <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14H6a3 3 0 01-3-3V6a3 3 0 013-3h12a3 3 0 013 3v5a3 3 0 01-3 3h-3m-3 4l-3-3m0 0l3-3m-3 3h12" />
        </svg>
        <p className="text-sm text-gray-500">No invoices found.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-2">
      {invoices.map((inv) => {
        const isOpen = expanded === inv.id
        return (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Invoice row */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded(isOpen ? null : inv.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{inv.number}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(inv.date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-gray-900">{formatAmount(inv.total, inv.currency)}</p>
                {inv.due_date && (
                  <p className="text-xs text-gray-400">Due {formatDate(inv.due_date)}</p>
                )}
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                {/* Line items */}
                {inv.line_items && inv.line_items.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
                    <div className="space-y-1.5">
                      {inv.line_items.map((li, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-700">{li.description}</p>
                            {li.hours != null && (
                              <p className="text-xs text-gray-400">{li.hours} hrs</p>
                            )}
                          </div>
                          {li.amount != null && (
                            <p className="text-sm font-medium text-gray-900 flex-shrink-0">
                              {formatAmount(li.amount, inv.currency)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Download PDF button */}
                <button
                  onClick={() => handleDownload(inv.id, inv.number)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const token = getToken()
  const [tab, setTab] = useState('hours')

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans">
        <div className="text-center">
          <p className="text-sm text-gray-500">No token provided. This widget must be opened from Assembly.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setTab('hours')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'hours'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Hours
            </div>
          </button>
          <button
            onClick={() => setTab('invoices')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'invoices'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14H6a3 3 0 01-3-3V6a3 3 0 013-3h12a3 3 0 013 3v5a3 3 0 01-3 3h-3m-3 4l-3-3m0 0l3-3m-3 3h12" />
              </svg>
              Invoices
            </div>
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'hours' && <HoursTab token={token} />}
      {tab === 'invoices' && <InvoicesTab token={token} />}
    </div>
  )
}
