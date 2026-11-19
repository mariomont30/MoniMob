import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { backend } from '../dev/local-config.mjs';

export async function publishConnection({ apiUrl, projectId, credentialPath }) {
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' || url.origin !== apiUrl || url.username || url.password) throw new Error('Endereço de conexão inválido.');
  const require = createRequire(path.join(backend, 'package.json'));
  const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId, credential: cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) }, 'connection-publisher');
  const db = getFirestore(app);
  try {
    await db.doc('appConfig/connection').set({ apiUrl, projectId, schemaVersion: 1, updatedAt: new Date().toISOString() });
    const response = await fetch('https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/appConfig/connection', { signal: AbortSignal.timeout(12000) });
    const document = await response.json();
    if (!response.ok || document.fields?.apiUrl?.stringValue !== apiUrl || document.fields?.projectId?.stringValue !== projectId) throw new Error('A conexão automática não pôde ser verificada. Execute npm.cmd run firebase:regras e tente iniciar novamente.');
  } finally { await db.terminate(); await deleteApp(app); }
}
