import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreStore } from '../src/firestoreStore.js';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--file') || !args.includes('--project')) throw new Error('Usage: node scripts/admin.mjs --file REAL_DATA.json --project PROJECT_ID [--apply]');
const projectId = option('--project');
if (!projectId || projectId.startsWith('--')) throw new Error('Explicit project required.');
const data = JSON.parse(await readFile(option('--file'), 'utf8'));
const allowed = ['profiles', 'disciplines', 'monitorDisciplines', 'professorDisciplines'];
for (const key of Object.keys(data)) if (!allowed.includes(key) || !Array.isArray(data[key])) throw new Error('Unsupported import collection: ' + key);
const id = value => typeof value === 'string' && /^[^/]{1,120}$/.test(value);
for (const [key, items] of Object.entries(data)) for (const item of items) {
  if (!id(item.id)) throw new Error('Every record requires a stable id.');
  if (key === 'profiles' && (!item.name?.trim() || !item.email?.includes('@') || !item.registration || !Array.isArray(item.roles) || !item.roles.length || item.roles.some(role => !['student', 'monitor', 'professor'].includes(role)))) throw new Error('Profile requires name, email, registration and valid roles.');
  if (key === 'disciplines' && (!item.name?.trim() || !item.code?.trim() || !Number.isInteger(item.semester) || item.semester < 1)) throw new Error('Discipline requires name, code and semester.');
  if (key.endsWith('Disciplines') && (!id(item.disciplineId) || !id(item.professorId))) throw new Error('Link requires discipline and professor IDs.');
  if (key === 'monitorDisciplines' && (!id(item.monitorId) || !item.validUntil || !(Date.parse(item.validUntil) > Date.now()))) throw new Error('Monitor links require a monitor and future ISO validUntil date.');
}
if (!args.includes('--apply')) {
  console.log('Validation passed. No Firebase writes performed. Review the real input, then add --apply.');
  process.exit(0);
}
const app = initializeApp({ projectId, ...(!process.env.FIRESTORE_EMULATOR_HOST ? { credential: applicationDefault() } : {}) });
const auth = getAuth(app);
for (const profile of data.profiles || []) {
  const account = await auth.getUser(profile.id);
  if (account.email?.toLowerCase() !== profile.email.toLowerCase()) throw new Error('Profile email must match the existing Firebase Auth account.');
}
const store = new FirestoreStore(getFirestore(app));
const digest = createHash('sha256').update(JSON.stringify(data)).digest('hex');
await store.transact('admin_' + digest, digest, state => {
  for (const [key, items] of Object.entries(data)) {
    const name = key === 'profiles' ? 'users' : key;
    for (const item of items) {
      const index = state[name].findIndex(existing => existing.id === item.id);
      if (index >= 0) state[name][index] = { ...state[name][index], ...item };
      else state[name].push({ ...item, ...(key === 'profiles' ? { course: item.course || 'Ciências da Computação' } : {}) });
    }
  }
  for (const link of [...state.monitorDisciplines, ...state.professorDisciplines]) {
    if (!state.disciplines.some(item => item.id === link.disciplineId)) throw new Error('Link references an unknown discipline.');
    if (!state.users.some(item => item.id === link.professorId && item.roles.includes('professor'))) throw new Error('Link references an unauthorized professor.');
    if (link.monitorId && !state.users.some(item => item.id === link.monitorId && item.roles.includes('monitor'))) throw new Error('Link references an unauthorized monitor.');
  }
  return { records: Object.values(data).reduce((sum, list) => sum + list.length, 0) };
});
for (const profile of data.profiles || []) {
  const account = await auth.getUser(profile.id);
  await auth.setCustomUserClaims(profile.id, { ...account.customClaims, roles: profile.roles });
}
console.log('Real academic records imported and role claims synchronized.');
