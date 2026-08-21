import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Failed to set browserLocalPersistence:", err);
  });
}

export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope(DRIVE_FILE_SCOPE);
googleProvider.setCustomParameters({
  prompt: "select_account",
});
