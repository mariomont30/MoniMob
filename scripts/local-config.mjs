import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const backend = path.join(root, 'backend');
export const mobile = path.join(root, 'mobile-expo');
export function loadConfig() {
  const backendEnv = parseEnv(fs.readFileSync(path.join(backend, '.env'), 'utf8'));
  const mobileEnv = parseEnv(fs.readFileSync(path.join(mobile, '.env'), 'utf8'));
  if (!backendEnv.GCLOUD_PROJECT || backendEnv.GCLOUD_PROJECT !== mobileEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID) throw new Error('Os projetos Firebase do aplicativo e do backend precisam ser iguais.');
  const file = backendEnv.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) throw new Error('Configure GOOGLE_APPLICATION_CREDENTIALS em backend/.env.');
  backendEnv.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(backend, file);
  const credential = JSON.parse(fs.readFileSync(backendEnv.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  if (credential.type !== 'service_account' || credential.project_id !== backendEnv.GCLOUD_PROJECT) throw new Error('Use a credencial de serviço do mesmo projeto Firebase.');
  if (!backendEnv.GEMINI_API_KEY || !backendEnv.GEMINI_MODEL) throw new Error('Configure a chave e o modelo Gemini em backend/.env.');
  return { backendEnv, mobileEnv, projectId: backendEnv.GCLOUD_PROJECT };
}
export function saveMobileEnv(values) {
  fs.writeFileSync(path.join(mobile, '.env'), Object.entries(values).map(([key, value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n');
}
