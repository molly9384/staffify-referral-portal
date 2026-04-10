import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND = [26, 189, 225]   // #1abde1
const DARK   = [17, 17, 17]
const GRAY   = [107, 114, 128]
const LIGHT  = [249, 250, 251]

const STATUS_LABELS = {
  referred: 'Referred', contacted: 'Contacted', call_scheduled: 'Call Scheduled',
  contract_signed: 'Contract Signed', va_hired: 'VA Hired', va_billing: 'VA Billing',
  active: 'Active', paused: 'Paused', expired: 'Expired', ceased: 'Ceased',
}

const CREDIT_STATUS_LABELS = {
  pending: 'Pending', eligible: 'Pending Payout', applied: 'Paid Out', voided: 'Voided',
}

function fmt$(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

async function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = '/logo.png'
  })
}

function addHeader(doc, title, subtitle) {
  const W = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = 18

  // Accent bar at top
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 5, 'F')

  // Logo placeholder area — logo added after (async)
  doc._logoY = y
  doc._logoMargin = margin
  y += 14

  // Generated date
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  const generated = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  doc.text(`Generated ${generated}`, W - margin, 22, { align: 'right' })

  // Title
  doc.setFontSize(18)
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.text(title, margin, y)
  y += 7

  // Subtitle
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'normal')
  doc.text(subtitle, margin, y)
  y += 8

  // Divider
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.line(margin, y, W - margin, y)
  y += 8

  return y
}

function addSectionTitle(doc, label, y) {
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.text(label, 20, y)
  return y + 4
}

function addFooters(doc) {
  const pages = doc.internal.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFillColor(...BRAND)
    doc.rect(0, H - 4, W, 4, 'F')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(`Staffify Referral Portal  ·  Page ${i} of ${pages}`, W / 2, H - 7, { align: 'center' })
  }
}

const TABLE_DEFAULTS = {
  styles: { fontSize: 8.5, cellPadding: 3 },
  headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
  alternateRowStyles: { fillColor: LIGHT },
  margin: { left: 20, right: 20 },
}

// ─── Admin report ──────────────────────────────────────────────────────────────

export async function generateAdminReportPDF(report, dateRangeLabel, clientName) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const subtitle = clientName ? `${clientName}  ·  ${dateRangeLabel}` : dateRangeLabel

  let y = addHeader(doc, 'Staffify Referral Report', subtitle)

  // Summary
  y = addSectionTitle(doc, 'Summary', y)
  autoTable(doc, {
    ...TABLE_DEFAULTS,
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Referring Clients', String(report.summary.total_clients)],
      ['Total Referrals', String(report.summary.total_referrals)],
      ['Active Referrals', String(report.summary.active_referrals)],
      ['Credits Earned', fmt$(report.summary.total_credits_earned)],
      ['Credits Applied', fmt$(report.summary.total_credits_applied)],
      ['Credits Pending', fmt$(report.summary.total_credits_pending)],
    ],
    columnStyles: { 1: { halign: 'right' } },
  })
  y = doc.lastAutoTable.finalY + 10

  // Top Referrers
  if (report.top_referrers.length > 0) {
    y = addSectionTitle(doc, 'Top Referrers', y)
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Client', 'Referrals Sent', 'Active', 'Credits Earned', 'Credits Applied']],
      body: report.top_referrers.map((r) => [
        r.client_name,
        r.referrals_sent,
        r.active_referrals,
        fmt$(r.credits_earned),
        fmt$(r.credits_applied),
      ]),
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // Pipeline
  if (report.pipeline.length > 0) {
    y = addSectionTitle(doc, 'Pipeline Breakdown', y)
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Status', 'Count', '% of Total']],
      body: [...report.pipeline]
        .sort((a, b) => b.count - a.count)
        .map((row) => [
          STATUS_LABELS[row.status] || row.status,
          row.count,
          report.summary.total_referrals > 0
            ? Math.round((row.count / report.summary.total_referrals) * 100) + '%'
            : '—',
        ]),
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
    })
  }

  // Add logo last (async)
  const logoData = await loadLogo()
  if (logoData) {
    doc.setPage(1)
    doc.addImage(logoData, 'PNG', doc._logoMargin, doc._logoY, 38, 11)
  }

  addFooters(doc)
  return doc
}

// ─── Client report ─────────────────────────────────────────────────────────────

export async function generateClientReportPDF(report, dateRangeLabel, clientName) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const subtitle = `${clientName}  ·  ${dateRangeLabel}`

  let y = addHeader(doc, 'Referral Activity Report', subtitle)

  // Summary
  y = addSectionTitle(doc, 'Summary', y)
  autoTable(doc, {
    ...TABLE_DEFAULTS,
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Referrals', String(report.summary.total_referrals)],
      ['Active Referrals', String(report.summary.active_referrals)],
      ['Credits Earned', fmt$(report.summary.credits_earned)],
      ['Credits Pending', fmt$(report.summary.credits_pending)],
      ['Credits Applied', fmt$(report.summary.credits_applied)],
    ],
    columnStyles: { 1: { halign: 'right' } },
  })
  y = doc.lastAutoTable.finalY + 10

  // Referrals
  if (report.referrals.length > 0) {
    y = addSectionTitle(doc, 'My Referrals', y)
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Referred Person', 'Status', 'Date', 'Credits Earned', 'Credits Applied']],
      body: report.referrals.map((r) => [
        r.referred_name,
        STATUS_LABELS[r.status] || r.status,
        fmtDate(r.referral_date),
        fmt$(r.credits_earned),
        fmt$(r.credits_applied),
      ]),
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // Credit detail
  if (report.credits.length > 0) {
    y = addSectionTitle(doc, 'Credit Detail', y)
    const totalCredits = report.credits.reduce((s, c) => s + c.credit_amount, 0)
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Referral', 'Billing Period', 'Hrs', 'Credit', 'Status', 'Applied']],
      body: report.credits.map((c) => [
        c.referral_name,
        `${fmtDate(c.period_start)} – ${fmtDate(c.period_end)}`,
        Number(c.hours_worked).toFixed(1),
        fmt$(c.credit_amount),
        CREDIT_STATUS_LABELS[c.status] || c.status,
        fmtDate(c.applied_date),
      ]),
      foot: [['', '', 'Total', fmt$(totalCredits), '', '']],
      footStyles: { fillColor: [240, 250, 254], fontStyle: 'bold', textColor: BRAND },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' } },
    })
  }

  // Logo
  const logoData = await loadLogo()
  if (logoData) {
    doc.setPage(1)
    doc.addImage(logoData, 'PNG', doc._logoMargin, doc._logoY, 38, 11)
  }

  addFooters(doc)
  return doc
}
