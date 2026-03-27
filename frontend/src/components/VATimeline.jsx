import { differenceInDays, parseISO } from 'date-fns'

const TOTAL_DAYS = 365

function parseDateSafe(d) {
  if (!d) return null
  if (d instanceof Date) return d
  return parseISO(d)
}

export default function VATimeline({ referral, clockPeriods = [] }) {
  const activationDate = parseDateSafe(referral?.activation_date)
  const today = new Date()

  if (!activationDate) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
        <p className="text-sm text-gray-500">12-month clock not started — waiting for first paid invoice.</p>
      </div>
    )
  }

  // Calculate segments from clock periods
  let segments = []
  let totalActiveDays = 0

  if (clockPeriods && clockPeriods.length > 0) {
    // Use clock periods to build the timeline
    const sortedPeriods = [...clockPeriods].sort(
      (a, b) => new Date(a.period_start) - new Date(b.period_start)
    )

    for (let i = 0; i < sortedPeriods.length; i++) {
      const period = sortedPeriods[i]
      const start = parseDateSafe(period.period_start)
      const end = period.period_end ? parseDateSafe(period.period_end) : today
      const days = Math.max(0, differenceInDays(end, start))
      totalActiveDays += days

      segments.push({ type: 'active', days, paused: false, va: period.va_id })

      // Gap between this period's end and next period's start = paused
      if (i < sortedPeriods.length - 1 && period.period_end) {
        const nextStart = parseDateSafe(sortedPeriods[i + 1].period_start)
        const gapDays = Math.max(0, differenceInDays(nextStart, parseDateSafe(period.period_end)))
        if (gapDays > 0) {
          segments.push({ type: 'paused', days: gapDays })
        }
      }
    }
  } else {
    // Fallback: just show elapsed days since activation
    const elapsed = differenceInDays(today, activationDate)
    totalActiveDays = Math.min(elapsed, TOTAL_DAYS)
    segments = [{ type: 'active', days: totalActiveDays }]
  }

  const remainingDays = Math.max(0, TOTAL_DAYS - totalActiveDays)
  const isExpired = totalActiveDays >= TOTAL_DAYS

  // Build bar segments as percentages
  const barSegments = segments.map((seg) => ({
    ...seg,
    pct: (seg.days / TOTAL_DAYS) * 100,
  }))

  // Add remaining
  if (!isExpired) {
    barSegments.push({ type: 'remaining', days: remainingDays, pct: (remainingDays / TOTAL_DAYS) * 100 })
  }

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex h-5 rounded-full overflow-hidden w-full bg-gray-100">
        {barSegments.map((seg, i) => (
          <div
            key={i}
            style={{ width: `${Math.min(seg.pct, 100)}%` }}
            className={`h-full transition-all ${
              seg.type === 'active'
                ? 'bg-primary-500'
                : seg.type === 'paused'
                ? 'bg-amber-400'
                : 'bg-gray-100'
            }`}
            title={
              seg.type === 'active'
                ? `${seg.days} active days`
                : seg.type === 'paused'
                ? `${seg.days} paused days`
                : `${seg.days} days remaining`
            }
          />
        ))}
      </div>

      {/* Legend + stats */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-500 inline-block" />
            Active ({totalActiveDays} days)
          </span>
          {segments.some((s) => s.type === 'paused') && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              Paused
            </span>
          )}
        </div>
        {isExpired ? (
          <span className="font-medium text-red-600">Window expired</span>
        ) : (
          <span className="font-medium text-gray-700">{remainingDays} days remaining</span>
        )}
      </div>

      {/* Dates */}
      <div className="flex justify-between text-xs text-gray-400">
        <span>Started {activationDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>
          Expires{' '}
          {new Date(activationDate.getTime() + TOTAL_DAYS * 86400000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}
