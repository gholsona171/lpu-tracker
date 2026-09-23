// Books tab: donations, expenses, people paid, filtered by fiscal year.
import { h, mount, fmtDate } from './dom.js';
import { fiscalYearFor } from '../domain/fiscal.js';
import { fmtMoney, donationFlags, donationTotals, expenseTotals, payeeYear, necThreshold, inFiscalYear } from '../domain/books.js';
import { todayLocal } from '../domain/time.js';

const SEG_KEY = 'lpu.books.seg';
const FY_KEY = 'lpu.books.fy';
export const CATEGORY_LABEL = { program: 'Program', management: 'Management', fundraising: 'Fundraising' };
export const METHOD_LABEL = { zeffy: 'Zeffy', cash: 'Cash', check: 'Check', card: 'Card', cashapp: 'Cash App', gift_card: 'Gift card', other: 'Other' };

export function fiscalYears(db) {
  const fyEnd = db.state.settings.fyEnd || '12-31';
  const years = new Set([fiscalYearFor(todayLocal(), fyEnd)]);
  for (const kind of ['donations', 'expenses']) for (const r of db.active(kind)) years.add(fiscalYearFor(r.date, fyEnd));
  return [...years].sort((a, b) => b - a);
}

export function currentFy(db) {
  const years = fiscalYears(db);
  const saved = Number(sessionStorage.getItem(FY_KEY));
  return years.includes(saved) ? saved : years[0];
}

const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));

function donationsView(db, fy, fyEnd) {
  const t = donationTotals(db.active('donations'), fy, fyEnd);
  const rows = db.active('donations').filter((d) => inFiscalYear(d, fy, fyEnd)).sort((a, b) => b.date.localeCompare(a.date));
  return [
    h('div', { class: 'card stats' }, stat('Cash', fmtMoney(t.cashCents)), stat('In-kind', fmtMoney(t.inKindCents)), stat('Gross receipts', fmtMoney(t.grossReceiptsCents))),
    h('a', { class: 'button primary wide', href: '#/donation/new' }, 'Add a donation'),
    h('h2', { class: 'section' }, `${rows.length} gifts`),
    rows.length ? rows.map((d) => {
      const f = donationFlags(d);
      return h('a', { class: 'list-row', href: `#/donation/${encodeURIComponent(d.id)}` },
        h('span', {}, d.anonymous ? 'Anonymous' : d.donorName, h('small', {}, `${fmtDate(d.date)} · ${d.kind === 'in_kind' ? 'In-kind: ' + (d.description || 'goods') : METHOD_LABEL[d.method] || d.method}`)),
        h('span', { class: 'row' }, f.ackRequired && h('span', { class: 'pill warn' }, 'Ack needed'), f.qpqDisclosure && h('span', { class: 'pill warn' }, 'Disclosure'),
          h('strong', {}, fmtMoney(d.amountCents))));
    }) : h('p', { class: 'hint' }, 'No gifts recorded for this year.'),
  ];
}

function expensesView(db, fy, fyEnd) {
  const t = expenseTotals(db.active('expenses'), fy, fyEnd);
  const rows = db.active('expenses').filter((e) => inFiscalYear(e, fy, fyEnd)).sort((a, b) => b.date.localeCompare(a.date));
  const payees = new Map(db.active('payees').map((p) => [p.id, p]));
  return [
    h('div', { class: 'card stats' }, stat('Program', fmtMoney(t.program)), stat('Management', fmtMoney(t.management)), stat('Fundraising', fmtMoney(t.fundraising))),
    h('div', { class: 'row' }, h('a', { class: 'button primary', href: '#/expense/new' }, 'Add an expense'), h('a', { class: 'button', href: '#/pay/new' }, 'Pay a person')),
    h('h2', { class: 'section' }, `${rows.length} expenses · ${fmtMoney(t.totalCents)}`),
    rows.length ? rows.map((e) => h('a', { class: 'list-row', href: `#/${e.isPersonPayment ? 'pay' : 'expense'}/${encodeURIComponent(e.id)}` },
      h('span', {}, payees.get(e.payeeId)?.name || e.payeeName || '(unknown)', h('small', {}, `${fmtDate(e.date)} · ${e.isPersonPayment ? e.workDone : CATEGORY_LABEL[e.category]}${e.withheldCents ? ' · held back ' + fmtMoney(e.withheldCents) : ''}`)),
      h('span', { class: 'row' }, e.isPersonPayment && h('span', { class: 'pill' }, 'Person'), e.signature && h('span', { class: 'pill ok' }, 'Signed'), h('strong', {}, fmtMoney(e.amountCents)))))
      : h('p', { class: 'hint' }, 'No expenses recorded for this year.'),
  ];
}

function payeesView(db, fy, fyEnd) {
  const year = fy;
  const rows = db.active('payees').map((p) => ({ p, y: payeeYear(db.active('expenses'), p.id, fy, fyEnd) }))
    .sort((a, b) => b.y.servicesCents - a.y.servicesCents);
  return [
    h('a', { class: 'button primary wide', href: '#/pay/new' }, 'Pay a person'),
    h('h2', { class: 'section' }, `${rows.length} people and vendors`),
    rows.length ? rows.map(({ p, y }) => h('a', { class: 'list-row', href: `#/payee/${encodeURIComponent(p.id)}` },
      h('span', {}, p.name, h('small', {}, `${p.kind === 'business' ? 'Business' : 'Individual'} · ${y.paymentsCount} payments this year`)),
      h('span', { class: 'row' },
        p.w9OnFile ? h('span', { class: 'pill ok' }, 'W-9') : y.servicesCents >= 150000 && h('span', { class: 'pill warn' }, 'Need W-9'),
        y.servicesCents >= necThreshold(year) && h('span', { class: 'pill warn' }, '1099'),
        y.recentCount >= 4 && h('span', { class: 'pill bad', title: 'Paid often; may be an employee' }, 'Check status'),
        h('strong', {}, fmtMoney(y.servicesCents + y.goodsCents)))))
      : h('p', { class: 'hint' }, 'No one paid yet.'),
  ];
}

export function renderBooks(root, { db }) {
  const fyEnd = db.state.settings.fyEnd || '12-31';
  let seg = sessionStorage.getItem(SEG_KEY) || 'donations';
  const body = h('div');
  const fySel = h('select', { 'aria-label': 'Fiscal year', onchange: () => { sessionStorage.setItem(FY_KEY, fySel.value); draw(); } },
    fiscalYears(db).map((y) => h('option', { value: y, selected: y === currentFy(db) }, fyEnd === '12-31' ? String(y) : `FY ${y}`)));
  const segs = h('div', { class: 'segs', role: 'tablist' }, ['donations', 'expenses', 'payees'].map((s) =>
    h('button', { type: 'button', role: 'tab', class: s === seg ? 'on' : '', onclick: () => { seg = s; sessionStorage.setItem(SEG_KEY, s); draw(); } },
      { donations: 'Donations', expenses: 'Expenses', payees: 'People paid' }[s])));

  function draw() {
    const fy = Number(fySel.value) || currentFy(db);
    for (const b of segs.children) b.classList.toggle('on', b.textContent === { donations: 'Donations', expenses: 'Expenses', payees: 'People paid' }[seg]);
    mount(body, (seg === 'donations' ? donationsView : seg === 'expenses' ? expensesView : payeesView)(db, fy, fyEnd));
  }
  mount(root, h('div', { class: 'head' }, h('h1', {}, 'Books'), fySel), segs, body);
  draw();
  return db.onChange(draw);
}
