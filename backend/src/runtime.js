import { MaterialFileService } from './materialFiles.js';
import { ensureCourseCatalog } from './catalogBootstrap.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminAuth, verifyFirebaseToken } from './firebaseAdmin.js';
import { getFirebaseRoles } from './firebaseRoles.js';
import { FirestoreStore } from './firestoreStore.js';
import { AcademicService } from './academicService.js';
import { GeminiClient } from './geminiClient.js';
import { createMoniMobHandler } from './app.js';
import { AccountDeletionService } from './accountDeletion.js';
import { RegistrationService } from './registrationService.js';

export function createRuntime() {
  getFirebaseAdminAuth();
  const store = new FirestoreStore(getFirestore());
  const deletion = new AccountDeletionService({auth:getFirebaseAdminAuth(),db:getFirestore(),store});
  const academic = new AcademicService(store);
  const files = new MaterialFileService({db:getFirestore(),academicService:academic});
  const handler = createMoniMobHandler({ accountDeletionService: deletion, materialFileService: files, academicService: academic, registrationService: new RegistrationService({ auth: getFirebaseAdminAuth(), db: getFirestore() }), verifyFirebaseToken, getFirebaseRoles, projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    geminiClient: process.env.GEMINI_API_KEY ? new GeminiClient({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' }) : null
  });
  handler.recoverAccountDeletions = () => deletion.recoverPending();
  handler.recoverMaterialFiles = () => files.recover();
  handler.ready = ensureCourseCatalog(getFirestore());
  return handler;
}
