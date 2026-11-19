import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminAuth } from './firebaseAdmin.js';
import { FirestoreStore } from './firestoreStore.js';
import { sendReminders } from './reminders.js';
import { createRuntime } from './runtime.js';
const geminiKey = defineSecret('GEMINI_API_KEY');
let handler;
export const monimobApi = onRequest({ region: 'southamerica-east1', secrets: [geminiKey], timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 }, async (request, response) => {
  try { handler ||= createRuntime(); await handler.ready; }
  catch { handler = null; response.status(503).json({ error: 'Não foi possível preparar o catálogo acadêmico. Tente novamente.' }); return; }
  return handler(request, response);
});
export const monitoringReminders = onSchedule({ schedule: 'every 60 minutes', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', maxInstances: 1 }, async () => {
  getFirebaseAdminAuth();
  const store = new FirestoreStore(getFirestore());
  const {AccountDeletionService} = await import('./accountDeletion.js');
  await new AccountDeletionService({auth:getFirebaseAdminAuth(),db:getFirestore(),store}).recoverPending();
  const {AcademicService} = await import('./academicService.js');
  const {MaterialFileService} = await import('./materialFiles.js');
  await new MaterialFileService({db:getFirestore(),academicService:new AcademicService(store)}).recover();
  await sendReminders(store);
});
