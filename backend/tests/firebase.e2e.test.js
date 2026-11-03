import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, deleteApp } from 'firebase-admin/app';
import { getFirebaseAdminAuth, verifyFirebaseToken } from '../src/firebaseAdmin.js';
import { getFirebaseRoles } from '../src/firebaseRoles.js';
import { createMoniBotServer } from '../src/app.js';
import { AcademicService } from '../src/academicService.js';
import { FirestoreStore } from '../src/firestoreStore.js';

const enabled = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
after(async () => { for (const app of getApps()) await deleteApp(app); });
async function authRequest(action, body) {
  const response = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST + '/identitytoolkit.googleapis.com/v1/accounts:' + action + '?key=emulator-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
test('Auth emulator login, real ID token verification, claims bootstrap and protected API', { skip: !enabled }, async () => {
  const email = 'e2e-' + Date.now() + '@example.com';
  const password = 'Test-only-secret-123';
  const created = await authRequest('signUp', { email, password, returnSecureToken: true });
  const auth = getFirebaseAdminAuth();
  const db = getFirestore();
  await db.collection('users').doc(created.localId).set({ id: created.localId, name: 'Test student', email, registration: 'TEST', course: 'Ciência da Computação', roles: ['student'] });
  const signedIn = await authRequest('signInWithPassword', { email, password, returnSecureToken: true });
  assert.equal((await verifyFirebaseToken(signedIn.idToken)).userId, created.localId);
  assert.deepEqual(await getFirebaseRoles(created.localId), ['student']);
  assert.deepEqual((await auth.getUser(created.localId)).customClaims.roles, ['student']);
  const server = createMoniBotServer({ verifyFirebaseToken, getFirebaseRoles, academicService: new AcademicService(new FirestoreStore(db)), geminiClient: null });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const state = await fetch(base + '/api/state?role=student', { headers: { authorization: 'Bearer ' + signedIn.idToken } });
    assert.equal(state.status, 200);
    const result = await state.json();
    assert.equal(result.state.users.find(item => item.id === created.localId).email, email);
    const forged = await fetch(base + '/api/state?role=professor', { headers: { authorization: 'Bearer ' + signedIn.idToken } });
    assert.equal(forged.status, 403);
    const noToken = await fetch(base + '/api/state?role=student'); assert.equal(noToken.status, 401);
    const reset = await authRequest('sendOobCode', { requestType: 'PASSWORD_RESET', email });
    assert.equal(reset.email, email);
    const codes = await (await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST + '/emulator/v1/projects/demo-monimob/oobCodes')).json();
    const code = codes.oobCodes.find(item => item.email === email && item.requestType === 'PASSWORD_RESET');
    assert.ok(code?.oobCode);
    await authRequest('resetPassword', { oobCode: code.oobCode, newPassword: password + '-changed' });
    await assert.rejects(authRequest('signInWithPassword', { email, password, returnSecureToken: true }));
    assert.ok((await authRequest('signInWithPassword', { email, password: password + '-changed', returnSecureToken: true })).idToken);
    await assert.rejects(authRequest('signInWithPassword', { email, password: 'incorrect', returnSecureToken: true }));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await auth.deleteUser(created.localId);
    await db.collection('users').doc(created.localId).delete();
  }
});
