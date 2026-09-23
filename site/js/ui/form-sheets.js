// Renders a generated form (answer sheet, worksheet, 1099 copies, letters) into a printable block.
import { h, mount, toast } from './dom.js';
import { FORM_BUILDERS, DISCLAIMER, irisCsv } from '../domain/forms.js';
import { fmtMoney } from '../domain/books.js';
import { contextFor } from './filings.js';

const printBtn = () => h('button', { class: 'screen-only', onclick: () => window.print() }, 'Print or save as PDF');
const fieldsTable = (fields) => h('table', { class: 'report-table' }, fields.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v || '—'))));
const sheet = (title, ...kids) => h('article', { class: 'report-page sheet' }, h('header', {}, h('h1', {}, title), h('p', { class: 'hint' }, DISCLAIMER)), ...kids);

function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

function renderAnswerSheet(f) {
  return sheet(f.title, fieldsTable(f.fields),
    f.lines && h('table', { class: 'report-table' }, f.lines.map(([n, label, v]) => h('tr', {}, h('td', {}, h('strong', {}, n), ' ', label), h('td', {}, v)))),
    h('p', { class: 'hint' }, f.where));
}

function render1099(f) {
  const tins = {};
  const tinInputs = new Map(f.entries.map((e) => [e.payeeId, h('input', { class: 'screen-only', placeholder: 'Recipient tax ID (not saved)', autocomplete: 'off', inputmode: 'numeric', maxlength: 11,
    oninput: (ev) => { tins[e.payeeId] = ev.target.value.trim(); ev.target.closest('.copy').querySelector('.tin').textContent = tins[e.payeeId] || '(type above)'; } })]));
  const copy = (e, which) => h('div', { class: 'copy card' },
    h('h2', {}, `Form 1099-NEC ${f.year}, Copy ${which}`),
    h('table', { class: 'report-table' },
      h('tr', {}, h('td', {}, 'Payer'), h('td', {}, `${f.payer.name}, ${f.payer.address}`)), h('tr', {}, h('td', {}, "Payer's TIN"), h('td', {}, f.payer.ein)),
      h('tr', {}, h('td', {}, 'Recipient'), h('td', {}, `${e.recipientName}${e.recipientAddress ? ', ' + e.recipientAddress : ' (address needed)'}`)),
      h('tr', {}, h('td', {}, "Recipient's TIN"), h('td', { class: 'tin' }, tins[e.payeeId] || '(type above)')),
      h('tr', {}, h('td', {}, 'Box 1: Nonemployee compensation'), h('td', {}, fmtMoney(e.box1Cents))),
      h('tr', {}, h('td', {}, 'Box 4: Federal income tax withheld'), h('td', {}, fmtMoney(e.box4Cents)))));
  return sheet(f.title,
    h('p', {}, f.where), h('p', { class: 'hint' }, 'Tax IDs are typed here for printing only and are never saved.'),
    f.entries.map((e) => h('div', {}, tinInputs.get(e.payeeId), copy(e, 'B (recipient)'), copy(e, 'C (LPU records)'))),
    h('button', { class: 'screen-only', onclick: () => download(`1099nec-${f.year}.csv`, irisCsv(f, tins), 'text/csv') }, 'Download IRIS CSV (check column order against the IRIS template)'));
}

const para = (p) => h('p', { style: 'white-space: pre-line' }, p);
function renderLetters(f) {
  return sheet(f.title, f.letters.length === 0 && h('p', {}, 'No letters needed.'),
    f.letters.map((l) => h('div', { class: 'letter' }, h('p', {}, new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })),
      h('p', {}, l.donorName, h('br'), l.donorAddress || l.donorEmail || h('em', {}, 'address needed')), l.paragraphs.map(para))));
}
function renderStatements(f) {
  return sheet(f.title, f.statements.map((s) => h('div', { class: 'letter' },
    h('p', {}, s.donorName, h('br'), s.donorAddress || s.donorEmail || ''), h('p', {}, s.intro),
    h('table', { class: 'report-table' }, s.rows.map((r) => h('tr', {}, h('td', {}, `${r[0]} · ${r[1]}${r[3] ? ' · ' + r[3] : ''}`), h('td', {}, r[2])))),
    h('p', {}, h('strong', {}, `Total gifts: ${fmtMoney(s.totalCents)}`), s.inKindCents ? ` plus non-cash gifts valued by you at ${fmtMoney(s.inKindCents)}` : ''),
    h('p', { class: 'hint' }, s.footer))));
}

export function renderSheet(box, db, item) {
  const build = FORM_BUILDERS[item.id];
  if (!build) { toast('No form for this item.'); return; }
  const f = build(contextFor(db, item.fy));
  const view = f.entries ? render1099(f) : f.letters ? renderLetters(f) : f.statements ? renderStatements(f) : renderAnswerSheet(f);
  mount(box, h('div', { class: 'row screen-only' }, printBtn()), view);
  box.scrollIntoView({ behavior: 'smooth' });
}
