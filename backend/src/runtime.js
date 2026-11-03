import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminAuth, verifyFirebaseToken } from './firebaseAdmin.js';
import { getFirebaseRoles } from './firebaseRoles.js';
import { FirestoreStore } from './firestoreStore.js';
import { AcademicService } from './academicService.js';
import { GeminiClient } from './geminiClient.js';
import { createMoniMobHandler } from './app.js';

export function createRuntime() {
  getFirebaseAdminAuth();
  const store = new FirestoreStore(getFirestore());
  return createMoniMobHandler({ academicService: new AcademicService(store), verifyFirebaseToken, getFirebaseRoles,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    geminiClient: process.env.GEMINI_API_KEY ? new GeminiClient({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.6-flash' }) : null
  });
}
