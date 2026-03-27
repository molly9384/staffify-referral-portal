import { Link } from 'react-router-dom'
import { formatDate, statusBadge, daysInWindow } from '../utils/format'

export default function ReferralCard({ referral, showLink = true }) {
  const badge = statusBadge(referral.status)
  const eligibleVA = referral.virtual_assistants?.find((v) => v.is_eligible && v.is_active)
  const dayCount = daysInWindow(referral.activation_date)

  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`badge ${badge.className}`}>{badge.label}</span>
          </div>
          <h3 className="text-base font-semibold text-gray-900 truncate">{referral.referred_name}</h3>
          {referral.referred_email && (
            <p className="text-sm text-gray-500 truncate">{referral.referred_email}</p>
          )}
        </div>
        {showLink && (
          <Link
            to={`/internal/referrals/${referral.id}`}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
          >
            View →
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Referring Client</p>
          <p className="text-gray-900 font-medium truncate">{referral.referring_client?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Eligible VA</p>
          <p className="text-gray-900 font-medium truncate">{eligibleVA?.hubstaff_user_name ?? 'Not assigned'}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Credits Earned</p>
          <p className="text-gray-900 font-medium">${Number(referral.total_credits_earned).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Days Active</p>
          <p className="text-gray-900 font-medium">{dayCount !== null ? `${dayCount} / 365` : '—'}</p>
        </div>
      </div>
    </div>
  )
}
