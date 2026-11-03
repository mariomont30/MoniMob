import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiOrigin } from '../src/services/apiOrigin.js';
test('explicit deployed API URL takes priority', () => assert.equal(resolveApiOrigin('https://api.example.com/', 'local:8081', false), 'https://api.example.com'));
test('LAN development uses the Metro proxy port', () => assert.equal(resolveApiOrigin('', '192.168.1.2:8081', true), 'http://192.168.1.2:8081'));
test('Expo tunnel always uses HTTPS without the internal HTTP port', () => assert.equal(resolveApiOrigin('', 'project.exp.direct:80', true), 'https://project.exp.direct'));
test('production does not infer an API from a development manifest', () => assert.equal(resolveApiOrigin('', 'project.exp.direct', false), ''));
test('missing development manifest keeps configuration explicit', () => assert.equal(resolveApiOrigin('', undefined, true), ''));
