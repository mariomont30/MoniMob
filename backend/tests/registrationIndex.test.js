import test from 'node:test';
import assert from 'node:assert/strict';
import { planRegistrationIndex } from '../src/registrationIndex.js';
test('registration migration preserves legacy profiles and academic numbers', () => {
  const profiles = [{ id: 'old', registration: '123' }, { id: 'student', registration: ' AbC-2026 ' }, { id: 'empty' }];
  const copy = structuredClone(profiles);
  assert.deepEqual(planRegistrationIndex(profiles), { entries: [{ registration: 'abc-2026', uid: 'student' }], legacy: ['old', 'empty'] });
  assert.deepEqual(profiles, copy);
});
test('registration migration detects normalized duplicates before returning a writable plan', () => {
  assert.throws(() => planRegistrationIndex([{ id: 'one', registration: 'ABC2026' }, { id: 'two', registration: ' abc2026 ' }]), { code: 'DUPLICATE_REGISTRATION' });
});
