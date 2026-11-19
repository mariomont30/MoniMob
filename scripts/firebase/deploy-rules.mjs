import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig, root, backend } from '../dev/local-config.mjs';
const { backendEnv, projectId } = loadConfig();
const r = createRequire(path.join(backend, 'package.json'));
const { initializeApp, cert, deleteApp } = r('firebase-admin/app');
const { getSecurityRules } = r('firebase-admin/security-rules');
const app = initializeApp({ projectId, credential: cert(JSON.parse(fs.readFileSync(backendEnv.GOOGLE_APPLICATION_CREDENTIALS))) });
try {
  const source = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const security = getSecurityRules(app);
  await security.releaseFirestoreRulesetFromSource(source);
  const result = await security.getFirestoreRuleset();
  if (result.source.length !== 1 || result.source[0].content.replace(/\r\n/g, '\n').trim() !== source.replace(/\r\n/g, '\n').trim()) throw new Error('As regras publicadas não correspondem ao arquivo local.');
  console.log('Regras publicadas e verificadas em ' + projectId + '.');
} finally { await deleteApp(app); }
