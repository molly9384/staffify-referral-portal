import { differenceInDays, parseISO } from 'date-fns'

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '—'
  return `$${Number(amount).toFixed(2)}`
}

export function daysInWindow(activationDate) {
  if (!activationDate) return null
  const start = typeof activationDate === 'string' ? parseISO(activationDate) : activationDate
  return differenceInDays(new Date(), start)
}

export const STATUS_CONFIG = {
  referred:        { label: 'Referred',         className: 'bg-gray-100 text-gray-700' },
  contacted:       { label: 'Contacted',         className: 'bg-blue-100 text-blue-700' },
  call_scheduled:  { label: 'Call Scheduled',    className: 'bg-indigo-100 text-indigo-700' },
  contract_signed: { label: 'Contract Signed',   className: 'bg-purple-100 text-purple-700' },
  va_hired:        { label: 'VA Hired',          className: 'bg-yellow-100 text-yellow-700' },
  va_billing:      { label: 'VA Billing',        className: 'bg-orange-100 text-orange-700' },
  active:          { label: 'Active',            className: 'bg-green-100 text-green-700' },
  paused:          { label: 'Paused',            className: 'bg-amber-100 text-amber-700' },
  expired:         { label: 'Expired',           className: 'bg-red-100 text-red-700' },
  ceased:          { label: 'Ceased',            className: 'bg-red-100 text-red-700' },
}

export function statusBadge(status) {
  return STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-700' }
}

export const ALL_STATUSES = Object.keys(STATUS_CONFIG)

export const PIPELINE_STATUSES = [
  'referred', 'contacted', 'call_scheduled', 'contract_signed',
  'va_hired', 'va_billing', 'active', 'paused', 'expired', 'ceased',
]
