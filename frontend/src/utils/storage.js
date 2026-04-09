const SEEN_REFERRAL_KEY = 'seenReferralIds'

export function getSeenReferralIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_REFERRAL_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function markReferralsAsSeen(ids) {
  try {
    const seen = getSeenReferralIds()
    ids.forEach((id) => seen.add(id))
    localStorage.setItem(SEEN_REFERRAL_KEY, JSON.stringify([...seen]))
  } catch {}
}
