import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { planRegistrationIndex } from '../src/registrationIndex.js';
const args = new Set(process.argv.slice(2));
const projectIndex = process.argv.indexOf('--project');
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const apply = args.has('--apply');
if (!projectId || projectId.startsWith('--')) throw new Error('Informe --project SEU_PROJETO ou configure GCLOUD_PROJECT.');
const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app), profiles = [];
let cursor = null, written = 0;
while (true) {
  let query = db.collection('users').orderBy(FieldPath.documentId()).limit(400);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  for (const snapshot of page.docs) profiles.push({ id: snapshot.id, registration: snapshot.get('registration') });
  if (page.size < 400) break;
  cursor = page.docs.at(-1);
}
const { entries, legacy } = planRegistrationIndex(profiles);
// Validate every page before making any write.
for (let start = 0; start < entries.length; start += 400) {
  const chunk = entries.slice(start, start + 400);
  const snapshots = await db.getAll(...chunk.map(entry => db.doc('studentRegistrationIndex/' + entry.registration)));
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists && snapshot.get('uid') !== chunk[index].uid) throw new Error('Índice de matrícula em conflito. Nenhum perfil será alterado.');
  });
}
if (apply) for (let start = 0; start < entries.length; start += 400) {
  const chunk = entries.slice(start, start + 400), refs = chunk.map(entry => db.doc('studentRegistrationIndex/' + entry.registration));
  written += await db.runTransaction(async transaction => {
    const snapshots = await transaction.getAll(...refs);
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists && snapshot.get('uid') !== chunk[index].uid) throw new Error('Índice de matrícula alterado por outra operação.');
    });
    let created = 0;
    snapshots.forEach((snapshot, index) => { if (!snapshot.exists) { transaction.create(refs[index], { uid: chunk[index].uid }); created++; } });
    return created;
  });
}
console.log(`${apply ? 'Migração concluída' : 'Prévia concluída'}: ${profiles.length} perfis analisados, ${entries.length} matrículas indexáveis, ${written} índices criados, ${legacy.length} cadastros legados preservados.`);
if (!apply) console.log('Nenhum dado foi alterado.');
