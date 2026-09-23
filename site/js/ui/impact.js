// Impact dashboard (#/impact) and printable report (#/report), both from impactSummary().
import { h, mount, fmtDate } from './dom.js';
import { impactSummary } from '../domain/impact.js';
import { fmtMoney } from '../domain/books.js';
import { fiscalYears, currentFy } from './books.js';

const FY_KEY = 'lpu.books.fy';
const pct = (n) => `${Math.round(n * 100)}%`;

function bars(items, { total } = {}) {
  const max = Math.max(1, ...items.map((x) => x.count));
  return h('div', { class: 'bars' }, items.map((x) => h('div', { class: 'bar-row' },
    h('span', { class: 'bar-label' }, x.label ?? x.zip),
    h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${(x.count / max) * 100}%` })),
    h('span', { class: 'bar-num' }, String(x.count), total ? h('small', {}, ` ${pct(x.count / total)}`) : null))));
}

function targetBar(t) {
  const share = t.target ? Math.min(1, t.value / t.target) : 0;
  return h('div', { class: 'target' },
    h('div', { class: 'row between' }, h('strong', {}, t.label), h('span', {}, `${t.value}${t.target ? ` of ${t.target}` : ''}`)),
    t.target ? h('span', { class: 'bar-track big' }, h('span', { class: 'bar-fill' + (share >= 1 ? ' done' : ''), style: `width:${share * 100}%` })) : h('p', { class: 'hint' }, 'Set a target in Settings.'));
}

const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label));

export function summaryFor(db, fy) {
  const st = db.state;
  return impactSummary({ events: st.events, people: st.people, checkins: st.checkins, expenses: st.expenses, payees: st.payees,
    settings: st.settings, fy, fyEnd: st.settings.fyEnd || '12-31' });
}

export function renderImpact(root, { db }) {
  const fySel = h('select', { 'aria-label': 'Fiscal year', onchange: () => { sessionStorage.setItem(FY_KEY, fySel.value); draw(); } },
    fiscalYears(db).map((y) => h('option', { value: y, selected: y === currentFy(db) }, String(y))));
  const body = h('div');
  function draw() {
    const s = summaryFor(db, Number(fySel.value) || currentFy(db));
    const topZips = s.byZip.slice(0, 8);
    const other = s.byZip.slice(8).reduce((a, z) => a + z.count, 0);
    mount(body,
      h('div', { class: 'card stats' }, stat('People reached', s.uniquePeople), stat('Visits', s.visits), stat('Events', s.eventsHeld)),
      h('div', { class: 'card stats' }, stat('First-timers', s.firstTimers), stat('Returning', s.returning), stat('Volunteers', s.volunteers)),
      h('div', { class: 'card' }, h('h2', {}, 'Targets'), s.targets.map(targetBar)),
      h('div', { class: 'card' }, h('h2', {}, 'Help given'),
        h('div', { class: 'stats' }, stat('Food bags', s.help.food_bag), stat('Hot meals', s.help.meal), stat('Referrals', s.help.referral)),
        h('p', { class: 'hint' }, `${s.householdsReached} household${s.householdsReached === 1 ? '' : 's'} fed, about ${s.peopleInHouseholds} ${s.peopleInHouseholds === 1 ? 'person' : 'people'} at home.`)),
      h('div', { class: 'card' }, h('h2', {}, 'Where people come from'),
        h('p', { class: 'hint' }, `${pct(s.targetZipShare)} live in the target ZIP codes.`),
        bars([...topZips, other ? { zip: 'Other', count: other } : null].filter(Boolean), { total: s.uniquePeople })),
      h('div', { class: 'card' }, h('h2', {}, 'Ages'), bars(s.byAge, { total: s.uniquePeople })),
      h('div', { class: 'card' }, h('h2', {}, 'Why people came'), bars(s.byRole, { total: s.visits })),
      h('div', { class: 'card' }, h('h2', {}, 'Who we reach'),
        h('h3', {}, 'Gender'), bars(s.gender, { total: s.uniquePeople }),
        h('h3', {}, 'Race or ethnicity'), bars(s.race), h('h3', {}, 'Served in the military'), bars(s.veteran, { total: s.uniquePeople })),
      h('div', { class: 'card' }, h('h2', {}, 'Work opportunities'),
        h('div', { class: 'stats' }, stat('People paid', s.work.people), stat('Jobs', s.work.payments), stat('Paid out', fmtMoney(s.work.cents))),
        h('p', { class: 'hint' }, 'Community members paid for work like cleaning the lot or serving food. Counted, never named.')),
      h('a', { class: 'button primary wide', href: `#/report/${s.fy}` }, 'Open the printable report'));
  }
  mount(root, h('div', { class: 'head' }, h('h1', {}, 'Impact'), fySel), body);
  draw();
  return db.onChange(draw);
}

export function renderReport(root, { db }, param) {
  const fy = Number(param) || currentFy(db);
  const s = summaryFor(db, fy);
  const st = db.state.settings;
  const table = (rows) => h('table', { class: 'report-table' }, rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, String(v)))));
  const dist = (items, total) => table(items.map((x) => [x.label ?? x.zip, total ? `${x.count} (${pct(x.count / total)})` : x.count]));
  document.body.classList.add('report');
  mount(root,
    h('div', { class: 'row screen-only' }, h('button', { class: 'primary', onclick: () => window.print() }, 'Print or save as PDF'), h('a', { class: 'button', href: '#/impact' }, 'Back')),
    h('article', { class: 'report-page' },
      h('header', {}, h('img', { src: 'icons/logo-160.png', alt: '', width: 72, height: 72 }),
        h('h1', {}, st.orgName), h('p', { class: 'report-title' }, `Impact report, ${fy}`)),
      h('section', {}, h('h2', {}, 'Our mission'), h('p', {}, st.mission || '')),
      h('section', {}, h('h2', {}, 'The year in numbers'),
        table([['Events held', s.eventsHeld], ['People reached', s.uniquePeople], ['Total visits', s.visits], ['First-time guests', s.firstTimers],
          ['Returning guests', s.returning], ['Volunteers', s.volunteers], ['Food bags given', s.help.food_bag], ['Hot meals served', s.help.meal],
          ['Resource referrals', s.help.referral], ['Households fed', s.householdsReached], ['People in those households', s.peopleInHouseholds],
          ['Community members given paid work', s.work.people], ['Paid work opportunities', s.work.payments]])),
      s.targets.some((t) => t.target) && h('section', {}, h('h2', {}, 'Progress on our goals'),
        table(s.targets.filter((t) => t.target).map((t) => [t.label, `${t.value} of ${t.target} (${pct(Math.min(1, t.value / t.target))})`]))),
      h('section', {}, h('h2', {}, 'Where our guests live'), h('p', {}, `${pct(s.targetZipShare)} of guests live in our target ZIP codes (${st.targets?.targetZips || ''}).`), dist(s.byZip, s.uniquePeople)),
      h('section', {}, h('h2', {}, 'Ages'), dist(s.byAge, s.uniquePeople)),
      h('section', {}, h('h2', {}, 'Who came and why'), dist(s.byRole, s.visits)),
      h('section', {}, h('h2', {}, 'Who we reach'), h('h3', {}, 'Gender'), dist(s.gender, s.uniquePeople), h('h3', {}, 'Race or ethnicity'), dist(s.race), h('h3', {}, 'Served in the military'), dist(s.veteran, s.uniquePeople),
        h('p', { class: 'hint' }, 'Every question at check-in is optional. "Not given" means the guest chose to skip it.')),
      h('section', {}, h('h2', {}, 'Events'), table(s.events.map((e) => [`${fmtDate(e.date)}: ${e.name}`, `${e.count} checked in`]))),
      h('footer', {}, h('p', {}, `${st.orgName} is a 501(c)(3) nonprofit, EIN ${st.ein}. ${st.website || ''}`))));
  return () => document.body.classList.remove('report');
}
