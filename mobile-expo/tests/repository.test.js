import test from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreStateRepository } from '../src/infrastructure/repositories.js';
import { createEmptyState } from '../src/data/emptyState.js';

test('server error is not converted to an empty success', async () => {
  const repository = new FirestoreStateRepository(async () => { throw new Error('permission-denied'); });
  await assert.rejects(repository.load({ id: 'user' }), /permission-denied/);
  assert.deepEqual(repository.read(), createEmptyState());
});

test('academic mutations cannot report success or modify confirmed server state', async () => {
  const state = createEmptyState(); state.sessions = [{ id: 'server-record' }];
  const repository = new FirestoreStateRepository(async () => state);
  await repository.load({ id: 'user' });
  const next = repository.read(); next.sessions = [];
  assert.throws(() => repository.write(next), /Nenhuma alteração foi salva/);
  assert.equal(repository.read().sessions[0].id, 'server-record');
});

test('logout discards in-flight results from the previous account', async () => {
  let resolve;
  const repository = new FirestoreStateRepository(() => new Promise(done => { resolve = done; }));
  const pending = repository.load({ id: 'old-user' });
  repository.clear();
  const state = createEmptyState(); state.users = [{ id: 'old-user' }];
  resolve(state);
  assert.equal(await pending, null);
  assert.deepEqual(repository.read(), createEmptyState());
});

test('a newer account load wins even when the old request finishes last', async () => {
  const resolve = {};
  const repository = new FirestoreStateRepository(user => new Promise(done => { resolve[user.id] = done; }));
  const old = repository.load({ id: 'old' });
  const current = repository.load({ id: 'current' });
  resolve.current({ ...createEmptyState(), users: [{ id: 'current' }] });
  await current;
  resolve.old({ ...createEmptyState(), users: [{ id: 'old' }] });
  await old;
  assert.equal(repository.read().users[0].id, 'current');
});
