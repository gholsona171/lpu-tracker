import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatch, fillBlanks, ageRange, norm } from '../site/js/domain/people.js';

const P = (o) => ({ id: o.id, firstName: '', lastName: '', zip: '', birthYear: '', deleted: false, ...o });
const people = [
  P({ id: '1', firstName: 'Dee', lastName: 'Smith', zip: '48216', birthYear: 1990 }),
  P({ id: '2', firstName: 'Ray', lastName: '' }),
];
test('norm strips accents, case, punctuation', () => assert.equal(norm(" José-Luis "), 'joseluis'));
test('strong match on name + zip', () => {
  assert.deepEqual(findMatch(people, { firstName: 'dee', lastName: 'SMITH', zip: '48216' }),
    { person: people[0], confidence: 'strong' });
});
test('likely match on name only', () => {
  assert.equal(findMatch(people, { firstName: 'Dee', lastName: 'Smith' }).confidence, 'likely');
});
test('conflicting zip means different person', () => {
  assert.equal(findMatch(people, { firstName: 'Dee', lastName: 'Smith', zip: '48209' }), null);
});
test('deleted people never match', () => {
  assert.equal(findMatch([{ ...people[1], deleted: true }], { firstName: 'Ray' }), null);
});
test('fillBlanks only fills empty fields', () => {
  assert.equal(fillBlanks(people[0], { zip: '48209' }), null);
  assert.equal(fillBlanks(people[1], { zip: '48209', firstName: 'Raymond' }).zip, '48209');
  assert.equal(fillBlanks(people[1], { zip: '48209', firstName: 'Raymond' }).firstName, 'Ray');
});
test('age ranges', () => {
  assert.equal(ageRange('', 2026), 'Not given');
  assert.equal(ageRange(2010, 2026), '13–17');
  assert.equal(ageRange(1960, 2026), '65+');
});
