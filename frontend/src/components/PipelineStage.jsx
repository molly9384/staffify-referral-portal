const STAGES = [
  { key: 'referred', label: 'Referred' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'call_scheduled', label: 'Call Scheduled' },
  { key: 'contract_signed', label: 'Contract Signed' },
  { key: 'va_hired', label: 'VA Hired' },
  { key: 'va_billing', label: 'VA Billing' },
  { key: 'active', label: 'Active' },
]

const TERMINAL_STAGES = ['paused', 'expired', 'ceased']

export default function PipelineStage({ status }) {
  if (TERMINAL_STAGES.includes(status)) {
    const colorMap = {
      paused: 'bg-amber-100 text-amber-800 border-amber-200',
      expired: 'bg-red-100 text-red-800 border-red-200',
      ceased: 'bg-red-100 text-red-800 border-red-200',
    }
    return (
      <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${colorMap[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    )
  }

  const currentIndex = STAGES.findIndex((s) => s.key === status)

  return (
    <div className="w-full">
      <div className="flex items-center">
        {STAGES.map((stage, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex
          const isUpcoming = index > currentIndex

          return (
            <div key={stage.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                    isDone
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : isCurrent
                      ? 'bg-white border-primary-600 text-primary-600'
                      : 'bg-white border-gray-300 text-gray-400'
                  }`}
                >
                  {isDone ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-1.5 text-xs whitespace-nowrap hidden sm:block ${
                    isCurrent ? 'text-primary-700 font-semibold' : isDone ? 'text-gray-500' : 'text-gray-400'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {index < STAGES.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 ${
                    index < currentIndex ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
