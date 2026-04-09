const STAGES = [
  { key: 'referred', label: 'Referred' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'call_scheduled', label: 'Call Scheduled' },
  { key: 'contract_signed', label: 'Contract Signed' },
  { key: 'va_hired', label: 'VA Hired' },
  { key: 'va_billing', label: 'Active' },
]

const STATUS_DISPLAY = {
  paused:  { label: 'Paused',  color: 'bg-amber-100 text-amber-800 border-amber-200' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-800 border-red-200' },
  ceased:  { label: 'Expired', color: 'bg-red-100 text-red-800 border-red-200' },
}

function normalizeStatus(status) {
  return status === 'active' ? 'va_billing' : status
}

export default function PipelineStage({ status }) {
  const normalized = normalizeStatus(status)

  if (STATUS_DISPLAY[normalized]) {
    const { label, color } = STATUS_DISPLAY[normalized]
    return (
      <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${color}`}>
        {label}
      </div>
    )
  }

  const currentIndex = STAGES.findIndex((s) => s.key === normalized)

  return (
    <div className="w-full">
      <div className="flex items-start w-full">
        {STAGES.map((stage, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex

          return (
            <div key={stage.key} className="contents">
              {/* Circle + label column */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                    isDone
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : isCurrent
                      ? 'bg-green-500 border-green-500 text-white'
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
                  className={`mt-1.5 text-xs text-center hidden sm:block w-14 leading-tight ${
                    isCurrent ? 'text-green-600 font-semibold' : isDone ? 'text-gray-500' : 'text-gray-400'
                  }`}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector — sits between stage columns, vertically centered with circles */}
              {index < STAGES.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mt-3.5 ${
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
