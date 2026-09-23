// Pay a person: the flow from spec §5a. Advice is recomputed live from books.js.
import { h, mount, field, toast, select, fmtDate } from './dom.js';
import { sanitizeExpense, sanitizePayee, EXPENSE_METHODS } from '../domain/validate-books.js';
import { paymentAdvice, fmtMoney, toCents, payeeYear, necThreshold } from '../domain/books.js';
import { fiscalYearFor } from '../domain/fiscal.js';
import { todayLocal } from '../domain/time.js';
import { norm } from '../domain/people.js';
import { METHOD_LABEL } from './books.js';
import { eventOptions } from './donation-form.js';
import { signaturePad, strokesToSvg } from './signature.js';

// Search existing payees or type a new name. resolve() returns {id, name}, creating the payee if new.
export function payeePicker(db, { payeeId = '', payeeName = '', defaultKind = 'individual' } = {}) {
  let chosen = payeeId ? db.active('payees').find((p) => p.id === payeeId) : null;
  const input = h('input', { name: 'payeeName', value: chosen ? chosen.name : payeeName, placeholder: 'Name', autocomplete: 'off', autocapitalize: 'words', maxlength: 80 });
  const results = h('div', { class: 'results' });
  const status = h('span', { class: 'hint' }, chosen ? 'Existing record' : '');
  function draw() {
    const q = norm(input.value);
    // An exact name match always means the existing record, so we never create a duplicate "Ray".
    chosen = chosen && norm(chosen.name) === q ? chosen : db.active('payees').find((p) => norm(p.name) === q) || null;
    status.textContent = chosen ? 'Existing record' : input.value.trim() ? 'New person or vendor' : '';
    if (!q || chosen) { mount(results); return; }
    const hits = db.active('payees').filter((p) => norm(p.name).includes(q)).slice(0, 6);
    mount(results, hits.map((p) => h('button', { type: 'button', class: 'list-row', onclick: () => { chosen = p; input.value = p.name; draw(); input.dispatchEvent(new Event('change')); } },
      h('span', {}, p.name, h('small', {}, p.kind === 'business' ? 'Business' : 'Individual')))));
  }
  input.addEventListener('input', draw);
  return {
    el: h('div', {}, input, status, results),
    current: () => chosen,
    async resolve() {
      draw();
      if (chosen) return chosen;
      const v = sanitizePayee({ name: input.value, kind: defaultKind, communityWorker: defaultKind === 'individual' });
      if (!v.ok) return null;
      chosen = await db.save('payee', v.record, { background: true });
      return chosen;
    },
  };
}

export function renderPayForm(root, { db }, id) {
  const existing = id !== 'new' ? db.active('expenses').find((e) => e.id === id) : null;
  if (id !== 'new' && !existing) { mount(root, h('p', {}, 'Payment not found.')); return; }
  const fyEnd = db.state.settings.fyEnd || '12-31';
  const e = existing || { date: todayLocal(), method: 'cash' };
  const picker = payeePicker(db, { payeeId: e.payeeId, payeeName: e.payeeName });
  const f = {
    date: h('input', { name: 'date', type: 'date', value: e.date, required: true }),
    workDone: h('input', { name: 'workDone', value: e.workDone || '', maxlength: 120, placeholder: 'e.g. Cleaned the lot before the show' }),
    amount: h('input', { name: 'amount', inputmode: 'decimal', value: existing ? (e.amountCents / 100).toFixed(2) : '', placeholder: '0.00', required: true }),
    goods: h('input', { name: 'goods', inputmode: 'decimal', value: e.goodsCents ? (e.goodsCents / 100).toFixed(2) : '', placeholder: '0.00' }),
    method: select('method', EXPENSE_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] })), e.method, 'How was it paid?'),
    w9Today: h('input', { type: 'checkbox', name: 'w9Today' }),
    eventId: eventOptions(db, e.eventId),
  };
  const advice = h('div', { class: 'card advice', 'aria-live': 'polite' });
  const msg = h('p', { class: 'error-text', role: 'alert' });
  const pad = existing?.signature ? null : signaturePad();
  const sigView = existing?.signature ? h('div', { class: 'card' }, h('p', { class: 'hint' }, `Signed ${existing.signedAt ? fmtDate(existing.signedAt.slice(0, 10)) : ''}`), strokesToSvg(existing.signature)) : null;

  function currentAdvice() {
    const payee = picker.current() || { id: '__new__', w9OnFile: f.w9Today.checked, tinStatus: f.w9Today.checked ? 'provided' : 'unknown' };
    const amount = toCents(f.amount.value) ?? 0, goods = Math.min(toCents(f.goods.value) ?? 0, amount);
    const others = db.active('expenses').filter((x) => !existing || x.id !== existing.id);
    const eff = { ...payee, w9OnFile: payee.w9OnFile || f.w9Today.checked, tinStatus: f.w9Today.checked ? 'provided' : payee.tinStatus };
    return { payee: eff, a: paymentAdvice({ payee: eff, expenses: others, date: f.date.value || todayLocal(), serviceCents: amount - goods, goodsCents: goods, fyEnd }) };
  }
  function drawAdvice() {
    const amount = toCents(f.amount.value);
    if (!amount) { mount(advice, h('p', { class: 'hint' }, 'Enter an amount to see the tax check.')); return; }
    const { a } = currentAdvice();
    mount(advice,
      h('p', {}, h('strong', {}, 'This year: '), `${fmtMoney(a.servicesBefore)} before, ${fmtMoney(a.servicesAfter)} after this payment. 1099 line is ${fmtMoney(a.threshold)}.`),
      a.notes.map((n) => h('p', { class: a.withholdCents || a.employmentWarning ? 'warn-text' : 'hint' }, n)),
      a.withholdCents ? h('p', {}, h('strong', {}, `Hand over ${fmtMoney(a.netCents)}`), ` and set aside ${fmtMoney(a.withholdCents)} for the IRS.`)
        : h('p', { class: 'hint' }, 'No hold-back needed.'));
  }
  for (const el of [f.amount, f.goods, f.date, f.w9Today]) el.addEventListener('input', drawAdvice);
  picker.el.addEventListener('change', drawAdvice);
  picker.el.addEventListener('input', drawAdvice);
  drawAdvice();

  async function save(ev) {
    ev.preventDefault();
    const payee = await picker.resolve();
    if (!payee) { msg.textContent = 'Who was paid?'; return; }
    if (pad && f.method.value === 'cash' && pad.isEmpty()) { msg.textContent = 'Cash payments need a signature. Hand them the phone to sign.'; return; }
    const { a } = currentAdvice();
    const v = sanitizeExpense({ date: f.date.value, amount: f.amount.value, goods: f.goods.value, method: f.method.value, workDone: f.workDone.value,
      eventId: f.eventId.value, payeeId: payee.id, payeeName: payee.name, isPersonPayment: true, category: 'program', withheldCents: a.withholdCents,
      signature: pad && !pad.isEmpty() ? pad.strokes() : existing?.signature || null, signedAt: pad && !pad.isEmpty() ? new Date().toISOString() : existing?.signedAt || '' });
    if (!v.ok) { msg.textContent = v.errors.join(' '); return; }
    if (f.w9Today.checked && (!payee.w9OnFile || payee.tinStatus !== 'provided')) {
      await db.save('payee', { ...payee, w9OnFile: true, w9Date: todayLocal(), tinStatus: 'provided' }, { background: true });
    }
    await db.save('expense', { ...(existing || {}), ...v.record }, { background: true });
    toast(a.withholdCents ? `Saved. Set aside ${fmtMoney(a.withholdCents)}.` : 'Payment saved');
    location.hash = '#/books';
  }
  async function remove() {
    if (!confirm('Delete this payment?')) return;
    await db.save('expense', { ...existing, deleted: true }, { background: true });
    location.hash = '#/books';
  }

  mount(root, h('h1', {}, existing ? 'Payment' : 'Pay a person'),
    h('form', { class: 'card', onsubmit: save },
      field('Who', picker.el), field('What they did', f.workDone), field('Date', f.date),
      field('Amount ($)', f.amount), field('Part of that for goods, not work ($)', f.goods, 'For example, food they bought and brought. Leave blank if it was all for their work.'),
      field('Paid by', f.method), field('Event', f.eventId),
      h('label', { class: 'check' }, f.w9Today, 'They gave a W-9 with their tax ID today (keep the paper; nothing is typed here)'),
      advice, pad && field('Their signature', pad.el), sigView, msg,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, existing ? 'Save' : 'Record payment'), h('a', { class: 'button', href: '#/books' }, 'Cancel'),
        existing && h('button', { type: 'button', class: 'danger', onclick: remove }, 'Delete'))));
}

export function renderPayee(root, { db }, id) {
  const p = db.active('payees').find((x) => x.id === id);
  if (!p) { mount(root, h('p', {}, 'Not found.')); return; }
  const fyEnd = db.state.settings.fyEnd || '12-31';
  const fy = fiscalYearFor(todayLocal(), fyEnd);
  const y = payeeYear(db.active('expenses'), p.id, fy, fyEnd);
  const f = {
    name: h('input', { name: 'name', value: p.name, maxlength: 80 }),
    kind: select('kind', [{ value: 'individual', label: 'Individual (a person)' }, { value: 'business', label: 'Business' }], p.kind, 'Pick one'),
    address: h('input', { name: 'address', value: p.address || '', placeholder: 'Needed on a 1099. "c/o" a shelter is fine.' }),
    w9OnFile: h('input', { type: 'checkbox', name: 'w9OnFile', checked: p.w9OnFile }),
    w9Date: h('input', { name: 'w9Date', type: 'date', value: p.w9Date || '' }),
    tinStatus: select('tinStatus', [{ value: 'unknown', label: 'Not asked yet' }, { value: 'provided', label: 'Provided on W-9' }, { value: 'refused', label: 'Declined to give one' }], p.tinStatus, 'Pick one'),
    communityWorker: h('input', { type: 'checkbox', name: 'communityWorker', checked: p.communityWorker }),
    note: h('input', { name: 'note', value: p.note || '' }),
  };
  const msg = h('p', { class: 'error-text' });
  async function save(ev) {
    ev.preventDefault();
    const v = sanitizePayee(Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value])));
    if (!v.ok) { msg.textContent = v.errors.join(' '); return; }
    await db.save('payee', { ...p, ...v.record }, { background: true });
    toast('Saved'); location.hash = '#/books';
  }
  const history = db.active('expenses').filter((x) => x.payeeId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  mount(root, h('h1', {}, p.name),
    h('div', { class: 'card stats' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, fmtMoney(y.servicesCents)), h('span', { class: 'stat-label' }, `Work paid ${fy}`)),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, fmtMoney(necThreshold(fy))), h('span', { class: 'stat-label' }, '1099 line')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, fmtMoney(y.withheldCents)), h('span', { class: 'stat-label' }, 'Held back'))),
    y.recentCount >= 4 && h('p', { class: 'warn-text' }, 'Paid 4 or more times in 90 days. If this person works a regular schedule LPU directs, they may count as an employee. Check with a preparer.'),
    h('form', { class: 'card', onsubmit: save },
      field('Name', f.name), field('Type', f.kind), field('Mailing address', f.address),
      h('label', { class: 'check' }, f.w9OnFile, 'W-9 on file (paper kept by LPU)'), field('W-9 date', f.w9Date), field('Tax ID', f.tinStatus),
      h('label', { class: 'check' }, f.communityWorker, 'Community member given work (reported by count only, never by name)'),
      field('Note', f.note), msg,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save'), h('a', { class: 'button', href: '#/books' }, 'Back'))),
    h('h2', { class: 'section' }, 'Payments'),
    history.map((x) => h('a', { class: 'list-row', href: `#/${x.isPersonPayment ? 'pay' : 'expense'}/${encodeURIComponent(x.id)}` },
      h('span', {}, x.workDone || x.note || 'Expense', h('small', {}, fmtDate(x.date))), h('strong', {}, fmtMoney(x.amountCents)))));
}
