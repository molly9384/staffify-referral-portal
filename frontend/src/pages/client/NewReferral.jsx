import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { createReferral } from '../../api/client'

export default function NewReferral() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    referred_name: '',
    referred_company: '',
    referred_email: '',
    referred_phone: '',
    referred_website: '',
    pipeline_notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.client_id) {
      setError('Your account is not linked to a client record. Please contact Staffify support.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await createReferral({
        referring_client_id: user.client_id,
        referred_name: form.referred_name,
        referred_company: form.referred_company,
        referred_email: form.referred_email || null,
        referred_phone: form.referred_phone,
        referred_website: form.referred_website || null,
        pipeline_notes: form.pipeline_notes || null,
        referral_date: new Date().toISOString().split('T')[0],
      })
      navigate('/client/referrals')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to submit referral. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <Link to="/client/referrals" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to My Referrals
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Refer Someone New</h1>
        <p className="text-gray-500 text-sm mt-1">Know someone who needs a great virtual assistant? Refer them and earn $1/hour credit.</p>
      </div>

      {/* How it works */}
      <div className="rounded-xl bg-primary-50 border border-primary-100 p-5 mb-8">
        <h3 className="text-sm font-semibold text-primary-800 mb-2">How it works</h3>
        <ol className="text-sm text-primary-700 space-y-1.5 list-decimal list-inside">
          <li>Fill out this form to submit your referral.</li>
          <li>Staffify will reach out to your contact and guide them through onboarding.</li>
          <li>Once they sign a contract and their first invoice is paid, your 12-month earning window begins.</li>
          <li>You earn $1.00 for every hour their VA works — applied as a credit on your next invoice.</li>
        </ol>
      </div>

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="label">Contact Name <span className="text-red-500">*</span></label>
              <input type="text" className="input" required placeholder="Jane Smith" value={form.referred_name} onChange={set('referred_name')} />
            </div>
            <div>
              <label className="label">
                Company <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(write N/A if unknown)</span>
              </label>
              <input type="text" className="input" required placeholder="Acme Corp or N/A" value={form.referred_company} onChange={set('referred_company')} />
            </div>
            <div>
              <label className="label">Email Address <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="email" className="input" placeholder="contact@example.com" value={form.referred_email} onChange={set('referred_email')} />
            </div>
            <div>
              <label className="label">Phone Number <span className="text-red-500">*</span></label>
              <input type="tel" className="input" required placeholder="(555) 000-0000" value={form.referred_phone} onChange={set('referred_phone')} />
            </div>
            <div>
              <label className="label">Company Website <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" className="input" placeholder="example.com" value={form.referred_website} onChange={set('referred_website')} />
            </div>
          </div>

          <div>
            <label className="label">Additional Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              className="input"
              rows={3}
              placeholder="Any context about this referral that might help our team…"
              value={form.pipeline_notes}
              onChange={set('pipeline_notes')}
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <Link to="/client/referrals" className="btn-secondary flex-1 justify-center">Cancel</Link>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting…
                </>
              ) : (
                'Submit Referral'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
