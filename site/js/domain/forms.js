// Field values for each generated form. Pure data; the UI renders and prints it.
import { fiscalYearRange } from './fiscal.js';
import { donationTotals, expenseTotals, fmtMoney, donationFlags, inFiscalYear } from './books.js';
import { necPayees, ackDonations, irs990Variant, miSolicitationNeedsRegistration } from './compliance.js';

export const DISCLAIMER = 'Prepared by LPU Tracker for review. Not a filed form.';
const range = (ctx) => fiscalYearRange(ctx.fy, ctx.fyEnd);
const fmtDateLong = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function form990N(ctx) {
  const s = ctx.settings; const r = range(ctx);
  const t = donationTotals(ctx.donations, ctx.fy, ctx.fyEnd);
  return { title: 'Form 990-N (e-Postcard) answer sheet', fields: [
    ['Employer identification number (EIN)', s.ein], ['Tax year', `${r.start} to ${r.end}`],
    ['Legal name', s.orgName], ['Other names used', ''], ['Mailing address', s.address],
    ['Website', s.website], ['Principal officer name', s.officer], ['Principal officer address', s.address],
    ['Gross receipts normally $50,000 or less?', 'Yes'], [`Gross receipts this year (for your records)`, fmtMoney(t.grossReceiptsCents)],
    ['Organization terminated or going out of business?', 'No'],
  ], where: 'File at https://www.irs.gov/charities-non-profits/annual-electronic-filing-requirement-for-small-exempt-organizations-form-990-n-e-postcard' };
}

export function form990EZ(ctx) {
  const s = ctx.settings;
  const d = donationTotals(ctx.donations, ctx.fy, ctx.fyEnd);
  const e = expenseTotals(ctx.expenses, ctx.fy, ctx.fyEnd);
  const start = Number(s.netAssetsStart?.[ctx.fy]) || 0;
  const excess = d.grossReceiptsCents - e.totalCents;
  const lines = [
    ['1', 'Contributions, gifts, grants', d.grossReceiptsCents], ['2', 'Program service revenue', 0], ['3', 'Membership dues', 0], ['4', 'Investment income', 0],
    ['8', 'Other revenue', 0], ['9', 'Total revenue', d.grossReceiptsCents],
    ['10', 'Grants and similar amounts paid', 0], ['12', 'Salaries and employee benefits', 0],
    ['13', 'Professional fees and payments to independent contractors', ctx.expenses.filter((x) => inFiscalYear(x, ctx.fy, ctx.fyEnd) && x.isPersonPayment).reduce((a, x) => a + (x.serviceCents || 0), 0)],
    ['16', 'Other expenses (all remaining)', e.totalCents - ctx.expenses.filter((x) => inFiscalYear(x, ctx.fy, ctx.fyEnd) && x.isPersonPayment).reduce((a, x) => a + (x.serviceCents || 0), 0)],
    ['17', 'Total expenses', e.totalCents], ['18', 'Excess or (deficit) for the year', excess],
    ['19', 'Net assets at beginning of year (Settings)', start], ['21', 'Net assets at end of year', start + excess],
  ];
  return { title: 'Form 990-EZ worksheet (Part I)', fields: [['EIN', s.ein], ['Name', s.orgName], ['Tax year', `${range(ctx).start} to ${range(ctx).end}`],
    ['Functional expenses: program', fmtMoney(e.program)], ['Functional expenses: management', fmtMoney(e.management)], ['Functional expenses: fundraising', fmtMoney(e.fundraising)],
    ['In-kind (non-cash) contributions included in line 1', fmtMoney(d.inKindCents)]],
    lines: lines.map(([n, label, cents]) => [`Line ${n}`, label, fmtMoney(cents)]), where: 'Have a preparer complete the official Form 990-EZ from these totals.' };
}

export function form1099NEC(ctx) {
  const s = ctx.settings; const year = Number(range(ctx).end.slice(0, 4));
  return { title: `Form 1099-NEC ${year}`, payer: { name: s.orgName, address: s.address, ein: s.ein },
    entries: necPayees(ctx).map(({ payee, year: y }) => ({ payeeId: payee.id, recipientName: payee.name, recipientAddress: payee.address || '',
      box1Cents: y.servicesCents, box4Cents: y.withheldCents, tinStatus: payee.tinStatus, w9OnFile: payee.w9OnFile })),
    year, where: 'File with the IRS through IRIS (https://www.irs.gov/filing/e-file-forms-1099-with-iris). Give Copy B to each recipient.' };
}

// Simple column CSV for IRIS-style upload. Column order must be checked against the current IRIS template before use.
export function irisCsv(form, tins = {}) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['PayerName', 'PayerTIN', 'PayerAddress', 'RecipientName', 'RecipientTIN', 'RecipientAddress', 'Box1NonemployeeComp', 'Box4FederalTaxWithheld', 'TaxYear'];
  const rows = form.entries.map((e) => [form.payer.name, form.payer.ein, form.payer.address, e.recipientName, tins[e.payeeId] || '', e.recipientAddress,
    (e.box1Cents / 100).toFixed(2), (e.box4Cents / 100).toFixed(2), form.year].map(q).join(','));
  return [head.join(','), ...rows].join('\r\n') + '\r\n';
}

export function form945(ctx) {
  const s = ctx.settings; const e = expenseTotals(ctx.expenses, ctx.fy, ctx.fyEnd);
  return { title: `Form 945 answer sheet ${ctx.fy}`, fields: [['EIN', s.ein], ['Name', s.orgName], ['Address', s.address],
    ['Line 2: Backup withholding', fmtMoney(e.withheldCents)], ['Line 3: Total taxes', fmtMoney(e.withheldCents)],
    ['Line 4: Total deposits for the year (from EFTPS)', 'Needs you'], ['Line 5 or 6: Balance due or overpayment', 'Line 3 minus line 4']],
    where: 'Deposit through EFTPS; file Form 945 by January 31.' };
}

function letterBody(ctx, d) {
  const s = ctx.settings; const f = donationFlags(d);
  const what = d.kind === 'in_kind' ? `a non-cash gift of ${d.description || 'goods'}` : `a gift of ${fmtMoney(d.amountCents)}`;
  const goods = d.goodsCents > 0
    ? `In return, you received ${d.goodsDescription || 'goods or services'} with an estimated value of ${fmtMoney(d.goodsCents)}. Only the amount of your contribution above that value, ${fmtMoney(f.deductibleCents)}, may be deductible.`
    : 'No goods or services were provided in exchange for this contribution.';
  return [`Dear ${d.donorName},`,
    `Thank you for ${what} to ${s.orgName} on ${fmtDateLong(d.date)}. Your support helps us build community through artistry and charity.`,
    goods, d.kind === 'in_kind' ? 'The value of a non-cash gift is set by the donor for tax purposes; we have described the items above.' : '',
    `${s.orgName} is a 501(c)(3) tax-exempt organization, EIN ${s.ein}. Please keep this letter for your records.`,
    'With gratitude,', `${s.officer || ''}\n${s.orgName}\n${s.address || ''}`].filter(Boolean);
}

// One receipt for a single gift. Non-cash receipts describe the items and never state a value
// (the donor sets it). Food from a business gets the IRC 170(e)(3) statement it needs.
export function donationReceipt(ctx, d) {
  const s = ctx.settings; const f = donationFlags(d);
  const goods = d.goodsCents > 0
    ? `In return, the donor received ${d.goodsDescription || 'goods or services'} with an estimated value of ${fmtMoney(d.goodsCents)}.${d.kind === 'cash' ? ` The deductible amount is therefore ${fmtMoney(f.deductibleCents)}.` : ''}`
    : 'No goods or services were provided by the organization in exchange for this contribution.';
  const isFood = d.kind === 'in_kind' && /food|can|meal|produce|bread|grocer|snack|water|drink/i.test(d.description || '');
  const paragraphs = d.kind === 'in_kind'
    ? [`${s.orgName} gratefully acknowledges the following non-cash contribution received on ${fmtDateLong(d.date)}:`,
      d.description || 'Goods (see attached list)',
      'No monetary value is stated for this gift. Under IRS rules the donor determines the fair market value of donated property.',
      goods,
      isFood ? `${s.orgName} certifies that this donated food is used solely for the care of the ill, the needy, or infants, in a manner consistent with our exempt purpose, and is not transferred in exchange for money, other property, or services (IRC 170(e)(3)).` : '']
    : [`${s.orgName} gratefully acknowledges a contribution of ${fmtMoney(d.amountCents)} received on ${fmtDateLong(d.date)}${d.method && d.method !== 'other' ? ` by ${d.method === 'zeffy' ? 'online payment (Zeffy)' : d.method}` : ''}.`, goods];
  return { title: 'Donation receipt', donorName: d.anonymous ? 'Anonymous donor' : d.donorName, donorAddress: d.donorAddress, donorEmail: d.donorEmail, date: d.date,
    paragraphs: paragraphs.filter(Boolean).concat([`${s.orgName} is a 501(c)(3) tax-exempt organization, EIN ${s.ein}. Please keep this receipt for your records.`, `${s.officer || ''}
${s.orgName}
${s.address || ''}`]) };
}

export function donorLetters(ctx) {
  return { title: `Donor acknowledgment letters ${ctx.fy}`, letters: ackDonations(ctx).map((d) => ({ donorName: d.donorName, donorAddress: d.donorAddress, donorEmail: d.donorEmail, date: d.date, paragraphs: letterBody(ctx, d) })) };
}

export function donorStatements(ctx) {
  const s = ctx.settings; const by = new Map();
  for (const d of ctx.donations.filter((x) => inFiscalYear(x, ctx.fy, ctx.fyEnd) && !x.anonymous)) {
    const k = (d.donorName || '').trim().toLowerCase();
    if (!by.has(k)) by.set(k, { donorName: d.donorName, donorAddress: d.donorAddress, donorEmail: d.donorEmail, gifts: [], totalCents: 0, inKindCents: 0 });
    const g = by.get(k); g.gifts.push(d); if (d.kind === 'in_kind') g.inKindCents += d.amountCents; else g.totalCents += d.amountCents;
    if (!g.donorAddress && d.donorAddress) g.donorAddress = d.donorAddress;
  }
  return { title: `Year-end donor statements ${ctx.fy}`, statements: [...by.values()].map((g) => ({ ...g,
    intro: `Thank you for supporting ${s.orgName} in ${ctx.fy}. Here is a summary of your gifts.`,
    rows: g.gifts.sort((a, b) => a.date.localeCompare(b.date)).map((d) => [fmtDateLong(d.date), d.kind === 'in_kind' ? `Non-cash: ${d.description || 'goods'}` : 'Gift', fmtMoney(d.amountCents), d.goodsCents ? `Received ${fmtMoney(d.goodsCents)} in return` : '']),
    footer: `${s.orgName}, 501(c)(3), EIN ${s.ein}. Unless noted, no goods or services were provided in exchange for these gifts.` })) };
}

export function miAnnualReport(ctx) {
  const s = ctx.settings;
  return { title: `Michigan nonprofit annual report ${ctx.fy} (CSCL/CD-2000)`, fields: [['Corporation name', s.orgName], ['Michigan ID number', s.miId || ''],
    ['Registered office address', s.address], ['Resident agent', s.residentAgent || s.officer], ['President', s.officer], ['Other officers and directors', s.officers || ''],
    ['Purpose', s.mission], ['Fee', '$20']], where: 'File online at https://www.michigan.gov/lara (Corporations Online Filing System) by October 1.' };
}

export function miSolicitation(ctx) {
  const s = ctx.settings; const t = donationTotals(ctx.donations, ctx.fy, ctx.fyEnd);
  const reg = miSolicitationNeedsRegistration(ctx);
  return { title: reg ? `Michigan charitable solicitation registration ${ctx.fy}` : `Michigan solicitation exemption request (CTS-03) ${ctx.fy}`,
    fields: [['Organization', s.orgName], ['EIN', s.ein], ['Address', s.address], ['Fiscal year end', ctx.fyEnd], ['Contributions received this year', fmtMoney(t.cashCents)],
      ['Anyone paid to fundraise?', s.paidFundraisers ? 'Yes' : 'No'], ['Basis', reg ? 'Registration required (contributions at or above $25,000, or paid fundraiser)' : 'Exempt: under $25,000 and fundraising done only by volunteers'],
      ['990 filed this year', irs990Variant(ctx)]],
    where: 'Michigan Attorney General, Charitable Trust Section: https://www.michigan.gov/ag/charity' };
}

export const FORM_BUILDERS = { 'irs-990': (ctx) => (irs990Variant(ctx) === '990-N' ? form990N(ctx) : form990EZ(ctx)), '1099-nec': form1099NEC, 'form-945': form945,
  'donor-acks': donorLetters, 'donor-statements': donorStatements, 'mi-annual-report': miAnnualReport, 'mi-solicitation': miSolicitation };
