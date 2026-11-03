
import {
  initializeApp,
  getApp,
  getApps,
  applicationDefault
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

export function getFirebaseAdminAuth() {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: applicationDefault(),
        projectId: PROJECT_ID
      });

  return getAuth(app);
}

export async function verifyFirebaseToken(token) {
  if (!token) {
    throw Object.assign(
      new Error("Token de autenticação não informado."),
      { status: 401 }
    );
  }

  try {
    const decoded = await getFirebaseAdminAuth()
      .verifyIdToken(token, true);

    return {
      userId: decoded.uid,
      email: decoded.email
    };
  } catch (error) {
    if (error.status === 401) throw error;

    throw Object.assign(
      new Error("Token Firebase inválido ou expirado."),
      { status: 401 }
    );
  }
}
