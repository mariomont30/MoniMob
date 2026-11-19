import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServerUrl, probeServer } from '../src/services/connectionValidation.js';
test('server connection accepts an HTTPS origin and removes its trailing slash', () => assert.equal(normalizeServerUrl(' https://meu-servidor.trycloudflare.com/ '), 'https://meu-servidor.trycloudflare.com'));
test('server connection rejects non-HTTPS, embedded credentials and URLs with extra parts', () => {
  for (const url of ['http://servidor.test', 'https://user:password@servidor.test', 'https://servidor.test/api', 'https://servidor.test?token=value', 'https://servidor.test#section', 'invalid']) assert.throws(() => normalizeServerUrl(url));
});
test('connection probe checks the project without sending authentication credentials', async () => {
  let request;
  const origin = await probeServer('https://servidor.test', 'bd-monimob', async (...args) => { request = args; return { ok: true, json: async () => ({ status: 'ok', service: 'monibot', projectId: 'bd-monimob' }) }; });
  assert.equal(origin, 'https://servidor.test');assert.equal(request[0], origin + '/health');assert.equal(request[1].headers, undefined);
});
test('connection probe rejects another Firebase project and unexpected server payloads', async () => {
  for (const body of [{status:'ok', service:'monibot', projectId:'outro-projeto'}, {status:'ok'}]) await assert.rejects(probeServer('https://servidor.test', 'bd-monimob', async () => ({ok:true,json:async()=>body})));
});
