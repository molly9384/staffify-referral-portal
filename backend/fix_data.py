"""
One-time data fix script.
Run from the Render shell: python fix_data.py

Fixes:
  1. Billing period dates on the two CreditLedger records for Daimen Martinez's
     referral of Jonathan Gonzalez:
       - $111.63 applied credit  → Mar 27, 2026 – Apr 9, 2026
       - $92.73  pending credit  → Apr 10, 2026 – Apr 23, 2026
  2. referred_name spelling: 'Gonzales' → 'Gonzalez' on the Referral row
     (and total_credits_earned field on Referral is unchanged — just the name).
"""

import asyncio
from datetime import date
from decimal import Decimal
from sqlalchemy import select, update
from database import AsyncSessionLocal
from models import Referral, CreditLedger


async def fix():
    async with AsyncSessionLocal() as db:

        # ── 1. Fix referred_name spelling ──────────────────────────────────
        result = await db.execute(
            select(Referral).where(Referral.referred_name.ilike("%gonzal%"))
        )
        referrals = result.scalars().all()

        if not referrals:
            print("No referrals matching 'gonzal*' found.")
        for r in referrals:
            old = r.referred_name
            if "Gonzales" in r.referred_name and "Gonzalez" not in r.referred_name:
                r.referred_name = r.referred_name.replace("Gonzales", "Gonzalez")
                print(f"  Referral {r.id}: renamed '{old}' → '{r.referred_name}'")
            else:
                print(f"  Referral {r.id}: name already '{r.referred_name}' — no change needed")

        # ── 2. Fix billing period dates on credit ledger entries ────────────
        # Identify by approximate credit amount + status since we have no invoice ID
        credits_result = await db.execute(
            select(CreditLedger).where(
                CreditLedger.credit_amount.between(Decimal("90"), Decimal("120"))
            )
        )
        credits = credits_result.scalars().all()

        if not credits:
            print("No matching credit records found.")

        for c in credits:
            amt = float(c.credit_amount)
            old_start, old_end = c.period_start, c.period_end

            if abs(amt - 111.63) < 0.01:
                # Applied credit — billing period was Mar 27 – Apr 9, 2026
                c.period_start = date(2026, 3, 27)
                c.period_end   = date(2026, 4, 9)
                print(f"  Credit {c.id} (${amt:.2f} applied):  {old_start}–{old_end}  →  {c.period_start}–{c.period_end}")

            elif abs(amt - 92.73) < 0.01:
                # Pending credit — billing period was Apr 10 – Apr 23, 2026
                c.period_start = date(2026, 4, 10)
                c.period_end   = date(2026, 4, 23)
                print(f"  Credit {c.id} (${amt:.2f} pending): {old_start}–{old_end}  →  {c.period_start}–{c.period_end}")

            else:
                print(f"  Credit {c.id} (${amt:.2f}): not one of the two target records — skipped")

        await db.commit()
        print("\nDone. All changes committed.")


if __name__ == "__main__":
    asyncio.run(fix())
