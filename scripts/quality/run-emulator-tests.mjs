import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-monimob') {
  throw new Error('Run this suite inside Firebase Auth/Firestore emulators with GCLOUD_PROJECT=demo-monimob.');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const suites = [
  'tests/firestore/rules.test.mjs',
  ...['firebase.e2e', 'catalogFlow.integration', 'firestore.integration', 'materialFiles.integration', 'libraryFlow.integration', 'reviewFlow.integration', 'accountDeletion.integration', 'load.integration'].map(name => 'backend/tests/' + name + '.test.js'),
];
for (const suite of suites) {
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', suite], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, MONIMOB_RUN_LOAD_TESTS: '1', GEMINI_API_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: '' },
    });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (status !== 0) process.exit(status || 1);
}
