export default function CreditSummary({ summary, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5">
            <div className="h-4 bg-gray-100 rounded animate-pulse w-24 mb-3" />
            <div className="h-7 bg-gray-100 rounded animate-pulse w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (!summary) return null

  const items = [
    {
      label: 'Total Earned',
      value: `$${Number(summary.total_earned).toFixed(2)}`,
      color: 'text-primary-600',
    },
    {
      label: 'Pending',
      value: `$${Number(summary.total_pending).toFixed(2)}`,
      sub: `${summary.pending_count} credit${summary.pending_count !== 1 ? 's' : ''} — awaiting Hubstaff payment`,
      color: 'text-amber-600',
    },
    {
      label: 'Eligible to Apply',
      value: `$${Number(summary.total_eligible).toFixed(2)}`,
      sub: `${summary.eligible_count} credit${summary.eligible_count !== 1 ? 's' : ''} — invoice paid`,
      color: 'text-blue-600',
    },
    {
      label: 'Total Applied',
      value: `$${Number(summary.total_applied).toFixed(2)}`,
      sub: `${summary.applied_count} applied`,
      color: 'text-green-600',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="card p-5">
          <p className="text-sm text-gray-500 font-medium">{item.label}</p>
          <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          {item.sub && <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>}
        </div>
      ))}
    </div>
  )
}
