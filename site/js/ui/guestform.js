// Guest questions shared by the public self check-in page and the door screen.
// Only the first name is required; everything else sits behind "A few more questions".
import { h, field, select } from './dom.js';
import { ROLES, GENDERS, RACES, VETERAN } from '../domain/options.js';

export function guestFields({ open = false } = {}) {
  const first = h('input', { name: 'firstName', required: true, maxlength: 40, autocomplete: 'given-name', autocapitalize: 'words' });
  const last = h('input', { name: 'lastName', maxlength: 40, autocomplete: 'family-name', autocapitalize: 'words' });

  const roles = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Why are you here today?' },
    ROLES.map((r) => h('label', { class: 'chip' },
      h('input', { type: 'radio', name: 'role', value: r.value }), h('span', {}, r.label))));

  const year = new Date().getFullYear();
  const more = h('details', { class: 'more', open },
    h('summary', {}, 'A few more questions (all optional)'),
    h('p', { class: 'hint' }, 'These help us show funders who we reach. Skip anything you like.'),
    field('Why are you here today?', roles),
    field('ZIP code', h('input', { name: 'zip', inputmode: 'numeric', pattern: '\\d{5}', maxlength: 5, autocomplete: 'postal-code' })),
    field('Year you were born', h('input', { name: 'birthYear', inputmode: 'numeric', maxlength: 4, placeholder: String(year - 30) })),
    field('How many people in your household?', h('input', { name: 'householdSize', type: 'number', min: 1, max: 20, inputmode: 'numeric' })),
    field('Gender', select('gender', GENDERS)),
    field('Race or ethnicity (pick any)', h('div', { class: 'checks' },
      RACES.map((r) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'race', value: r.value }), r.label)))),
    field('Have you served in the military?', select('veteran', VETERAN)),
  );

  const el = h('div', { class: 'guest-fields' },
    field('First name', first, 'This is the only thing we need.'),
    field('Last name (optional)', last),
    more);

  function read(form) {
    const d = {};
    for (const x of form.elements) {
      if (!x.name) continue;
      if (x.type === 'checkbox') { if (x.checked) (d[x.name] ||= []).push(x.value); }
      else if (x.type === 'radio') { if (x.checked) d[x.name] = x.value; }
      else d[x.name] = x.value;
    }
    d.race ||= [];
    return d;
  }

  return { el, read, focus: () => first.focus(), more };
}
