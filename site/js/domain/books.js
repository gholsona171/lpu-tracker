import { fiscalYearFor } from './fiscal.js';

export const THRESHOLDS = { nec: { 2025: 60000, 2026: 200000 } };
export const W9_NUDGE = 150000, ACK_MIN = 25000, QPQ_MIN = 7500, BACKUP_RATE = 0.24, EMPLOYMENT_RECENT = 4;
export const necThreshold = (year) => THRESHOLDS.nec[year] ?? THRESHOLDS.nec[Math.max(...Object.keys(THRESHOLDS.nec).map(Number))];

export function toCents(input) {
  const s = String(input ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [d, c = ''] = s.split('.');
  return Number(d) * 100 + Number((c + '00').slice(0, 2));
}
export const fmtMoney = (cents) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inFiscalYear = (rec, fy, fyEnd) => !rec.deleted && fiscalYearFor(rec.date, fyEnd) === fy;

export function donationFlags(d) {
  const goods = d.goodsCents || 0;
  return { ackRequired: d.amountCents >= ACK_MIN, qpqDisclosure: goods > 0 && d.amountCents > QPQ_MIN, deductibleCents: Math.max(0, d.amountCents - goods) };
}
export function donationTotals(donations, fy, fyEnd) {
  const t = { cashCents: 0, inKindCents: 0, grossReceiptsCents: 0, count: 0 };
  for (const d of donations.filter((x) => inFiscalYear(x, fy, fyEnd))) {
    t[d.kind === 'in_kind' ? 'inKindCents' : 'cashCents'] += d.amountCents; t.grossReceiptsCents += d.amountCents; t.count++;
  }
  return t;
}
export function expenseTotals(expenses, fy, fyEnd) {
  const t = { program: 0, management: 0, fundraising: 0, totalCents: 0, withheldCents: 0 };
  for (const e of expenses.filter((x) => inFiscalYear(x, fy, fyEnd))) {
    t[t[e.category] !== undefined ? e.category : 'program'] += e.amountCents; t.totalCents += e.amountCents; t.withheldCents += e.withheldCents || 0;
  }
  return t;
}
export function payeeYear(expenses, payeeId, fy, fyEnd, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const t = { servicesCents: 0, goodsCents: 0, withheldCents: 0, paymentsCount: 0, recentCount: 0 };
  for (const e of expenses.filter((x) => x.payeeId === payeeId && inFiscalYear(x, fy, fyEnd))) {
    t.servicesCents += e.serviceCents || 0; t.goodsCents += e.goodsCents || 0; t.withheldCents += e.withheldCents || 0; t.paymentsCount++;
    if (e.date >= cutoff) t.recentCount++;
  }
  return t;
}
export function paymentAdvice({ payee, expenses, date, serviceCents, goodsCents = 0, fyEnd = '12-31', now = new Date() }) {
  const fy = fiscalYearFor(date, fyEnd);
  const year = Number(date.slice(0, 4));
  const y = payeeYear(expenses, payee.id, fy, fyEnd, now);
  const threshold = necThreshold(year);
  const servicesAfter = y.servicesCents + serviceCents;
  const tinMissing = payee.tinStatus !== 'provided';
  const needs1099 = servicesAfter >= threshold;
  const withholdCents = needs1099 && tinMissing ? Math.round(serviceCents * BACKUP_RATE) : 0;
  const nudgeW9 = !payee.w9OnFile && servicesAfter >= W9_NUDGE;
  const employmentWarning = y.recentCount + 1 >= EMPLOYMENT_RECENT;
  const notes = [];
  if (nudgeW9 && !needs1099) notes.push(`Total this year will be ${fmtMoney(servicesAfter)}. Ask for a W-9 before it reaches ${fmtMoney(threshold)}.`);
  if (needs1099) notes.push(`Total this year reaches ${fmtMoney(servicesAfter)}, so a 1099-NEC is required for ${year}.`);
  if (withholdCents) notes.push(`No tax ID on file, so 24% (${fmtMoney(withholdCents)}) must be held back and sent to the IRS (Form 945).`);
  if (employmentWarning) notes.push('Paid 4 or more times in 90 days. If this person works a regular schedule LPU directs, they may be an employee. Check with a preparer.');
  return { servicesBefore: y.servicesCents, servicesAfter, threshold, nudgeW9, needs1099, withholdCents, netCents: serviceCents + goodsCents - withholdCents, employmentWarning, notes };
}
