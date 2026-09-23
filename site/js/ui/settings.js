import { h, mount, field, toast } from './dom.js';

export function renderSettings(root, { db, conn, disconnect: drop }) {
  const s = db.state.settings;
  const t = s.targets || {};
  const inp = (name, value, extra = {}) => h('input', { name, value: value ?? '', ...extra });
  const f = {
    orgName: inp('orgName', s.orgName), ein: inp('ein', s.ein, { pattern: '\\d{2}-\\d{7}' }),
    address: inp('address', s.address, { placeholder: 'Mailing address used on IRS forms' }),
    officer: inp('officer', s.officer, { placeholder: 'Principal officer name' }),
    website: inp('website', s.website, { type: 'url' }),
    mission: h('textarea', { name: 'mission', rows: 4 }, s.mission || ''),
    fyEnd: inp('fyEnd', s.fyEnd, { pattern: '\\d{2}-\\d{2}', placeholder: 'MM-DD' }),
    uniquePeople: inp('uniquePeople', t.uniquePeople, { type: 'number', min: 0 }),
    foodBags: inp('foodBags', t.foodBags, { type: 'number', min: 0 }),
    targetZips: inp('targetZips', t.targetZips, { placeholder: '48216,48209' }),
  };
  const msg = h('p', { class: 'error-text', role: 'alert' });

  async function save(ev) {
    ev.preventDefault();
    if (!/^\d{2}-\d{2}$/.test(f.fyEnd.value)) { msg.textContent = 'Fiscal year end must look like 12-31.'; return; }
    await db.save('settings', {
      ...s, orgName: f.orgName.value.trim(), ein: f.ein.value.trim(), address: f.address.value.trim(),
      officer: f.officer.value.trim(), website: f.website.value.trim(), fyEnd: f.fyEnd.value, mission: f.mission.value.trim(),
      targets: { uniquePeople: Number(f.uniquePeople.value) || 0, foodBags: Number(f.foodBags.value) || 0,
        targetZips: f.targetZips.value.replace(/\s/g, '') },
    }, { background: true });
    msg.textContent = '';
    toast('Settings saved');
  }

  function disconnect() {
    if (!confirm('Disconnect this phone? Anything not yet uploaded stays on the phone until you reconnect.')) return;
    drop();
  }

  mount(root,
    h('h1', {}, 'Settings'),
    h('form', { class: 'card', onsubmit: save },
      h('h2', {}, 'Organization'),
      field('Name', f.orgName), field('EIN', f.ein), field('Mailing address', f.address),
      field('Principal officer', f.officer), field('Website', f.website),
      field('Mission statement', f.mission, 'Printed on the impact report exactly as written here.'),
      field('Fiscal year ends (MM-DD)', f.fyEnd, 'Calendar year is 12-31, which matches the IRS.'),
      h('h2', {}, 'Yearly targets'),
      field('Unique people reached', f.uniquePeople), field('Food bags given', f.foodBags),
      field('Target ZIP codes', f.targetZips, 'Separate with commas.'),
      msg,
      h('button', { class: 'primary', type: 'submit' }, 'Save settings')),
    h('div', { class: 'card' },
      h('h2', {}, 'Connection'),
      h('p', {}, conn.mode === 'demo' ? 'Demo mode. Data stays on this phone.' : `GitHub: ${conn.owner}/${conn.repo} (${conn.branch || 'main'})`),
      h('div', { class: 'row' },
        h('button', { onclick: async () => { await db.flush().catch((e) => toast(e.message)); await db.load(); toast('Synced'); } }, 'Sync now'),
        h('button', { class: 'danger', onclick: disconnect }, 'Disconnect'))));
}
