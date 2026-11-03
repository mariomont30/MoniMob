import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';

let env;
const profile = (uid = 'alice') => ({
  id: uid, name: 'Aluno Teste', registration: '20260001',
  email: `${uid}@example.com`, roles: ['student'], course: 'Ciência da Computação'
});
const db = (uid = 'alice') => env.authenticatedContext(uid, {
  email: `${uid}@example.com`, firebase: { sign_in_provider: 'password' }
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
  });
});
after(async () => { await env?.cleanup(); });

test('owner reads own profile and changes only name', async () => {
  const ref = doc(db(), 'users/alice');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { name: 'Novo Nome' }));
});
test('new password account creates its own student profile', async () => {
  await assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), profile('bob')));
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
