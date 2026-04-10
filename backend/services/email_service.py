"""
Shared email helpers for Staffify Referral Portal.
All outgoing emails use Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD env vars).
"""
import asyncio
import smtplib
from decimal import Decimal
from email.message import EmailMessage
import email.policy

from config import settings

BRAND_COLOR = "#1abde1"


# ─── Core send helper ─────────────────────────────────────────────────────────

async def send_email_with_attachment(
    to: list[str],
    subject: str,
    html: str,
    attachment_data: bytes,
    attachment_filename: str,
) -> None:
    """Send an HTML email with a PDF attachment via Gmail SMTP."""
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders as email_encoders

    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        return
    if not to:
        return

    _subst = {'\u2014': '-', '\u2013': '-', '\u2019': "'", '\u2018': "'",
              '\u201c': '"', '\u201d': '"', '\u2026': '...', '\xa0': ' '}
    subject_clean = subject
    for ch, rep in _subst.items():
        subject_clean = subject_clean.replace(ch, rep)
    subject_safe = subject_clean.encode("ascii", "ignore").decode("ascii")
    html_safe = html.encode("ascii", "xmlcharrefreplace").decode("ascii")

    gmail_user = settings.GMAIL_USER.strip()
    gmail_password = "".join(settings.GMAIL_APP_PASSWORD.split())

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject_safe
    msg["From"] = f"Staffify <{gmail_user}>"
    msg["To"] = ", ".join(a.strip() for a in to)
    msg.attach(MIMEText(html_safe, "html", "us-ascii"))

    pdf_part = MIMEBase("application", "octet-stream")
    pdf_part.set_payload(attachment_data)
    email_encoders.encode_base64(pdf_part)
    pdf_part.add_header("Content-Disposition", "attachment", filename=attachment_filename)
    msg.attach(pdf_part)

    def _send():
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(gmail_user, gmail_password)
            server.send_message(msg)

    try:
        await asyncio.to_thread(_send)
    except Exception as e:
        import traceback
        print(f"[email] Failed to send '{subject}' with attachment to {to}: {e}")
        print(f"[email] Traceback:\n{traceback.format_exc()}")


async def send_email(to: list[str], subject: str, html: str) -> None:
    """Send an HTML email via Gmail SMTP. Silently swallows errors."""
    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        return
    if not to:
        return

    # Replace common Unicode with ASCII equivalents in subject (HTML entities look terrible there)
    _subst = {'\u2014': '-', '\u2013': '-', '\u2019': "'", '\u2018': "'",
              '\u201c': '"', '\u201d': '"', '\u2026': '...', '\xa0': ' '}
    subject_clean = subject
    for ch, rep in _subst.items():
        subject_clean = subject_clean.replace(ch, rep)
    subject_safe = subject_clean.encode("ascii", "ignore").decode("ascii")

    # HTML body: convert non-ASCII to HTML entities (renders fine in email clients)
    html_safe = html.encode("ascii", "xmlcharrefreplace").decode("ascii")
    gmail_user = settings.GMAIL_USER.strip()
    # App passwords may be copied with spaces/non-breaking spaces between groups — strip them all
    gmail_password = "".join(settings.GMAIL_APP_PASSWORD.split())

    msg = EmailMessage(policy=email.policy.SMTP)
    msg["Subject"] = subject_safe
    msg["From"] = f"Staffify <{gmail_user}>"
    msg["To"] = ", ".join(a.strip() for a in to)
    msg.set_content(html_safe, subtype="html", charset="us-ascii")

    def _send():
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(gmail_user, gmail_password)
            server.send_message(msg)

    try:
        await asyncio.to_thread(_send)
    except Exception as e:
        import traceback
        print(f"[email] Failed to send '{subject}' to {to}: {e}")
        print(f"[email] Traceback:\n{traceback.format_exc()}")


async def get_client_emails(db, client_id) -> list[str]:
    """Return active portal user emails for a client."""
    from sqlalchemy import select
    from models import User, UserRole
    result = await db.execute(
        select(User.email).where(
            User.client_id == client_id,
            User.is_active == True,
            User.role == UserRole.client,
        )
    )
    return [row[0] for row in result.all()]


# ─── Layout wrapper ───────────────────────────────────────────────────────────

def _wrap(body: str) -> str:
    logo_url = f"{settings.FRONTEND_URL}/logo.png"
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#333;">
      <img src="{logo_url}" alt="Staffify" style="height:40px;margin-bottom:28px;" />
      {body}
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
      <p style="color:#aaa;font-size:12px;margin:0;">Staffify LLC &middot; Referral Portal<br/>
      Questions? Reply to this email or visit <a href="{settings.FRONTEND_URL}" style="color:{BRAND_COLOR};">the portal</a>.</p>
    </div>
    """


def _btn(label: str, url: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;'
        f'text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;'
        f'font-weight:600;margin-top:12px;">{label}</a>'
    )


# ─── Individual email builders ────────────────────────────────────────────────

def email_referral_confirmation(
    referring_client_name: str,
    referred_name: str,
) -> tuple[str, str]:
    subject = f"We received your referral for {referred_name}!"
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Referral received! 🎉</h2>
      <p style="margin:0 0 12px;">Hi {referring_client_name},</p>
      <p style="margin:0 0 12px;">We got your referral for <strong>{referred_name}</strong>.
      Our team will be in touch with them shortly.</p>
      <p style="margin:0 0 20px;">You can track this referral's progress anytime in the portal.</p>
      {_btn("View in Portal", settings.FRONTEND_URL)}
    """)
    return subject, html


def email_welcome_self_registered(full_name: str, email: str) -> tuple[str, str]:
    subject = "Welcome to the Staffify Referral Portal"
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Welcome, {full_name}! 👋</h2>
      <p style="margin:0 0 12px;">Your Staffify Referral Portal account is ready. You can now
      submit referrals, track their progress, and view your credits.</p>
      <p style="margin:0 0 20px;font-size:13px;color:#777;">Signed in as: <strong>{email}</strong></p>
      {_btn("Go to Portal", settings.FRONTEND_URL)}
    """)
    return subject, html


def email_welcome_admin_created(full_name: str, email: str) -> tuple[str, str]:
    subject = "Your Staffify Referral Portal account is ready"
    reset_url = f"{settings.FRONTEND_URL}/#/forgot-password"
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Hi {full_name}, your account is ready!</h2>
      <p style="margin:0 0 12px;">An account has been created for you on the Staffify Referral Portal
      using <strong>{email}</strong>.</p>
      <p style="margin:0 0 20px;">Use the button below to set your password and sign in.</p>
      {_btn("Set Your Password", reset_url)}
    """)
    return subject, html


def email_referral_active(
    referring_client_name: str,
    referred_name: str,
    activation_date: str,
) -> tuple[str, str]:
    subject = "Great news — your referral credits are now generating!"
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Your credits have started! 🚀</h2>
      <p style="margin:0 0 12px;">Hi {referring_client_name},</p>
      <p style="margin:0 0 12px;">Your referral for <strong>{referred_name}</strong> is now active
      as of <strong>{activation_date}</strong>. Referral credits will begin generating on your
      account bi-weekly.</p>
      <p style="margin:0 0 20px;">You'll receive a statement each time new credits are logged.</p>
      {_btn("View Credits", settings.FRONTEND_URL)}
    """)
    return subject, html


def email_referral_reinstated(
    referring_client_name: str,
    referred_name: str,
) -> tuple[str, str]:
    subject = "Your referral credits have been reinstated!"
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Credits reinstated ✅</h2>
      <p style="margin:0 0 12px;">Hi {referring_client_name},</p>
      <p style="margin:0 0 20px;">Your referral credits for <strong>{referred_name}</strong> have
      been reinstated and are generating again.</p>
      {_btn("View Credits", settings.FRONTEND_URL)}
    """)
    return subject, html


def email_referral_paused(
    referring_client_name: str,
    referred_name: str,
    reason: str,
) -> tuple[str, str]:
    subject = "Update: Your referral credits have been paused"
    reason_block = (
        f'<p style="margin:0 0 12px;"><strong>Reason:</strong> {reason}</p>'
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Credits paused</h2>
      <p style="margin:0 0 12px;">Hi {referring_client_name},</p>
      <p style="margin:0 0 12px;">Credit generation for your referral of <strong>{referred_name}</strong>
      has been temporarily paused.</p>
      {reason_block}
      <p style="margin:0 0 20px;">Credits will resume once the referral becomes active again.
      Reach out if you have any questions.</p>
      {_btn("View in Portal", settings.FRONTEND_URL)}
    """)
    return subject, html


def _credits_table(credits: list[dict], total: Decimal, footer_label: str) -> str:
    rows = "".join(
        f"<tr>"
        f"<td style='padding:9px 12px;border-bottom:1px solid #f0f0f0;'>{c['referred_name']}</td>"
        f"<td style='padding:9px 12px;border-bottom:1px solid #f0f0f0;color:#777;font-size:13px;'>{c['period']}</td>"
        f"<td style='padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;'>${float(c['amount']):.2f}</td>"
        f"</tr>"
        for c in credits
    )
    return f"""
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#999;font-weight:600;">Referral</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#999;font-weight:600;">Period</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#999;font-weight:600;">Amount</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
      <tfoot>
        <tr style="background:#f0fafe;">
          <td colspan="2" style="padding:10px 12px;font-weight:600;">{footer_label}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:{BRAND_COLOR};">${float(total):.2f}</td>
        </tr>
      </tfoot>
    </table>
    """


def email_pending_credits_statement(
    referring_client_name: str,
    credits: list[dict],
    total: Decimal,
) -> tuple[str, str]:
    subject = "Your Staffify referral credits statement"
    table = _credits_table(credits, total, "Total Pending")
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Bi-Weekly Credits Statement</h2>
      <p style="margin:0 0 12px;">Hi {referring_client_name},</p>
      <p style="margin:0 0 4px;">Here are your pending referral credits from this period.
      These will be applied to your invoice once the corresponding Hubstaff invoices are paid.</p>
      {table}
      {_btn("View in Portal", settings.FRONTEND_URL)}
    """)
    return subject, html


def email_invite(
    invitee_name: str,
    inviter_name: str,
    role: str,
    invite_url: str,
) -> tuple[str, str]:
    role_labels = {"owner": "Owner", "admin": "Admin", "staff": "Staff Member", "client": "Client"}
    role_display = role_labels.get(role.lower(), role.title())
    article = "an" if role.lower() in ("owner", "admin") else "a"
    subject = "You're invited to join the Staffify Referral Portal"
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">You've been invited!</h2>
      <p style="margin:0 0 12px;">Hi {invitee_name},</p>
      <p style="margin:0 0 12px;"><strong>{inviter_name}</strong> has invited you to join the
      <strong>Staffify Referral Portal</strong> as {article} <strong>{role_display}</strong>.</p>
      <p style="margin:0 0 24px;">Click the button below to accept your invitation and set your password.
      This link expires in <strong>7 days</strong>.</p>
      {_btn("Accept Invitation", invite_url)}
      <p style="margin:20px 0 0;font-size:12px;color:#aaa;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    """)
    return subject, html


def email_applied_credits_statement(
    referring_client_name: str,
    credits: list[dict],
    total: Decimal,
) -> tuple[str, str]:
    subject = "Your Staffify referral credits have been applied to your invoice!"
    table = _credits_table(credits, total, "Total Applied")
    html = _wrap(f"""
      <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Credits Applied to Your Invoice 🎉</h2>
      <p style="margin:0 0 12px;">Hi {referring_client_name},</p>
      <p style="margin:0 0 4px;">The following referral credits have been applied to your
      QuickBooks invoice. Your updated invoice balance reflects these credits.</p>
      {table}
      <p style="margin:16px 0 20px;font-size:13px;color:#777;">
        Thank you for being part of the Staffify referral program!
      </p>
      {_btn("View Credits", settings.FRONTEND_URL)}
    """)
    return subject, html
