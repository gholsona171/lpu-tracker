// Validation for donations, expenses (incl. payments to people) and payees.
import { toCents } from './books.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const bool = (v) => v === true || v === 'true' || v === 'on' || v === 1;
// Accepts either a cents integer (from a stored record) or money text (from a form).
const money = (cents, text) => (cents !== undefined ? (Number.isInteger(cents) && cents >= 0 ? cents : null) : toCents(text));

export const DONATION_METHODS = ['zeffy', 'cash', 'check', 'other'];
export const EXPENSE_METHODS = ['cash', 'cashapp', 'check', 'card', 'gift_card', 'other'];
export const CATEGORIES = ['program', 'management', 'fundraising'];

export function sanitizeDonation(input = {}) {
  const amountCents = money(input.amountCents, input.amount);
  const goodsCents = input.goods === undefined && input.goodsCents === undefined ? 0 : money(input.goodsCents, input.goods) ?? 0;
  const record = {
    date: str(input.date, 10), donorName: str(input.donorName, 80), donorEmail: str(input.donorEmail, 120),
    donorAddress: str(input.donorAddress, 200), kind: oneOf(input.kind, ['cash', 'in_kind'], 'cash'),
    amountCents, description: str(input.description, 200), method: oneOf(input.method, DONATION_METHODS, 'other'),
    goodsCents, goodsDescription: str(input.goodsDescription, 200), eventId: str(input.eventId, 40), anonymous: bool(input.anonymous),
  };
  const errors = [];
  if (!DATE.test(record.date)) errors.push('Date must be YYYY-MM-DD.');
  if (amountCents === null || amountCents <= 0) errors.push('Amount must be more than zero.');
  if (amountCents !== null && goodsCents > amountCents) errors.push('Value given back cannot exceed the gift.');
  if (!record.donorName && !record.anonymous) errors.push('Donor name is required, or mark it anonymous.');
  return { ok: errors.length === 0, errors, record };
}

export function sanitizeExpense(input = {}) {
  const amountCents = money(input.amountCents, input.amount);
  const isPersonPayment = bool(input.isPersonPayment);
  const goodsCents = input.goods === undefined && input.goodsCents === undefined ? 0 : money(input.goodsCents, input.goods) ?? 0;
  const record = {
    date: str(input.date, 10), payeeId: str(input.payeeId, 40), payeeName: str(input.payeeName, 80), amountCents,
    category: oneOf(input.category, CATEGORIES, 'program'), method: oneOf(input.method, EXPENSE_METHODS, 'other'),
    note: str(input.note, 200), workDone: str(input.workDone, 120), eventId: str(input.eventId, 40), isPersonPayment,
    goodsCents: isPersonPayment ? goodsCents : 0, serviceCents: 0, withheldCents: Math.max(0, Number(input.withheldCents) || 0),
    signature: Array.isArray(input.signature) && input.signature.length ? input.signature : null, signedAt: str(input.signedAt, 30),
  };
  const errors = [];
  if (!DATE.test(record.date)) errors.push('Date must be YYYY-MM-DD.');
  if (amountCents === null || amountCents <= 0) errors.push('Amount must be more than zero.');
  if (!record.payeeName && !record.payeeId) errors.push('Who was paid?');
  if (isPersonPayment) {
    if (amountCents !== null && record.goodsCents > amountCents) errors.push('Goods part cannot exceed the amount.');
    else if (amountCents !== null) record.serviceCents = amountCents - record.goodsCents;
    if (!record.workDone) errors.push('What did they do?');
  }
  return { ok: errors.length === 0, errors, record };
}

export function sanitizePayee(input = {}) {
  const record = {
    name: str(input.name, 80), kind: oneOf(input.kind, ['individual', 'business'], 'individual'), address: str(input.address, 200),
    w9OnFile: bool(input.w9OnFile), w9Date: str(input.w9Date, 10),
    tinStatus: oneOf(input.tinStatus, ['unknown', 'provided', 'refused'], 'unknown'),
    communityWorker: bool(input.communityWorker), note: str(input.note, 200),
  };
  const errors = record.name ? [] : ['Name is required.'];
  return { ok: errors.length === 0, errors, record };
}
