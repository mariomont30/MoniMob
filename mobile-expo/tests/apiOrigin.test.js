import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiOrigin, selectApiOrigin } from '../src/services/apiOrigin.js';
test('explicit deployed API URL takes priority', () => assert.equal(resolveApiOrigin('https://api.example.com/', 'local:8081', false), 'https://api.example.com'));
test('LAN development uses the Metro proxy port', () => assert.equal(resolveApiOrigin('', '192.168.1.2:8081', true), 'http://192.168.1.2:8081'));
test('Expo tunnel always uses HTTPS without the internal HTTP port', () => assert.equal(resolveApiOrigin('', 'project.exp.direct:80', true), 'https://project.exp.direct'));
test('production does not infer an API from a development manifest', () => assert.equal(resolveApiOrigin('', 'project.exp.direct', false), ''));
test('missing development manifest keeps configuration explicit', () => assert.equal(resolveApiOrigin('', undefined, true), ''));

test('an expired saved tunnel cannot override the current Expo launcher address', () => {
  const configuredUrl='https://current.trycloudflare.com', savedUrl='https://expired.trycloudflare.com';
  assert.equal(selectApiOrigin({configuredUrl,savedUrl,development:true,hostUri:'192.168.1.2:8081'}),configuredUrl);
});

test('launcher-enabled Expo Go uses its working Metro connection instead of tunnel DNS', () => {
  assert.equal(selectApiOrigin({configuredUrl:'https://current.trycloudflare.com',savedUrl:'https://expired.trycloudflare.com',development:true,metroProxy:true,hostUri:'192.168.1.2:8081'}),'http://192.168.1.2:8081');
});

test('obsolete manual settings have no influence on the automatic Expo connection', () => {
  assert.equal(selectApiOrigin({configuredUrl:'https://current.trycloudflare.com',savedUrl:'https://institution.example',development:true,metroProxy:true,hostUri:'192.168.1.2:8081'}),'http://192.168.1.2:8081');
});

test('production always delegates to automatic discovery despite stored or compiled URLs', () => {
  assert.equal(selectApiOrigin({configuredUrl:'https://current.trycloudflare.com',savedUrl:'https://saved.trycloudflare.com',development:false,metroProxy:true,hostUri:'192.168.1.2:8081'}),'');
});

test('missing Metro metadata falls back to the current configured server', () => {
  assert.equal(selectApiOrigin({configuredUrl:'https://current.trycloudflare.com',savedUrl:'https://expired.trycloudflare.com',development:true,metroProxy:true}),'https://current.trycloudflare.com');
});
