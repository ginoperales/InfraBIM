import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
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

export type CatalogKind = "familias" | "materiales" | "colecciones" | "marcas" | "proyectos" | "galeria";

export type CatalogItemPayload = BimObjectPayload & {
  kind: CatalogKind;
  slug: string;
  route: string;
  description: string;
  specs: string[];
  visual: string;
  feature: string;
  isPremium: boolean;
  imageUrl?: string;
  ownerUid?: string;
};

export type ModuleKey =
  | "families"
  | "materials"
  | "collections"
  | "manufacturers"
  | "projects"
  | "gallery"
  | "revitPlugin"
  | "adminDashboard"
  | "roles"
  | "firestore"
  | "drive";

export type RoleKey =
  | "Administrador"
  | "Usuario"
  | "Creador BIM"
  | "Fabricante"
  | "Empresa"
  | "Instructor";

export type ModulePermission = {
  enabled: boolean;
  read: boolean;
  write: boolean;
  publish: boolean;
};

export type AccessRole = {
  label: RoleKey;
  description: string;
  modules: Record<ModuleKey, ModulePermission>;
};

export type AccessModule = {
  key: ModuleKey;
  label: string;
  description: string;
};

export type AccessControl = {
  ownerUid: string;
  ownerEmail: string | null;
  modules: AccessModule[];
  roles: Record<RoleKey, AccessRole>;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PaymentPlanId = "profesional" | "estudiante";
export type PaymentBillingCycle = "mensual" | "anual";

export type PaymentPlanConfig = {
  label: string;
  description: string;
  prices: Record<PaymentBillingCycle, number>;
};

export type PaymentPlansConfig = Record<PaymentPlanId, PaymentPlanConfig>;

export const defaultPaymentPlansConfig: PaymentPlansConfig = {
  profesional: {
    description: "Estudios, coordinadores BIM y equipos de proyecto.",
    label: "Profesional",
    prices: {
      mensual: 79,
      anual: 790,
    },
  },
  estudiante: {
    description: "Acceso completo con descuento academico.",
    label: "Estudiante",
    prices: {
      mensual: 39,
      anual: 390,
    },
  },
};

const modules: AccessModule[] = [
  { key: "families", label: "Familias", description: "Gestionar objetos BIM, fichas y descargas." },
  { key: "materials", label: "Materiales", description: "Publicar materiales y acabados BIM." },
  { key: "collections", label: "Colecciones", description: "Crear paquetes y bibliotecas por proyecto." },
  { key: "manufacturers", label: "Fabricantes", description: "Administrar marcas, productos y analitica." },
  { key: "projects", label: "Proyectos", description: "Gestionar modelos, documentos y miembros." },
  { key: "gallery", label: "Galeria", description: "Mostrar renders, previews y casos de uso." },
  { key: "revitPlugin", label: "Plugin Revit", description: "Controlar instalador, versiones y descargas." },
  { key: "adminDashboard", label: "Panel admin", description: "Ver metricas y publicar configuraciones." },
  { key: "roles", label: "Roles y permisos", description: "Activar modulos por perfil de usuario." },
  { key: "firestore", label: "Firestore", description: "Publicar datos base y catalogos." },
  { key: "drive", label: "Google Drive", description: "Subir fichas y archivos vinculados." },
];

const allAccess: ModulePermission = {
  enabled: true,
  read: true,
  write: true,
  publish: true,
};

function permission(read = true, write = false, publish = false): ModulePermission {
  return {
    enabled: read || write || publish,
    read,
    write,
    publish,
  };
}

function buildRole(
  label: RoleKey,
  description: string,
  overrides: Partial<Record<ModuleKey, ModulePermission>>,
): AccessRole {
  const roleModules = modules.reduce(
    (accumulator, item) => ({
      ...accumulator,
      [item.key]: overrides[item.key] ?? permission(false, false, false),
    }),
    {} as Record<ModuleKey, ModulePermission>,
  );

  return {
    label,
    description,
    modules: roleModules,
  };
}

function defaultAccessControl(user: User): AccessControl {
  const readOnlyModules = modules.reduce(
    (accumulator, item) => ({
      ...accumulator,
      [item.key]: permission(true, false, false),
    }),
    {} as Record<ModuleKey, ModulePermission>,
  );

  return {
    ownerUid: user.uid,
    ownerEmail: user.email,
    modules,
    roles: {
      Administrador: buildRole("Administrador", "Control total de la plataforma.", {
        families: allAccess,
        materials: allAccess,
        collections: allAccess,
        manufacturers: allAccess,
        projects: allAccess,
        gallery: allAccess,
        revitPlugin: allAccess,
        adminDashboard: allAccess,
        roles: allAccess,
        firestore: allAccess,
        drive: allAccess,
      }),
      Usuario: {
        label: "Usuario",
        description: "Explora, descarga y guarda favoritos.",
        modules: {
          ...readOnlyModules,
          adminDashboard: permission(false, false, false),
          roles: permission(false, false, false),
          firestore: permission(false, false, false),
          drive: permission(true, true, false),
        },
      },
      "Creador BIM": buildRole("Creador BIM", "Publica familias, materiales y colecciones.", {
        families: allAccess,
        materials: allAccess,
        collections: allAccess,
        gallery: permission(true, true, true),
        drive: permission(true, true, true),
      }),
      Fabricante: buildRole("Fabricante", "Gestiona catalogo de marca y analitica comercial.", {
        families: permission(true, true, true),
        materials: permission(true, true, true),
        manufacturers: allAccess,
        drive: permission(true, true, true),
      }),
      Empresa: buildRole("Empresa", "Gestiona proyectos, colecciones y biblioteca interna.", {
        families: permission(true, false, false),
        collections: allAccess,
        projects: allAccess,
        drive: permission(true, true, true),
      }),
      Instructor: buildRole("Instructor", "Publica contenido educativo y recursos descargables.", {
        families: permission(true, false, false),
        materials: permission(true, false, false),
        gallery: permission(true, true, true),
        drive: permission(true, true, true),
      }),
    },
  };
}

function requireDb() {
  if (!db) {
    throw new Error("Firebase no esta configurado. Completa las variables VITE_FIREBASE_*.");
  }

  return db;
}

function normalizePaymentPlans(data: Partial<PaymentPlansConfig>): PaymentPlansConfig {
  return (Object.keys(defaultPaymentPlansConfig) as PaymentPlanId[]).reduce((plans, planId) => {
    const fallback = defaultPaymentPlansConfig[planId];
    const source = data[planId];

    return {
      ...plans,
      [planId]: {
        description: source?.description || fallback.description,
        label: source?.label || fallback.label,
        prices: {
          mensual: Number(source?.prices?.mensual) > 0 ? Number(source?.prices?.mensual) : fallback.prices.mensual,
          anual: Number(source?.prices?.anual) > 0 ? Number(source?.prices?.anual) : fallback.prices.anual,
        },
      },
    };
  }, {} as PaymentPlansConfig);
}

export async function upsertUserProfile(user: User, role: RoleKey = "Usuario") {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "users", user.uid),
    {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      role,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function initializeUserAccess(user: User) {
  const firestore = requireDb();
  const accessRef = doc(firestore, "system", "accessControl");
  const userRef = doc(firestore, "users", user.uid);

  return runTransaction(firestore, async (transaction) => {
    const accessSnapshot = await transaction.get(accessRef);
    const userSnapshot = await transaction.get(userRef);
    const fallbackAccess = defaultAccessControl(user);
    const access = accessSnapshot.exists() ? (accessSnapshot.data() as AccessControl) : fallbackAccess;
    const existingRole = userSnapshot.data()?.role as RoleKey | undefined;
    const role: RoleKey = !accessSnapshot.exists()
      ? "Administrador"
      : access.ownerUid === user.uid
        ? "Administrador"
        : (existingRole ?? "Usuario");

    if (!accessSnapshot.exists()) {
      transaction.set(accessRef, {
        ...fallbackAccess,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(
      userRef,
      {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        role,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return {
      access,
      role,
      isAdmin: role === "Administrador",
    };
  });
}

export async function saveAccessControl(access: AccessControl) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "system", "accessControl"),
    {
      ...access,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchPaymentPlans(): Promise<PaymentPlansConfig> {
  const firestore = requireDb();
  const snapshot = await getDoc(doc(firestore, "system", "paymentPlans"));

  if (!snapshot.exists()) {
    return defaultPaymentPlansConfig;
  }

  return normalizePaymentPlans(snapshot.data() as Partial<PaymentPlansConfig>);
}

export async function savePaymentPlans(plans: PaymentPlansConfig) {
  const firestore = requireDb();
  const normalizedPlans = normalizePaymentPlans(plans);

  await setDoc(
    doc(firestore, "system", "paymentPlans"),
    {
      ...normalizedPlans,
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

export async function saveCatalogItem(item: CatalogItemPayload) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "catalogItems", `${item.kind}_${item.slug}`),
    {
      ...item,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchCatalogItems(maxResults = 80): Promise<CatalogItemPayload[]> {
  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, "catalogItems"), orderBy("updatedAt", "desc"), limit(maxResults)),
  );

  return snapshot.docs.map((item) => item.data() as CatalogItemPayload);
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
