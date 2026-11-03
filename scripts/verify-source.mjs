import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    if (item.name === 'node_modules') return [];
    const path = join(directory, item.name);
    return item.isDirectory() ? files(path) : [path];
  });
}
for (const file of [...files(join(root, 'mobile-expo/src')), ...files(join(root, 'backend/src'))]) {
  if (!file.endsWith('.js')) continue;
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /DemoAuthRepository|MemoryStateRepository|createSeedState|createDemoSession|DemoInstitutionalGateway|issueDemoToken|verifyDemoToken/);
  assert.doesNotMatch(source, /Aluno@123|Monitor@123|Professor@123|example\.invalid|exemplo-monimob/);
}
const app = readFileSync(join(root, 'mobile-expo/src/MoniMobApp.js'), 'utf8');
assert.ok(app.includes('new FirebaseAuthRepository()'));
assert.ok(app.includes('new FirestoreStateRepository(loadAcademicState)'));
assert.equal(readFileSync(join(root, 'mobile-expo/src/domain/monitoring.js'), 'utf8'), readFileSync(join(root, 'backend/src/domain/monitoring.js'), 'utf8'), 'Generated backend domain is stale. Run npm run sync:domain.');
assert.ok(app.includes('auth.signIn(email, password)'));
console.log('Source verification passed.');
