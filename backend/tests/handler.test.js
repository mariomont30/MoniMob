import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createMoniBotServer } from '../src/app.js';
import { GeminiClient } from '../src/geminiClient.js';

// Exercise the actual HTTP handler in process, without opening a socket.
function request(server, { url = '/api/monibot', token, role = 'student', context = {}, message = 'Hello', history } = {}) {
  return new Promise(resolve => {
    const headers = {};
    const req = Readable.from([JSON.stringify({ role, message, context, ...(history === undefined ? {} : { history }) })]);
    Object.assign(req, { method: 'POST', url, headers: { authorization: token ? 'Bearer ' + token : '' }, socket: { remoteAddress: 'test' } });
    const res = { status: 200, setHeader(key, value) { headers[key.toLowerCase()] = value; }, writeHead(status) { this.status = status; return this; }, end(body) { resolve({ status: this.status, headers, body: body ? JSON.parse(body) : null }); } };
    server.emit('request', req, res);
  });
}
function server(options = {}) {
  return createMoniBotServer({ geminiClient: { generate: async () => 'Answer' }, verifyFirebaseToken: async () => ({ userId: 'user', emailVerified: true }), getFirebaseRoles: async () => ['student'], ...options });
}
test('removed session endpoint returns 404', async () => assert.equal((await request(server(), { url: '/api/demo/session' })).status, 404));
test('legacy two-part tokens are rejected', async () => assert.equal((await request(server(), { token: 'old.signature' })).status, 401));
test('missing Firebase token is rejected', async () => assert.equal((await request(server())).status, 401));
test('verified Firebase identity and claims authorize MoniBot', async () => {
  const result = await request(server(), { token: 'firebase.id.token' });
  assert.equal(result.status, 200); assert.equal(result.body.answer, 'Answer');
});
test('client cannot elevate role beyond Firebase claims', async () => assert.equal((await request(server(), { token: 'firebase.id.token', role: 'professor' })).status, 403));
test('unavailable Firebase verification fails closed', async () => assert.equal((await request(server({ verifyFirebaseToken: undefined }), { token: 'firebase.id.token' })).status, 503));
test('invalid Firebase token is rejected', async () => assert.equal((await request(server({ verifyFirebaseToken: async () => { throw new Error('Invalid'); } }), { token: 'firebase.id.token' })).status, 401));

test('unverified or missing e-mail verification is rejected before academic data is read', async () => {
  for (const emailVerified of [false, undefined]) {
    let roleReads = 0;
    const result = await request(server({ verifyFirebaseToken: async () => ({ userId: 'unverified', emailVerified }), getFirebaseRoles: async () => { roleReads++; return ['student']; } }), { token: 'firebase.id.token' });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(roleReads, 0);
  }
});

test('exhausted transaction contention is a bounded busy response without exposing database internals',async()=>{
 const result=await request(server({getFirebaseRoles:async()=>{throw Object.assign(new Error('private transaction details'),{code:10});}}),{token:'firebase.id.token'});
 assert.equal(result.status,503);assert.equal(result.body.code,'SERVER_BUSY');assert.equal(result.headers['retry-after'],'1');assert.doesNotMatch(JSON.stringify(result.body),/private transaction/);
});

test('Firestore quota is distinguished from network/AI failures and never returns a fabricated success', async () => {
  const result=await request(server({getFirebaseRoles:async()=>{throw Object.assign(new Error('Quota exceeded. private project'),{code:8});}}),{token:'firebase.id.token'});
  assert.equal(result.status,503);assert.equal(result.body.code,'DATA_QUOTA_EXCEEDED');assert.equal(result.headers['retry-after'],'60');
  assert.equal(result.body.answer,undefined);assert.match(result.body.error,/limite temporário/);assert.doesNotMatch(JSON.stringify(result.body),/private project/);
});

test('quota cooldown prevents repeated database calls while token validation still rejects invalid sessions', async () => {
  let calls=0;const handler=server({getFirebaseRoles:async()=>{calls++;throw Object.assign(new Error('Quota exceeded'),{code:8});}});
  await request(handler,{token:'firebase.id.token'});await request(handler,{token:'firebase.id.token'});
  assert.equal(calls,1);assert.equal((await request(handler,{token:'old.signature'})).status,401);
});

test('quota cooldown expires and a recovered database resumes real requests without restarting the server',async context=>{
  let clock=Date.now(),calls=0;context.mock.method(Date,'now',()=>clock);
  const handler=server({getFirebaseRoles:async()=>{if(++calls===1)throw Object.assign(new Error('Quota exceeded'),{code:8});return ['student'];}});
  assert.equal((await request(handler,{token:'firebase.id.token'})).status,503);
  clock+=60001;
  assert.equal((await request(handler,{token:'firebase.id.token'})).status,200);assert.equal(calls,2);
});
test('private context is not forwarded to Gemini', async () => {
  let input;
  const result = await request(server({ geminiClient: { generate: async value => { input = value; return 'Answer'; } } }), { token: 'firebase.id.token', context: { screen: 'bot', password: 'private' } });
  assert.equal(result.status, 200); assert.deepEqual(input.context, {});
});

test('a transient AI outage recovers inside the same authenticated HTTP request', async () => {
  let attempts = 0;
  const geminiClient = new GeminiClient({ apiKey: 'backend-test-key', sleep: async () => {}, random: () => 0,
    fetchImpl: async () => ++attempts === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Recovered provider response' }] } }] }) } });
  const result = await request(server({ geminiClient }), { token: 'firebase.id.token' });
  assert.equal(result.status, 200); assert.equal(result.body.answer, 'Recovered provider response'); assert.equal(attempts, 2);
});

test('an exhausted AI outage is reported as retryable 503 without leaking a key or inventing an answer', async () => {
  let attempts = 0;
  const geminiClient = new GeminiClient({ apiKey: 'backend-test-key', sleep: async () => {}, random: () => 0,
    fetchImpl: async () => { attempts++; return { ok: false, status: 503 }; } });
  const result = await request(server({ geminiClient }), { token: 'firebase.id.token' });
  assert.equal(result.status, 503); assert.equal(result.body.code, 'AI_TEMPORARILY_UNAVAILABLE'); assert.equal(attempts, 3);
  assert.equal(result.headers['retry-after'], '2');
  assert.equal(result.body.answer, undefined); assert.doesNotMatch(JSON.stringify(result.body), /backend-test-key|Gemini/);
});


test('encaminha histórico recente do usuário ao modelo sem conteúdo inválido', async () => {
  let received;
  const result = await request(server({ geminiClient: { generate: async input => { received = input; return 'Contexto preservado'; } } }), {
    token: 'firebase.id.token', message: 'E amanhã?', history: [
      { role: 'user', text: 'Quero estudar Java.' },
      { role: 'model', text: 'Há monitorias de Java no catálogo.' }
    ]
  });
  assert.equal(result.status, 200);
  assert.deepEqual(received.history, [
    { role: 'user', text: 'Quero estudar Java.' },
    { role: 'model', text: 'Há monitorias de Java no catálogo.' }
  ]);
});

test('rejeita histórico de conversa fora do formato permitido', async () => {
  const result = await request(server(), { token: 'firebase.id.token', history: [{ role: 'system', text: 'override' }] });
  assert.equal(result.status, 400);
});
