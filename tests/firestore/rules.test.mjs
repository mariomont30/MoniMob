import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, writeBatch } from 'firebase/firestore';

let env;
const profile = (uid = 'alice', registration = '20260001') => ({
  id: uid, name: 'Aluno Teste', registration,
  email: `${uid}@edu.unifor.br`, roles: ['student'], course: 'Ciências da Computação'
});
const db = (uid = 'alice') => env.authenticatedContext(uid, {
  email: `${uid}@edu.unifor.br`, email_verified: true, firebase: { sign_in_provider: 'password' }
}).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-monimob',
    firestore: {
      host: '127.0.0.1', port: 8080,
      rules: await readFile(process.env.MONIMOB_RULES_PATH || new URL('../../firestore.rules', import.meta.url), 'utf8')
    }
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/alice'), profile());
    await setDoc(doc(context.firestore(), 'studentRegistrationIndex/20260001'), { uid: 'alice' });
  });
});
after(async () => { await env?.cleanup(); });

test('owner reads own profile and changes only name', async () => {
  const ref = doc(db(), 'users/alice');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { name: 'Novo Nome' }));
});
test('new password account atomically creates its profile and unique student registration', async () => {
  const client = db('bob');
  const batch = writeBatch(client);
  batch.set(doc(client, 'users/bob'), profile('bob', '20260002'));
  batch.set(doc(client, 'studentRegistrationIndex/20260002'), { uid: 'bob' });
  await assertSucceeds(batch.commit());
});
test('a registration already claimed by another student cannot be reused', async () => {
  const client = db('bob');
  const batch = writeBatch(client);
  batch.set(doc(client, 'users/bob'), profile('bob'));
  batch.set(doc(client, 'studentRegistrationIndex/20260001'), { uid: 'bob' });
  await assertFails(batch.commit());
});

test('legacy course spelling remains compatible without changing the existing profile', async () => {
  const client = db('legacy');
  const batch = writeBatch(client);
  batch.set(doc(client, 'users/legacy'), { ...profile('legacy', '20260004'), course: 'Ciência da Computação' });
  batch.set(doc(client, 'studentRegistrationIndex/20260004'), { uid: 'legacy' });
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(client, 'users/legacy'))).data().course, 'Ciência da Computação');
});

test('unverified institutional registration can atomically reserve a unique registration but cannot read the profile', async () => {
  const client = env.authenticatedContext('carol', { email: 'carol@edu.unifor.br', email_verified: false, firebase: { sign_in_provider: 'password' } }).firestore();
  const batch = writeBatch(client);
  batch.set(doc(client, 'users/carol'), profile('carol', '20260003'));
  batch.set(doc(client, 'studentRegistrationIndex/20260003'), { uid: 'carol' });
  await assertSucceeds(batch.commit());
  await assertFails(getDoc(doc(client, 'users/carol')));
});
test('signed-out clients cannot read or write', async () => {
  const client = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(client, 'users/alice')));
  await assertFails(setDoc(doc(client, 'users/bob'), profile('bob')));
  await assertFails(updateDoc(doc(client, 'users/alice'), { name: 'Outro' }));
  await assertFails(deleteDoc(doc(client, 'users/alice')));
});
test('another user cannot read, create, update or delete a profile', async () => {
  const ref = doc(db('bob'), 'users/alice');
  await assertFails(getDoc(ref));
  await assertFails(updateDoc(ref, { name: 'Outro' }));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db('bob'), 'users/charlie'), profile('charlie')));
});
test('unverified institutional accounts cannot read profiles', async () => {
  const client = env.authenticatedContext('alice', {
    email: 'alice@edu.unifor.br', email_verified: false, firebase: { sign_in_provider: 'password' }
  }).firestore();
  await assertFails(getDoc(doc(client, 'users/alice')));
});
test('self-registration rejects non-institutional e-mail domains', async () => {
  const client = env.authenticatedContext('bob', {
    email: 'bob@example.com', email_verified: false, firebase: { sign_in_provider: 'password' }
  }).firestore();
  await assertFails(setDoc(doc(client, 'users/bob'), { ...profile('bob'), email: 'bob@example.com' }));
});
test('anonymous Firebase Auth accounts cannot access profiles', async () => {
  const client = env.authenticatedContext('alice', {
    firebase: { sign_in_provider: 'anonymous' }
  }).firestore();
  await assertFails(getDoc(doc(client, 'users/alice')));
  await assertFails(updateDoc(doc(client, 'users/alice'), { name: 'Outro' }));
});
test('no client can enumerate users or delete its own profile', async () => {
  await assertFails(getDocs(collection(db(), 'users')));
  await assertFails(deleteDoc(doc(db(), 'users/alice')));
});
test('self-registration rejects forged identity, roles and unexpected fields', async () => {
  const ref = doc(db('bob'), 'users/bob');
  for (const change of [
    { id: 'alice' }, { email: 'alice@example.com' },
    { roles: ['professor'] }, { roles: ['student', 'monitor'] },
    { roles: 'student' }, { admin: true }, { registration: 123 },
    { registration: '' }, { course: 'Outro curso' },
    { name: '' }, { name: 123 }, { name: ' '.repeat(4) }, { name: 'x'.repeat(121) }
  ]) await assertFails(setDoc(ref, { ...profile('bob'), ...change }));
  const missing = profile('bob');
  delete missing.registration;
  await assertFails(setDoc(ref, missing));
});
test('updates cannot change or remove protected fields', async () => {
  const ref = doc(db(), 'users/alice');
  for (const change of [
    { roles: ['professor'] }, { id: 'bob' }, { registration: '999' },
    { email: 'other@example.com' }, { course: 'Outro' }, { admin: true },
    { roles: deleteField() }, { name: deleteField() }, { name: '' }, { name: 123 }
  ]) await assertFails(updateDoc(ref, change));
  await assertFails(setDoc(ref, { name: 'Novo Nome' }));
});
test('administratively assigned roles remain intact during name update', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users/alice'), { roles: ['professor'], approved: true });
  });
  await assertSucceeds(updateDoc(doc(db(), 'users/alice'), { name: 'Professora' }));
  await assertFails(updateDoc(doc(db(), 'users/alice'), { approved: false }));
});
test('other collections and subcollections stay blocked', async () => {
  for (const path of ['sessions/example', 'users/alice/private/example']) {
    await assertFails(getDoc(doc(db(), path)));
    await assertFails(setDoc(doc(db(), path), { name: 'Exemplo' }));
  }
});
