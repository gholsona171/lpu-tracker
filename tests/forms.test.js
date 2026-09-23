import { test } from 'node:test';
import assert from 'node:assert/strict';
import { form990N, form990EZ, form1099NEC, irisCsv, donorLetters, donorStatements, form945, miSolicitation, donationReceipt } from '../site/js/domain/forms.js';

const ctx = { fy: 2026, fyEnd: '12-31', today: '2026-12-01',
  settings: { orgName: 'LPU', ein: '99-0471961', address: '1 Main St', officer: 'K', website: 'https://x', firstFiscalYear: 2024, netAssetsStart: { 2026: 10000 } },
  donations: [{ date: '2026-02-01', kind: 'cash', amountCents: 30000, donorName: 'Ann', goodsCents: 0, donorAddress: 'A st' },
    { date: '2026-03-01', kind: 'cash', amountCents: 10000, donorName: 'Bo', goodsCents: 3000, goodsDescription: 'ticket' },
    { date: '2026-04-01', kind: 'in_kind', amountCents: 2000, donorName: 'Ann', description: '12 cans', goodsCents: 0 }],
  payees: [{ id: 'p', name: 'Ray', address: '', tinStatus: 'unknown', w9OnFile: false }],
  expenses: [{ date: '2026-05-01', payeeId: 'p', isPersonPayment: true, amountCents: 210000, serviceCents: 200000, goodsCents: 10000, withheldCents: 4800, category: 'program' },
    { date: '2026-05-02', payeeId: 'k', amountCents: 5000, category: 'management', withheldCents: 0 }],
  filings: [] };

test('990-N answer sheet', () => {
  const f = form990N(ctx);
  assert.equal(Object.fromEntries(f.fields)['Employer identification number (EIN)'], '99-0471961');
  assert.equal(Object.fromEntries(f.fields)['Gross receipts this year (for your records)'], '$420.00');
});
test('990-EZ lines tie to the books', () => {
  const f = form990EZ(ctx);
  const line = (n) => f.lines.find((l) => l[0] === `Line ${n}`)[2];
  assert.equal(line(1), '$420.00'); assert.equal(line(13), '$2,000.00'); assert.equal(line(16), '$150.00'); assert.equal(line(17), '$2,150.00');
  assert.equal(line(18), '-$1,730.00'); assert.equal(line(21), '-$1,630.00');
});
test('1099-NEC box 1 is services only, box 4 withheld, CSV row', () => {
  const f = form1099NEC(ctx);
  assert.equal(f.entries.length, 1);
  assert.equal(f.entries[0].box1Cents, 200000); assert.equal(f.entries[0].box4Cents, 4800);
  const csv = irisCsv(f, { p: '123-45-6789' });
  assert.match(csv, /"Ray","123-45-6789","","2000.00","48.00","2026"/);
});
test('donor letters carry the right wording', () => {
  const f = donorLetters(ctx);
  assert.equal(f.letters.length, 2);
  assert.match(f.letters[0].paragraphs.join(' '), /No goods or services were provided/);
  assert.match(f.letters[1].paragraphs.join(' '), /estimated value of \$30\.00.*\$70\.00/);
});
test('statements group by donor', () => {
  const f = donorStatements(ctx);
  assert.equal(f.statements.length, 2);
  const ann = f.statements.find((s) => s.donorName === 'Ann');
  assert.equal(ann.totalCents, 30000); assert.equal(ann.inKindCents, 2000); assert.equal(ann.rows.length, 2);
});
test('945 and MI solicitation', () => {
  assert.equal(Object.fromEntries(form945(ctx).fields)['Line 2: Backup withholding'], '$48.00');
  assert.match(miSolicitation(ctx).title, /CTS-03/);
});
test('in-kind food receipt states no value and the food-inventory certification', () => {
  const r = donationReceipt(ctx, ctx.donations[2]);
  const text = r.paragraphs.join(' ');
  assert.match(text, /12 cans/); assert.match(text, /No monetary value is stated/); assert.match(text, /170\(e\)\(3\)/);
  assert.doesNotMatch(text, /\$20\.00/);
  const cash = donationReceipt(ctx, ctx.donations[1]).paragraphs.join(' ');
  assert.match(cash, /\$100\.00/); assert.match(cash, /deductible amount is therefore \$70\.00/);
});
