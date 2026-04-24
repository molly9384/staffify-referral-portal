import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''
const REFRESH_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

function getToken() {
  return new URLSearchParams(window.location.search).get('token') || ''
}

// Distinct avatar colors — assigned per VA name so they stay consistent across all three cards
const AVATAR_PALETTE = [
  { bg: 'bg-sky-100',     text: 'text-sky-700'     },
  { bg: 'bg-violet-100',  text: 'text-violet-700'   },
  { bg: 'bg-emerald-100', text: 'text-emerald-700'  },
  { bg: 'bg-amber-100',   text: 'text-amber-700'    },
  { bg: 'bg-rose-100',    text: 'text-rose-700'     },
  { bg: 'bg-orange-100',  text: 'text-orange-700'   },
  { bg: 'bg-indigo-100',  text: 'text-indigo-700'   },
  { bg: 'bg-teal-100',    text: 'text-teal-700'     },
]

// Card accent styles — each period gets its own distinct color
const ACCENT_STYLES = {
  today:  { bar: 'bg-primary-600',  text: 'text-primary-700'  },
  week:   { bar: 'bg-teal-500',     text: 'text-teal-700'     },
  period: { bar: 'bg-purple-400',   text: 'text-purple-700'   },
}

// ── Individual hours card ─────────────────────────────────────────────────────
function HoursCard({ block, accent, vaColorMap }) {
  const hasVAs = block.by_va && block.by_va.length > 0
  const s = ACCENT_STYLES[accent] || ACCENT_STYLES.today

  // Split "Today (Thursday, April 23)" → title: "TODAY", sub: "(Thursday, April 23)"
  // Split "This Week (Mon Apr 20 – today)" → title: "THIS WEEK", sub: "(Mon Apr 20 – today)"
  const parenIdx = block.label.indexOf(' (')
  const headerTitle = (parenIdx >= 0 ? block.label.slice(0, parenIdx) : block.label).toUpperCase()
  const headerSub   = parenIdx >= 0 ? block.label.slice(parenIdx + 1) : ''

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Colored top bar */}
      <div className={`${s.bar} px-5 py-4`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-white text-xs font-bold uppercase tracking-widest">{headerTitle}</span>
          {headerSub && (
            <span className="text-white/65 text-xs font-medium tracking-normal normal-case">{headerSub}</span>
          )}
        </div>
        <p className="text-white text-3xl font-bold leading-none">
          {block.total_formatted}
        </p>
        {block.total_seconds === 0 && (
          <p className="text-white/60 text-xs mt-1">No hours tracked yet</p>
        )}
      </div>

      {/* VA breakdown + daily avg footer */}
      {(hasVAs || block.daily_avg_formatted) && (
        <div className="divide-y divide-gray-50">
          {block.by_va.map((va) => {
            const avatar = vaColorMap[va.name] || AVATAR_PALETTE[0]
            return (
              <div key={va.name} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-7 h-7 rounded-full ${avatar.bg} flex-shrink-0 flex items-center justify-center`}>
                    <span className={`${avatar.text} text-xs font-bold`}>
                      {va.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 truncate">{va.name}</span>
                </div>
                <span className={`text-xs font-bold flex-shrink-0 ml-4 ${s.text}`}>{va.formatted}</span>
              </div>
            )
          })}

          {/* Daily average footer row */}
          {block.daily_avg_formatted && (
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50/70">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-500">Daily average</span>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ml-4 ${s.text}`}>
                {block.daily_avg_formatted}/day
              </span>
            </div>
          )}
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
  const [noProject, setNoProject] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!token) return
    if (!silent) setLoading(true)
    setError('')
    setNoProject(false)
    try {
      // Pass the client's local date so the UTC server uses the viewer's actual day
      const localDate = new Date().toLocaleDateString('en-CA') // → "YYYY-MM-DD"
      const res = await fetch(`${API_BASE}/api/widget/hours?token=${encodeURIComponent(token)}&local_date=${localDate}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 404) {
          setNoProject(true)
          setLoading(false)
          return
        }
        throw new Error(body.detail || `Error ${res.status}`)
      }
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message || 'Failed to load hours.')
    } finally {
      setLoading(false)
    }
  }, [token])

  // Initial load
  useEffect(() => { load() }, [load])

  // Auto-refresh every 15 minutes (silent — no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => load(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  // Build a stable VA → avatar-color map from all unique names across all three cards
  const vaColorMap = (() => {
    if (!data) return {}
    const names = [
      ...(data.today?.by_va || []),
      ...(data.this_week?.by_va || []),
      ...(data.billing_period?.by_va || []),
    ].map(v => v.name)
    const unique = [...new Set(names)].sort()
    return Object.fromEntries(unique.map((name, i) => [name, AVATAR_PALETTE[i % AVATAR_PALETTE.length]]))
  })()

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null

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
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
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
        <img src="/logo.png" alt="Staffify" className="h-5" />
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {loading && (
          <>
            {[
              'bg-primary-200',
              'bg-teal-200',
              'bg-purple-200',
            ].map((color, i) => (
              <div key={i} className="rounded-2xl overflow-hidden shadow-sm">
                <div className={`h-20 ${color} animate-pulse`} />
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
              onClick={() => load()}
              className="mt-2 text-xs font-semibold text-red-500 hover:text-red-700 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {noProject && (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-gray-900">Your VA hours will appear here</h2>
              <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                Once you've made your first hire, you'll be able to track your VA's hours right here in real time.
              </p>
            </div>
            <a
              href="https://gostaffify.com"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              Learn more about hiring a VA
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <HoursCard block={data.today}          accent="today"  vaColorMap={vaColorMap} />
            <HoursCard block={data.this_week}       accent="week"   vaColorMap={vaColorMap} />
            <HoursCard block={data.billing_period}  accent="period" vaColorMap={vaColorMap} />

            {/* Last updated timestamp */}
            {formattedTime && (
              <p className="text-right text-xs text-gray-400 px-1 pt-0.5">
                Updated at {formattedTime} · refreshes every 15 min
              </p>
            )}

            {/* Disclaimer */}
            <p className="text-center text-xs text-gray-400 italic px-2 pt-1 pb-2 leading-relaxed">
              *Hours shown are based on Hubstaff time tracking and may be adjusted if a VA needs to correct a missed start/stop. For the most up-to-date data, check Hubstaff directly. Hour corrections must be submitted by Thursday at 7PM EST prior to billing.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
