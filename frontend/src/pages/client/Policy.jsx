export default function Policy() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Referral Program Policy</h1>
        <p className="text-gray-500 text-sm mt-1">Last updated April 2026</p>
      </div>

      <div className="card p-8 space-y-8 text-sm text-gray-700 leading-relaxed">

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">1. Eligibility</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>Referring clients receive a $1 credit per billable hour worked by one (1) eligible VA per referred client.</li>
            <li>The eligible VA is defined as the first VA position contracted by the referred client.</li>
            <li>Any additional VA positions contracted by the referred client are not eligible for referral credit.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">2. Duration</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>Referral credits apply for twelve (12) months per referred client.</li>
            <li>The twelve (12) month period begins on the start date of the eligible VA.</li>
            <li>The twelve (12) month period does not reset under any circumstances.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">3. Replacement Scenario</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>If the eligible VA is replaced pursuant to Staffify's replacement guarantee as outlined in the applicable Service Agreement, referral credits will pause during any period in which no eligible VA is actively billing.</li>
            <li>The original twelve (12) month period will resume upon the replacement VA's start date.</li>
            <li>The twelve (12) month period will not reset.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">4. Termination of Eligible Role</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>If the referred client elects not to restaff the eligible VA position, referral credits will cease at the time the eligible VA's billing ends.</li>
            <li>Referral eligibility will not transfer to another VA position.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">5. Credit Timing</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>Referral credits are calculated based on actual billable hours worked, invoiced, and paid by the referred client.</li>
            <li>Referral credits will be applied to the referring client's next invoice following receipt of the referred client's paid invoice. Credits will not be issued in advance of payment.</li>
            <li>Staffify reserves the right to delay application of referral credits in the event of payment disputes, refunds, chargebacks, or invoice adjustments.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">6. Credit Application</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>Credits apply only to actual billable hours worked, invoiced, and paid.</li>
            <li>Credits may only offset active invoices.</li>
            <li>Credits may not exceed the referring client's invoice total for a given billing cycle.</li>
            <li>No cash payouts or direct payments will be issued.</li>
            <li>Unused credits do not accumulate beyond invoice amounts.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">7. Active Status, Invoice Requirement & Non-Accumulation</h2>
          <p className="mb-2">Referral credits are available only while both the referring and referred clients maintain active engagements with Staffify and remain in good standing.</p>
          <p className="mb-2">Referral credits may only be applied during periods in which the referring client maintains an active VA engagement and is receiving ongoing invoices from Staffify. If the referring client does not have an active VA engagement and is not receiving an invoice, referral credits will not accrue or accumulate during such period.</p>
          <p className="mb-2">If the referring client elects to source a replacement VA under Staffify's standard replacement process, the referral program duration will pause during the sourcing period and resume upon the replacement VA's start date. The original referral duration period will not reset.</p>
          <p>If the referring client elects not to source a replacement VA, any remaining referral eligibility will be forfeited.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">8. Modification Clause</h2>
          <ul className="space-y-2 list-disc list-outside ml-5">
            <li>Staffify reserves the right to modify or discontinue the referral program at any time.</li>
          </ul>
        </section>

        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 italic">
            By participating in the Staffify Referral Program, you acknowledge that you have read, understood, and agree to be bound by this policy. Participation in the referral program constitutes acceptance of these terms.
          </p>
        </div>
      </div>
    </div>
  )
}
