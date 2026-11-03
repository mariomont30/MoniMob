
import { initializeApp, getApps, getApp } from "firebase/app";

import {
  initializeAuth,
  getAuth,
  connectAuthEmulator,
  getReactNativePersistence
} from "firebase/auth";

import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveFirebasePublicConfig } from './firebasePublicConfig.js';

const firebaseConfig = resolveFirebasePublicConfig({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
}, process.env.NODE_ENV !== 'production' ? process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST : undefined);

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  if (error.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

// Firestore database.
const db = getFirestore(app);

if (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST && process.env.NODE_ENV !== 'production') {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  connectAuthEmulator(auth, 'http://' + host + ':9099', { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}
export { app, auth, db };
