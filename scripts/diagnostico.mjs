import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadConfig, backend } from './local-config.mjs';
const { backendEnv, projectId } = loadConfig();
const r = createRequire(path.join(backend, 'package.json'));
const { initializeApp, cert, deleteApp } = r('firebase-admin/app');
const { getFirestore } = r('firebase-admin/firestore');
const { getAuth } = r('firebase-admin/auth');
const fs = r('node:fs');
const app = initializeApp({ projectId, credential: cert(JSON.parse(fs.readFileSync(backendEnv.GOOGLE_APPLICATION_CREDENTIALS))) });
const database = getFirestore(app);
try {
  await database.collection('users').limit(1).get();
  console.log('OK — acesso ao Firestore: ' + projectId);
  await getAuth(app).listUsers(1);
  console.log('OK — acesso administrativo ao Authentication.');
  if (process.argv.includes('--ia')) {
    const { GeminiClient } = await import(pathToFileURL(path.join(backend, 'src/geminiClient.js')));
    const answer = await new GeminiClient({ apiKey: backendEnv.GEMINI_API_KEY, model: backendEnv.GEMINI_MODEL, maxAttempts: 2 }).generate({ role: 'student', message: 'Responda apenas OK para confirmar este teste de conexão.', context: {} });
    if (!answer?.trim()) throw new Error('A IA não retornou texto.');
    console.log('OK — resposta real do Gemini: ' + backendEnv.GEMINI_MODEL);
  }
  console.log('Diagnóstico concluído. Nenhuma senha ou chave foi exibida.');
} catch(error) { console.error('Diagnóstico não concluído: ' + (error.code || 'CONNECTION_FAILED') + '. ' + (error.code === 'AI_QUOTA_EXCEEDED' ? 'Aguarde a renovação da cota da IA.' : 'Confira a conexão e tente novamente.')); process.exitCode = 1; } finally { await database.terminate(); await deleteApp(app); }
