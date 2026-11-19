import test from 'node:test';
import assert from 'node:assert/strict';
import { RegistrationService } from '../src/registrationService.js';
import { createMoniBotServer } from '../src/app.js';

function setup() {
  const rows = new Map();
  const users = new Map();
  const claims = [];
  const db = { collection: name => ({ doc: id => ({ key: name + '/' + id,
    async get() { return { exists: rows.has(this.key), data: () => rows.get(this.key) }; },
    async update(value) { rows.set(this.key, { ...rows.get(this.key), ...value }); }
  }) }), async runTransaction(fn) { return fn({ get: ref => ref.get(), set: (ref, value) => rows.set(ref.key, value) }); } };
  const auth = { getUser: async uid => users.get(uid), setCustomUserClaims: async (uid, roles) => { claims.push({ uid, roles }); users.get(uid).customClaims = roles; } };
  const add = uid => users.set(uid, { uid, email: uid + '@edu.unifor.br', emailVerified: false, disabled: false, providerData: [{ providerId: 'password' }] });
  add('owner'); add('other');
  return { service: new RegistrationService({ auth, db }), rows, users, claims };
}
const input = role => ({ role, name: 'Authorized test account', registration: 'reg1234' });
for (const role of ['student', 'monitor', 'professor']) {
  test(role + ': pending signup reserves the registration without granting permissions', async () => {
    const x = setup(); const result = await x.service.register('owner', input(role));
    assert.equal(result.useFirebase, true); assert.equal(result.email, 'owner@edu.unifor.br');
    assert.deepEqual(x.rows.get('users/owner').roles, []); assert.equal(x.claims.length, 0);
    await assert.rejects(x.service.activate('owner'), e => e.code === 'EMAIL_NOT_VERIFIED');
    assert.equal(x.claims.length, 0);
  });
  test(role + ': verified owner activates only the requested role and repeated activation is harmless', async () => {
    const x = setup(); await x.service.register('owner', input(role));
    x.users.get('owner').emailVerified = true;
    assert.equal((await x.service.activate('owner')).activated, true);
    assert.deepEqual(x.claims[0].roles.roles, role === 'monitor' ? ['student', 'monitor'] : [role]);
    assert.equal((await x.service.activate('owner')).activated, false); assert.equal(x.claims.length, 1);
  });
}
test('pending signup can be resumed but its requested role cannot be replaced', async () => {
  const x = setup(); await x.service.register('owner', input('monitor'));
  await x.service.register('owner', input('monitor'));
  await assert.rejects(x.service.register('owner', input('professor')), e => e.status === 409);
});
test('registration index blocks another user taking the same registration', async () => {
  const x = setup(); await x.service.register('owner', input('monitor'));
  await assert.rejects(x.service.register('other', input('professor')), e => e.status === 409);
  assert.equal(x.rows.has('users/other'), false);
});
test('non-institutional email and unknown roles are rejected before writing', async () => {
  const x = setup(); x.users.get('owner').email = 'owner@example.org';
  await assert.rejects(x.service.register('owner', input('professor')));
  x.users.get('owner').email = 'owner@edu.unifor.br';
  await assert.rejects(x.service.register('owner', input('administrator')));
  assert.equal(x.rows.size, 0);
});
test('blocked profile cannot activate after email verification', async () => {
  const x = setup(); await x.service.register('owner', input('professor'));
  x.users.get('owner').emailVerified = true; x.rows.get('users/owner').disabled = true;
  await assert.rejects(x.service.activate('owner'), e => e.status === 403); assert.equal(x.claims.length, 0);
});
test('disabled Firebase account is rejected', async () => {
  const x = setup(); x.users.get('owner').disabled = true;
  await assert.rejects(x.service.register('owner', input('professor')), e => e.status === 403);
});
test('existing student activates once without receiving privileged claims', async () => {
  const x = setup(); x.users.get('owner').emailVerified = true;
  x.rows.set('users/owner', { email: 'owner@edu.unifor.br', roles: ['student'] });
  assert.equal((await x.service.activate('owner')).profile, 'Aluno');
  assert.equal((await x.service.activate('owner')).activated, false); assert.equal(x.claims.length, 0);
});
test('existing administratively provisioned roles remain unchanged', async () => {
  const x = setup(); x.users.get('owner').emailVerified = true;
  x.rows.set('users/owner', { email: 'owner@edu.unifor.br', roles: ['professor'] });
  assert.equal((await x.service.activate('owner')).activated, false); assert.equal(x.claims.length, 0);
});
test('registration HTTP uses the token owner while academic routes still reject unverified users', async () => {
  const x = setup();
  const server = createMoniBotServer({ registrationService: x.service, verifyFirebaseToken: async () => ({ userId: 'owner', emailVerified: false }), getFirebaseRoles: async () => [] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const headers = { authorization: 'Bearer test.valid.token', 'content-type': 'application/json' };
  try {
    const signup = await fetch(origin + '/api/registration', { method: 'POST', headers, body: JSON.stringify({ ...input('professor'), userId: 'other' }) });
    assert.equal(signup.status, 200); assert.equal(x.rows.has('users/other'), false);
    assert.equal((await fetch(origin + '/api/state?role=professor', { headers })).status, 403);
    assert.equal((await fetch(origin + '/api/registration/activate', { method: 'POST', headers, body: JSON.stringify({ role: 'monitor' }) })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
