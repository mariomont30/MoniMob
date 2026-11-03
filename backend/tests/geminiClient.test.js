import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiClient, AiUnavailableError } from '../src/geminiClient.js';

const success = (text = 'Recovered') => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const immediate = { sleep: async () => {}, random: () => 0 };

test('Gemini usa chave somente no cabeçalho do backend e limita a geração', async () => {
  let request;
  const client = new GeminiClient({ apiKey: 'chave-apenas-de-teste', model: 'gemini-test', fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Resposta segura.' }] } }] }) };
  } });
  const answer = await client.generate({ role: 'student', message: 'Como reservar?', context: { screen: 'catalog' } });
  assert.equal(answer, 'Resposta segura.');
  assert.match(request.url, /gemini-test:generateContent/);
  assert.equal(request.options.headers['x-goog-api-key'], 'chave-apenas-de-teste');
  assert.doesNotMatch(request.options.body, /chave-apenas-de-teste/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.generationConfig.temperature, 0.2);
  assert.equal(body.generationConfig.maxOutputTokens, 1024);
});

test('Gemini trata resposta HTTP e conteúdo vazio como falha', async () => {
  const denied = new GeminiClient({ apiKey: 'teste', maxAttempts: 1, fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(() => denied.generate({ role: 'student', message: 'Olá', context: {} }), error => error instanceof AiUnavailableError && error.cause.providerStatus === 429);
  const empty = new GeminiClient({ apiKey: 'teste', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) });
  await assert.rejects(() => empty.generate({ role: 'student', message: 'Olá', context: {} }), /conteúdo utilizável/);
});

test('Gemini retries a transient provider outage without changing the configured model', async () => {
  let calls = 0;
  const client = new GeminiClient({ apiKey: 'test', ...immediate, model: 'gemini-3.8-flash', fetchImpl: async () => ++calls === 1 ? { status: 503, ok: false } : success() });
  assert.equal(await client.generate({ role: 'student', message: 'Hello', context: {} }), 'Recovered');
  assert.equal(calls, 2);
});

test('network failures are retried with unchanged model, prompt and private-key header', async () => {
  const attempts = [];
  const client = new GeminiClient({ apiKey: 'private-test-key', model: 'gemini-test', ...immediate,
    fetchImpl: async (url, options) => { attempts.push({ url, options }); if (attempts.length === 1) throw new TypeError('fetch failed'); return success(); } });
  assert.equal(await client.generate({ role: 'student', message: 'Question', context: {} }), 'Recovered');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].url, attempts[1].url);
  assert.equal(attempts[0].options.body, attempts[1].options.body);
  assert.notEqual(attempts[0].options.signal, attempts[1].options.signal);
  assert.doesNotMatch(attempts[1].options.body, /private-test-key/);
});

test('a timed-out attempt cannot poison the next attempt with an already-aborted signal', async () => {
  const signals = [];
  const client = new GeminiClient({ apiKey: 'test', ...immediate, attemptTimeoutMs: 10, totalTimeoutMs: 2000,
    fetchImpl: async (_, options) => { signals.push(options.signal); if (signals.length === 1) return new Promise(() => {}); assert.equal(options.signal.aborted, false); return success(); } });
  assert.equal(await client.generate({ role: 'student', message: 'Hello', context: {} }), 'Recovered');
  assert.equal(signals.length, 2); assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
});

test('the timeout also bounds a response whose headers arrive but JSON body stalls', async () => {
  let calls = 0;
  const client = new GeminiClient({ apiKey: 'test', ...immediate, attemptTimeoutMs: 10, totalTimeoutMs: 2000,
    fetchImpl: async () => ++calls === 1 ? { ok: true, json: () => new Promise(() => {}) } : success() });
  assert.equal(await client.generate({ role: 'student', message: 'Hello', context: {} }), 'Recovered');
  assert.equal(calls, 2);
});

test('503 then 502 recover on a bounded third attempt with exponential backoff and jitter', async () => {
  let calls = 0, clock = 0; const delays = [];
  const client = new GeminiClient({ apiKey: 'test', now: () => clock, random: () => 0.5,
    sleep: async delay => { delays.push(delay); clock += delay; },
    fetchImpl: async () => ++calls < 3 ? { ok: false, status: calls === 1 ? 503 : 502 } : success() });
  assert.equal(await client.generate({ role: 'student', message: 'Hello', context: {} }), 'Recovered');
  assert.deepEqual(delays, [1125, 2125]); assert.equal(calls, 3);
});

test('429 Retry-After is honored and does not extend the overall response budget', async () => {
  let calls = 0, clock = 0; const delays = [];
  const client = new GeminiClient({ apiKey: 'test', now: () => clock, random: () => 0,
    sleep: async delay => { delays.push(delay); clock += delay; },
    fetchImpl: async () => ++calls === 1 ? { ok: false, status: 429, headers: new Headers({ 'retry-after': '3' }) } : success() });
  assert.equal(await client.generate({ role: 'student', message: 'Hello', context: {} }), 'Recovered');
  assert.deepEqual(delays, [3000]); assert.equal(calls, 2);
  let deniedCalls = 0;
  const denied = new GeminiClient({ apiKey: 'test', ...immediate, totalTimeoutMs: 50, fetchImpl: async () => { deniedCalls++; return { ok: false, status: 429, headers: new Headers({ 'retry-after': '120' }) }; } });
  await assert.rejects(() => denied.generate({ role: 'student', message: 'Hello', context: {} }), error => error.code === 'AI_TEMPORARILY_UNAVAILABLE' && error.retryAfterSeconds === 120);
  assert.equal(deniedCalls, 1);
});

test('permanent provider errors are not retried', async () => {
  for (const status of [400, 401, 402, 403, 404]) {
    let calls = 0;
    const client = new GeminiClient({ apiKey: 'test', ...immediate, fetchImpl: async () => { calls++; return { ok: false, status }; } });
    await assert.rejects(() => client.generate({ role: 'student', message: 'Hello', context: {} }), new RegExp('status ' + status));
    assert.equal(calls, 1);
  }
});

test('an exhausted outage is a controlled 503 with no fabricated answer or unbounded requests', async () => {
  let calls = 0;
  const client = new GeminiClient({ apiKey: 'test', ...immediate, fetchImpl: async () => { calls++; return { ok: false, status: 503 }; } });
  await assert.rejects(() => client.generate({ role: 'student', message: 'Hello', context: {} }), error => error.status === 503 && error.code === 'AI_TEMPORARILY_UNAVAILABLE');
  assert.equal(calls, 3);
});

test('overall timeout terminates an unresponsive provider even when it ignores AbortSignal', async () => {
  const signals = [];
  const client = new GeminiClient({ apiKey: 'test', totalTimeoutMs: 20, attemptTimeoutMs: 1000, ...immediate,
    fetchImpl: async (_, options) => { signals.push(options.signal); return new Promise(() => {}); } });
  await assert.rejects(() => client.generate({ role: 'student', message: 'Hello', context: {} }), { code: 'AI_TEMPORARILY_UNAVAILABLE' });
  assert.equal(signals.length, 1); assert.ok(signals[0].aborted);
});

test('provider thought content is never shown as the assistant answer', async () => {
  const client = new GeminiClient({ apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'Internal reasoning' }, { text: 'Public answer' }] } }] }) }) });
  assert.equal(await client.generate({ role: 'student', message: 'Hello', context: {} }), 'Public answer');
});

test('integração real com Gemini é opcional e só roda com GEMINI_API_KEY', { skip: !process.env.GEMINI_API_KEY }, async () => {
  const client = new GeminiClient({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.6-flash' });
  const answer = await client.generate({ role: 'student', message: 'Responda apenas: OK', context: { screen: 'test' } });
  assert.ok(answer.length > 0);
});
