import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoniBotServer } from '../src/app.js';


async function withServer(run) {
  const calls = [];
  const server = createMoniBotServer({
    geminiClient: { generate: async input => { calls.push(input); return 'Resposta acadêmica segura.'; } },
    verifyFirebaseToken: async token => { if (token !== 'test.firebase.token') throw new Error('Invalid token'); return { userId: 'test-student' }; },
    getFirebaseRoles: async () => ['student'],
    allowedOrigins: ['http://localhost:8081'],
    rateLimit: 10
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function tokenFor() { return 'test.firebase.token'; }

test('health informa o serviço sem expor configuração', async () => withServer(async base => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /monibot/);
  assert.doesNotMatch(text, /GEMINI_API_KEY|apiKey/);
}));

test('rejeita perfil e mensagem inválidos', async () => withServer(async base => {
  const token = await tokenFor(base);
  const response = await fetch(`${base}/api/monibot`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ role: 'admin', message: '' })
  });
  assert.equal(response.status, 403);
}));

test('envia apenas contexto permitido e retorna resposta', async () => withServer(async (base, calls) => {
  const token = await tokenFor(base);
  const response = await fetch(`${base}/api/monibot`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      role: 'student', message: 'Qual é minha próxima monitoria?',
      context: { sessionId: 'session-1', screen: 'agenda', password: 'segredo', token: 'nunca' }
    })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: 'Resposta acadêmica segura.' });
  assert.deepEqual(calls[0].context, {});
}));

test('bloqueia origem não autorizada', async () => withServer(async base => {
  const response = await fetch(`${base}/api/monibot`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://malicioso.example' },
    body: JSON.stringify({ role: 'student', message: 'Olá' })
  });
  assert.equal(response.status, 403);
}));

test('exige token assinado e rejeita papel fora da sessão', async () => withServer(async base => {
  const missing = await fetch(`${base}/api/monibot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'student', message: 'Olá' }) });
  assert.equal(missing.status, 401);
  const token = await tokenFor(base);
  const elevated = await fetch(`${base}/api/monibot`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'professor', message: 'Olá' }) });
  assert.equal(elevated.status, 403);
}));

test('demo endpoint removed and old tokens rejected', async () => withServer(async base => {
  const removed = await fetch(base + '/api/demo/session', { method: 'POST' });
  assert.equal(removed.status, 404);
  const rejected = await fetch(base + '/api/monibot', { method: 'POST', headers: { authorization: 'Bearer old.signature', 'content-type': 'application/json' }, body: JSON.stringify({ role: 'student', message: 'Hello' }) });
  assert.equal(rejected.status, 401);
}));

test('rate limit still protects MoniBot', async () => {
  const server = createMoniBotServer({ geminiClient: { generate: async () => 'ok' }, rateLimit: 1 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/monibot';
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST' })).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
