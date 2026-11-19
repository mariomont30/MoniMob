import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoniMobHandler } from '../src/app.js';
async function health(projectId) {
  let result;
  await createMoniMobHandler({ projectId })({ method: 'GET', url: '/health', headers: {} }, { setHeader() {}, writeHead(status) { this.status = status; }, end(body) { result = { status: this.status, body: JSON.parse(body) }; } });
  return result;
}
test('health identifies the configured Firebase without exposing backend credentials', async () => {
  assert.deepEqual(await health('my-monimob-project'), { status: 200, body: { status: 'ok', service: 'monibot', projectId: 'my-monimob-project' } });
});
test('health remains compatible with callers that do not supply a Firebase project', async () => {
  assert.deepEqual((await health()).body, { status: 'ok', service: 'monibot' });
});
