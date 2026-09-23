// Filing rules for a small Michigan 501(c)(3). Pure: evaluate(ctx) -> items with due dates, readiness and status.
import { fiscalYearRange } from './fiscal.js';
import { donationTotals, expenseTotals, payeeYear, necThreshold, ACK_MIN, donationFlags, inFiscalYear } from './books.js';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// Months after the fiscal year end, on a given day (or the last day of that month when day is null).
function afterFyEnd(fy, fyEnd, months, day) {
  const [m] = fyEnd.split('-').map(Number);
  let month = m + months, year = fy;
  while (month > 12) { month -= 12; year += 1; }
  return `${year}-${pad(month)}-${pad(day ?? lastDay(year, month))}`;
}
export const dueDates = {
  irs990: (fy, fyEnd) => afterFyEnd(fy, fyEnd, 5, 15),
  jan31: (fy, fyEnd) => afterFyEnd(fy, fyEnd, 1, null), // last day of the month after year end
  miAnnual: (fy) => `${fy}-10-01`,
  miSolicitation: (fy, fyEnd) => afterFyEnd(fy, fyEnd, 7, null),
};

// Form 990 instructions, Appendix B: "normally" not more than $50,000.
export function normallyUnder50k(receiptsByFy, fy, firstFy) {
  const age = fy - firstFy + 1; // years in existence including this one
  const r = (y) => receiptsByFy[y] || 0;
  if (age <= 1) return r(fy) <= 7500000;
  if (age <= 3) return (r(fy) + r(fy - 1)) / 2 <= 6000000;
  return (r(fy) + r(fy - 1) + r(fy - 2)) / 3 <= 5000000;
}

export function irs990Variant(ctx) {
  const receiptsByFy = {};
  for (const y of [ctx.fy, ctx.fy - 1, ctx.fy - 2]) receiptsByFy[y] = donationTotals(ctx.donations, y, ctx.fyEnd).grossReceiptsCents;
  const gross = receiptsByFy[ctx.fy];
  const assets = Number(ctx.settings.netAssetsEnd?.[ctx.fy]) || 0;
  if (normallyUnder50k(receiptsByFy, ctx.fy, Number(ctx.settings.firstFiscalYear) || ctx.fy)) return '990-N';
  if (gross < 20000000 && assets < 50000000) return '990-EZ';
  return '990';
}

export function necPayees(ctx) {
  const year = Number(fiscalYearRange(ctx.fy, ctx.fyEnd).end.slice(0, 4));
  return ctx.payees.filter((p) => !p.deleted).map((p) => ({ payee: p, year: payeeYear(ctx.expenses, p.id, ctx.fy, ctx.fyEnd) }))
    .filter((x) => x.year.servicesCents >= necThreshold(year));
}
export const ackDonations = (ctx) => ctx.donations.filter((d) => inFiscalYear(d, ctx.fy, ctx.fyEnd) && !d.anonymous && (donationFlags(d).ackRequired || donationFlags(d).qpqDisclosure));

const RULES = [
  { id: 'irs-990', agency: 'IRS', due: dueDates.irs990, applies: () => true,
    name: (ctx) => `Form ${irs990Variant(ctx)} annual return`,
    variant: irs990Variant,
    notes: (ctx) => {
      const v = irs990Variant(ctx);
      return [v === '990-N' ? 'Gross receipts are normally $50,000 or less, so the e-Postcard applies. It is filed online at the IRS site; the answer sheet has every field.'
        : v === '990-EZ' ? 'Gross receipts are between $50,000 and $200,000, so Form 990-EZ applies. The worksheet has the line totals; have a preparer review it.'
        : 'Receipts or assets are above the 990-EZ limits. Use a preparer for the full Form 990.',
      'Missing three years in a row automatically revokes 501(c)(3) status.'];
    },
    needsYou: (ctx) => {
      const s = ctx.settings; const out = [];
      if (!s.officer) out.push('Principal officer name (Settings)');
      if (!s.address) out.push('Mailing address (Settings)');
      if (irs990Variant(ctx) !== '990-N') out.push('Net assets at start and end of year (Settings)');
      out.push('Submit on the IRS site and record the confirmation here');
      return out;
    } },
  { id: '1099-nec', agency: 'IRS + payees', due: dueDates.jan31, name: () => 'Form 1099-NEC for contractors',
    applies: (ctx) => necPayees(ctx).length > 0,
    notes: (ctx) => [`${necPayees(ctx).length} payee(s) reached the reporting line this year. Send Copy B to each and file with the IRS (IRIS) by the due date.`],
    needsYou: (ctx) => necPayees(ctx).flatMap(({ payee }) => [
      !payee.w9OnFile && `W-9 from ${payee.name}`, !payee.address && `Mailing address for ${payee.name}`, `Type ${payee.name}'s tax ID when printing`].filter(Boolean))
      .concat(['File with the IRS and record the confirmation here']) },
  { id: 'form-945', agency: 'IRS', due: dueDates.jan31, name: () => 'Form 945 backup withholding',
    applies: (ctx) => expenseTotals(ctx.expenses, ctx.fy, ctx.fyEnd).withheldCents > 0,
    notes: (ctx) => [`${(expenseTotals(ctx.expenses, ctx.fy, ctx.fyEnd).withheldCents / 100).toFixed(2)} dollars were held back from people without a tax ID. Deposit it with the IRS (EFTPS) and report it on Form 945.`],
    needsYou: () => ['Deposit the withheld amount through EFTPS', 'File Form 945 and record the confirmation here'] },
  { id: 'donor-acks', agency: 'Donors', due: dueDates.jan31, name: () => 'Donor acknowledgment letters',
    applies: (ctx) => ackDonations(ctx).length > 0,
    notes: (ctx) => [`${ackDonations(ctx).length} gift(s) need a written acknowledgment (gifts of $250 or more, or over $75 with something given back).`],
    needsYou: (ctx) => ackDonations(ctx).filter((d) => !d.donorAddress && !d.donorEmail).map((d) => `Address or email for ${d.donorName}`).concat(['Print, sign and send the letters']) },
  { id: 'donor-statements', agency: 'Donors', due: dueDates.jan31, name: () => 'Year-end donor statements',
    applies: (ctx) => ctx.donations.some((d) => inFiscalYear(d, ctx.fy, ctx.fyEnd) && !d.anonymous),
    notes: () => ['A courtesy summary for every named donor. Not required by law, but donors expect it.'],
    needsYou: () => ['Print or email the statements'] },
  { id: 'mi-annual-report', agency: 'Michigan LARA', due: dueDates.miAnnual, name: () => 'Michigan nonprofit annual report',
    applies: (ctx) => ctx.fy >= (Number(ctx.settings.firstFiscalYear) || ctx.fy) + 1,
    notes: () => ['Form CSCL/CD-2000, filed online at LARA, $20 fee. The answer sheet has the officer and address details.'],
    needsYou: (ctx) => [!ctx.settings.officer && 'Principal officer name (Settings)', !ctx.settings.address && 'Registered office address (Settings)', 'File online at LARA and pay the $20 fee'].filter(Boolean) },
  { id: 'mi-solicitation', agency: 'Michigan Attorney General', due: dueDates.miSolicitation, name: (ctx) => miSolicitationNeedsRegistration(ctx) ? 'Michigan charitable solicitation registration' : 'Michigan solicitation exemption (CTS-03)',
    applies: () => true,
    notes: (ctx) => [miSolicitationNeedsRegistration(ctx)
      ? 'Contributions reached $25,000 or LPU pays someone to fundraise, so LPU must be registered to solicit in Michigan and renew each year.'
      : 'Under $25,000 with volunteer-only fundraising, so LPU can request the exemption with form CTS-03 instead of registering.'],
    needsYou: () => ['Submit to the Charitable Trust Section and record the confirmation here'] },
  { id: 'payroll', agency: 'IRS + Michigan', due: dueDates.jan31, name: () => 'Payroll filings (W-2, 941, Michigan withholding)',
    applies: (ctx) => !!ctx.settings.hasEmployees, notes: () => ['LPU has no employees, so none of these apply. Turn on "has employees" in Settings if that changes.'], needsYou: () => [] },
];

export function miSolicitationNeedsRegistration(ctx) {
  return donationTotals(ctx.donations, ctx.fy, ctx.fyEnd).cashCents >= 2500000 || !!ctx.settings.paidFundraisers;
}

export function statusFor({ applies, filing, due, needsYou }, today) {
  if (!applies) return 'not-required';
  if (filing?.status === 'filed') return 'filed';
  if (filing?.status === 'not-required') return 'not-required';
  if (today > due) return 'overdue';
  const soon = new Date(new Date(due + 'T00:00:00Z').getTime() - 30 * 86400000).toISOString().slice(0, 10);
  if (today >= soon) return 'due-soon';
  return needsYou.length ? 'needs-you' : 'ready';
}

export function evaluate(ctx) {
  const today = ctx.today;
  return RULES.map((r) => {
    const applies = r.applies(ctx);
    const filing = (ctx.filings || []).find((f) => !f.deleted && f.ruleId === r.id && f.fy === ctx.fy) || null;
    const needsYou = applies ? r.needsYou(ctx) : [];
    const due = r.due(ctx.fy, ctx.fyEnd);
    return { id: r.id, fy: ctx.fy, name: r.name(ctx), agency: r.agency, due, applies, variant: r.variant ? r.variant(ctx) : null,
      notes: applies ? r.notes(ctx) : [], needsYou, filing, status: statusFor({ applies, filing, due, needsYou }, today) };
  }).sort((a, b) => a.due.localeCompare(b.due));
}

export function icsFor(items, orgName = 'LPU') {
  const esc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = (it) => {
    const d = it.due.replace(/-/g, '');
    const next = new Date(new Date(it.due + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:${it.id}-${it.fy}@lpu-tracker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(`${orgName}: ${it.name} due`)}`, `DESCRIPTION:${esc(`${it.agency}. Open LPU Tracker > Filings.`)}`,
      'BEGIN:VALARM', 'TRIGGER:-P30D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.name + ' due in 30 days')}`, 'END:VALARM', 'END:VEVENT'].join('\r\n');
  };
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LPU Tracker//EN', ...items.filter((i) => i.applies && i.status !== 'filed').map(ev), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
