import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export type BimObjectPayload = {
  id: string;
  name: string;
  maker: string;
  category: string;
  discipline: string;
  country: string;
  formats: string[];
  versions: string[];
  price: string;
  downloads: string;
  tags: string[];
};

export type DriveFilePayload = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  ownerUid: string;
  linkedObjectId?: string;
};

function requireDb() {
  if (!db) {
    throw new Error("Firebase no esta configurado. Completa las variables VITE_FIREBASE_*.");
  }

  return db;
}

export async function upsertUserProfile(user: User) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "users", user.uid),
    {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      role: "Usuario",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function publishBimObject(product: BimObjectPayload) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "bimObjects", product.id),
    {
      ...product,
      source: "InfraBIM MVP",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveFavorite(uid: string, product: BimObjectPayload) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "users", uid, "favorites", product.id),
    {
      productId: product.id,
      name: product.name,
      maker: product.maker,
      formats: product.formats,
      savedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function logDriveFile(file: DriveFilePayload) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "driveFiles", file.id),
    {
      ...file,
      provider: "google-drive",
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchBimObjects(maxResults = 12): Promise<DocumentData[]> {
  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, "bimObjects"), orderBy("updatedAt", "desc"), limit(maxResults)),
  );

  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
