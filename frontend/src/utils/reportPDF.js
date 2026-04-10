import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND = [26, 189, 225]
const DARK  = [17, 17, 17]
const GRAY  = [107, 114, 128]
const LIGHT = [249, 250, 251]

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


// ─── Logo loader ──────────────────────────────────────────────────────────────

async function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ data: canvas.toDataURL('image/png'), aspect: img.naturalWidth / img.naturalHeight })
    }
    img.onerror = () => resolve(null)
    img.src = '/logo.png'
  })
}

// ─── Document setup ───────────────────────────────────────────────────────────

async function createDoc() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const font = 'helvetica'
  const logo = await loadLogo()
  return { doc, font, logo }
}

// ─── Page header ──────────────────────────────────────────────────────────────

function addHeader(doc, font, logo, title, subtitle) {
  const W = doc.internal.pageSize.getWidth()
  const margin = 20

  // Logo — top left
  const logoH = 11
  const logoW = logo ? logoH * logo.aspect : 38
  const logoY = 18
  if (logo) doc.addImage(logo.data, 'PNG', margin, logoY, logoW, logoH)

  // Generated date — top right
  doc.setFontSize(8)
  doc.setFont(font, 'normal')
  doc.setTextColor(...GRAY)
  const generated = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  doc.text(`Generated ${generated}`, W - margin, logoY + 7, { align: 'right' })

  // Title — below logo with clear breathing room
  const titleY = logoY + logoH + 10
  doc.setFontSize(20)
  doc.setFont(font, 'bold')
  doc.setTextColor(...DARK)
  doc.text(title, margin, titleY)

  // Subtitle
  doc.setFontSize(10)
  doc.setFont(font, 'normal')
  doc.setTextColor(...GRAY)
  doc.text(subtitle, margin, titleY + 7)

  // Divider
  const divY = titleY + 13
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.line(margin, divY, W - margin, divY)

  return divY + 8 // content starts here
}

// ─── Section label ────────────────────────────────────────────────────────────

function addSection(doc, font, label, y) {
  doc.setFontSize(10)
  doc.setFont(font, 'bold')
  doc.setTextColor(...DARK)
  doc.text(label, 20, y)
  return y + 5
}

// ─── Page footers (all pages) ─────────────────────────────────────────────────

function addFooters(doc, font, logo) {
  const pages = doc.internal.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)

    // Thin divider above footer
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.3)
    doc.line(20, H - 12, W - 20, H - 12)

    const baseY = H - 7

    // "Powered by " text + logo
    doc.setFontSize(7.5)
    doc.setFont(font, 'normal')
    doc.setTextColor(...GRAY)

    const prefix = 'Powered by  '
    const prefixW = doc.getTextWidth(prefix)
    const logoH = 3.2
    const logoW = logo ? logoH * logo.aspect : 12

    const blockW = prefixW + logoW
    const startX = (W - blockW) / 2

    doc.text(prefix, startX, baseY)
    if (logo) {
      doc.addImage(logo.data, 'PNG', startX + prefixW, baseY - logoH * 0.6, logoW, logoH)
    }

    // Page number — right side
    doc.setTextColor(...GRAY)
    doc.text(`Page ${i} of ${pages}`, W - 20, baseY, { align: 'right' })
  }
}

// ─── Table helpers ────────────────────────────────────────────────────────────

// Ensures header cells in the given columns also get the specified alignment
function alignHeadHook(centerCols = [], rightCols = []) {
  return {
    didParseCell: (data) => {
      if (data.section === 'head') {
        if (centerCols.includes(data.column.index)) data.cell.styles.halign = 'center'
        if (rightCols.includes(data.column.index)) data.cell.styles.halign = 'right'
      }
    },
  }
}

function tDefaults(font) {
  return {
    styles: { font, fontSize: 8.5, cellPadding: { top: 4, right: 8, bottom: 4, left: 8 } },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8, font },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 20, right: 20 },
  }
}

// ─── Admin report ──────────────────────────────────────────────────────────────

export async function generateAdminReportPDF(report, dateRangeLabel, clientName) {
  const { doc, font, logo } = await createDoc()
  const subtitle = clientName ? `${clientName}  ·  ${dateRangeLabel}` : dateRangeLabel
  let y = addHeader(doc, font, logo, 'Referral Report', subtitle)
  const td = tDefaults(font)

  // Summary
  y = addSection(doc, font, 'Summary', y)
  autoTable(doc, {
    ...td,
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
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' } },
    ...alignHeadHook([], [1]),
  })
  y = doc.lastAutoTable.finalY + 10

  // Top Referrers
  if (report.top_referrers.length > 0) {
    y = addSection(doc, font, 'Top Referrers', y)
    autoTable(doc, {
      ...td,
      startY: y,
      head: [['Client', 'Referrals Sent', 'Active', 'Credits Earned', 'Credits Applied']],
      body: report.top_referrers.map((r) => [
        r.client_name,
        r.referrals_sent,
        r.active_referrals,
        fmt$(r.credits_earned),
        fmt$(r.credits_applied),
      ]),
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      ...alignHeadHook([1, 2], [3, 4]),
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // Pipeline
  if (report.pipeline.length > 0) {
    y = addSection(doc, font, 'Pipeline Breakdown', y)
    autoTable(doc, {
      ...td,
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
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
      ...alignHeadHook([1, 2], []),
    })
  }

  addFooters(doc, font, logo)
  return doc
}

// ─── Client report ─────────────────────────────────────────────────────────────

export async function generateClientReportPDF(report, dateRangeLabel, clientName) {
  const { doc, font, logo } = await createDoc()
  let y = addHeader(doc, font, logo, 'Referral Activity Report', `${clientName}  ·  ${dateRangeLabel}`)
  const td = tDefaults(font)

  // Summary
  y = addSection(doc, font, 'Summary', y)
  autoTable(doc, {
    ...td,
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Referrals', String(report.summary.total_referrals)],
      ['Active Referrals', String(report.summary.active_referrals)],
      ['Credits Earned', fmt$(report.summary.credits_earned)],
      ['Credits Pending', fmt$(report.summary.credits_pending)],
      ['Credits Applied', fmt$(report.summary.credits_applied)],
    ],
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' } },
    ...alignHeadHook([], [1]),
  })
  y = doc.lastAutoTable.finalY + 10

  // Referrals
  if (report.referrals.length > 0) {
    y = addSection(doc, font, 'My Referrals', y)
    autoTable(doc, {
      ...td,
      startY: y,
      head: [['Referred Person', 'Status', 'Date', 'Credits Earned', 'Credits Applied']],
      body: report.referrals.map((r) => [
        r.referred_name,
        STATUS_LABELS[r.status] || r.status,
        fmtDate(r.referral_date),
        fmt$(r.credits_earned),
        fmt$(r.credits_applied),
      ]),
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      ...alignHeadHook([1, 2], [3, 4]),
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // Credit detail
  if (report.credits.length > 0) {
    y = addSection(doc, font, 'Credit Detail', y)
    const totalCredits = report.credits.reduce((s, c) => s + c.credit_amount, 0)
    autoTable(doc, {
      ...td,
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
      footStyles: { fillColor: [240, 250, 254], fontStyle: 'bold', textColor: BRAND, font },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'center' },
        5: { halign: 'center' },
      },
      ...alignHeadHook([1, 2, 4, 5], [3]),
    })
  }

  addFooters(doc, font, logo)
  return doc
}
