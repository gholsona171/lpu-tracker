// Filings: the compliance calendar (#/filings) and one filing's detail (#/filing/<id>/<fy>).
import { h, mount, field, toast, fmtDate } from './dom.js';
import { evaluate, icsFor } from '../domain/compliance.js';
import { todayLocal } from '../domain/time.js';
import { fiscalYears, currentFy } from './books.js';
import { renderSheet } from './form-sheets.js';

const FY_KEY = 'lpu.books.fy';
export const STATUS_LABEL = { 'not-required': 'Not required', filed: 'Filed', overdue: 'Overdue', 'due-soon': 'Due soon', 'needs-you': 'Needs you', ready: 'Ready', upcoming: 'Upcoming' };
const STATUS_CLASS = { overdue: 'bad', 'due-soon': 'warn', 'needs-you': 'warn', filed: 'ok', ready: 'ok' };

export function contextFor(db, fy) {
  const st = db.state;
  return { fy, fyEnd: st.settings.fyEnd || '12-31', today: todayLocal(), settings: st.settings,
    donations: db.active('donations'), expenses: db.active('expenses'), payees: db.active('payees'), filings: db.active('filings') };
}
export const itemsFor = (db, fy) => evaluate(contextFor(db, fy));

export function alertsFor(db) {
  const years = [...new Set([currentFy(db) - 1, currentFy(db), currentFy(db) + 1])];
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return years.flatMap((fy) => itemsFor(db, fy)).filter((i) => i.applies && (i.status === 'overdue' || (i.status !== 'filed' && i.due <= soon)))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export const filingRow = (i) => h('a', { class: 'list-row', href: `#/filing/${i.id}/${i.fy}` },
  h('span', {}, i.name, h('small', {}, `${i.agency} · due ${fmtDate(i.due)}`)),
  h('span', { class: `pill ${STATUS_CLASS[i.status] || ''}` }, STATUS_LABEL[i.status]));

function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export function renderFilings(root, { db }) {
  const fySel = h('select', { 'aria-label': 'Fiscal year', onchange: () => { sessionStorage.setItem(FY_KEY, fySel.value); draw(); } },
    [...new Set([...fiscalYears(db), currentFy(db) + 1, 2025, 2024])].sort((a, b) => b - a).map((y) => h('option', { value: y, selected: y === currentFy(db) }, String(y))));
  const body = h('div');
  function draw() {
    const fy = Number(fySel.value) || currentFy(db);
    const items = itemsFor(db, fy);
    const active = items.filter((i) => i.applies);
    mount(body,
      h('p', { class: 'hint' }, `Everything LPU owes for the ${fy} year. The app prepares each one; you file it and record it here.`),
      active.map(filingRow),
      h('h2', { class: 'section' }, 'Not required this year'),
      items.filter((i) => !i.applies).map((i) => h('div', { class: 'list-row muted' }, h('span', {}, i.name, h('small', {}, i.agency)), h('span', { class: 'pill' }, 'Not required'))),
      h('button', { class: 'wide', onclick: () => download(`lpu-filings-${fy}.ics`, icsFor(active, db.state.settings.orgName), 'text/calendar') }, 'Add due dates to my calendar'));
  }
  mount(root, h('div', { class: 'head' }, h('h1', {}, 'Filings'), fySel), body);
  draw();
  return db.onChange(draw);
}

export function renderFiling(root, { db }, param) {
  const [id, fyStr] = String(param || '').split('/');
  const fy = Number(fyStr) || currentFy(db);
  const item = itemsFor(db, fy).find((i) => i.id === id);
  if (!item) { mount(root, h('p', {}, 'Not found.')); return; }
  const filedDate = h('input', { type: 'date', name: 'filedDate', value: item.filing?.filedDate || todayLocal() });
  const confirmation = h('input', { name: 'confirmation', value: item.filing?.confirmation || '', placeholder: 'Confirmation or receipt number' });
  const sheetBox = h('div');

  async function mark(status) {
    const rec = { ...(item.filing || {}), ruleId: item.id, fy, status, filedDate: status === 'filed' ? filedDate.value : '', confirmation: confirmation.value.trim() };
    await db.save('filing', rec, { background: true });
    toast(status === 'filed' ? 'Recorded as filed' : status === 'not-required' ? 'Marked not required' : 'Reopened');
    location.hash = '#/filings';
  }

  mount(root,
    h('a', { href: '#/filings', class: 'hint' }, '← Filings'),
    h('h1', {}, item.name),
    h('p', {}, h('span', { class: `pill ${STATUS_CLASS[item.status] || ''}` }, STATUS_LABEL[item.status]), ` · ${item.agency} · due ${fmtDate(item.due)}`),
    item.notes.map((n) => h('p', {}, n)),
    item.needsYou.length > 0 && h('div', { class: 'card' }, h('h2', {}, 'Needs you'), h('ul', {}, item.needsYou.map((n) => h('li', {}, n)))),
    item.applies && item.id !== 'payroll' && h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => renderSheet(sheetBox, db, item) }, 'Open the form'),
      h('a', { class: 'button', href: '#/settings' }, 'Settings')),
    sheetBox,
    item.applies && h('div', { class: 'card' }, h('h2', {}, 'Record the filing'),
      field('Date filed', filedDate), field('Confirmation', confirmation),
      h('div', { class: 'row' },
        item.status !== 'filed' && h('button', { class: 'primary', onclick: () => mark('filed') }, 'Mark as filed'),
        item.status !== 'filed' && item.status !== 'not-required' && h('button', { onclick: () => confirm('Mark this as not required this year?') && mark('not-required') }, 'Not required this year'),
        (item.status === 'filed' || item.filing?.status === 'not-required') && h('button', { onclick: () => mark('open') }, 'Reopen'))));
}
