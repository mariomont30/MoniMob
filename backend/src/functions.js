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
export const monimobApi = onRequest({ region: 'southamerica-east1', secrets: [geminiKey], timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 }, (request, response) => {
  try { handler ||= createRuntime(); }
  catch { response.status(503).json({ error: 'Serviço indisponível.' }); return; }
  return handler(request, response);
});
export const monitoringReminders = onSchedule({ schedule: 'every 60 minutes', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', maxInstances: 1 }, async () => {
  getFirebaseAdminAuth();
  await sendReminders(new FirestoreStore(getFirestore()));
});
