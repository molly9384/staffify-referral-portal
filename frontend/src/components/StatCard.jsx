export default function StatCard({ label, value, sub, icon, color = 'primary', loading = false }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.primary}`}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 bg-gray-100 rounded animate-pulse w-24" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-32" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
          <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </>
      )}
    </div>
  )
}
