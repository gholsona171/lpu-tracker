import { h, field, toast } from './dom.js';
import { createGithubStore } from '../store/github.js';

export function renderSetup({ getConn, onDone }) {
  const old = getConn() || {};
  const owner = h('input', { name: 'owner', value: old.owner || 'gholsona171', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const repo = h('input', { name: 'repo', value: old.repo || 'lpu-tracker', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const branch = h('input', { name: 'branch', value: old.branch || 'main', autocapitalize: 'off' });
  const token = h('input', { name: 'token', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: 'github_pat_…' });
  const msg = h('p', { class: 'hint', role: 'status' });

  async function connect(ev) {
    ev.preventDefault();
    const conn = { mode: 'github', owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main',
      token: token.value.trim() || old.token };
    if (!conn.owner || !conn.repo || !conn.token) { msg.textContent = 'Fill in the owner, repo and token.'; return; }
    msg.textContent = 'Checking…';
    try {
      await createGithubStore(conn).readJson('data/events.json');
      token.value = '';
      toast('Connected');
      onDone(conn);
    } catch (e) {
      msg.textContent = e.status === 401 ? 'GitHub did not accept that token.'
        : e.status === 404 ? 'Repo not found, or the token cannot see it.' : `Could not connect: ${e.message}`;
    }
  }

  return h('section', { class: 'setup' },
    h('img', { src: 'icons/logo-160.png', alt: 'Love, Peace & Unity', class: 'logo', width: 96, height: 96 }),
    h('h1', {}, 'LPU Tracker'),
    h('p', {}, 'Check people in at events, keep the books, and stay on top of filings.'),
    h('div', { class: 'card' },
      h('h2', {}, 'Connect to GitHub'),
      h('p', { class: 'hint' }, 'Use a fine-grained token that can only reach this one repo, with Contents set to read and write. It stays on this phone.'),
      h('form', { onsubmit: connect },
        field('Owner', owner), field('Repo', repo), field('Branch', branch),
        field('Token', token, old.token ? 'A token is saved. Leave blank to keep it.' : ''),
        h('button', { class: 'primary', type: 'submit' }, 'Connect'),
        msg)),
    h('div', { class: 'card' },
      h('h2', {}, 'Just looking?'),
      h('p', { class: 'hint' }, 'Demo mode keeps made-up data on this phone only. Nothing is uploaded.'),
      h('button', { onclick: () => onDone({ mode: 'demo' }) }, 'Try demo mode')));
}
