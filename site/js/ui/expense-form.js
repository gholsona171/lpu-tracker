import { h, mount, field, toast, select } from './dom.js';
import { sanitizeExpense, EXPENSE_METHODS, CATEGORIES } from '../domain/validate-books.js';
import { todayLocal } from '../domain/time.js';
import { CATEGORY_LABEL, METHOD_LABEL } from './books.js';
import { eventOptions } from './donation-form.js';
import { payeePicker } from './pay-form.js';

export function renderExpenseForm(root, { db }, id) {
  const existing = id !== 'new' ? db.active('expenses').find((e) => e.id === id) : null;
  if (id !== 'new' && !existing) { mount(root, h('p', {}, 'Expense not found.')); return; }
  const e = existing || { date: todayLocal(), category: 'program', method: 'card' };
  const picker = payeePicker(db, { payeeId: e.payeeId, payeeName: e.payeeName, defaultKind: 'business' });
  const f = {
    date: h('input', { name: 'date', type: 'date', value: e.date, required: true }),
    amount: h('input', { name: 'amount', inputmode: 'decimal', value: existing ? (e.amountCents / 100).toFixed(2) : '', placeholder: '0.00', required: true }),
    category: select('category', CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })), e.category, 'Pick one'),
    method: select('method', EXPENSE_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] })), e.method, 'How was it paid?'),
    note: h('input', { name: 'note', value: e.note || '', maxlength: 200, placeholder: 'What was it for?' }),
    eventId: eventOptions(db, e.eventId),
  };
  const msg = h('p', { class: 'error-text', role: 'alert' });

  async function save(ev) {
    ev.preventDefault();
    const payee = await picker.resolve();
    if (!payee) { msg.textContent = 'Who was paid?'; return; }
    const v = sanitizeExpense({ date: f.date.value, amount: f.amount.value, category: f.category.value, method: f.method.value,
      note: f.note.value, eventId: f.eventId.value, payeeId: payee.id, payeeName: payee.name });
    if (!v.ok) { msg.textContent = v.errors.join(' '); return; }
    await db.save('expense', { ...(existing || {}), ...v.record }, { background: true });
    toast('Expense saved'); location.hash = '#/books';
  }
  async function remove() {
    if (!confirm('Delete this expense?')) return;
    await db.save('expense', { ...existing, deleted: true }, { background: true });
    location.hash = '#/books';
  }

  mount(root, h('h1', {}, existing ? 'Edit expense' : 'Add an expense'),
    !existing && h('p', { class: 'hint' }, 'Paying a person for their work? ', h('a', { href: '#/pay/new' }, 'Use Pay a person'), ' instead so the tax rules are handled.'),
    h('form', { class: 'card', onsubmit: save },
      field('Date', f.date), field('Paid to', picker.el), field('Amount ($)', f.amount),
      field('Category', f.category, 'Program is anything for the events and people served. Management is admin. Fundraising is raising money.'),
      field('Paid by', f.method), field('Note', f.note), field('Event', f.eventId), msg,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save'), h('a', { class: 'button', href: '#/books' }, 'Cancel'),
        existing && h('button', { type: 'button', class: 'danger', onclick: remove }, 'Delete'))));
}
