import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "./lib/firebase";
import {
  Archive,
  ArchiveRestore,
  Armchair,
  Bath,
  BookOpen,
  Box,
  Boxes,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CheckSquare,
  CookingPot,
  CreditCard,
  Crown,
  Database,
  DoorOpen,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Factory,
  Fan,
  FileText,
  Filter,
  Folder,
  FolderKanban,
  GraduationCap,
  Grid3x3,
  Heart,
  Image,
  Images,
  Info,
  Lamp,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  List,
  Moon,
  PackagePlus,
  PanelsTopLeft,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Trees,
  Upload,
  UploadCloud,
  User2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createCardSubscription,
  createYapePayment,
  createYapeToken,
  isMercadoPagoConfigured,
  isPaymentsApiConfigured,
  mountCardPaymentBrick,
  type BillingCycle,
  type PaidPlanId,
} from "./lib/mercadoPago";
import {
  deleteCatalogItem,
  initializeUserAccess,
  saveAccessControl,
  fetchCatalogItems,
  fetchPaymentPlans,
  fetchBimObjects,
  logDriveFile,
  publishBimObject,
  saveCatalogItem,
  savePaymentPlans,
  saveFavorite,
  toggleArchiveCatalogItem,
  type AccessControl,
  type BimObjectPayload,
  type CatalogItemPayload,
  type CatalogKind,
  type DriveFilePayload,
  type ModuleKey,
  type PaymentPlansConfig,
  type RoleKey,
  defaultPaymentPlansConfig,
} from "./lib/firestore";
import {
  createDriveFolderClient,
  deleteDriveFileClient,
  listDriveFiles,
  renameDriveFileClient,
  uploadFileToDriveClient,
  uploadJsonToDrive,
  type DriveFile,
} from "./lib/googleDrive";
import { matchesBilingualSearch } from "./lib/bilingualSearch";
import "./styles.css";

type UploadFileItem = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  previewUrl?: string;
  size: number;
};

type BulkUploadFile = File & {
  relPath?: string;
  bulkRootPath?: string;
  bulkRelativePath?: string;
};

type Product = BimObjectPayload & {
  description: string;
  specs: string[];
  visual: string;
  feature: string;
  isPremium: boolean;
  imageUrl?: string;
  images?: string[];
  glbUrl?: string;
  has3D?: boolean;
  hasAR?: boolean;
  driveFolderId?: string;
  driveFolderLink?: string;
  attachedFiles?: DriveFilePayload[];
};

type CatalogProduct = Product & {
  kind: CatalogKind;
  slug: string;
  route: string;
  source: "demo" | "firestore";
  isArchived?: boolean;
};

type CatalogDraft = {
  kind: CatalogKind;
  name: string;
  maker: string;
  category: string;
  discipline: string;
  country: string;
  formats: string;
  versions: string;
  price: string;
  downloads: string;
  tags: string;
  specs: string;
  description: string;
  feature: string;
  isPremium: boolean;
  imageUrl: string;
  coverImages: UploadFileItem[];
  glbFile: UploadFileItem | null;
  attachedFiles: UploadFileItem[];
  editingOriginalKind?: CatalogKind;
  editingOriginalSlug?: string;
  existingImages?: string[];
  existingGlbUrl?: string;
  existingDriveFolderId?: string;
  existingDriveFolderLink?: string;
  existingAttachedFiles?: DriveFilePayload[];
  isArchived?: boolean;
};

type CheckoutMethod = "card" | "yape";

export interface BulkFolderProgressItem {
  id: string;
  folderName: string;
  cleanName: string;
  fileCount: number;
  totalBytes: number;
  uploadedBytes: number;
  progress: number;
  currentFilePercent?: number;
  status: "pending" | "uploading" | "completed" | "error";
  currentStep: string;
  processedFiles: number;
  category: string;
  maker: string;
  formats: string[];
  driveFolderLink?: string;
  errorMessage?: string;
}

export interface BulkFolderSelectionItem {
  id: string;
  folderName: string;
  rootPath: string;
  cleanName: string;
  files: BulkUploadFile[];
  fileCount: number;
  totalBytes: number;
  category: string;
  maker: string;
  formats: string[];
  selected: boolean;
}

type CheckoutState = {
  method: CheckoutMethod;
  planId: PaidPlanId;
};

type DbLoadKey = "access" | "catalog" | "objects" | "plans";

const catalogMeta: Record<
  CatalogKind,
  { label: string; singular: string; description: string; Icon: LucideIcon }
> = {
  familias: {
    label: "Familias",
    singular: "Familia",
    description: "Objetos BIM parametrizados para Revit, IFC y flujos OpenBIM.",
    Icon: Box,
  },
  materiales: {
    label: "Materiales",
    singular: "Material",
    description: "Acabados, superficies y fichas tecnicas enlazadas.",
    Icon: Layers,
  },
  colecciones: {
    label: "Colecciones",
    singular: "Coleccion",
    description: "Paquetes de recursos por ambiente, sistema o tipo de proyecto.",
    Icon: Boxes,
  },
  marcas: {
    label: "Marcas",
    singular: "Marca",
    description: "Fabricantes con catalogo BIM, productos y analitica comercial.",
    Icon: Factory,
  },
  proyectos: {
    label: "Proyectos",
    singular: "Proyecto",
    description: "Expedientes BIM con modelos, documentos y objetos vinculados.",
    Icon: FolderKanban,
  },
  galeria: {
    label: "Galeria",
    singular: "Galeria",
    description: "Escenas, renders, previsualizaciones y casos de uso.",
    Icon: Images,
  },
};

export interface MasterOptions {
  makers: string[];
  categories: string[];
  disciplines: string[];
  countries: string[];
  formats: string[];
  versions: string[];
  tags: string[];
  specs: string[];
  statuses: string[];
}

export const defaultMasterOptions: MasterOptions = {
  makers: [
    "5V INMOBILIARIA",
    "MODASA",
    "AirTek",
    "HydroAndes",
    "SaniPro",
    "InfraWood",
    "SteelBIM",
    "NexoForma",
    "Weiku",
    "Aceros Arequipa",
    "Generico BIM",
  ],
  categories: [
    "Arquitectura",
    "Mobiliario",
    "Puertas",
    "Ventanas",
    "Sanitarios",
    "Iluminacion",
    "HVAC",
    "Estructuras",
    "Instalaciones MEP",
    "Infraestructura",
  ],
  disciplines: [
    "Arquitectura",
    "Estructura",
    "Sanitaria",
    "Electrica",
    "Mecanica / HVAC",
    "BIM General",
  ],
  countries: [
    "Peru",
    "Chile",
    "Colombia",
    "Mexico",
    "Argentina",
    "Espana",
    "Internacional",
  ],
  formats: [
    "RFA",
    "RVT",
    "IFC",
    "DWG",
    "SKP",
    "GLB",
    "PDF",
    "ZIP",
    "RAR",
    "FBX",
    "3DS MAX",
  ],
  versions: [
    "2026",
    "2025",
    "2024",
    "2023",
    "2022",
    "2021",
    "2020",
  ],
  tags: [
    "Cortafuegos",
    "Ergonomia",
    "Sostenible",
    "BIM Pro",
    "Residencial",
    "Comercial",
    "Hospitalario",
    "Educativo",
  ],
  specs: [
    "Alta Resistencia",
    "Aislamiento Acustico",
    "Norma ISO 9001",
    "Parametros Compartidos",
    "LOD 300",
    "LOD 400",
  ],
  statuses: [
    "Nuevo",
    "Actualizado",
    "Destacado",
    "Beta",
    "Popular",
    "Revisado",
  ],
};

const navigation: Array<{ label: string; path: string }> = [
  { label: "Familias", path: "/familias" },
  { label: "Materiales", path: "/materiales" },
  { label: "Colecciones", path: "/colecciones" },
  { label: "Marcas", path: "/marcas" },
  { label: "Proyectos", path: "/proyectos" },
  { label: "Galeria", path: "/galeria" },
];

const searchKinds: CatalogKind[] = ["familias", "materiales", "colecciones", "marcas"];
const categoryFilters = ["Todos", "Arquitectura", "Estructuras", "MEP", "Infraestructura"];
const categories: Array<{ label: string; filter: string; Icon: LucideIcon }> = [
  { label: "Mobiliario", filter: "Arquitectura", Icon: Armchair },
  { label: "Puertas", filter: "Puertas", Icon: DoorOpen },
  { label: "Ventanas", filter: "Ventanas", Icon: PanelsTopLeft },
  { label: "Sanitarios", filter: "Sanitarios", Icon: Bath },
  { label: "Iluminacion", filter: "Iluminacion", Icon: Lamp },
  { label: "HVAC", filter: "HVAC", Icon: Fan },
  { label: "Cocinas", filter: "Cocinas", Icon: CookingPot },
  { label: "Estructuras", filter: "Estructuras", Icon: Building2 },
  { label: "Exterior", filter: "Exterior", Icon: Trees },
];

const products: Product[] = [
  {
    id: "door-fire-90",
    name: "Puerta cortafuego P-01",
    maker: "MODASA",
    category: "Puertas",
    discipline: "Arquitectura",
    country: "Peru",
    formats: ["RFA", "RVT", "IFC", "DWG"],
    versions: ["2024", "2025", "2026"],
    downloads: "12.4K",
    price: "Gratis",
    tags: ["hospital", "accesible", "madera", "fuego"],
    specs: ["RF 60", "0.90 x 2.10 m", "Peso 46 kg", "OmniClass 23-17 11 17"],
    description:
      "Familia parametrica para puertas tecnicas con control de ancho, resistencia al fuego, material y simbologia de planos.",
    visual: "door",
    feature: "Nuevo",
    isPremium: false,
  },
  {
    id: "sink-accessible",
    name: "Lavamanos accesible",
    maker: "SaniPro",
    category: "Sanitarios",
    discipline: "MEP",
    country: "Colombia",
    formats: ["RFA", "IFC", "SKP", "PDF"],
    versions: ["2023", "2024", "2025", "2026"],
    downloads: "8.9K",
    price: "Pro",
    tags: ["bano", "accesible", "hospital", "mep"],
    specs: ["600 mm", "Altura 800 mm", "Zona libre", "Manual PDF"],
    description:
      "Objeto BIM listo para banos accesibles, con parametros de instalacion, conexiones MEP y ficha tecnica enlazada.",
    visual: "sink",
    feature: "Pro",
    isPremium: true,
  },
  {
    id: "pump-set",
    name: "Sistema de bombas 8 pisos",
    maker: "HydroAndes",
    category: "Bombas",
    discipline: "MEP",
    country: "Chile",
    formats: ["RVT", "IFC", "DWG", "PDF"],
    versions: ["2024", "2025", "2026"],
    downloads: "5.2K",
    price: "USD 39",
    tags: ["bomba", "presion", "cuarto tecnico", "8 pisos"],
    specs: ["Q 6.2 l/s", "H 44 m", "Conexiones MEP", "Ficha tecnica"],
    description:
      "Conjunto hidraulico con bombas, valvulas y tuberias para predimensionar cuartos tecnicos en edificios medianos.",
    visual: "pump",
    feature: "1 dia",
    isPremium: true,
  },
  {
    id: "window-panel",
    name: "Ventana corrediza 2 paneles",
    maker: "Weiku",
    category: "Ventanas",
    discipline: "Arquitectura",
    country: "Mexico",
    formats: ["RFA", "IFC", "DWG"],
    versions: ["2024", "2025"],
    downloads: "27K",
    price: "Gratis",
    tags: ["ventana", "aluminio", "vidrio", "fachada"],
    specs: ["Vidrio 8 mm", "Marco aluminio", "LOD 300", "UniClass Ss_25_30"],
    description:
      "Ventana parametizable con materiales separados para vidrio, marco y riel, optimizada para catalogos de fabricantes.",
    visual: "window",
    feature: "Popular",
    isPremium: false,
  },
  {
    id: "cabinet-kit",
    name: "Kit modular de cocina",
    maker: "InfraWood",
    category: "Cocinas",
    discipline: "Arquitectura",
    country: "Peru",
    formats: ["RFA", "RVT", "IFC"],
    versions: ["2024", "2025", "2026"],
    downloads: "25K",
    price: "Pro",
    tags: ["cocina", "mueble", "modular", "familia"],
    specs: ["3 modulos", "Melamina", "Herrajes incluidos", "MasterFormat 12 35 30"],
    description:
      "Conjunto de muebles altos y bajos para cocinas, con tipos editables y parametros comerciales para presupuestos.",
    visual: "cabinet",
    feature: "Pro",
    isPremium: true,
  },
  {
    id: "chair-lounge",
    name: "Sillon lounge BIM",
    maker: "NexoForma",
    category: "Mobiliario",
    discipline: "Arquitectura",
    country: "Brasil",
    formats: ["RFA", "SKP", "IFC"],
    versions: ["2023", "2024", "2025"],
    downloads: "9.2K",
    price: "Gratis",
    tags: ["sillon", "mobiliario", "interior", "familia"],
    specs: ["Tapiz editable", "LOD 250", "Materiales", "Bajo peso"],
    description:
      "Familia liviana para interiorismo y renders de avance, con materiales editables y geometria optimizada.",
    visual: "chair",
    feature: "Nuevo",
    isPremium: false,
  },
  {
    id: "hvac-terminal",
    name: "Difusor HVAC lineal",
    maker: "AirTek",
    category: "HVAC",
    discipline: "MEP",
    country: "Peru",
    formats: ["RFA", "IFC", "PDF"],
    versions: ["2024", "2025", "2026"],
    downloads: "3.8K",
    price: "Gratis",
    tags: ["hvac", "difusor", "aire", "mep"],
    specs: ["Caudal editable", "Conexion ducto", "Nivel techo", "Manual"],
    description:
      "Terminal de aire con parametros de caudal, conexion, nivel y clasificacion para coordinacion MEP.",
    visual: "hvac",
    feature: "OpenBIM",
    isPremium: false,
  },
  {
    id: "rebar-column",
    name: "Columna estructural LOD 350",
    maker: "SteelBIM",
    category: "Estructuras",
    discipline: "Estructuras",
    country: "Peru",
    formats: ["RFA", "IFC", "DWG"],
    versions: ["2022", "2023", "2024", "2025"],
    downloads: "6.1K",
    price: "Gratis",
    tags: ["concreto", "acero", "estructura", "metrados"],
    specs: ["Concreto 280", "Acero fy 4200", "Volumen 2.43 m3", "Parametro LOD"],
    description:
      "Elemento estructural con cuantificacion base y propiedades de concreto, acero y volumen para metrados.",
    visual: "column",
    feature: "Metrados",
    isPremium: false,
  },
];

const brands = ["MODASA", "SaniPro", "HydroAndes", "Weiku", "InfraWood", "AirTek", "SteelBIM", "Sika", "Tigre"];
const footerGroups = [
  ["InfraBIM", "Inicio", "Plugin Revit", "Planes", "Familias", "Materiales", "Colecciones"],
  ["Comunidad", "Aprende BIM", "Foro", "Cursos", "Galeria", "Proyectos"],
  ["Fabricantes", "Para fabricantes", "Marketing BIM", "Analitica", "Publicar producto", "Planes"],
  ["Soporte", "Centro de ayuda", "Terminos de uso", "Privacidad", "Politica de cookies"],
];

const DEFAULT_GOOGLE_DRIVE_ROOT_FOLDER_ID = "1rgmaezSy8mEwkYi0RTqHSne1fLue1p6U";
const driveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || DEFAULT_GOOGLE_DRIVE_ROOT_FOLDER_ID;
const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "infrabimss";

function OtpInputBoxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || "");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, "");
    if (!cleanVal) {
      const nextChars = value.split("");
      nextChars[index] = "";
      onChange(nextChars.join(""));
      return;
    }

    const char = cleanVal.slice(-1);
    const nextChars = value.split("");
    while (nextChars.length < 6) nextChars.push("");
    nextChars[index] = char;
    const nextOtp = nextChars.join("").slice(0, 6);
    onChange(nextOtp);

    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        const nextChars = value.split("");
        nextChars[index - 1] = "";
        onChange(nextChars.join(""));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const targetIndex = Math.min(pasted.length, 5);
      inputRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div className="otp-boxes-container">
      {digits.map((digit, index) => (
        <input
          aria-label={`Digito ${index + 1} de aprobacion`}
          className={`otp-box ${digit ? "is-filled" : ""}`}
          inputMode="numeric"
          key={index}
          maxLength={1}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          pattern="[0-9]*"
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
        />
      ))}
    </div>
  );
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="carousel-container">
        <div className="carousel-viewport">
          <img alt={alt} src={images[0]} />
        </div>
      </div>
    );
  }

  const prevSlide = () => setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  const nextSlide = () => setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));

  return (
    <div className="carousel-container">
      <div className="carousel-viewport">
        <img alt={`${alt} - ${activeIndex + 1}`} src={images[activeIndex]} />
        <button className="carousel-arrow prev" onClick={prevSlide} type="button" aria-label="Imagen anterior">
          <ChevronLeft size={20} />
        </button>
        <button className="carousel-arrow next" onClick={nextSlide} type="button" aria-label="Imagen siguiente">
          <ChevronRight size={20} />
        </button>
        <span className="carousel-counter">
          {activeIndex + 1} / {images.length}
        </span>
      </div>

      <div className="carousel-thumbs">
        {images.map((img, idx) => (
          <button
            key={`${img}-${idx}`}
            className={`carousel-thumb ${idx === activeIndex ? "active" : ""}`}
            onClick={() => setActiveIndex(idx)}
            type="button"
          >
            <img alt={`Miniatura ${idx + 1}`} src={img} />
          </button>
        ))}
      </div>
    </div>
  );
}

const PAYMENTS_WORKER_API_URL = import.meta.env.VITE_PAYMENTS_API_URL || "https://infrabim-payments.infrabimss.workers.dev";

function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function Model3DViewer({ glbUrl, alt }: { glbUrl: string; alt: string }) {
  const [modelSrc, setModelSrc] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const viewerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let createdBlobUrl = "";

    async function resolveAndLoadGlb() {
      if (!glbUrl) {
        setHasError(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setHasError(false);

      const trimmed = glbUrl.trim();

      if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
        setModelSrc(trimmed);
        setLoading(false);
        return;
      }

      const driveId = extractGoogleDriveFileId(trimmed);
      const candidateUrls: string[] = [];

      if (driveId) {
        candidateUrls.push(`${PAYMENTS_WORKER_API_URL}/drive-file/${driveId}`);
        candidateUrls.push(`https://corsproxy.io/?https://drive.google.com/uc?export=download&id=${driveId}`);
        candidateUrls.push(`https://drive.google.com/uc?export=download&id=${driveId}`);
      } else {
        candidateUrls.push(trimmed);
      }

      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 0 && !isCancelled) {
              createdBlobUrl = URL.createObjectURL(blob);
              setModelSrc(createdBlobUrl);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("[Model3DViewer] Error fetching candidate GLB URL:", url, e);
        }
      }

      if (!isCancelled) {
        const fallbackUrl = candidateUrls[0] || trimmed;
        setModelSrc(fallbackUrl);
        setLoading(false);
      }
    }

    resolveAndLoadGlb();

    return () => {
      isCancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [glbUrl]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const handleError = (e: Event) => {
      console.error("[Model3DViewer] model-viewer DOM error event:", e);
      setHasError(true);
      setLoading(false);
    };

    const handleLoad = () => {
      setLoading(false);
      setHasError(false);
    };

    el.addEventListener("error", handleError);
    el.addEventListener("load", handleLoad);

    return () => {
      el.removeEventListener("error", handleError);
      el.removeEventListener("load", handleLoad);
    };
  }, [modelSrc]);

  if (hasError) {
    return (
      <div className="model-3d-container" style={{ padding: "2.5rem 1.5rem", textAlign: "center", background: "#0f172a", color: "#fff", borderRadius: "12px" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: "#f87171" }}>⚠️ No se pudo procesar el modelo 3D</p>
        <small style={{ color: "#94a3b8", display: "block", marginTop: "0.5rem", fontSize: "0.82rem" }}>
          Verifica que el archivo subido sea un modelo .glb válido de 3D o intenta nuevamente.
        </small>
        <button
          onClick={() => {
            setHasError(false);
            setLoading(true);
            setModelSrc((prev) => (prev ? `${prev}#retry` : ""));
          }}
          type="button"
          style={{ marginTop: "1rem", padding: "0.4rem 1rem", borderRadius: "6px", background: "#38bdf8", border: "none", color: "#0f172a", fontWeight: 600, cursor: "pointer" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="model-3d-container" style={{ position: "relative" }}>
      <div className="model-3d-header">
        <span>
          <Sparkles size={16} style={{ marginRight: 6 }} /> Visor 3D Interactivo & Realidad Aumentada
        </span>
        <span className="badge-3d-ar">AR Habilitada</span>
      </div>

      {loading && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10, background: "rgba(15, 23, 42, 0.85)", padding: "0.8rem 1.5rem", borderRadius: "8px", color: "#38bdf8", fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
          <Sparkles size={18} /> Cargando modelo 3D...
        </div>
      )}

      {/* @ts-expect-error custom web component */}
      <model-viewer
        ref={viewerRef}
        src={modelSrc}
        alt={alt}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        camera-target="auto auto auto"
        camera-orbit="auto auto auto"
        field-of-view="auto"
        touch-action="pan-y"
        auto-rotate
        rotation-per-second="15deg"
        shadow-intensity="1.25"
        shadow-softness="0.4"
        environment-image="neutral"
        exposure="1.35"
        bounds="tight"
        loading="eager"
        style={{ width: "100%", height: "100%", minHeight: "280px", backgroundColor: "#0f172a", borderRadius: "12px" }}
      >
        <button slot="ar-button" className="ar-button" type="button">
          <Sparkles size={16} />
          Ver en Realidad Aumentada (AR)
        </button>
      {/* @ts-expect-error custom web component */}
      </model-viewer>
      <small className="model-3d-hint">
        💡 Arrastra para girar en 360°, usa la rueda para hacer zoom. En tu celular haz clic en &quot;Ver en Realidad Aumentada&quot; para proyectar la familia BIM en tu entorno real.
      </small>
    </div>
  );
}

const emptyCatalogDraft: CatalogDraft = {
  kind: "familias",
  name: "",
  maker: "",
  category: "Arquitectura",
  discipline: "Arquitectura",
  country: "Peru",
  formats: "RFA, IFC",
  versions: "2026",
  price: "Gratis",
  downloads: "0",
  tags: "",
  specs: "",
  description: "",
  feature: "Nuevo",
  isPremium: false,
  imageUrl: "",
  coverImages: [],
  glbFile: null,
  attachedFiles: [],
};

function normalizeRoute(path: string) {
  const normalized = path.replace(/\/+$/, "");

  return normalized || "/";
}

function searchKindFromRoute(path: string): CatalogKind | undefined {
  const [firstSegment] = normalizeRoute(path).split("/").filter(Boolean);
  const kind = firstSegment as CatalogKind | undefined;

  return kind && searchKinds.includes(kind) ? kind : undefined;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function downloadsScore(value: string) {
  const normalized = value.trim().replace(",", ".").toUpperCase();
  const number = Number.parseFloat(normalized);

  if (Number.isNaN(number)) {
    return 0;
  }

  return normalized.includes("K") ? number * 1000 : number;
}

function toPayload(product: Product): BimObjectPayload {
  return {
    id: product.id,
    name: product.name,
    maker: product.maker,
    category: product.category,
    discipline: product.discipline,
    country: product.country,
    formats: product.formats,
    versions: product.versions,
    downloads: product.downloads,
    price: product.price,
    tags: product.tags,
  };
}

function productToCatalog(product: Product, source: CatalogProduct["source"] = "demo"): CatalogProduct {
  const slug = slugify(product.id || product.name);

  return {
    ...product,
    kind: "familias",
    slug,
    route: `/familias/${slug}`,
    source,
  };
}

function remoteToCatalog(item: CatalogItemPayload): CatalogProduct {
  return {
    id: item.id,
    name: item.name,
    maker: item.maker,
    category: item.category,
    discipline: item.discipline,
    country: item.country,
    formats: item.formats,
    versions: item.versions,
    downloads: item.downloads,
    price: item.price,
    tags: item.tags,
    specs: item.specs,
    description: item.description,
    visual: item.visual,
    feature: item.feature,
    isPremium: item.isPremium,
    imageUrl: item.imageUrl,
    images: item.images,
    glbUrl: item.glbUrl,
    has3D: item.has3D,
    hasAR: item.hasAR,
    driveFolderId: item.driveFolderId,
    driveFolderLink: item.driveFolderLink,
    attachedFiles: item.attachedFiles,
    kind: item.kind,
    slug: item.slug,
    route: item.route,
    source: "firestore",
    isArchived: item.isArchived,
  };
}

export default function App() {
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [remoteCatalogRaw, setRemoteCatalogRaw] = useState<CatalogItemPayload[]>([]);
  const [remoteCatalog, setRemoteCatalog] = useState<CatalogProduct[]>([]);
  const [searchKind, setSearchKind] = useState<CatalogKind>(() => searchKindFromRoute(window.location.pathname) ?? "familias");
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(emptyCatalogDraft);
  const [gestionarSearch, setGestionarSearch] = useState("");
  const [gestionarKindFilter, setGestionarKindFilter] = useState<"todos" | CatalogKind>("todos");
  const [gestionarStatusFilter, setGestionarStatusFilter] = useState<"todos" | "activos" | "archivados">("todos");
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<RoleKey>("Usuario");
  const [accessControl, setAccessControl] = useState<AccessControl | null>(null);
  const [language, setLanguage] = useState<"ES" | "EN">("ES");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("infrabim_theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("infrabim_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  // Toast notifications state
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: "success" | "info" | "error" }>>([]);

  function showToast(message: string, type: "success" | "info" | "error" = "info") {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  // Favorites state with persistence
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("infrabim_favorites");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Plugin view mode state (grid, list, compact)
  const [pluginViewMode, setPluginViewMode] = useState<"grid" | "list" | "compact">(() => {
    try {
      return (localStorage.getItem("infrabim_plugin_view_mode") as any) || "grid";
    } catch {
      return "grid";
    }
  });

  // Selected product for plugin detail modal
  const [selectedPluginProduct, setSelectedPluginProduct] = useState<CatalogProduct | null>(null);
  const [pluginModalTab, setPluginModalTab] = useState<"3d" | "specs">("3d");

  useEffect(() => {
    localStorage.setItem("infrabim_favorites", JSON.stringify(favorites));
  }, [favorites]);

  function toggleFavoriteItem(productId: string) {
    const isFav = favorites.includes(productId);
    const updated = isFav ? favorites.filter((id) => id !== productId) : [...favorites, productId];
    setFavorites(updated);
    showToast(
      isFav ? "Eliminado de tus favoritos" : "Guardado en tus favoritos ❤️",
      isFav ? "info" : "success"
    );
  }

  function getBestFamilyDownloadUrl(product: CatalogProduct): string {
    // 1. Buscar en attachedFiles si hay algún archivo con extensión .rfa
    if (product.attachedFiles && product.attachedFiles.length > 0) {
      const rfaFile = product.attachedFiles.find(
        (f) => f.name.toLowerCase().endsWith(".rfa") || (f.webViewLink && f.webViewLink.toLowerCase().includes(".rfa"))
      );
      if (rfaFile && rfaFile.webViewLink) {
        return rfaFile.webViewLink;
      }
      if (product.attachedFiles[0]?.webViewLink) {
        return product.attachedFiles[0].webViewLink;
      }
    }

    // 2. Si driveFolderLink existe
    if (product.driveFolderLink) {
      return product.driveFolderLink;
    }

    // 3. Si glbUrl existe y no es data/blob
    if (product.glbUrl && !product.glbUrl.startsWith("data:") && !product.glbUrl.startsWith("blob:")) {
      return product.glbUrl;
    }

    return "";
  }

  function handleDownloadOrInsert(product: CatalogProduct) {
    const familyUrl = getBestFamilyDownloadUrl(product);

    // @ts-ignore
    if (window.chrome?.webview) {
      if (!familyUrl) {
        showToast(`La familia '${product.name}' no tiene un archivo RFA asignado en la base de datos.`, "error");
        return;
      }

      // Comunicar con C# mediante WebView2 en Revit
      // @ts-ignore
      window.chrome.webview.postMessage({
        action: "INSERT_FAMILY",
        familyUrl: familyUrl,
        familyName: product.name,
      });
      showToast(`Descargando '${product.name}' para insertar en Revit 🚀`, "success");
    } else if (familyUrl || product.driveFolderLink) {
      const linkToOpen = familyUrl || product.driveFolderLink || "";
      window.open(linkToOpen, "_blank");
      showToast(`Abriendo enlace de descarga para ${product.name}`, "info");
    } else {
      showToast(`No se encontró enlace de descarga configurado para ${product.name}`, "error");
    }
  }

  // Advanced Filters & Master Options State
  const [selectedFormat, setSelectedFormat] = useState("Todos");
  const [selectedVersion, setSelectedVersion] = useState("Todas");
  const [selectedPricing, setSelectedPricing] = useState("Todos");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [mediaTab, setMediaTab] = useState<"gallery" | "3d">("gallery");

  const [masterOptions, setMasterOptions] = useState<MasterOptions>(() => {
    try {
      const saved = localStorage.getItem("infrabim_master_options");
      const base = saved ? { ...defaultMasterOptions, ...JSON.parse(saved) } : defaultMasterOptions;

      const cleanWords = (arr: string[]) => {
        const wordSet = new Set<string>();
        (arr || []).forEach((item) => {
          if (!item) return;
          item.split(",").forEach((sub) => {
            const trimmed = sub.trim();
            if (trimmed) wordSet.add(trimmed);
          });
        });
        return Array.from(wordSet);
      };

      return {
        ...base,
        formats: cleanWords(base.formats),
        versions: cleanWords(base.versions),
        tags: cleanWords(base.tags),
        specs: cleanWords(base.specs),
      };
    } catch {
      return defaultMasterOptions;
    }
  });

  useEffect(() => {
    localStorage.setItem("infrabim_master_options", JSON.stringify(masterOptions));
  }, [masterOptions]);

  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [masterActiveTab, setMasterActiveTab] = useState<keyof MasterOptions>("makers");
  const [newMasterOptionInput, setNewMasterOptionInput] = useState("");

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkProgressList, setBulkProgressList] = useState<BulkFolderProgressItem[]>([]);
  const [bulkOverallProgress, setBulkOverallProgress] = useState(0);
  const [isDragOverBulk, setIsDragOverBulk] = useState(false);
  const [bulkPreparingOpen, setBulkPreparingOpen] = useState(false);
  const [bulkPreparingMessage, setBulkPreparingMessage] = useState("");
  const [bulkProgressCollapsed, setBulkProgressCollapsed] = useState(false);

  const [bulkSelectionModalOpen, setBulkSelectionModalOpen] = useState(false);
  const [bulkSelectionItems, setBulkSelectionItems] = useState<BulkFolderSelectionItem[]>([]);

  function addMasterOption(fieldKey: keyof MasterOptions, optionValue: string) {
    const raw = optionValue.trim();
    if (!raw) return;

    const words = raw.split(",").map((w) => w.trim()).filter(Boolean);
    const existing = new Set(masterOptions[fieldKey] || []);
    let addedCount = 0;

    for (const word of words) {
      if (!existing.has(word)) {
        existing.add(word);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      showToast(`Las opciones ya existen en la lista`, "info");
      return;
    }

    const updated = {
      ...masterOptions,
      [fieldKey]: Array.from(existing),
    };
    setMasterOptions(updated);
    showToast(`Se agregó ${addedCount} opción(es) a la lista`, "success");
  }

  function editMasterOption(fieldKey: keyof MasterOptions, oldVal: string) {
    const newVal = prompt(`Editar opción '${oldVal}':`, oldVal);
    if (!newVal || newVal.trim() === "" || newVal.trim() === oldVal) return;
    const trimmed = newVal.trim();
    const updated = {
      ...masterOptions,
      [fieldKey]: masterOptions[fieldKey].map((opt) => (opt === oldVal ? trimmed : opt)),
    };
    setMasterOptions(updated);
    showToast(`Opción actualizada a '${trimmed}'`, "success");
  }

  function deleteMasterOption(fieldKey: keyof MasterOptions, valToDelete: string) {
    if (!confirm(`¿Eliminar la opción '${valToDelete}' de la lista desplegable?`)) return;
    const updated = {
      ...masterOptions,
      [fieldKey]: masterOptions[fieldKey].filter((opt) => opt !== valToDelete),
    };
    setMasterOptions(updated);
    showToast(`Opción '${valToDelete}' eliminada`, "info");
  }

  function renderMultiSelectField(
    label: string,
    fieldKey: keyof MasterOptions,
    currentValue: string,
    onChangeValue: (val: string) => void
  ) {
    const masterList = masterOptions[fieldKey] || [];
    const selectedWords = new Set(
      currentValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const allOptions = Array.from(new Set([...masterList, ...Array.from(selectedWords)]));

    const toggleWord = (word: string) => {
      const nextSet = new Set(selectedWords);
      if (nextSet.has(word)) {
        nextSet.delete(word);
      } else {
        nextSet.add(word);
      }
      onChangeValue(Array.from(nextSet).join(", "));
    };

    return (
      <div className="wide-field" style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--ink)" }}>
            {label} <small style={{ color: "var(--muted)", fontWeight: 500 }}>(Selección múltiple)</small>
          </span>
          <button
            type="button"
            onClick={() => {
              const newWord = prompt(`Agregar nuevo ${label.toLowerCase()} (palabra individual, ej: RAR):`);
              if (newWord && newWord.trim()) {
                const words = newWord.split(",").map((w) => w.trim()).filter(Boolean);
                for (const w of words) {
                  addMasterOption(fieldKey, w);
                }
                const nextSet = new Set([...Array.from(selectedWords), ...words]);
                onChangeValue(Array.from(nextSet).join(", "));
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              fontSize: "0.78rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            + Agregar palabra
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", background: "var(--surface-2)", padding: "0.55rem", borderRadius: "10px", border: "1px solid var(--line)" }}>
          {allOptions.length === 0 ? (
            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Sin palabras registradas. Haz clic en "+ Agregar palabra".</span>
          ) : (
            allOptions.map((word) => {
              const isSelected = selectedWords.has(word);
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => toggleWord(word)}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: "6px",
                    border: isSelected ? "1px solid var(--accent)" : "1px solid var(--line)",
                    background: isSelected ? "var(--accent-gradient)" : "var(--surface)",
                    color: isSelected ? "#ffffff" : "var(--ink)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{isSelected ? "✓" : "+"}</span>
                  <span>{word}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  function renderDynamicSelectField(
    label: string,
    fieldKey: keyof MasterOptions,
    currentValue: string,
    onChangeValue: (val: string) => void
  ) {
    const options = masterOptions[fieldKey] || [];
    return (
      <label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
          <span>{label}</span>
          <button
            type="button"
            onClick={() => {
              const newOpt = prompt(`Agregar nueva opción para ${label}:`);
              if (newOpt && newOpt.trim()) {
                addMasterOption(fieldKey, newOpt.trim());
                onChangeValue(newOpt.trim());
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-dark)",
              fontSize: "0.72rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            + Agregar
          </button>
        </div>
        <select
          value={currentValue}
          onChange={(e) => {
            if (e.target.value === "__ADD_NEW__") {
              const newOpt = prompt(`Agregar nueva opción para ${label}:`);
              if (newOpt && newOpt.trim()) {
                addMasterOption(fieldKey, newOpt.trim());
                onChangeValue(newOpt.trim());
              }
            } else {
              onChangeValue(e.target.value);
            }
          }}
          style={{
            width: "100%",
            padding: "0.45rem 0.65rem",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          {currentValue && !options.includes(currentValue) && (
            <option value={currentValue}>{currentValue}</option>
          )}
          {!currentValue && <option value="">-- Seleccionar {label} --</option>}
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value="__ADD_NEW__">➕ Agregar nueva opción...</option>
        </select>
      </label>
    );
  }

  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isPluginMode = queryParams.get("mode") === "plugin" || Boolean((window as any).chrome?.webview);
  const detectedRevitVersion = queryParams.get("revitVersion") || "2026";

  const [supportOpen, setSupportOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "popular">("recent");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("mensual");
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [yapeDraft, setYapeDraft] = useState({ otp: "", phoneNumber: "" });
  const [route, setRoute] = useState(() => normalizeRoute(window.location.pathname));
  const [driveToken, setDriveToken] = useState<string>(() => {
    const savedToken = sessionStorage.getItem("infrabim_drive_token") || "";
    const savedTime = Number(sessionStorage.getItem("infrabim_drive_token_time") || "0");
    if (savedToken && savedTime && Date.now() - savedTime > 50 * 60 * 1000) {
      sessionStorage.removeItem("infrabim_drive_token");
      sessionStorage.removeItem("infrabim_drive_token_time");
      return "";
    }
    return savedToken;
  });

  useEffect(() => {
    if (driveToken) {
      sessionStorage.setItem("infrabim_drive_token", driveToken);
      sessionStorage.setItem("infrabim_drive_token_time", String(Date.now()));
    } else {
      sessionStorage.removeItem("infrabim_drive_token");
      sessionStorage.removeItem("infrabim_drive_token_time");
    }
  }, [driveToken]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [remoteObjects, setRemoteObjects] = useState<number | null>(null);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlansConfig>(defaultPaymentPlansConfig);
  const [paymentPlanDraft, setPaymentPlanDraft] = useState<PaymentPlansConfig>(defaultPaymentPlansConfig);
  const [paymentPlansReady, setPaymentPlansReady] = useState(!isFirebaseConfigured);
  const [paymentPlansError, setPaymentPlansError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [dbLoading, setDbLoading] = useState<Record<DbLoadKey, boolean>>({
    access: false,
    catalog: isFirebaseConfigured,
    objects: false,
    plans: isFirebaseConfigured,
  });
  const [busy, setBusy] = useState("");
  const [adminTab, setAdminTab] = useState<"resumen" | "gestionar" | "crear" | "precios" | "permisos">("resumen");
  const [connectionLog, setConnectionLog] = useState(
    isFirebaseConfigured
      ? "Firebase listo para autenticar, publicar objetos y enlazar Drive."
      : "Completa .env.local con tu configuracion Firebase.",
  );

  const isAdmin = userRole === "Administrador";

  const catalogItems = useMemo(() => {
    const demoItems = products.map((product) => productToCatalog(product));
    const items = isFirebaseConfigured ? remoteCatalog : demoItems;
    return items.filter((item) => !item.isArchived || isAdmin);
  }, [remoteCatalog, isAdmin]);

  const [routeKind, routeSlug] = route.split("/").filter(Boolean) as [CatalogKind | undefined, string | undefined];
  const activeRouteKind = routeKind && routeKind in catalogMeta ? routeKind : undefined;
  const routeCatalogItem =
    activeRouteKind && routeSlug
      ? catalogItems.find((item) => item.kind === activeRouteKind && item.slug === routeSlug)
      : undefined;
  const isCatalogListPage = Boolean(activeRouteKind && !routeSlug);
  const isCatalogDetailPage = Boolean(activeRouteKind && routeSlug);

  const filteredProducts = useMemo(() => {
    const matches = catalogItems.filter((product) => {
      const matchesKind = !activeRouteKind || product.kind === activeRouteKind;
      const matchesFilter = filter === "Todos" || product.discipline === filter || product.category === filter;
      const matchesFormat = selectedFormat === "Todos" || product.formats.includes(selectedFormat);
      const matchesVersion = selectedVersion === "Todas" || product.versions.includes(selectedVersion);
      const matchesPricing =
        selectedPricing === "Todos" ||
        (selectedPricing === "Gratis" ? !product.isPremium : product.isPremium);
      const matchesFavorites = !onlyFavorites || favorites.includes(product.id);

      const searchableText = [
        product.name,
        product.maker,
        product.category,
        product.discipline,
        product.country,
        product.description,
        ...product.tags,
        ...product.formats,
        ...product.versions,
        ...(product.specs || []),
      ].join(" ");

      const matchesQuery = !query.trim() || matchesBilingualSearch(query, searchableText);

      return (
        matchesKind &&
        matchesFilter &&
        matchesFormat &&
        matchesVersion &&
        matchesPricing &&
        matchesFavorites &&
        matchesQuery
      );
    });

    return matches.sort((first, second) =>
      sortMode === "popular"
        ? downloadsScore(second.downloads) - downloadsScore(first.downloads)
        : catalogItems.indexOf(first) - catalogItems.indexOf(second),
    );
  }, [
    activeRouteKind,
    catalogItems,
    favorites,
    filter,
    onlyFavorites,
    query,
    selectedFormat,
    selectedPricing,
    selectedVersion,
    sortMode,
  ]);

  const selectedProduct =
    routeCatalogItem ??
    catalogItems.find((product) => product.id === selectedId) ??
    filteredProducts[0] ??
    productToCatalog(products[0]);
  const isAdminPage = route === "/admin";
  const isPlansPage = route === "/planes";

  function setDatabaseLoading(key: DbLoadKey, value: boolean) {
    setDbLoading((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!auth) {
      return undefined;
    }

    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setAccessControl(null);
        setUserRole("Usuario");
        setRemoteObjects(null);
        setDatabaseLoading("access", false);
        setDatabaseLoading("objects", false);
        return;
      }

      setDatabaseLoading("access", true);
      setDatabaseLoading("objects", true);
      try {
        const access = await initializeUserAccess(currentUser);
        setAccessControl(access.access);
        setUserRole(access.role);
        const objects = await fetchBimObjects();
        setRemoteObjects(objects.length);
      } catch (error) {
        setConnectionLog(error instanceof Error ? error.message : "No se pudo leer Firestore.");
      } finally {
        setDatabaseLoading("access", false);
        setDatabaseLoading("objects", false);
      }
    });
  }, []);

  useEffect(() => {
    void refreshCatalogItems();
    void refreshPaymentPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function syncRoute() {
      const nextRoute = normalizeRoute(window.location.pathname);
      const nextSearchKind = searchKindFromRoute(nextRoute);

      setRoute(nextRoute);
      if (nextSearchKind) {
        setSearchKind(nextSearchKind);
      }
    }

    window.addEventListener("popstate", syncRoute);

    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (!checkout || checkout.method !== "card") {
      return undefined;
    }

    const containerId = "mp-card-payment-brick";

    if (!user || !isMercadoPagoConfigured() || !isPaymentsApiConfigured()) {
      return undefined;
    }

    let disposeBrick: (() => void) | undefined;
    let disposed = false;

    void mountCardPaymentBrick({
      amount: paymentPlans[checkout.planId].prices[billingCycle],
      containerId,
      onError: (message) => setCheckoutStatus(message),
      onSubmit: async (formData) => {
        const cardTokenId = formData.token ?? formData.card_token_id ?? "";
        const payerEmail = formData.payer?.email ?? user.email ?? "";

        if (!cardTokenId || !payerEmail) {
          throw new Error("Mercado Pago no devolvio token de tarjeta o correo.");
        }

        setBusy("payment-card");
        setCheckoutStatus("Creando suscripcion en Mercado Pago...");

        try {
          const response = await createCardSubscription({
            billingCycle,
            cardTokenId,
            payerEmail,
            planId: checkout.planId,
          });
          const label = paymentPlans[checkout.planId].label;
          setCheckoutStatus(`Suscripcion ${label} registrada: ${response.status ?? "pendiente"}.`);
          setConnectionLog(`Mercado Pago registro la suscripcion ${response.id ?? label}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "No se pudo crear la suscripcion.";
          setCheckoutStatus(message);
          throw error;
        } finally {
          setBusy("");
        }
      },
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }

        disposeBrick = dispose;
        setCheckoutStatus("Formulario seguro listo para tarjeta.");
      })
      .catch((error) => {
        setCheckoutStatus(error instanceof Error ? error.message : "No se pudo iniciar Mercado Pago.");
      });

    return () => {
      disposed = true;
      disposeBrick?.();
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [billingCycle, checkout, paymentPlans, user]);

  function navigateTo(path: string) {
    const normalizedPath = normalizeRoute(path);
    const nextSearchKind = searchKindFromRoute(normalizedPath);

    if (normalizeRoute(window.location.pathname) !== normalizedPath) {
      window.history.pushState({}, "", normalizedPath);
    }

    if (nextSearchKind) {
      setSearchKind(nextSearchKind);
    }

    setRoute(normalizedPath);
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  function goToAdmin() {
    navigateTo("/admin");
  }

  function goToPlans() {
    navigateTo("/planes");
  }

  async function refreshCatalogItems() {
    if (!isFirebaseConfigured) {
      return;
    }

    setDatabaseLoading("catalog", true);
    setCatalogError("");
    try {
      const items = await fetchCatalogItems();
      setRemoteCatalogRaw(items);
      setRemoteCatalog(items.map(remoteToCatalog));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el catalogo dinamico.";
      setCatalogError(message);
      if (isFirebaseConfigured) {
        setConnectionLog(message);
      }
    } finally {
      setDatabaseLoading("catalog", false);
    }
  }

  const filteredAdminItems = useMemo(() => {
    return remoteCatalogRaw.filter((item) => {
      const matchesKind = gestionarKindFilter === "todos" || item.kind === gestionarKindFilter;
      const matchesStatus =
        gestionarStatusFilter === "todos"
          ? true
          : gestionarStatusFilter === "activos"
            ? !item.isArchived
            : Boolean(item.isArchived);
      const adminSearchableText = [
        item.name,
        item.maker,
        item.category,
        item.discipline,
        item.country,
        item.description,
        ...(item.tags || []),
        ...(item.formats || []),
        ...(item.versions || []),
        ...(item.specs || []),
      ].join(" ");

      const matchesSearch = !gestionarSearch.trim() || matchesBilingualSearch(gestionarSearch, adminSearchableText);

      return matchesKind && matchesStatus && matchesSearch;
    });
  }, [remoteCatalogRaw, gestionarKindFilter, gestionarStatusFilter, gestionarSearch]);

  function handleEditCatalogItem(item: CatalogItemPayload) {
    setCatalogDraft({
      kind: item.kind,
      name: item.name || "",
      maker: item.maker || "",
      category: item.category || "",
      discipline: item.discipline || "",
      country: item.country || "Peru",
      formats: (item.formats || []).join(", "),
      versions: (item.versions || []).join(", "),
      price: item.price || "Gratis",
      downloads: item.downloads || "0",
      tags: (item.tags || []).join(", "),
      specs: (item.specs || []).join(", "),
      description: item.description || "",
      feature: item.feature || "Nuevo",
      isPremium: Boolean(item.isPremium),
      imageUrl: item.imageUrl || "",
      coverImages: [],
      glbFile: null,
      attachedFiles: [],
      editingOriginalKind: item.kind,
      editingOriginalSlug: item.slug,
      existingImages: item.images || (item.imageUrl ? [item.imageUrl] : []),
      existingGlbUrl: item.glbUrl || "",
      existingDriveFolderId: item.driveFolderId || "",
      existingDriveFolderLink: item.driveFolderLink || "",
      existingAttachedFiles: item.attachedFiles || [],
      isArchived: Boolean(item.isArchived),
    });
    setAdminTab("crear");
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  async function handleToggleArchiveCatalogItem(item: CatalogItemPayload) {
    const newStatus = !item.isArchived;
    const actionText = newStatus ? "archivar" : "restaurar";
    if (!window.confirm(`¿Deseas ${actionText} el recurso "${item.name}"?`)) {
      return;
    }
    setBusy(`archive-${item.id}`);
    try {
      await toggleArchiveCatalogItem(item.kind, item.slug, newStatus);
      await refreshCatalogItems();
      setConnectionLog(`Recurso "${item.name}" ${newStatus ? "archivado" : "restaurado"}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : `No se pudo ${actionText} el recurso.`;
      alert(msg);
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteCatalogItem(item: CatalogItemPayload) {
    if (!window.confirm(`⚠️ ¿Estás seguro de ELIMINAR permanentemente el recurso "${item.name}" y sus archivos en Google Drive?\nEsta acción no se puede deshacer.`)) {
      return;
    }
    setBusy(`delete-${item.id}`);
    setConnectionLog(`Eliminando "${item.name}" de Firestore y Google Drive...`);

    try {
      let currentDriveToken = driveToken;
      if (!currentDriveToken && auth) {
        setConnectionLog("Solicitando permiso Google OAuth 2.0 para eliminar de Google Drive...");
        try {
          const result = await signInWithPopup(auth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          currentDriveToken = credential?.accessToken || "";
          if (currentDriveToken) setDriveToken(currentDriveToken);
        } catch (err) {
          console.warn("OAuth cancelado:", err);
        }
      }

      if (currentDriveToken) {
        if (item.driveFolderId) {
          setConnectionLog(`Eliminando subcarpeta de Google Drive ID '${item.driveFolderId}'...`);
          try {
            await deleteDriveFileClient(currentDriveToken, item.driveFolderId);
            setConnectionLog(`✓ Subcarpeta de Google Drive eliminada.`);
          } catch (driveErr) {
            console.warn("No se pudo eliminar la subcarpeta principal de Drive:", driveErr);
          }
        }

        if (item.attachedFiles && item.attachedFiles.length > 0) {
          for (const f of item.attachedFiles) {
            if (f.id && f.id !== item.driveFolderId && !f.id.startsWith("file-")) {
              try {
                await deleteDriveFileClient(currentDriveToken, f.id);
              } catch (e) {
                // ignore 404 if already deleted with folder
              }
            }
          }
        }

        if (item.glbUrl) {
          const fileIdMatch = item.glbUrl.match(/\/(?:d|drive-file)\/([a-zA-Z0-9_-]+)/);
          if (fileIdMatch && fileIdMatch[1]) {
            try {
              await deleteDriveFileClient(currentDriveToken, fileIdMatch[1]);
            } catch (e) {
              // ignore if already deleted
            }
          }
        }
      }

      await deleteCatalogItem(item.kind, item.slug);
      await refreshCatalogItems();
      setConnectionLog(`✓ Recurso "${item.name}" y sus archivos en Google Drive eliminados correctamente.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "No se pudo eliminar el recurso.";
      alert(msg);
    } finally {
      setBusy("");
    }
  }

  async function refreshPaymentPlans() {
    if (!isFirebaseConfigured) {
      return;
    }

    setDatabaseLoading("plans", true);
    setPaymentPlansError("");
    try {
      const plans = await fetchPaymentPlans();
      setPaymentPlans(plans);
      setPaymentPlanDraft(plans);
      setPaymentPlansReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los precios.";
      setPaymentPlansError(message);
      setPaymentPlansReady(false);
      if (isFirebaseConfigured) {
        setConnectionLog(message);
      }
    } finally {
      setDatabaseLoading("plans", false);
    }
  }

  function scrollTo(section: string) {
    const currentTarget = document.getElementById(section);

    if (currentTarget) {
      currentTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
      setRoute("/");
      window.setTimeout(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      return;
    }

    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectProduct(productId: string) {
    setSelectedId(productId);
    const item = catalogItems.find((product) => product.id === productId);

    if (item) {
      navigateTo(item.route);
      return;
    }

    scrollTo("detalle");
  }

  async function connectGoogleAccount() {
    if (!auth) {
      setConnectionLog("Configura Firebase antes de iniciar sesion.");
      showToast("Configura Firebase antes de iniciar sesion.", "error");
      return;
    }

    setBusy("auth");
    setDatabaseLoading("access", true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken ?? "";
      setUser(result.user);
      setDriveToken(accessToken);
      const access = await initializeUserAccess(result.user);
      setAccessControl(access.access);
      setUserRole(access.role);

      if (accessToken) {
        const files = await listDriveFiles(accessToken, driveFolderId);
        setDriveFiles(files);
      }

      setConnectionLog("Sesion Google conectada con Firebase Auth, Firestore y Drive.");
      showToast(`¡Bienvenido, ${result.user.displayName || result.user.email}!`, "success");
    } catch (error) {
      console.error("Firebase Auth Error:", error);
      const errCode = (error as any)?.code || "";
      const errMsg = error instanceof Error ? error.message : "";

      if (errCode === "auth/popup-closed-by-user") {
        showToast("Inicio de sesión cancelado.", "info");
      } else if (errCode === "auth/popup-blocked") {
        showToast("Se bloqueó la ventana emergente de inicio de sesión.", "error");
      } else {
        setConnectionLog(errMsg || "No se pudo conectar Google.");
        showToast(errMsg || "No se pudo iniciar sesión con Google.", "error");
      }
    } finally {
      setDatabaseLoading("access", false);
      setBusy("");
    }
  }

  async function disconnect() {
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    setAccessControl(null);
    setUserRole("Usuario");
    setDriveToken("");
    setDriveFiles([]);
    setConnectionLog("Sesion cerrada.");
  }

  async function publishSelected() {
    setBusy("firestore");
    setDatabaseLoading("objects", true);
    try {
      await publishBimObject(toPayload(selectedProduct));
      const objects = await fetchBimObjects();
      setRemoteObjects(objects.length);
      setConnectionLog(`${selectedProduct.name} fue publicado en Firestore.`);
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo publicar en Firestore.");
    } finally {
      setDatabaseLoading("objects", false);
      setBusy("");
    }
  }

  async function saveSelectedFavorite() {
    if (!user) {
      setConnectionLog("Inicia sesion para guardar favoritos.");
      return;
    }

    setBusy("favorite");
    try {
      await saveFavorite(user.uid, toPayload(selectedProduct));
      setConnectionLog(`${selectedProduct.name} se guardo en tus favoritos.`);
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo guardar el favorito.");
    } finally {
      setBusy("");
    }
  }

  async function uploadSelectedToDrive() {
    if (!driveToken || !user) {
      setConnectionLog("Conecta Google para habilitar Drive.");
      return;
    }

    setBusy("drive");
    try {
      const file = await uploadJsonToDrive(
        driveToken,
        `${selectedProduct.id}.infrabim.json`,
        {
          object: selectedProduct,
          exportedFrom: "InfraBIM Hub",
          storage: "Google Drive API",
          createdAt: new Date().toISOString(),
        },
        driveFolderId,
      );
      await logDriveFile({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        ownerUid: user.uid,
        linkedObjectId: selectedProduct.id,
      });
      const files = await listDriveFiles(driveToken, driveFolderId);
      setDriveFiles(files);
      setConnectionLog(`${file.name} fue subido a Google Drive y registrado en Firestore.`);
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo subir a Drive.");
    } finally {
      setBusy("");
    }
  }

  async function publishDemoCatalog() {
    setBusy("catalog");
    setDatabaseLoading("objects", true);
    try {
      await Promise.all([
        ...products.map((product) => publishBimObject(toPayload(product))),
        ...products.map((product) => saveCatalogItem(productToCatalog(product))),
      ]);
      const objects = await fetchBimObjects();
      setRemoteObjects(objects.length);
      await refreshCatalogItems();
      setConnectionLog("Catalogo inicial publicado en Firestore.");
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo publicar el catalogo.");
    } finally {
      setDatabaseLoading("objects", false);
      setBusy("");
    }
  }

  function handleSelectCoverImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const newItems: UploadFileItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      mimeType: file.type || "image/png",
      previewUrl: URL.createObjectURL(file),
      size: file.size,
    }));

    setCatalogDraft((prev) => ({
      ...prev,
      coverImages: [...prev.coverImages, ...newItems],
    }));
    event.target.value = "";
  }

  function handleRemoveCoverImage(id: string) {
    setCatalogDraft((prev) => {
      const target = prev.coverImages.find((img) => img.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return {
        ...prev,
        coverImages: prev.coverImages.filter((img) => img.id !== id),
      };
    });
  }

  function detectFormatsFromFiles(
    attachedFiles: Array<{ name: string }>,
    glbFile?: { name: string } | null
  ): string {
    const extensionMap: Record<string, string> = {
      ".rfa": "RFA",
      ".rvt": "RVT",
      ".ifc": "IFC",
      ".dwg": "DWG",
      ".skp": "SKP",
      ".pdf": "PDF",
      ".glb": "GLB",
      ".gltf": "GLTF",
      ".zip": "ZIP",
      ".rar": "RAR",
      ".7z": "ZIP",
      ".max": "3DS MAX",
      ".obj": "OBJ",
      ".fbx": "FBX",
      ".nwd": "NWD",
      ".nwc": "NWC",
    };

    const detected = new Set<string>();

    if (glbFile) {
      const ext = glbFile.name.slice(glbFile.name.lastIndexOf(".")).toLowerCase();
      if (extensionMap[ext]) {
        detected.add(extensionMap[ext]);
      }
    }

    for (const f of attachedFiles) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (extensionMap[ext]) {
        detected.add(extensionMap[ext]);
      } else if (ext && ext.includes(".")) {
        const cleanExt = ext.replace(".", "").toUpperCase();
        if (cleanExt) {
          detected.add(cleanExt);
        }
      }
    }

    return Array.from(detected).join(", ");
  }

  function handleSelectGlbFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const newGlb = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      mimeType: file.type || "model/gltf-binary",
      size: file.size,
    };

    setCatalogDraft((prev) => {
      const autoFormats = detectFormatsFromFiles(prev.attachedFiles, newGlb);
      return {
        ...prev,
        glbFile: newGlb,
        formats: autoFormats || prev.formats,
      };
    });
    event.target.value = "";
  }

  function handleRemoveGlbFile() {
    setCatalogDraft((prev) => {
      const autoFormats = detectFormatsFromFiles(prev.attachedFiles, null);
      return {
        ...prev,
        glbFile: null,
        formats: autoFormats || prev.formats,
      };
    });
  }

  function handleSelectAttachedFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const newItems: UploadFileItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }));

    setCatalogDraft((prev) => {
      const updatedAttached = [...prev.attachedFiles, ...newItems];
      const autoFormats = detectFormatsFromFiles(updatedAttached, prev.glbFile);
      return {
        ...prev,
        attachedFiles: updatedAttached,
        formats: autoFormats || prev.formats,
      };
    });
    event.target.value = "";
  }

  function handleRemoveAttachedFile(id: string) {
    setCatalogDraft((prev) => {
      const updatedAttached = prev.attachedFiles.filter((f) => f.id !== id);
      const autoFormats = detectFormatsFromFiles(updatedAttached, prev.glbFile);
      return {
        ...prev,
        attachedFiles: updatedAttached,
        formats: autoFormats || prev.formats,
      };
    });
  }



  async function handleDeleteExistingDriveFile(
    fileId: string,
    fileType: "image" | "glb" | "attached",
    fileRefOrItem?: string | DriveFilePayload
  ) {
    if (!confirm("¿Seguro que deseas eliminar este archivo de Google Drive? Se borrará permanentemente.")) {
      return;
    }

    let currentDriveToken = driveToken;
    if (!currentDriveToken && auth) {
      setConnectionLog("Solicitando permiso Google OAuth 2.0 para eliminar de Drive...");
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        currentDriveToken = credential?.accessToken || "";
        if (currentDriveToken) setDriveToken(currentDriveToken);
      } catch (err) {
        console.warn("OAuth cancelado:", err);
      }
    }

    if (fileId && currentDriveToken) {
      setConnectionLog(`Eliminando archivo ID '${fileId}' de Google Drive...`);
      try {
        await deleteDriveFileClient(currentDriveToken, fileId);
        setConnectionLog(`✓ Archivo eliminado exitosamente de Google Drive.`);
      } catch (err: any) {
        console.warn("Error eliminando de Google Drive:", err);
      }
    }

    setCatalogDraft((prev) => {
      if (fileType === "image") {
        const updatedImages = (prev.existingImages || []).filter((url) => url !== fileRefOrItem && !url.includes(fileId));
        return {
          ...prev,
          existingImages: updatedImages,
          imageUrl: updatedImages[0] || "",
        };
      } else if (fileType === "glb") {
        return {
          ...prev,
          existingGlbUrl: "",
        };
      } else {
        const updatedAttached = (prev.existingAttachedFiles || []).filter(
          (f) => f.id !== fileId && f !== fileRefOrItem
        );
        const autoFormats = detectFormatsFromFiles(prev.attachedFiles, prev.glbFile);
        return {
          ...prev,
          existingAttachedFiles: updatedAttached,
          formats: autoFormats || prev.formats,
        };
      }
    });
  }

  async function handleRenameExistingDriveFile(
    fileId: string,
    currentName: string,
    fileType: "attached" | "glb" | "image"
  ) {
    const newName = prompt("Ingresa el nuevo nombre para este archivo en Google Drive:", currentName);
    if (!newName || newName.trim() === "" || newName.trim() === currentName) return;

    let currentDriveToken = driveToken;
    if (!currentDriveToken && auth) {
      setConnectionLog("Solicitando permiso Google OAuth 2.0 para renombrar en Drive...");
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        currentDriveToken = credential?.accessToken || "";
        if (currentDriveToken) setDriveToken(currentDriveToken);
      } catch (err) {
        console.warn("OAuth cancelado:", err);
      }
    }

    if (fileId && currentDriveToken) {
      setConnectionLog(`Renombrando archivo en Google Drive a "${newName.trim()}"...`);
      try {
        await renameDriveFileClient(currentDriveToken, fileId, newName.trim());
        setConnectionLog(`✓ Archivo renombrado en Google Drive a "${newName.trim()}".`);
      } catch (err: any) {
        console.warn("Error renombrando en Google Drive:", err);
      }
    }

    setCatalogDraft((prev) => {
      if (fileType === "attached") {
        const updatedAttached = (prev.existingAttachedFiles || []).map((f) => {
          if (f.id === fileId) {
            return { ...f, name: newName.trim() };
          }
          return f;
        });
        return {
          ...prev,
          existingAttachedFiles: updatedAttached,
        };
      }
      return prev;
    });
  }

  async function createCatalogItem() {
    if (!user) {
      setConnectionLog("Inicia sesion para crear recursos.");
      return;
    }

    const slug = slugify(catalogDraft.name);

    if (!slug) {
      setConnectionLog("Escribe un nombre para crear la ruta del recurso.");
      return;
    }

    if (
      catalogDraft.coverImages.length === 0 &&
      !catalogDraft.imageUrl.trim() &&
      (!catalogDraft.existingImages || catalogDraft.existingImages.length === 0)
    ) {
      setConnectionLog("Debes seleccionar al menos 1 imagen de portada o colocar una URL.");
      alert("Debes seleccionar al menos 1 imagen de portada o colocar una URL.");
      return;
    }

    setBusy("create");
    setConnectionLog("Creando subcarpeta en Google Drive (gin.zu.ken@gmail.com) y subiendo archivos...");

    try {
      let uploadedImages: string[] = [];
      let uploadedGlbUrl = "";
      let uploadedDriveFolderId = "";
      let uploadedDriveFolderLink = "";
      let uploadedAttachedFiles: DriveFilePayload[] = [];

      // If user provided files to upload, send them directly to Google Drive API using OAuth 2.0
      if (catalogDraft.coverImages.length > 0 || catalogDraft.glbFile || catalogDraft.attachedFiles.length > 0) {
        let currentDriveToken = driveToken;

        if (!currentDriveToken && auth) {
          setConnectionLog("Solicitando permiso Google OAuth 2.0 para subir a Google Drive...");
          const result = await signInWithPopup(auth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          currentDriveToken = credential?.accessToken || "";
          if (currentDriveToken) {
            setDriveToken(currentDriveToken);
          }
        }

        if (!currentDriveToken) {
          throw new Error("No se obtubo token Google OAuth 2.0. Conecta tu cuenta Google de nuevo.");
        }

        const cleanName = String(catalogDraft.name).trim().replace(/[\\/:*?"<>|]/g, "_");
        const folderName = `${cleanName} - ${slug}`;

        setConnectionLog("Creando subcarpeta en tu Google Drive via API OAuth 2.0...");
        const folder = await createDriveFolderClient(currentDriveToken, folderName, driveFolderId);
        uploadedDriveFolderId = folder.id;
        uploadedDriveFolderLink = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;

        // 1. Upload cover images via OAuth 2.0
        for (let i = 0; i < catalogDraft.coverImages.length; i++) {
          const item = catalogDraft.coverImages[i];
          setConnectionLog(`Subiendo imagen ${i + 1}/${catalogDraft.coverImages.length} a Google Drive via OAuth 2.0...`);
          const res = await uploadFileToDriveClient(
            currentDriveToken,
            item.name,
            item.mimeType,
            item.file,
            folder.id
          );
          uploadedImages.push(res.directUrl);
        }

        // 2. Upload 3D GLB model via OAuth 2.0 & format direct CDN URL for 3D Viewer
        if (catalogDraft.glbFile) {
          setConnectionLog("Subiendo modelo 3D GLB a Google Drive para el Visor 3D...");
          if (currentDriveToken) {
            try {
              const res = await uploadFileToDriveClient(
                currentDriveToken,
                catalogDraft.glbFile.name,
                catalogDraft.glbFile.mimeType,
                catalogDraft.glbFile.file,
                folder.id
              );
              uploadedGlbUrl = res.directUrl;
            } catch (driveErr) {
              console.warn("No se pudo subir GLB a Drive:", driveErr);
            }
          }

          if (!uploadedGlbUrl) {
            try {
              const b64 = await fileToBase64(catalogDraft.glbFile.file);
              uploadedGlbUrl = `data:model/gltf-binary;base64,${b64}`;
            } catch (err) {
              console.error("Error convirtiendo GLB a Base64:", err);
            }
          }
        }

        // 3. Upload attached BIM files via OAuth 2.0
        for (let i = 0; i < catalogDraft.attachedFiles.length; i++) {
          const item = catalogDraft.attachedFiles[i];
          setConnectionLog(`Subiendo archivo ${i + 1}/${catalogDraft.attachedFiles.length} a Google Drive via OAuth 2.0...`);
          const res = await uploadFileToDriveClient(
            currentDriveToken,
            item.name,
            item.mimeType,
            item.file,
            folder.id
          );
          uploadedAttachedFiles.push({
            id: res.id,
            name: res.name,
            mimeType: item.mimeType,
            ownerUid: user.uid,
            webViewLink: res.webViewLink || res.directUrl,
          });
        }
      }

      const finalImages = uploadedImages.length > 0
        ? uploadedImages
        : (catalogDraft.existingImages && catalogDraft.existingImages.length > 0)
          ? catalogDraft.existingImages
          : catalogDraft.imageUrl.trim()
            ? [catalogDraft.imageUrl.trim()]
            : [];

      const primaryImage = finalImages[0] || catalogDraft.imageUrl || "";
      const finalGlbUrl = uploadedGlbUrl || catalogDraft.existingGlbUrl || "";
      const finalDriveFolderId = uploadedDriveFolderId || catalogDraft.existingDriveFolderId || "";
      const finalDriveFolderLink = uploadedDriveFolderLink || catalogDraft.existingDriveFolderLink || "";
      const finalAttachedFiles = uploadedAttachedFiles.length > 0
        ? [...(catalogDraft.existingAttachedFiles || []), ...uploadedAttachedFiles]
        : (catalogDraft.existingAttachedFiles || []);

      const item: CatalogItemPayload = {
        id: `${catalogDraft.kind}-${slug}`,
        kind: catalogDraft.kind,
        slug,
        route: `/${catalogDraft.kind}/${slug}`,
        name: catalogDraft.name,
        maker: catalogDraft.maker || "InfraBIM",
        category: catalogDraft.category || catalogMeta[catalogDraft.kind].singular,
        discipline: catalogDraft.discipline || catalogMeta[catalogDraft.kind].label,
        country: catalogDraft.country || "Peru",
        formats: splitList(catalogDraft.formats),
        versions: splitList(catalogDraft.versions),
        price: catalogDraft.price || "Gratis",
        downloads: catalogDraft.downloads || "0",
        tags: splitList(catalogDraft.tags),
        specs: splitList(catalogDraft.specs),
        description:
          catalogDraft.description ||
          `${catalogMeta[catalogDraft.kind].singular} publicado desde el panel administrador de InfraBIM.`,
        visual: catalogDraft.kind === "materiales" ? "column" : catalogDraft.kind === "colecciones" ? "cabinet" : "box",
        feature: catalogDraft.feature || "Nuevo",
        isPremium: catalogDraft.isPremium,
        imageUrl: primaryImage,
        images: finalImages,
        glbUrl: finalGlbUrl,
        has3D: Boolean(finalGlbUrl),
        hasAR: Boolean(finalGlbUrl),
        driveFolderId: finalDriveFolderId,
        driveFolderLink: finalDriveFolderLink,
        attachedFiles: finalAttachedFiles,
        ownerUid: user.uid,
        isArchived: Boolean(catalogDraft.isArchived),
      };

      if (catalogDraft.editingOriginalKind && catalogDraft.editingOriginalSlug) {
        if (catalogDraft.editingOriginalKind !== catalogDraft.kind || catalogDraft.editingOriginalSlug !== slug) {
          await deleteCatalogItem(catalogDraft.editingOriginalKind, catalogDraft.editingOriginalSlug);
        }
      }

      await saveCatalogItem(item);
      await refreshCatalogItems();
      setCatalogDraft({ ...emptyCatalogDraft, kind: catalogDraft.kind });
      navigateTo(item.route);
      setConnectionLog(`✓ "${item.name}" guardado exitosamente en Firestore.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "No se pudo crear el recurso.";
      setConnectionLog(`Error al crear recurso: ${msg}`);
      alert(`Error al crear recurso: ${msg}`);
    } finally {
      setBusy("");
    }
  }

  async function handleImportBulkJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setBusy("bulk-import");
      setConnectionLog("Leyendo lote masivo de recursos...");
      const text = await file.text();
      const items: CatalogItemPayload[] = JSON.parse(text);

      if (!Array.isArray(items) || items.length === 0) {
        alert("El archivo no contiene un arreglo válido de recursos.");
        return;
      }

      setConnectionLog(`Publicando ${items.length} recursos en Firestore...`);

      let count = 0;
      for (const rawItem of items) {
        const item: CatalogItemPayload = {
          ...rawItem,
          formats: Array.isArray(rawItem.formats) ? rawItem.formats : splitList(String(rawItem.formats || "RFA, IFC")),
          versions: Array.isArray(rawItem.versions) ? rawItem.versions : splitList(String(rawItem.versions || "2026")),
          tags: Array.isArray(rawItem.tags) ? rawItem.tags : splitList(String(rawItem.tags || "")),
          specs: Array.isArray(rawItem.specs) ? rawItem.specs : splitList(String(rawItem.specs || "")),
          ownerUid: user?.uid || "admin",
        };

        await saveCatalogItem(item);
        count++;
        setConnectionLog(`Publicado (${count}/${items.length}): ${item.name}`);
      }

      setConnectionLog(`✅ ¡Carga Masiva Exitosa! Se publicaron ${count} recursos en Firestore.`);
      alert(`¡Carga Masiva Completada! Se importaron ${count} familias BIM exitosamente.`);
      await refreshCatalogItems();
    } catch (err: any) {
      console.error("Error importando lote JSON:", err);
      alert(`Error al importar lote: ${err.message || err}`);
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  function detectCategoryInJS(folderName: string, fileNames: string[]): string {
    const combined = (folderName + " " + fileNames.join(" ")).toLowerCase();
    if (combined.includes("silla") || combined.includes("chair") || combined.includes("sofa") || combined.includes("mesa") || combined.includes("table") || combined.includes("mueble")) return "Mobiliario";
    if (combined.includes("puerta") || combined.includes("door")) return "Puertas";
    if (combined.includes("ventana") || combined.includes("window")) return "Ventanas";
    if (combined.includes("sanitario") || combined.includes("bano") || combined.includes("baño") || combined.includes("lavamano")) return "Sanitarios";
    if (combined.includes("hvac") || combined.includes("aire") || combined.includes("difusor")) return "HVAC";
    if (combined.includes("columna") || combined.includes("viga") || combined.includes("estructura")) return "Estructuras";
    return "Arquitectura";
  }

  function detectMakerInJS(folderName: string, fileNames: string[]): string {
    const combined = (folderName + " " + fileNames.join(" ")).toLowerCase();
    if (combined.includes("kokuyo")) return "KOKUYO";
    if (combined.includes("plank")) return "Plank";
    if (combined.includes("steelbim")) return "SteelBIM";
    if (combined.includes("modasa")) return "MODASA";
    if (combined.includes("airtek")) return "AirTek";
    return "InfraBIM";
  }

  function detectFormatsInJS(fileNames: string[]): string[] {
    const extMap: Record<string, string> = {
      ".rfa": "RFA", ".rvt": "RVT", ".ifc": "IFC", ".dwg": "DWG",
      ".skp": "SKP", ".pdf": "PDF", ".glb": "GLB", ".gltf": "GLTF",
      ".zip": "ZIP", ".rar": "RAR", ".7z": "ZIP", ".max": "3DS MAX",
      ".fbx": "FBX", ".obj": "OBJ", ".nwd": "NWD", ".nwc": "NWC",
    };
    const formats = new Set<string>();
    for (const name of fileNames) {
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      if (extMap[ext]) {
        formats.add(extMap[ext]);
      } else if (ext && ext.includes(".")) {
        const cleanExt = ext.replace(".", "").toUpperCase();
        if (cleanExt.length <= 6) formats.add(cleanExt);
      }
    }
    return formats.size > 0 ? Array.from(formats) : ["RFA", "IFC"];
  }

  function clean_product_name_js(name: string): string {
    const clean = name.replace(/_/g, " ").trim();
    return clean.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeBulkPath(pathValue: string): string {
    return pathValue
      .split("\\")
      .join("/")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("/");
  }

  function splitBulkPath(pathValue: string): string[] {
    const normalized = normalizeBulkPath(pathValue);
    return normalized ? normalized.split("/") : [];
  }

  function getBulkOriginalPath(file: File): string {
    const uploadFile = file as BulkUploadFile;
    return normalizeBulkPath(file.webkitRelativePath || uploadFile.relPath || file.name);
  }

  function getBulkUploadRelativePath(file: File): string {
    const uploadFile = file as BulkUploadFile;
    return normalizeBulkPath(uploadFile.bulkRelativePath || file.name) || file.name;
  }

  function sanitizeDrivePathSegment(segment: string): string {
    return segment.replace(/[\/:*?"<>|]/g, "_").trim().slice(0, 160) || "Carpeta";
  }

  function formatBulkBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    const decimals = unitIndex === 0 || value >= 100 ? 0 : 1;
    return value.toFixed(decimals) + " " + units[unitIndex];
  }

  function normalizeBulkFolderToken(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isLikelyInternalAssetFolder(name: string): boolean {
    return new Set([
      "3d",
      "cad",
      "docs",
      "documents",
      "documentos",
      "dwg",
      "familias",
      "families",
      "files",
      "fuentes",
      "glb",
      "gltf",
      "ifc",
      "imagenes",
      "images",
      "img",
      "maps",
      "mapas",
      "models",
      "modelos",
      "preview",
      "previews",
      "renders",
      "revit",
      "rfa",
      "rvt",
      "source",
      "sources",
      "texturas",
      "texture",
      "textures",
    ]).has(normalizeBulkFolderToken(name));
  }
  async function scanDataTransferEntry(entry: any, path = ""): Promise<BulkUploadFile[]> {
    const results: BulkUploadFile[] = [];
    if (!entry) return results;

    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      const uploadFile = file as BulkUploadFile;
      const relPath = path ? `${path}/${file.name}` : file.name;
      uploadFile.relPath = relPath;
      results.push(uploadFile);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await new Promise<any[]>((resolve) => {
        const allEntries: any[] = [];
        const readBatch = () => {
          dirReader.readEntries((batch: any[]) => {
            if (!batch || batch.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...batch);
              readBatch();
            }
          });
        };
        readBatch();
      });

      for (const childEntry of entries) {
        const childFiles = await scanDataTransferEntry(childEntry, path ? `${path}/${entry.name}` : entry.name);
        results.push(...childFiles);
      }
    }
    return results;
  }

  async function processBulkFileList(filesList: File[]) {
    if (filesList.length === 0) return;

    setBulkPreparingOpen(true);
    setBulkPreparingMessage("Leyendo " + filesList.length + " archivo(s) y detectando carpetas...");

    try {
      let currentUser = user;
      let preparedDriveToken = driveToken || sessionStorage.getItem("infrabim_drive_token") || "";

      if (!currentUser && auth) {
        try {
          setBulkPreparingMessage("Abriendo autorizacion de Google para continuar...");
          setConnectionLog("Solicitando inicio de sesion Administrador Google...");
          const result = await signInWithPopup(auth, googleProvider);
          currentUser = result.user;
          setUser(result.user);
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (cred?.accessToken) {
            preparedDriveToken = cred.accessToken;
            setDriveToken(cred.accessToken);
            sessionStorage.setItem("infrabim_drive_token", cred.accessToken);
          }
        } catch (authErr: any) {
          alert("Inicia sesion como Administrador para subir carpetas a Drive.");
          return;
        }
      }

      setBulkPreparingMessage("Analizando estructura de carpetas...");

      const pathEntries = filesList.map((rawFile) => {
        const file = rawFile as BulkUploadFile;
        const originalPath = getBulkOriginalPath(file);
        const parts = splitBulkPath(originalPath);
        return { file, parts: parts.length > 0 ? parts : [file.name] };
      });

      const firstLevelNames = Array.from(
        new Set(pathEntries.filter((entry) => entry.parts.length >= 2).map((entry) => entry.parts[0]))
      );
      const singleRootName = firstLevelNames.length === 1 ? firstLevelNames[0] : "";
      const secondLevelNames = singleRootName
        ? new Set(
            pathEntries
              .filter((entry) => entry.parts[0] === singleRootName && entry.parts.length >= 3)
              .map((entry) => entry.parts[1])
          )
        : new Set<string>();
      const secondLevelList = Array.from(secondLevelNames);
      const internalSecondLevelCount = secondLevelList.filter(isLikelyInternalAssetFolder).length;
      const shouldUnwrapSingleRoot = Boolean(
        singleRootName &&
          secondLevelList.length > 1 &&
          internalSecondLevelCount < secondLevelList.length
      );
      let ignoredLooseFiles = 0;

      const folderMap = new Map<string, { folderName: string; rootPath: string; files: BulkUploadFile[] }>();

      for (const { file, parts } of pathEntries) {
        let folderName = "";
        let rootParts: string[] = [];
        let relativeParts: string[] = [];

        if (parts.length < 2) {
          ignoredLooseFiles++;
          continue;
        }

        if (shouldUnwrapSingleRoot) {
          if (parts.length < 3) {
            ignoredLooseFiles++;
            continue;
          }

          folderName = parts[1];
          rootParts = parts.slice(0, 2);
          relativeParts = parts.slice(2);
        } else {
          folderName = parts[0];
          rootParts = parts.slice(0, 1);
          relativeParts = parts.slice(1);
        }

        const rootPath = normalizeBulkPath(rootParts.join("/")) || folderName;
        const relativePath = normalizeBulkPath(relativeParts.join("/")) || file.name;
        file.bulkRootPath = rootPath;
        file.bulkRelativePath = relativePath;

        const existing = folderMap.get(rootPath);
        if (existing) {
          existing.files.push(file);
        } else {
          folderMap.set(rootPath, { folderName, rootPath, files: [file] });
        }
      }

      const folders = Array.from(folderMap.values());
      if (folders.length === 0) {
        alert("No se detectaron carpetas de recursos. Selecciona una carpeta raiz que contenga subcarpetas.");
        return;
      }

      if (ignoredLooseFiles > 0) {
        setConnectionLog("Se ignoraron " + ignoredLooseFiles + " archivo(s) suelto(s). Solo se subiran carpetas.");
        showToast("Se ignoraron " + ignoredLooseFiles + " archivo(s) suelto(s) de la raiz.", "info");
      }

      setBulkPreparingMessage("Preparando " + folders.length + " carpeta(s) para subir a Google Drive...");

      const selectionItems: BulkFolderSelectionItem[] = folders.map((folder, idx) => {
        const cleanName = clean_product_name_js(folder.folderName);
        const fileNames = folder.files.map((f) => getBulkUploadRelativePath(f));
        const totalBytes = folder.files.reduce((sum, file) => sum + (file.size || 0), 0);
        return {
          id: "sel-" + idx + "-" + folder.rootPath,
          folderName: folder.folderName,
          rootPath: folder.rootPath,
          cleanName,
          files: folder.files,
          fileCount: folder.files.length,
          totalBytes,
          category: detectCategoryInJS(folder.folderName, fileNames),
          maker: detectMakerInJS(folder.folderName, fileNames),
          formats: detectFormatsInJS(fileNames),
          selected: true,
        };
      });

      setBulkSelectionItems(selectionItems);
      setBulkSelectionModalOpen(false);
      showToast("Se detectaron " + selectionItems.length + " subcarpetas. Iniciando carga masiva a Google Drive...", "info");
      await startUploadingSelectedFolders(selectionItems, preparedDriveToken);
    } finally {
      setBulkPreparingOpen(false);
      setBulkPreparingMessage("");
    }
  }

  async function startUploadingSelectedFolders(itemsToUpload: BulkFolderSelectionItem[], overrideToken?: string) {
    if (itemsToUpload.length === 0) {
      alert("Selecciona al menos una subcarpeta para iniciar la carga.");
      return;
    }

    let currentDriveToken = overrideToken || driveToken || sessionStorage.getItem("infrabim_drive_token") || "";

    setBulkPreparingOpen(true);
    setBulkPreparingMessage("Preparando subida a Google Drive...");

    if (!currentDriveToken && auth) {
      try {
        setBulkPreparingMessage("Abriendo autorizacion de Google Drive...");
        setConnectionLog("Solicitando autorizacion Google OAuth 2.0 para Google Drive...");
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        currentDriveToken = credential?.accessToken || "";
        if (currentDriveToken) {
          setDriveToken(currentDriveToken);
          sessionStorage.setItem("infrabim_drive_token", currentDriveToken);
        }
      } catch (popupErr: any) {
        console.warn("Popup OAuth error:", popupErr);
      }
    }

    if (!currentDriveToken) {
      setBulkPreparingOpen(false);
      setBulkPreparingMessage("");
      alert("Autorizacion de Google Drive requerida. Vuelve a seleccionar la carpeta raiz y autoriza la cuenta Google cuando aparezca la ventana.");
      return;
    }

    sessionStorage.setItem("infrabim_drive_token", currentDriveToken);
    setBulkPreparingMessage("Creando ventana de progreso...");
    setBulkSelectionModalOpen(false);

    const initialProgressList: BulkFolderProgressItem[] = itemsToUpload.map((item, idx) => ({
      id: "bulk-" + idx + "-" + item.folderName,
      folderName: item.folderName,
      cleanName: item.cleanName,
      fileCount: item.fileCount,
      totalBytes: item.totalBytes,
      uploadedBytes: 0,
      progress: 0,
      currentFilePercent: 0,
      status: "pending",
      currentStep: "En espera...",
      processedFiles: 0,
      category: item.category,
      maker: item.maker,
      formats: item.formats,
    }));

    setBulkProgressList(initialProgressList);
    setBulkOverallProgress(0);
    setBulkProgressCollapsed(false);
    setBulkModalOpen(true);
    setBulkPreparingOpen(false);
    setBulkPreparingMessage("");
    setBusy("bulk-drive");

    const totalFilesCount = itemsToUpload.reduce((acc, i) => acc + i.fileCount, 0);
    const totalUploadBytes = Math.max(
      1,
      itemsToUpload.reduce((acc, item) => acc + (item.totalBytes || item.files.reduce((sum, file) => sum + (file.size || 0), 0)), 0)
    );
    setConnectionLog("Preparando subida a Google Drive de " + itemsToUpload.length + " subcarpetas (" + totalFilesCount + " archivos, " + formatBulkBytes(totalUploadBytes) + ")...");

    try {
      let totalSuccess = 0;
      let globalUploadedBytes = 0;
      const envRootFolderId = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || DEFAULT_GOOGLE_DRIVE_ROOT_FOLDER_ID;
      const driveFolderPathCache = new Map<string, string>();

      const updateOverallProgress = (inFlightBytes = 0) => {
        const percent = Math.min(99, Math.round(((globalUploadedBytes + inFlightBytes) / totalUploadBytes) * 100));
        setBulkOverallProgress(percent);
      };

      async function refreshDriveTokenForBulk(): Promise<void> {
        if (!auth) {
          throw new Error("Autorizacion de Google Drive expirada. Inicia sesion nuevamente.");
        }

        setConnectionLog("Token de Google Drive expirado. Solicitando nueva autorizacion OAuth...");
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) {
          throw new Error("No se obtuvo token Google OAuth 2.0. Reintenta la autorizacion de Drive.");
        }

        currentDriveToken = credential.accessToken;
        setDriveToken(currentDriveToken);
        sessionStorage.setItem("infrabim_drive_token", currentDriveToken);
      }

      async function createDriveFolderForBulk(
        name: string,
        parentFolderId?: string
      ): Promise<{ id: string; name: string; webViewLink?: string }> {
        try {
          return await createDriveFolderClient(currentDriveToken, name, parentFolderId);
        } catch (err: any) {
          if (err?.message?.includes("401")) {
            await refreshDriveTokenForBulk();
            return createDriveFolderClient(currentDriveToken, name, parentFolderId);
          }
          throw err;
        }
      }

      async function uploadFileForBulk(
        fileName: string,
        mimeType: string,
        file: File,
        parentFolderId: string,
        options?: { onProgress?: (progress: { loaded: number; total: number; percent: number }) => void }
      ): Promise<{ id: string; name: string; webViewLink?: string; directUrl: string }> {
        try {
          return await uploadFileToDriveClient(currentDriveToken, fileName, mimeType, file, parentFolderId, options);
        } catch (err: any) {
          if (err?.message?.includes("401")) {
            await refreshDriveTokenForBulk();
            return uploadFileToDriveClient(currentDriveToken, fileName, mimeType, file, parentFolderId, options);
          }
          throw err;
        }
      }

      async function ensureDriveFolderPath(parentFolderId: string, folderSegments: string[]): Promise<string> {
        let currentParentId = parentFolderId;

        for (const rawSegment of folderSegments) {
          const folderName = sanitizeDrivePathSegment(rawSegment);
          const cacheKey = currentParentId + "/" + folderName.toLowerCase();
          const cachedFolderId = driveFolderPathCache.get(cacheKey);
          if (cachedFolderId) {
            currentParentId = cachedFolderId;
            continue;
          }

          const folder = await createDriveFolderForBulk(folderName, currentParentId);
          driveFolderPathCache.set(cacheKey, folder.id);
          currentParentId = folder.id;
        }

        return currentParentId;
      }

      for (let fIdx = 0; fIdx < itemsToUpload.length; fIdx++) {
        const item = itemsToUpload[fIdx];
        const files = item.files;
        const folderTotalBytes = Math.max(1, item.totalBytes || files.reduce((sum, file) => sum + (file.size || 0), 0));
        let folderUploadedBytes = 0;

        setBulkProgressList((prev) =>
          prev.map((p, idx) =>
            idx === fIdx
              ? {
                  ...p,
                  status: "uploading",
                  progress: Math.max(p.progress, 1),
                  currentStep: "Creando subcarpeta en Google Drive...",
                }
              : p
          )
        );

        const cleanName = item.cleanName;
        const slug = slugify(cleanName);
        const docId = "familias-" + slug;

        setConnectionLog("[" + (fIdx + 1) + "/" + itemsToUpload.length + "] Creando subcarpeta en Google Drive: " + cleanName + "...");

        try {
          const driveFolder = await createDriveFolderForBulk(cleanName + " - " + slug, envRootFolderId);

          setBulkProgressList((prev) =>
            prev.map((p, idx) =>
              idx === fIdx
                ? {
                    ...p,
                    progress: Math.max(p.progress, 3),
                    driveFolderLink: driveFolder.webViewLink || "https://drive.google.com/drive/folders/" + driveFolder.id,
                    currentStep: "Subcarpeta creada. Iniciando archivos...",
                  }
                : p
            )
          );

          const uploadedImages: string[] = [];
          let uploadedGlbUrl = "";
          const uploadedAttached: DriveFilePayload[] = [];
          const fileErrors: string[] = [];

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = getBulkUploadRelativePath(file);
            const relativeParts = splitBulkPath(relativePath);
            const uploadFileName = relativeParts[relativeParts.length - 1] || file.name;
            const nestedFolderParts = relativeParts.slice(0, -1);
            const fileSize = file.size || 0;
            let lastProgressUpdate = 0;

            const pushFolderProgress = (loadedForCurrentFile: number, force = false) => {
              const now = Date.now();
              if (!force && now - lastProgressUpdate < 140) return;
              lastProgressUpdate = now;

              const safeLoaded = Math.max(0, Math.min(fileSize || loadedForCurrentFile, loadedForCurrentFile));
              const inFlightFolderBytes = Math.min(folderTotalBytes, folderUploadedBytes + safeLoaded);
              const bytePercent = Math.round((inFlightFolderBytes / folderTotalBytes) * 100);
              const filePercent = Math.round(((i + (fileSize ? safeLoaded / Math.max(1, fileSize) : 0)) / Math.max(1, files.length)) * 100);
              const folderPercent = Math.min(99, Math.max(bytePercent, filePercent, 3));

              setBulkProgressList((prev) =>
                prev.map((p, idx) =>
                  idx === fIdx
                    ? {
                        ...p,
                        status: "uploading",
                        processedFiles: i,
                        uploadedBytes: inFlightFolderBytes,
                        progress: folderPercent,
                        currentFilePercent: fileSize ? Math.min(99, Math.round((safeLoaded / Math.max(1, fileSize)) * 100)) : undefined,
                        currentStep: "Subiendo (" + (i + 1) + "/" + files.length + "): " + relativePath,
                      }
                    : p
                )
              );
              updateOverallProgress(safeLoaded);
            };

            setBulkProgressList((prev) =>
              prev.map((p, idx) =>
                idx === fIdx
                  ? {
                      ...p,
                      status: "uploading",
                      processedFiles: i,
                      currentFilePercent: 0,
                      currentStep: "Subiendo (" + (i + 1) + "/" + files.length + "): " + relativePath,
                    }
                  : p
              )
            );

            setConnectionLog("[" + (fIdx + 1) + "/" + itemsToUpload.length + "] Subiendo a Drive (" + (i + 1) + "/" + files.length + "): " + relativePath + "...");

            try {
              const targetFolderId = nestedFolderParts.length > 0
                ? await ensureDriveFolderPath(driveFolder.id, nestedFolderParts)
                : driveFolder.id;

              const res = await uploadFileForBulk(
                uploadFileName,
                file.type || "application/octet-stream",
                file,
                targetFolderId,
                {
                  onProgress: (progress) => pushFolderProgress(progress.loaded, progress.percent >= 100),
                }
              );

              folderUploadedBytes = Math.min(folderTotalBytes, folderUploadedBytes + fileSize);
              globalUploadedBytes = Math.min(totalUploadBytes, globalUploadedBytes + fileSize);
              const completedFilePercent = Math.round(((i + 1) / Math.max(1, files.length)) * 100);
              const completedBytePercent = Math.round((folderUploadedBytes / folderTotalBytes) * 100);
              const completedPercent = Math.min(99, Math.max(completedFilePercent, completedBytePercent));

              setBulkProgressList((prev) =>
                prev.map((p, idx) =>
                  idx === fIdx
                    ? {
                        ...p,
                        processedFiles: i + 1,
                        uploadedBytes: folderUploadedBytes,
                        progress: completedPercent,
                        currentFilePercent: 100,
                        currentStep: "Archivo subido (" + (i + 1) + "/" + files.length + "): " + relativePath,
                      }
                    : p
                )
              );
              updateOverallProgress(0);

              const lowerFileName = uploadFileName.toLowerCase();

              if (lowerFileName.endsWith(".glb") || lowerFileName.endsWith(".gltf")) {
                uploadedGlbUrl = res.directUrl;
              } else if (file.type?.startsWith("image/") || lowerFileName.match(/\.(png|jpg|jpeg|webp)$/i)) {
                uploadedImages.push(res.directUrl);
              } else {
                uploadedAttached.push({
                  id: res.id,
                  name: relativePath,
                  mimeType: file.type || "application/octet-stream",
                  ownerUid: user?.uid || "",
                  webViewLink: res.webViewLink || res.directUrl,
                });
              }
            } catch (fileErr: any) {
              const fileMsg = fileErr?.message || String(fileErr);
              fileErrors.push(relativePath + ": " + fileMsg);
              console.warn("Error subiendo " + relativePath + " a Drive:", fileErr);
            }
          }

          if (fileErrors.length > 0) {
            throw new Error("No se subieron " + fileErrors.length + " archivo(s): " + fileErrors.slice(0, 3).join("; "));
          }

          const payload: CatalogItemPayload = {
            id: docId,
            kind: "familias",
            slug,
            route: "/familias/" + slug,
            name: cleanName,
            maker: item.maker,
            category: item.category,
            discipline: item.category,
            country: "Peru",
            formats: item.formats,
            versions: ["2026", "2025", "2024", "2023"],
            price: "Gratis",
            downloads: "1.2K",
            tags: [item.maker, item.category, "BIM"],
            specs: ["Archivos incluidos: " + item.formats.join(", "), "Compatibilidad: Revit 2020-2026"],
            description: "Familia BIM " + cleanName + " de la marca " + item.maker + " subida masivamente a Google Drive para Revit y OpenBIM.",
            visual: "box",
            feature: "Nuevo",
            isPremium: false,
            imageUrl: uploadedImages[0] || "",
            images: uploadedImages,
            glbUrl: uploadedGlbUrl,
            has3D: Boolean(uploadedGlbUrl),
            hasAR: Boolean(uploadedGlbUrl),
            driveFolderId: driveFolder.id,
            driveFolderLink: driveFolder.webViewLink || "https://drive.google.com/drive/folders/" + driveFolder.id,
            attachedFiles: uploadedAttached,
            ownerUid: user?.uid || "",
            isArchived: false,
          };

          await saveCatalogItem(payload);
          totalSuccess++;

          setBulkProgressList((prev) =>
            prev.map((p, idx) =>
              idx === fIdx
                ? {
                    ...p,
                    status: "completed",
                    progress: 100,
                    uploadedBytes: item.totalBytes,
                    currentFilePercent: 100,
                    currentStep: "Publicado en Firestore y Google Drive",
                    driveFolderLink: driveFolder.webViewLink || "https://drive.google.com/drive/folders/" + driveFolder.id,
                  }
                : p
            )
          );

          setConnectionLog("Subida completada (" + totalSuccess + "/" + itemsToUpload.length + "): " + cleanName);
        } catch (folderErr: any) {
          console.error("Error procesando subcarpeta " + cleanName + ":", folderErr);
          const fMsg = folderErr?.message || String(folderErr);

          setBulkProgressList((prev) =>
            prev.map((p, idx) =>
              idx === fIdx
                ? {
                    ...p,
                    status: "error",
                    currentStep: "Error: " + fMsg,
                    errorMessage: fMsg,
                  }
                : p
            )
          );
        }
      }

      setBulkOverallProgress(100);
      setConnectionLog("Carga masiva a Google Drive finalizada: " + totalSuccess + " de " + itemsToUpload.length + " subcarpetas respaldadas y publicadas.");
      await refreshCatalogItems();
    } catch (err: any) {
      console.error("Error global en Carga Masiva a Drive:", err);
      const msg = err?.message || String(err);

      if (msg.includes("NET_BLOCKED_BY_CLIENT") || msg.includes("Failed to fetch") || msg.includes("BLOCKED_BY_CLIENT")) {
        alert(
          "BLOQUEO DE NAVEGADOR DETECTADO (net::ERR_BLOCKED_BY_CLIENT):\n\n" +
          "Microsoft Edge o una extension ha bloqueado las peticiones de subida a Google Drive.\n\n" +
          "Solucion: desactiva la proteccion contra rastreo o pausa el AdBlocker para infrabimss.web.app y reintenta."
        );
      } else {
        alert("Error en Carga Masiva a Drive: " + msg);
      }
    } finally {
      setBusy("");
    }
  }

  async function handleShowDirectoryPicker() {
    try {
      if (typeof (window as any).showDirectoryPicker !== "function") {
        alert("Tu navegador no soporta el selector nativo de directorio. Usa la zona de arrastrar y soltar.");
        return;
      }

      const selectedFiles: BulkUploadFile[] = [];
      const rootNameCounts = new Map<string, number>();

      while (true) {
        let handle: any;
        try {
          handle = await (window as any).showDirectoryPicker();
        } catch (pickErr: any) {
          if (pickErr?.name === "AbortError") {
            break;
          }
          throw pickErr;
        }

        const duplicateCount = rootNameCounts.get(handle.name) || 0;
        rootNameCounts.set(handle.name, duplicateCount + 1);
        const rootName = duplicateCount === 0 ? handle.name : `${handle.name} (${duplicateCount + 1})`;
        const files: BulkUploadFile[] = [];

        async function readDir(dirHandle: any, path = "") {
          for await (const entry of dirHandle.values()) {
            if (entry.kind === "file") {
              const file = (await entry.getFile()) as BulkUploadFile;
              const relPath = path ? `${path}/${file.name}` : file.name;
              file.relPath = relPath;
              files.push(file);
            } else if (entry.kind === "directory") {
              await readDir(entry, path ? `${path}/${entry.name}` : entry.name);
            }
          }
        }

        await readDir(handle, rootName);
        selectedFiles.push(...files);

        const addAnother = window.confirm(
          `Se agregaron ${files.length} archivo(s) de "${handle.name}". ¿Quieres seleccionar otra carpeta para la carga masiva?`
        );
        if (!addAnother) {
          break;
        }
      }

      if (selectedFiles.length > 0) {
        await processBulkFileList(selectedFiles);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Error en showDirectoryPicker:", err);
      }
    }
  }

  async function handleImportBulkFolderToDrive(event: React.ChangeEvent<HTMLInputElement>) {
    const filesList = Array.from(event.target.files || []);
    if (filesList.length === 0) return;
    await processBulkFileList(filesList);
    event.target.value = "";
  }

  function setCommonSearch(value: string) {
    setQuery(value);
    setSearchKind("familias");
    navigateTo("/familias");
  }

  function togglePermission(role: RoleKey, module: ModuleKey, field: "enabled" | "read" | "write" | "publish") {
    if (!accessControl) {
      return;
    }

    const currentPermission = accessControl.roles[role].modules[module] ?? {
      enabled: false,
      read: false,
      write: false,
      publish: false,
    };

    setAccessControl({
      ...accessControl,
      roles: {
        ...accessControl.roles,
        [role]: {
          ...accessControl.roles[role],
          modules: {
            ...accessControl.roles[role].modules,
            [module]: {
              ...currentPermission,
              [field]: !currentPermission[field],
            },
          },
        },
      },
    });
  }

  async function persistAccessControl() {
    if (!accessControl) {
      setConnectionLog("Conecta el administrador para cargar permisos.");
      return;
    }

    setBusy("access");
    try {
      await saveAccessControl(accessControl);
      setConnectionLog("Permisos modulares actualizados.");
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudieron guardar los permisos.");
    } finally {
      setBusy("");
    }
  }

  function handleNavigation(path: string) {
    navigateTo(path);
  }

  function handleFooterAction(label: string) {
    if (label === "Publicar producto") {
      goToAdmin();
      return;
    }

    const map: Record<string, string> = {
      Inicio: "inicio",
      "Plugin Revit": "plugin",
      Planes: "/planes",
      Familias: "/familias",
      Materiales: "/materiales",
      Colecciones: "/colecciones",
      Fabricantes: "/marcas",
      Proyectos: "/proyectos",
      Galeria: "/galeria",
      "Para fabricantes": "fabricantes",
      "Aprende BIM": "galeria",
    };

    if (map[label]?.startsWith("/")) {
      navigateTo(map[label]);
      return;
    }

    scrollTo(map[label] ?? "inicio");
  }

  function runSearch() {
    navigateTo(`/${searchKind}`);
    setConnectionLog(
      query.trim()
        ? `Busqueda activa en ${catalogMeta[searchKind].label.toLowerCase()}: ${query.trim()}.`
        : `Mostrando ${catalogMeta[searchKind].label.toLowerCase()}.`,
    );
  }

  function toggleSortMode() {
    const nextMode = sortMode === "recent" ? "popular" : "recent";
    setSortMode(nextMode);
    setConnectionLog(nextMode === "popular" ? "Orden aplicado: mas descargados." : "Orden aplicado: recientes.");
  }

  function chooseBillingCycle(cycle: "mensual" | "anual") {
    setBillingCycle(cycle);
    setConnectionLog(
      cycle === "mensual"
        ? "Planes mensuales activados."
        : "Planes anuales activados con ahorro para equipos y estudiantes.",
    );
  }

  function toggleLanguage() {
    const nextLanguage = language === "ES" ? "EN" : "ES";
    setLanguage(nextLanguage);
    setConnectionLog(
      nextLanguage === "ES"
        ? "Idioma activo: espanol."
        : "Language toggle ready. Spanish remains the primary interface for this MVP.",
    );
  }

  function openSearchFamilies() {
    setSearchMenuOpen((open) => !open);
  }

  function chooseSearchKind(kind: CatalogKind) {
    setSearchKind(kind);
    setFilter("Todos");
    setSearchMenuOpen(false);
    navigateTo(`/${kind}`);
  }

  function openSupport() {
    setSupportOpen((open) => !open);
  }

  function getCheckoutAmount(planId: PaidPlanId) {
    return paymentPlans[planId].prices[billingCycle];
  }

  function formatMoney(amount: number) {
    return `S/ ${amount.toLocaleString("es-PE", {
      maximumFractionDigits: 2,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    })}`;
  }

  function updatePaymentPlanDraft(planId: PaidPlanId, cycle: BillingCycle, value: string) {
    const amount = Number(value);

    setPaymentPlanDraft((currentPlans) => ({
      ...currentPlans,
      [planId]: {
        ...currentPlans[planId],
        prices: {
          ...currentPlans[planId].prices,
          [cycle]: Number.isFinite(amount) ? amount : 0,
        },
      },
    }));
  }

  function updatePaymentPlanMeta(planId: PaidPlanId, field: "label" | "description", value: string) {
    setPaymentPlanDraft((currentPlans) => ({
      ...currentPlans,
      [planId]: {
        ...currentPlans[planId],
        [field]: value,
      },
    }));
  }

  async function persistPaymentPlans() {
    if (!isAdmin) {
      setConnectionLog("Solo el administrador puede cambiar precios.");
      return;
    }

    const hasInvalidPrice = (Object.keys(paymentPlanDraft) as PaidPlanId[]).some((planId) =>
      (["mensual", "anual"] as BillingCycle[]).some((cycle) => paymentPlanDraft[planId].prices[cycle] <= 0),
    );

    if (hasInvalidPrice) {
      setConnectionLog("Los precios de los planes deben ser mayores que cero.");
      return;
    }

    const hasEmptyText = (Object.keys(paymentPlanDraft) as PaidPlanId[]).some(
      (planId) => !paymentPlanDraft[planId].label.trim() || !paymentPlanDraft[planId].description.trim(),
    );

    if (hasEmptyText) {
      setConnectionLog("El nombre y la descripcion del plan no pueden estar vacios.");
      return;
    }

    setBusy("plans");
    setDatabaseLoading("plans", true);
    setPaymentPlansError("");
    try {
      await savePaymentPlans(paymentPlanDraft);
      const plans = await fetchPaymentPlans();
      setPaymentPlans(plans);
      setPaymentPlanDraft(plans);
      setPaymentPlansReady(true);
      setConnectionLog("Precios y detalles de los planes actualizados correctamente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron guardar los precios.";
      setPaymentPlansError(message);
      setConnectionLog(message);
    } finally {
      setDatabaseLoading("plans", false);
      setBusy("");
    }
  }

  function startCheckout(planId: PaidPlanId, method: CheckoutMethod) {
    if (dbLoading.plans || !paymentPlansReady) {
      setConnectionLog("Espera a que Firestore cargue los precios reales antes de iniciar el pago.");
      return;
    }

    setCheckout({ method, planId });
    setCheckoutStatus(
      method === "card"
        ? "Preparando suscripcion con tarjeta."
        : "Preparando pago con Yape dentro de InfraBIM.",
    );
  }

  function closeCheckout() {
    setCheckout(null);
    setCheckoutStatus("");
  }

  function chooseCheckoutMethod(method: CheckoutMethod) {
    if (!checkout) {
      return;
    }

    setCheckout({ ...checkout, method });
    setCheckoutStatus(method === "card" ? "Preparando suscripcion con tarjeta." : "Preparando pago con Yape.");
  }

  async function submitYapePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!checkout) {
      setCheckoutStatus("Selecciona un plan antes de pagar.");
      return;
    }

    if (!user) {
      setCheckoutStatus("Conecta tu cuenta para registrar el pago.");
      return;
    }

    if (!isMercadoPagoConfigured()) {
      setCheckoutStatus("Agrega VITE_MERCADO_PAGO_PUBLIC_KEY para activar Yape.");
      return;
    }

    if (!isPaymentsApiConfigured()) {
      setCheckoutStatus(
        "WORKER_OFFLINE: Configura VITE_PAYMENTS_API_URL o activa el Worker local con 'npm run worker:dev'.",
      );
      return;
    }

    if (!yapeDraft.phoneNumber.trim() || !yapeDraft.otp.trim()) {
      setCheckoutStatus("Ingresa celular y codigo Yape.");
      return;
    }

    setBusy("payment-yape");
    setCheckoutStatus("Validando Yape con Mercado Pago...");

    try {
      const yapeToken = await createYapeToken(yapeDraft.phoneNumber.trim(), yapeDraft.otp.trim());
      const response = await createYapePayment({
        billingCycle,
        payerEmail: user.email ?? "",
        planId: checkout.planId,
        yapeToken,
      });
      const label = paymentPlans[checkout.planId].label;
      setCheckoutStatus(`Pago Yape ${label}: ${response.status ?? "pendiente"}.`);
      setConnectionLog(`Mercado Pago registro el pago Yape ${response.id ?? label}.`);
    } catch (error) {
      // TypeError: Failed to fetch → Worker no disponible o bloqueado por extensión
      const raw = error instanceof Error ? error.message : "";
      const isNetworkError = raw === "Failed to fetch" || raw.includes("NetworkError") || raw.includes("ERR_FAILED");
      if (isNetworkError) {
        setCheckoutStatus(
          "WORKER_OFFLINE: No se pudo conectar al servidor de pagos. " +
            "Si estas en local activa 'npm run worker:dev'. " +
            "Si usas AdBlock, desactivalo en esta pagina y vuelve a intentarlo.",
        );
      } else {
        setCheckoutStatus(raw || "No se pudo procesar Yape.");
      }
    } finally {
      setBusy("");
    }
  }

  function getCategoryIcon(category: string, kind: CatalogKind) {
    const catLower = (category || "").toLowerCase();
    if (catLower.includes("mobiliario") || catLower.includes("mueble")) return <Armchair size={22} />;
    if (catLower.includes("puerta")) return <DoorOpen size={22} />;
    if (catLower.includes("ventana")) return <PanelsTopLeft size={22} />;
    if (catLower.includes("sanitario") || catLower.includes("baño") || catLower.includes("bano") || catLower.includes("lavamano")) return <Bath size={22} />;
    if (catLower.includes("ilumina") || catLower.includes("lamp")) return <Lamp size={22} />;
    if (catLower.includes("hvac") || catLower.includes("aire") || catLower.includes("ventila") || catLower.includes("difusor")) return <Fan size={22} />;
    if (catLower.includes("estruc") || catLower.includes("columna") || catLower.includes("viga")) return <Building2 size={22} />;
    if (kind === "colecciones") return <Boxes size={22} />;
    return <Box size={22} />;
  }

  function renderCatalogVisual(product: CatalogProduct, className: string) {
    if (product.imageUrl) {
      return (
        <span className={`${className} image-backed`} aria-hidden="true">
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        </span>
      );
    }

    return (
      <span className={`${className} fallback-visual`} aria-hidden="true">
        <span className="fallback-gradient-overlay" />
        <span className="fallback-icon-wrapper">
          {getCategoryIcon(product.category, product.kind)}
        </span>
        <span className="fallback-badge">{product.category || catalogMeta[product.kind]?.singular || "BIM"}</span>
      </span>
    );
  }

  function renderSkeletonLine(className = "") {
    return <span className={`skeleton-line ${className}`} aria-hidden="true" />;
  }

  function renderCatalogCardSkeletons(count = 6, variant: "family" | "library" = "library") {
    return Array.from({ length: count }, (_, index) => (
      <article
        aria-hidden="true"
        className={`${variant === "family" ? "family-card" : "library-card"} catalog-card-skeleton`}
        key={`catalog-skeleton-${variant}-${index}`}
      >
        <span className="skeleton-block catalog-visual-skeleton" />
        {renderSkeletonLine("skeleton-title")}
        {renderSkeletonLine("skeleton-short")}
        <span className="card-footer">
          {renderSkeletonLine("skeleton-micro")}
          {renderSkeletonLine("skeleton-chip")}
        </span>
      </article>
    ));
  }

  function renderPricingSkeletonCards() {
    return (
      <div className="pricing-grid" aria-busy="true" aria-label="Cargando planes">
        {["free", "professional", "student"].map((planId) => (
          <article
            aria-hidden="true"
            className={`pricing-card pricing-card-skeleton ${planId === "professional" ? "featured-plan" : ""}`}
            key={`pricing-skeleton-${planId}`}
          >
            <div className="pricing-card-head">
              <span className="plan-icon skeleton-icon" />
              <div>
                {renderSkeletonLine("skeleton-plan-heading")}
                {renderSkeletonLine("skeleton-plan-copy")}
                {renderSkeletonLine("skeleton-plan-copy short")}
              </div>
            </div>
            <div className="price-row">
              {renderSkeletonLine("skeleton-price")}
              {renderSkeletonLine("skeleton-micro")}
            </div>
            <div className="billing-toggle skeleton-toggle" />
            <div className="plan-benefits skeleton-benefits">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={`benefit-skeleton-${planId}-${index}`}>
                  {renderSkeletonLine("skeleton-dot")}
                  {renderSkeletonLine("skeleton-benefit")}
                </span>
              ))}
            </div>
            <div className="plan-actions">
              {renderSkeletonLine("skeleton-button")}
              {renderSkeletonLine("skeleton-button secondary")}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderDatabaseMessage(title: string, message: string, onRetry?: () => void) {
    return (
      <div className="load-state">
        <PackagePlus aria-hidden="true" size={34} />
        <h2>{title}</h2>
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} type="button">
            Reintentar
          </button>
        )}
      </div>
    );
  }

  function getSimilarProducts(currentProduct: CatalogProduct) {
    const currentTags = new Set(currentProduct.tags.map((tag) => tag.toLowerCase()));
    const scored = catalogItems
      .filter((product) => `${product.kind}/${product.slug}` !== `${currentProduct.kind}/${currentProduct.slug}`)
      .map((product) => {
        const tagMatches = product.tags.filter((tag) => currentTags.has(tag.toLowerCase())).length;
        const score =
          (product.kind === currentProduct.kind ? 5 : 0) +
          (product.category === currentProduct.category ? 4 : 0) +
          (product.discipline === currentProduct.discipline ? 3 : 0) +
          (product.maker === currentProduct.maker ? 2 : 0) +
          tagMatches;

        return { product, score };
      })
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return downloadsScore(second.product.downloads) - downloadsScore(first.product.downloads);
      });

    return scored.slice(0, 6).map(({ product }) => product);
  }

  function renderSimilarProducts(currentProduct: CatalogProduct) {
    const similarProducts = getSimilarProducts(currentProduct);

    if (similarProducts.length === 0) {
      return null;
    }

    return (
      <section className="similar-section" aria-label="Productos similares">
        <h2>Tambien te puede gustar:</h2>
        <div className="similar-grid">
          {similarProducts.map((product) => (
            <button
              className="library-card similar-card"
              key={`${product.kind}-${product.slug}`}
              onClick={() => selectProduct(product.id)}
              type="button"
            >
              <div className="card-top-badges">
                {product.feature && <span className="fresh-badge">{product.feature}</span>}
                {(product.has3D || Boolean(product.glbUrl)) && (
                  <span className="badge-3d-ar">
                    <Sparkles size={11} /> 3D & AR
                  </span>
                )}
              </div>
              {product.isPremium && (
                <span className="crown-badge icon-crown" aria-label="Premium">
                  <Crown aria-hidden="true" size={18} />
                </span>
              )}
              {renderCatalogVisual(product, "library-visual")}
              <strong>{product.name}</strong>
              <small>{product.maker}</small>
              <span className="card-footer">
                <i>
                  <Download aria-hidden="true" size={13} />
                  <span>{product.downloads}</span>
                </i>
                <b>
                  <Download aria-hidden="true" size={13} />
                  <span>Descargar</span>
                </b>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderBillingToggle() {
    return (
      <div className="billing-toggle" role="group" aria-label="Frecuencia de pago">
        <button
          className={billingCycle === "mensual" ? "is-active" : ""}
          onClick={() => chooseBillingCycle("mensual")}
          type="button"
        >
          Mensual
        </button>
        <button
          className={billingCycle === "anual" ? "is-active" : ""}
          onClick={() => chooseBillingCycle("anual")}
          type="button"
        >
          Anual
        </button>
      </div>
    );
  }

  function renderPlanBenefits(benefits: string[]) {
    return (
      <ul className="plan-benefits">
        {benefits.map((benefit) => (
          <li key={benefit}>
            <PackagePlus aria-hidden="true" size={16} />
            {benefit}
          </li>
        ))}
      </ul>
    );
  }

  function renderPaymentModal() {
    if (!checkout) {
      return null;
    }

    const plan = paymentPlans[checkout.planId];
    const amount = getCheckoutAmount(checkout.planId);

    return (
      <div className="payment-overlay" role="presentation">
        <section className="payment-modal" role="dialog" aria-modal="true" aria-label="Checkout Mercado Pago">
          <div className="payment-modal-head">
            <div>
              <span>Mercado Pago</span>
              <h2>{plan.label}</h2>
              <p>{plan.description}</p>
            </div>
            <button className="icon-button" onClick={closeCheckout} type="button" aria-label="Cerrar checkout">
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="payment-summary">
            <strong>{formatMoney(amount)}</strong>
            <span>{billingCycle === "mensual" ? "Pago mensual" : "Pago anual"}</span>
          </div>

          <div className="payment-method-tabs" role="group" aria-label="Metodo de pago">
            <button
              className={checkout.method === "card" ? "is-active" : ""}
              onClick={() => chooseCheckoutMethod("card")}
              type="button"
            >
              <CreditCard aria-hidden="true" size={17} />
              Tarjeta
            </button>
            <button
              className={checkout.method === "yape" ? "is-active" : ""}
              onClick={() => chooseCheckoutMethod("yape")}
              type="button"
            >
              <Smartphone aria-hidden="true" size={17} />
              Yape
            </button>
          </div>

          {!user ? (
            <div className="payment-empty">
              <ShieldCheck aria-hidden="true" size={26} />
              <strong>Conecta tu cuenta</strong>
              <p>Necesitamos Firebase Auth para asociar el pago con tu usuario y rol.</p>
              <button disabled={busy === "auth"} onClick={connectGoogleAccount} type="button">
                Iniciar sesion
              </button>
            </div>
          ) : checkout.method === "card" ? (
            <div className="payment-card-flow">
              {isMercadoPagoConfigured() && isPaymentsApiConfigured() ? (
                <div id="mp-card-payment-brick" className="mp-card-container" />
              ) : (
                <div className="payment-empty">
                  <CreditCard aria-hidden="true" size={26} />
                  <strong>Checkout pendiente</strong>
                  <p>Agrega VITE_MERCADO_PAGO_PUBLIC_KEY y VITE_PAYMENTS_API_URL para activar tarjeta.</p>
                </div>
              )}
            </div>
          ) : (
            <form className="yape-form" onSubmit={submitYapePayment}>
              <label>
                Celular Yape
                <input
                  className="yape-phone-input"
                  inputMode="tel"
                  maxLength={9}
                  onChange={(event) =>
                    setYapeDraft({
                      ...yapeDraft,
                      phoneNumber: event.target.value.replace(/\D/g, "").slice(0, 9),
                    })
                  }
                  placeholder="999999999"
                  value={yapeDraft.phoneNumber}
                />
              </label>
              <div className="yape-code-field">
                <span>Codigo de aprobacion</span>
                <OtpInputBoxes
                  onChange={(otp) => setYapeDraft({ ...yapeDraft, otp })}
                  value={yapeDraft.otp}
                />
              </div>
              <button className="plan-cta" disabled={busy === "payment-yape"} type="submit">
                Pagar con Yape
              </button>
            </form>
          )}

          {checkoutStatus && checkoutStatus.startsWith("WORKER_OFFLINE") ? (
            <div className="payment-status-alert" role="alert">
              <strong>⚠ Servidor de pagos no disponible</strong>
              <p>{checkoutStatus.replace("WORKER_OFFLINE: ", "")}</p>
              <p>
                Local: <code>npm run worker:dev</code> — Produccion: verifica secretos en Cloudflare.
              </p>
            </div>
          ) : (
            <p className="payment-status" aria-live="polite">
              {checkoutStatus || "Checkout listo."}
            </p>
          )}
        </section>
      </div>
    );
  }

  function renderPlansPage() {
    const renderPlansHero = () => (
      <div className="plans-page-hero">
        <span>Planes InfraBIM</span>
        <h1>Los mejores proyectos empiezan aqui</h1>
        <p>Todo lo que necesitas, directamente en Revit, Firestore y Google Drive.</p>
      </div>
    );

    if (dbLoading.plans) {
      return (
        <section className="plans-page">
          {renderPlansHero()}
          {renderPricingSkeletonCards()}
        </section>
      );
    }

    if (!paymentPlansReady && paymentPlansError) {
      return (
        <section className="plans-page">
          {renderPlansHero()}
          {renderDatabaseMessage(
            "Precios no disponibles",
            "No se pudieron cargar los precios reales desde Firestore.",
            () => void refreshPaymentPlans(),
          )}
        </section>
      );
    }

    const professionalPlan = paymentPlans.profesional;
    const studentPlan = paymentPlans.estudiante;
    const professionalAmount = professionalPlan.prices[billingCycle];
    const studentAmount = studentPlan.prices[billingCycle];
    const professionalPrice = formatMoney(professionalAmount);
    const studentPrice = formatMoney(studentAmount);
    const studentBasePrice = formatMoney(professionalAmount);
    const studentDiscount =
      professionalAmount > studentAmount ? Math.round(100 - (studentAmount / professionalAmount) * 100) : 0;
    const paidBenefits = [
      "Plugin para Revit",
      "Mas de 9,000 familias disponibles al instante",
      "25 familias nuevas cada semana, hasta 1,300 al ano + colecciones extra",
      "Productos de fabricantes nacionales e internacionales",
      "Materiales con texturas listas para renderizar",
      "Sugerencias inteligentes de elementos relacionados",
      "Equipos con permisos modulares por rol",
    ];

    return (
      <section className="plans-page">
        {renderPlansHero()}

        <div className="pricing-grid" aria-label="Planes disponibles">
          <article className="pricing-card free-plan">
            <div className="pricing-card-head">
              <span className="plan-icon">
                <Download aria-hidden="true" size={21} />
              </span>
              <div>
                <h2>Gratis</h2>
                <p>Para explorar el catalogo y probar el flujo BIM.</p>
              </div>
            </div>

            <div className="free-price">S/ 0</div>
            <h3>Beneficios:</h3>
            {renderPlanBenefits([
              "Plugin para Revit",
              "Acceso limitado a familias gratuitas de InfraBIM",
              "Productos de fabricantes nacionales e internacionales",
              "Materiales con texturas listas para renderizar",
            ])}

            <button className="plan-cta secondary" onClick={() => scrollTo("plugin")} type="button">
              Descargar el plugin
              <Download aria-hidden="true" size={16} />
            </button>
          </article>

          <article className="pricing-card featured-plan">
            <span className="popular-badge">
              Popular
              <Crown aria-hidden="true" size={14} />
            </span>
            <div className="pricing-card-head">
              <span className="plan-icon">
                <ShieldCheck aria-hidden="true" size={22} />
              </span>
              <div>
                <h2>{professionalPlan.label}</h2>
                <p>{professionalPlan.description}</p>
              </div>
            </div>

            <div className="price-row">
              <strong>{professionalPrice}</strong>
              <span>Usuario/Mes</span>
            </div>
            {renderBillingToggle()}

            <h3>Beneficios:</h3>
            {renderPlanBenefits(paidBenefits)}

            <div className="plan-actions">
              <button className="plan-cta" onClick={() => startCheckout("profesional", "card")} type="button">
                Suscribirme
                <CreditCard aria-hidden="true" size={16} />
              </button>
              <button className="plan-cta secondary" onClick={() => startCheckout("profesional", "yape")} type="button">
                Pagar con Yape
                <Smartphone aria-hidden="true" size={16} />
              </button>
            </div>
          </article>

          <article className="pricing-card student-plan">
            <div className="pricing-card-head">
              <span className="plan-icon">
                <Database aria-hidden="true" size={21} />
              </span>
              <div>
                <h2>{studentPlan.label}</h2>
                <p>{studentPlan.description}</p>
              </div>
            </div>

            <div className="student-discount">
              <s>{studentBasePrice}</s>
              <span>{studentDiscount > 0 ? `-${studentDiscount}%` : "Edu"}</span>
            </div>
            <div className="price-row">
              <strong>{studentPrice}</strong>
              <span>Usuario/Mes</span>
            </div>
            {renderBillingToggle()}

            <h3>Beneficios:</h3>
            {renderPlanBenefits(paidBenefits)}
            <p className="plan-note">Descuento para estudiantes. Sera necesario acreditar la elegibilidad.</p>

            <div className="plan-actions">
              <button className="plan-cta" onClick={() => startCheckout("estudiante", "card")} type="button">
                Suscribirme
                <CreditCard aria-hidden="true" size={16} />
              </button>
              <button className="plan-cta secondary" onClick={() => startCheckout("estudiante", "yape")} type="button">
                Pagar con Yape
                <Smartphone aria-hidden="true" size={16} />
              </button>
            </div>
          </article>
        </div>
        {renderPaymentModal()}
      </section>
    );
  }

  function renderSearchKindControl() {
    const ActiveIcon = catalogMeta[searchKind].Icon;

    return (
      <div className="search-kind-menu">
        <button className="search-kind" onClick={openSearchFamilies} type="button">
          <ActiveIcon aria-hidden="true" size={17} />
          {catalogMeta[searchKind].label}
          <ChevronDown aria-hidden="true" size={16} />
        </button>
        {searchMenuOpen && (
          <div className="search-kind-options">
            {searchKinds.map((kind) => {
              const OptionIcon = catalogMeta[kind].Icon;

              return (
                <button key={kind} onClick={() => chooseSearchKind(kind)} type="button">
                  <OptionIcon aria-hidden="true" size={18} />
                  {catalogMeta[kind].label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderProductCard(product: CatalogProduct) {
    const isFav = favorites.includes(product.id);
    const has3D = product.has3D || Boolean(product.glbUrl);

    return (
      <div
        className="library-card"
        key={`${product.kind}-${product.slug}`}
        onClick={() => selectProduct(product.id)}
        role="button"
        tabIndex={0}
        style={{ position: "relative", cursor: "pointer" }}
      >
        <div className="card-top-badges">
          {product.feature && <span className="fresh-badge">{product.feature}</span>}
          {has3D && (
            <span className="badge-3d-ar">
              <Sparkles size={11} /> 3D & AR
            </span>
          )}
        </div>
        {product.isPremium && (
          <span className="crown-badge icon-crown" aria-label="Premium">
            <Crown aria-hidden="true" size={18} />
          </span>
        )}
        <button
          className={`favorite-card-button ${isFav ? "is-favorite" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavoriteItem(product.id);
          }}
          type="button"
          aria-label={isFav ? "Eliminar de favoritos" : "Guardar en favoritos"}
          title={isFav ? "Eliminar de favoritos" : "Guardar en favoritos"}
        >
          <Heart size={16} fill={isFav ? "currentColor" : "none"} />
        </button>

        {renderCatalogVisual(product, "library-visual")}
        <strong>{product.name}</strong>
        <small>{product.maker}</small>

        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", margin: "0.35rem 0 0.2rem 0" }}>
          {product.formats.slice(0, 3).map((fmt) => (
            <span
              key={fmt}
              style={{
                fontSize: "0.7rem",
                background: "var(--surface-2)",
                padding: "0.15rem 0.45rem",
                borderRadius: "4px",
                fontWeight: 700,
                color: "var(--muted)",
              }}
            >
              {fmt}
            </span>
          ))}
        </div>

        <span className="card-footer">
          <i>
            <Download aria-hidden="true" size={13} />
            <span>{product.downloads}</span>
          </i>
          <b
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadOrInsert(product);
            }}
          >
            <Download aria-hidden="true" size={13} />
            {/* @ts-ignore */}
            <span>{window.chrome?.webview ? "Cargar en Revit 🔌" : "Descargar"}</span>
          </b>
        </span>
      </div>
    );
  }

  function renderAdvancedFilters() {
    return (
      <div className="advanced-filter-bar">
        <div className="advanced-filter-group">
          <Filter size={15} />
          <span>Formato:</span>
          <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}>
            <option value="Todos">Todos los formatos</option>
            <option value="RFA">.RFA (Revit Family)</option>
            <option value="RVT">.RVT (Revit Project)</option>
            <option value="IFC">.IFC (OpenBIM)</option>
            <option value="DWG">.DWG (AutoCAD)</option>
            <option value="SKP">.SKP (SketchUp)</option>
            <option value="PDF">.PDF (Ficha técnica)</option>
          </select>
        </div>

        <div className="advanced-filter-group">
          <span>Versión Revit:</span>
          <select value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)}>
            <option value="Todas">Todas las versiones</option>
            <option value="2026">Revit 2026</option>
            <option value="2025">Revit 2025</option>
            <option value="2024">Revit 2024</option>
            <option value="2023">Revit 2023</option>
          </select>
        </div>

        <div className="advanced-filter-group">
          <span>Licencia:</span>
          <select value={selectedPricing} onChange={(e) => setSelectedPricing(e.target.value)}>
            <option value="Todos">Todas</option>
            <option value="Gratis">Gratis</option>
            <option value="Pro">Premium / Pro</option>
          </select>
        </div>

        <button
          className={`filter-chip-btn ${onlyFavorites ? "is-active" : ""}`}
          onClick={() => setOnlyFavorites((prev) => !prev)}
          type="button"
        >
          <Heart size={14} fill={onlyFavorites ? "currentColor" : "none"} />
          Mis Favoritos ({favorites.length})
        </button>

        {(selectedFormat !== "Todos" || selectedVersion !== "Todas" || selectedPricing !== "Todos" || onlyFavorites) && (
          <button
            className="filter-chip-btn"
            onClick={() => {
              setSelectedFormat("Todos");
              setSelectedVersion("Todas");
              setSelectedPricing("Todos");
              setOnlyFavorites(false);
            }}
            type="button"
            style={{ color: "var(--terracotta)" }}
          >
            Limpiar filtros ✕
          </button>
        )}
      </div>
    );
  }

  function renderCatalogListPage() {
    const kind = activeRouteKind ?? "familias";
    const meta = catalogMeta[kind];
    const PageIcon = meta.Icon;

    return (
      <section className="families-page catalog-route-page" id={kind}>
        <div className="breadcrumb">Inicio / {meta.label}</div>
        <div className="list-heading">
          <div>
            <span className="route-eyebrow">
              <PageIcon aria-hidden="true" size={18} />
              {meta.singular}
            </span>
            <h2>
              {dbLoading.catalog
                ? renderSkeletonLine("skeleton-count")
                : `${filteredProducts.length.toLocaleString("es-PE")} resultados`}
            </h2>
            <p>{meta.description}</p>
          </div>
          <button onClick={toggleSortMode} type="button">
            {sortMode === "recent" ? "Recientes" : "Populares"}
            <ChevronDown aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="filter-row">
          <span>Filtrar por</span>
          <button onClick={() => setFilter("Todos")} type="button">
            <Crown aria-hidden="true" size={16} />
            Recurso
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          <button onClick={() => navigateTo("/marcas")} type="button">
            <Factory aria-hidden="true" size={16} />
            Fabricantes
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          <button onClick={toggleSortMode} type="button">
            <SlidersHorizontal aria-hidden="true" size={16} />
            Avanzado
            <ChevronDown aria-hidden="true" size={16} />
          </button>
        </div>

        {renderAdvancedFilters()}

        {dbLoading.catalog ? (
          <div className="family-grid">{renderCatalogCardSkeletons(8)}</div>
        ) : filteredProducts.length > 0 ? (
          <div className="family-grid">
            {filteredProducts.map((product) => renderProductCard(product))}
          </div>
        ) : (
          renderDatabaseMessage(
            "Sin recursos publicados",
            catalogError || "Firestore no devolvio recursos para esta busqueda o filtro seleccionado.",
            () => void refreshCatalogItems(),
          )
        )}
      </section>
    );
  }

  function renderCatalogDetailPage() {
    if (dbLoading.catalog) {
      return (
        <section className="detail-section catalog-detail-page" id="detalle" aria-busy="true">
          <div className="detail-visual detail-skeleton-visual">
            <span className="skeleton-block" />
          </div>
          <div className="detail-copy">
            {renderSkeletonLine("skeleton-chip")}
            <div className="detail-title">
              <div>
                {renderSkeletonLine("skeleton-route")}
                {renderSkeletonLine("skeleton-detail-title")}
                {renderSkeletonLine("skeleton-short")}
              </div>
              {renderSkeletonLine("skeleton-button")}
            </div>
            <div className="meta-pills skeleton-meta">
              {renderSkeletonLine("skeleton-chip")}
              {renderSkeletonLine("skeleton-chip")}
              {renderSkeletonLine("skeleton-chip")}
            </div>
            {renderSkeletonLine("skeleton-title")}
            {renderSkeletonLine("skeleton-paragraph")}
            {renderSkeletonLine("skeleton-paragraph short")}
            <div className="technical-grid">
              {Array.from({ length: 4 }, (_, index) => (
                <span className="skeleton-tech" key={`detail-tech-skeleton-${index}`} />
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (!routeCatalogItem) {
      return (
        <section className="families-page catalog-route-page">
          <div className="breadcrumb">Inicio / Catalogo</div>
          <div className="empty-route">
            <PackagePlus aria-hidden="true" size={34} />
            <h2>Recurso no encontrado</h2>
            <p>Puede estar pendiente de publicarse en Firestore o la ruta no existe.</p>
            <button onClick={goToAdmin} type="button">
              Crear recurso
            </button>
          </div>
        </section>
      );
    }

    const DetailIcon = catalogMeta[routeCatalogItem.kind].Icon;
    const has3dModel = Boolean(routeCatalogItem.glbUrl || routeCatalogItem.has3D);

    return (
      <>
        <section className="detail-section catalog-detail-page" id="detalle">
          <div className="detail-visual">
            {routeCatalogItem.isPremium && (
              <span className="crown-badge large icon-crown" aria-label="Premium">
                <Crown aria-hidden="true" size={22} />
              </span>
            )}

            {has3dModel && (
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <button
                  className={`plan-cta ${mediaTab === "gallery" ? "" : "secondary"}`}
                  onClick={() => setMediaTab("gallery")}
                  style={{ padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
                  type="button"
                >
                  <Images size={15} /> Fotos ({routeCatalogItem.images?.length || 1})
                </button>
                <button
                  className={`plan-cta ${mediaTab === "3d" ? "" : "secondary"}`}
                  onClick={() => setMediaTab("3d")}
                  style={{ padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
                  type="button"
                >
                  <Sparkles size={15} /> Visor 3D & AR
                </button>
              </div>
            )}

            {mediaTab === "3d" && routeCatalogItem.glbUrl ? (
              <Model3DViewer alt={routeCatalogItem.name} glbUrl={routeCatalogItem.glbUrl} />
            ) : routeCatalogItem.images && routeCatalogItem.images.length > 0 ? (
              <ImageCarousel alt={routeCatalogItem.name} images={routeCatalogItem.images} />
            ) : (
              renderCatalogVisual(routeCatalogItem, "library-visual detail")
            )}
          </div>

          <div className="detail-copy">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="fresh-badge detail-badge">{routeCatalogItem.feature}</span>
              {has3dModel && (
                <span className="badge-3d-ar">
                  <Sparkles size={12} /> 3D & AR Disponibles
                </span>
              )}
            </div>

            <div className="detail-title">
              <div>
                <p>Inicio / {catalogMeta[routeCatalogItem.kind].label} / {routeCatalogItem.name}</p>
                <h2>{routeCatalogItem.name}</h2>
                <span>
                  <DetailIcon aria-hidden="true" size={18} />
                  {routeCatalogItem.isPremium ? "Premium" : "Gratis"}
                </span>
              </div>
              <button disabled={busy === "drive"} onClick={uploadSelectedToDrive} type="button">
                Descargar <Download aria-hidden="true" size={16} />
              </button>
            </div>

            <div className="meta-pills">
              <span>{routeCatalogItem.maker}</span>
              <span>{routeCatalogItem.category}</span>
              <span>{routeCatalogItem.formats.join(" / ") || "Ficha BIM"}</span>
              <span>{routeCatalogItem.route}</span>
            </div>

            <h3>Descripcion</h3>
            <p>{routeCatalogItem.description}</p>

            <h3>Informacion tecnica</h3>
            <div className="technical-grid">
              {(routeCatalogItem.specs.length ? routeCatalogItem.specs : ["Recurso creado en InfraBIM"]).map((spec) => (
                <span key={spec}>{spec}</span>
              ))}
            </div>

            {routeCatalogItem.driveFolderLink && (
              <div style={{ marginTop: "1rem" }}>
                <a
                  className="plan-cta secondary"
                  href={routeCatalogItem.driveFolderLink}
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", width: "fit-content" }}
                  target="_blank"
                >
                  <Folder size={16} /> Abrir carpeta en Google Drive <ExternalLink size={14} />
                </a>
              </div>
            )}

            {routeCatalogItem.attachedFiles && routeCatalogItem.attachedFiles.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3>Archivos adjuntos en Drive</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
                  {routeCatalogItem.attachedFiles.map((file) => (
                    <a
                      key={file.id}
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attached-file-chip"
                      style={{ textDecoration: "none", color: "var(--ink)" }}
                    >
                      <FileText size={14} /> {file.name} <Download size={12} style={{ marginLeft: 4 }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="detail-actions" style={{ marginTop: "1.5rem" }}>
              <button disabled={busy === "firestore"} onClick={publishSelected} type="button">
                Publicar en Firestore
              </button>
              <button disabled={busy === "favorite"} onClick={saveSelectedFavorite} type="button">
                Guardar favorito
              </button>
            </div>
          </div>
        </section>
        {renderSimilarProducts(routeCatalogItem)}
      </>
    );
  }

  function renderRoleDashboard() {
    if (!user) return null;

    type RoleAction = { icon: React.ReactNode; label: string; detail: string; onClick: () => void };

    const roleConfig: Record<string, { Icon: LucideIcon; color: string; description: string; actions: RoleAction[]; info: string }> = {
      Usuario: {
        Icon: User2,
        color: "#0f6872",
        description: "Explora el catalogo BIM, guarda favoritos y descarga recursos gratuitos.",
        info: "Tu cuenta tiene acceso de lectura al catalogo. Activa un plan Pro para desbloquear descargas ilimitadas, Drive y el plugin Revit.",
        actions: [
          { icon: <Box size={18} />, label: "Ver familias BIM", detail: "Explora el catalogo completo de objetos.", onClick: () => navigateTo("/familias") },
          { icon: <Star size={18} />, label: "Mis favoritos", detail: "Objetos que guardaste para proyectos.", onClick: () => saveSelectedFavorite() },
          { icon: <CreditCard size={18} />, label: "Ver planes", detail: "Desbloquea descargas ilimitadas y Drive.", onClick: () => goToPlans() },
          { icon: <Download size={18} />, label: "Descargar plugin", detail: "Plugin gratuito para Revit 2024-2026.", onClick: () => scrollTo("plugin") },
        ],
      },
      "Creador BIM": {
        Icon: Wrench,
        color: "#d96f3d",
        description: "Publica familias, materiales y colecciones en el catalogo de InfraBIM.",
        info: "Como Creador BIM tienes acceso para publicar recursos en Firestore y subir fichas a Google Drive.",
        actions: [
          { icon: <PackagePlus size={18} />, label: "Crear recurso", detail: "Publica una familia, material o coleccion.", onClick: () => goToAdmin() },
          { icon: <UploadCloud size={18} />, label: "Subir a Drive", detail: "Vincula una ficha tecnica a tu objeto BIM.", onClick: () => uploadSelectedToDrive() },
          { icon: <Box size={18} />, label: "Ver familias", detail: "Revisa el catalogo actual.", onClick: () => navigateTo("/familias") },
          { icon: <Images size={18} />, label: "Galeria", detail: "Publica renders y previsualizaciones.", onClick: () => navigateTo("/galeria") },
        ],
      },
      Fabricante: {
        Icon: Factory,
        color: "#87a878",
        description: "Gestiona el catalogo de tu marca, analitica comercial y pagina de fabricante.",
        info: "Como Fabricante puedes publicar productos con ficha tecnica, imagenes y datos BIM vinculados a tu marca.",
        actions: [
          { icon: <Factory size={18} />, label: "Mi pagina de marca", detail: "Actualiza tu perfil de fabricante.", onClick: () => navigateTo("/marcas") },
          { icon: <PackagePlus size={18} />, label: "Publicar producto", detail: "Sube un producto BIM al catalogo.", onClick: () => goToAdmin() },
          { icon: <UploadCloud size={18} />, label: "Subir ficha tecnica", detail: "Vincula documentos a tus productos.", onClick: () => uploadSelectedToDrive() },
          { icon: <Database size={18} />, label: "Ver mis archivos", detail: `${driveFiles.length} archivos en Drive.`, onClick: () => uploadSelectedToDrive() },
        ],
      },
      Empresa: {
        Icon: Briefcase,
        color: "#d8a323",
        description: "Organiza proyectos, colecciones internas y la biblioteca BIM de tu equipo.",
        info: "Como Empresa tienes acceso a gestionar proyectos y colecciones. Comparte recursos con tu equipo y mantén un registro en Drive.",
        actions: [
          { icon: <FolderKanban size={18} />, label: "Mis proyectos", detail: "Gestiona expedientes BIM activos.", onClick: () => navigateTo("/proyectos") },
          { icon: <Boxes size={18} />, label: "Colecciones", detail: "Biblioteca interna de tu empresa.", onClick: () => navigateTo("/colecciones") },
          { icon: <UploadCloud size={18} />, label: "Subir a Drive", detail: "Respaldo de fichas y modelos.", onClick: () => uploadSelectedToDrive() },
          { icon: <Box size={18} />, label: "Catalogo BIM", detail: "Busca familias para tus proyectos.", onClick: () => navigateTo("/familias") },
        ],
      },
      Instructor: {
        Icon: GraduationCap,
        color: "#6f7779",
        description: "Publica contenido educativo, recursos descargables y materiales de curso.",
        info: "Como Instructor puedes subir recursos educativos a Drive y publicar materiales en la galeria de InfraBIM.",
        actions: [
          { icon: <BookOpen size={18} />, label: "Publicar material", detail: "Sube un recurso educativo BIM.", onClick: () => goToAdmin() },
          { icon: <Images size={18} />, label: "Galeria", detail: "Casos de uso y renders de clase.", onClick: () => navigateTo("/galeria") },
          { icon: <UploadCloud size={18} />, label: "Subir a Drive", detail: "Archivos y documentos del curso.", onClick: () => uploadSelectedToDrive() },
          { icon: <Box size={18} />, label: "Biblioteca", detail: "Familias gratuitas para practicar.", onClick: () => navigateTo("/familias") },
        ],
      },
    };

    const config = roleConfig[userRole] ?? roleConfig.Usuario;
    const RoleIcon = config.Icon;

    return (
      <div className="role-dashboard">
        <div className="role-dashboard-hero">
          <div className="role-avatar" style={{ background: `${config.color}18`, color: config.color }}>
            <RoleIcon size={24} />
          </div>
          <div>
            <strong>{user.displayName || user.email || "Usuario InfraBIM"}</strong>
            <p>{config.description}</p>
            <span className="role-badge" style={{ background: `${config.color}18`, color: config.color }}>
              {userRole}
            </span>
          </div>
        </div>

        <div className="role-info-box">{config.info}</div>

        <h3 style={{ fontSize: "0.88rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.85rem" }}>
          Acciones rapidas
        </h3>
        <div className="role-quick-actions">
          {config.actions.map((action) => (
            <button className="role-action-card" key={action.label} onClick={action.onClick} type="button">
              <span className="action-icon" style={{ background: `${config.color}18`, color: config.color }}>
                {action.icon}
              </span>
              <strong>{action.label}</strong>
              <small>{action.detail}</small>
            </button>
          ))}
        </div>

        <div className="role-dashboard-footer">
          <button onClick={() => navigateTo("/")} type="button">Ir al catalogo</button>
          <button onClick={goToPlans} type="button">Ver planes</button>
          <button onClick={disconnect} type="button">Cerrar sesion</button>
        </div>
      </div>
    );
  }

  function renderMasterOptionsModal() {
    if (!masterModalOpen) return null;

    const tabs: { key: keyof MasterOptions; label: string }[] = [
      { key: "makers", label: "Fabricante / Marca" },
      { key: "categories", label: "Categorías" },
      { key: "disciplines", label: "Disciplinas" },
      { key: "countries", label: "Países" },
      { key: "formats", label: "Formatos" },
      { key: "versions", label: "Versiones" },
      { key: "tags", label: "Etiquetas" },
      { key: "specs", label: "Specs" },
      { key: "statuses", label: "Estado" },
    ];

    const currentList = masterOptions[masterActiveTab] || [];

    return (
      <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}>
        <div className="modal-card master-options-modal" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "16px", padding: "1.5rem", maxWidth: "680px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SlidersHorizontal size={18} /> Gestionar Listas Desplegables
            </h3>
            <button onClick={() => setMasterModalOpen(false)} type="button" style={{ background: "none", border: "none", color: "var(--ink)", cursor: "pointer", padding: "0.3rem" }}>
              <X size={20} />
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.5rem 0 1rem 0" }}>
            Administra las opciones disponibles en los desplegables. Puedes agregar nuevas opciones, editar las existentes o eliminar las obsoletas.
          </p>

          {/* Sub-pestañas de Categorías de Opciones */}
          <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMasterActiveTab(tab.key)}
                type="button"
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "999px",
                  border: "1px solid var(--line)",
                  background: masterActiveTab === tab.key ? "var(--accent-gradient)" : "var(--surface-2)",
                  color: masterActiveTab === tab.key ? "#fff" : "var(--ink)",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label} ({masterOptions[tab.key]?.length || 0})
              </button>
            ))}
          </div>

          {/* Formulario para agregar una opción */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addMasterOption(masterActiveTab, newMasterOptionInput);
              setNewMasterOptionInput("");
            }}
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
          >
            <input
              placeholder={`Nueva opción para ${tabs.find((t) => t.key === masterActiveTab)?.label}...`}
              value={newMasterOptionInput}
              onChange={(e) => setNewMasterOptionInput(e.target.value)}
              style={{ flex: 1, padding: "0.5rem 0.8rem", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)", fontSize: "0.85rem" }}
            />
            <button type="submit" style={{ padding: "0.5rem 1rem", borderRadius: "8px", background: "var(--accent-gradient)", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Plus size={16} /> Agregar
            </button>
          </form>

          {/* Lista de Opciones Registradas */}
          <div style={{ maxHeight: "280px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {currentList.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", textAlign: "center", padding: "1rem" }}>No hay opciones en esta lista.</p>
            ) : (
              currentList.map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.45rem 0.8rem",
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{item}</span>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      onClick={() => editMasterOption(masterActiveTab, item)}
                      type="button"
                      style={{ background: "none", border: "none", color: "var(--ink)", cursor: "pointer", padding: "0.2rem" }}
                      title="Editar"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => deleteMasterOption(masterActiveTab, item)}
                      type="button"
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: "0.2rem" }}
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderBulkPreparingModal() {
    if (!bulkPreparingOpen) return null;

    return (
      <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(6px)" }}>
        <div className="modal-card bulk-preparing-modal" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "16px", padding: "1.5rem", width: "min(440px, 92vw)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.9rem", boxShadow: "var(--shadow)", textAlign: "center" }}>
          <div className="bulk-upload-orbit bulk-upload-orbit-large" aria-hidden="true">
            <span />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Preparando carga a Google Drive</h3>
            <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", fontSize: "0.86rem" }}>
              {bulkPreparingMessage || "Leyendo carpetas y preparando archivos..."}
            </p>
          </div>
          <div className="bulk-indeterminate-bar" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    );
  }
  function renderBulkProgressModal() {
    if (!bulkModalOpen) return null;

    const completedCount = bulkProgressList.filter((item) => item.status === "completed").length;
    const errorCount = bulkProgressList.filter((item) => item.status === "error").length;
    const uploadingItem = bulkProgressList.find((item) => item.status === "uploading");
    const isFinished = (completedCount + errorCount) === bulkProgressList.length && bulkProgressList.length > 0;
    const hasErrors = errorCount > 0;
    const totalBytes = bulkProgressList.reduce((sum, item) => sum + (item.totalBytes || 0), 0);
    const uploadedBytes = bulkProgressList.reduce((sum, item) => sum + Math.min(item.uploadedBytes || 0, item.totalBytes || 0), 0);
    const overallLabel = isFinished
      ? hasErrors
        ? "Finalizada con errores"
        : "Finalizada"
      : uploadingItem
        ? "Subiendo " + uploadingItem.cleanName
        : "Preparando subida";

    const renderFolderRow = (item: BulkFolderProgressItem, idx: number) => {
      const itemPercent = item.status === "completed"
        ? 100
        : item.status === "pending"
          ? 0
          : Math.max(0, Math.min(99, item.progress || 0));
      const rowTone = item.status === "completed"
        ? "#10b981"
        : item.status === "error"
          ? "#ef4444"
          : "var(--accent)";

      return (
        <div
          key={item.id}
          className={item.status === "uploading" ? "bulk-upload-row-active bulk-upload-folder-row" : "bulk-upload-folder-row"}
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "8px",
            background: item.status === "uploading" ? "rgba(15, 104, 114, 0.08)" : "var(--surface-2)",
            border: item.status === "completed"
              ? "1px solid rgba(34, 197, 94, 0.4)"
              : item.status === "uploading"
                ? "1px solid var(--accent)"
                : item.status === "error"
                  ? "1px solid rgba(239, 68, 68, 0.4)"
                  : "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: "0.55rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.65rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
              <Folder size={16} style={{ color: rowTone, flex: "0 0 auto" }} />
              <span className="bulk-folder-name">
                [{idx + 1}/{bulkProgressList.length}] {item.cleanName}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flex: "0 0 auto" }}>
              {item.status === "uploading" && <span className="bulk-mini-spinner" aria-hidden="true" />}
              <span className="bulk-folder-percent" style={{ color: rowTone }}>{itemPercent}%</span>
            </div>
          </div>

          <div className="bulk-folder-progress-track" aria-hidden="true">
            <div
              className={item.status === "uploading" ? "bulk-folder-progress-fill is-animated" : "bulk-folder-progress-fill"}
              style={{
                width: itemPercent + "%",
                background: item.status === "error" ? "#ef4444" : item.status === "completed" ? "#10b981" : "var(--accent-gradient)",
              }}
            />
          </div>

          <div className="bulk-folder-meta-line">
            <span>{item.currentStep}</span>
            <span>{item.processedFiles}/{item.fileCount} archivos · {formatBulkBytes(item.uploadedBytes || 0)} / {formatBulkBytes(item.totalBytes || 0)}</span>
          </div>

          {item.driveFolderLink && (
            <a
              href={item.driveFolderLink}
              target="_blank"
              rel="noreferrer"
              className="bulk-drive-link"
            >
              <Folder size={13} /> Abrir subcarpeta en Google Drive
            </a>
          )}
        </div>
      );
    };

    if (bulkProgressCollapsed) {
      return (
        <div className="bulk-progress-floating" role="status" aria-live="polite">
          <button
            type="button"
            className="bulk-floating-main"
            onClick={() => setBulkProgressCollapsed(false)}
            title="Expandir progreso de carga masiva"
          >
            <div className="bulk-upload-orbit" aria-hidden="true"><span /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong>{overallLabel}</strong>
              <span>{completedCount}/{bulkProgressList.length} carpetas · {bulkOverallProgress}%</span>
              <div className="bulk-floating-progress-track" aria-hidden="true">
                <div style={{ width: bulkOverallProgress + "%" }} />
              </div>
            </div>
            <ChevronRight size={18} />
          </button>
          {isFinished && (
            <button
              type="button"
              className="bulk-floating-close"
              onClick={() => setBulkModalOpen(false)}
              title="Cerrar progreso"
            >
              <X size={16} />
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="modal-overlay bulk-progress-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(6px)" }}>
        <div className="modal-card bulk-progress-modal" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "12px", padding: "1.2rem", maxWidth: "920px", width: "94%", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0 }}>
              <FolderKanban size={22} style={{ color: "var(--accent)", flex: "0 0 auto" }} />
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Carga masiva a Google Drive</h3>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {overallLabel} · {bulkProgressList.length} subcarpetas · {formatBulkBytes(uploadedBytes)} / {formatBulkBytes(totalBytes)}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <button
                onClick={() => setBulkProgressCollapsed(true)}
                type="button"
                className="icon-action-button"
                title="Contraer progreso"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", cursor: "pointer", padding: "0.45rem", borderRadius: 8, display: "inline-flex" }}
              >
                <ChevronDown size={18} />
              </button>
              {isFinished && (
                <button
                  onClick={() => setBulkModalOpen(false)}
                  type="button"
                  className="icon-action-button"
                  title="Cerrar progreso"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", cursor: "pointer", padding: "0.45rem", borderRadius: 8, display: "inline-flex" }}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {!isFinished && (
            <div className="bulk-upload-activity" role="status" aria-live="polite">
              <div className="bulk-upload-orbit" aria-hidden="true">
                <span />
              </div>
              <div>
                <strong>Subida activa a Google Drive</strong>
                <span>{uploadingItem ? uploadingItem.currentStep : "Preparando carpetas y archivos..."}</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, gap: "0.8rem" }}>
              <span>Progreso global ({completedCount}/{bulkProgressList.length} completadas{errorCount > 0 ? ", " + errorCount + " con error" : ""})</span>
              <span>{bulkOverallProgress}%</span>
            </div>
            <div className="bulk-global-progress-track" aria-hidden="true">
              <div
                className={!isFinished ? "bulk-progress-bar-fill is-animated" : "bulk-progress-bar-fill"}
                style={{
                  width: bulkOverallProgress + "%",
                  background: hasErrors && completedCount === 0 ? "#ef4444" : "var(--accent-gradient)",
                }}
              />
            </div>
          </div>

          <div className="bulk-progress-list">
            {bulkProgressList.map((item, idx) => renderFolderRow(item, idx))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--line)", flexWrap: "wrap", gap: "0.6rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              {isFinished
                ? completedCount === bulkProgressList.length
                  ? "Carga masiva finalizada exitosamente."
                  : "Carga masiva finalizada con " + errorCount + " error(es)."
                : "Puedes contraer esta ventana; la subida seguira activa."}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {hasErrors && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!auth) return;
                    try {
                      const res = await signInWithPopup(auth, googleProvider);
                      const cred = GoogleAuthProvider.credentialFromResult(res);
                      const freshToken = cred?.accessToken || "";
                      if (freshToken) {
                        setDriveToken(freshToken);
                        sessionStorage.setItem("infrabim_drive_token", freshToken);
                        showToast("Google Drive reconectado exitosamente. Reintentando...", "success");
                        const remainingItems = bulkSelectionItems.filter((i) => {
                          const prog = bulkProgressList.find((p) => p.cleanName === i.cleanName);
                          return !prog || prog.status === "error" || prog.status === "pending";
                        });
                        if (remainingItems.length > 0) {
                          await startUploadingSelectedFolders(remainingItems, freshToken);
                        }
                      }
                    } catch (err: any) {
                      alert("Error al reconectar Google Drive: " + (err.message || err));
                    }
                  }}
                  style={{
                    padding: "0.5rem 0.85rem",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <UploadCloud size={14} /> Reintentar errores
                </button>
              )}
              {isFinished && (
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  style={{
                    padding: "0.5rem 0.85rem",
                    borderRadius: 8,
                    background: "var(--accent)",
                    color: "white",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  function renderBulkSelectionModal() {
    if (!bulkSelectionModalOpen) return null;

    const selectedCount = bulkSelectionItems.filter((i) => i.selected).length;
    const totalFilesCount = bulkSelectionItems
      .filter((i) => i.selected)
      .reduce((acc, i) => acc + i.fileCount, 0);

    const allSelected = selectedCount === bulkSelectionItems.length && bulkSelectionItems.length > 0;

    function toggleSelectAll() {
      const nextState = !allSelected;
      setBulkSelectionItems((prev) => prev.map((item) => ({ ...item, selected: nextState })));
    }

    function toggleItem(id: string) {
      setBulkSelectionItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
      );
    }

    return (
      <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(6px)" }}>
        <div className="modal-card bulk-selection-modal" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "16px", padding: "1.5rem", maxWidth: "820px", width: "94%", maxHeight: "88vh", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "var(--shadow)" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FolderKanban size={22} style={{ color: "var(--accent)" }} />
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Seleccionar Carpetas a Subir</h3>
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Se detectaron {bulkSelectionItems.length} carpetas principales. Marca las que deseas subir a Google Drive.
                </span>
              </div>
            </div>
            <button onClick={() => setBulkSelectionModalOpen(false)} type="button" style={{ background: "none", border: "none", color: "var(--ink)", cursor: "pointer", padding: "0.3rem" }}>
              <X size={22} />
            </button>
          </div>

          {/* Tarjeta de Estado de Conexión Google Drive */}
          <div style={{ padding: "0.6rem 0.8rem", borderRadius: "10px", background: driveToken ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)", border: driveToken ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.83rem" }}>
              {driveToken ? (
                <span style={{ color: "#10b981", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  🟢 Conectado a Google Drive (OAuth Activo)
                </span>
              ) : (
                <span style={{ color: "#ef4444", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  ⚠️ Conexión a Google Drive Requerida antes de subir
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!auth) return;
                try {
                  const res = await signInWithPopup(auth, googleProvider);
                  const cred = GoogleAuthProvider.credentialFromResult(res);
                  if (cred?.accessToken) {
                    setDriveToken(cred.accessToken);
                    showToast("Google Drive autorizado exitosamente", "success");
                  }
                } catch (err: any) {
                  alert(`Error al conectar Google Drive: ${err.message || err}`);
                }
              }}
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: 6,
                background: driveToken ? "var(--surface-2)" : "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: driveToken ? "var(--ink)" : "#fff",
                border: driveToken ? "1px solid var(--line)" : "none",
                fontWeight: 700,
                fontSize: "0.78rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem"
              }}
            >
              <Crown size={14} /> {driveToken ? "Reconectar / Cambiar Cuenta" : "Autorizar Google Drive (1-Click)"}
            </button>
          </div>

          {/* Bar de Controles y Selección Rápida */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--surface-2)", borderRadius: "10px", border: "1px solid var(--line)" }}>
            <button
              type="button"
              onClick={toggleSelectAll}
              style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <CheckSquare size={16} />
              {allSelected ? "Deseleccionar Todas" : "Seleccionar Todas"}
            </button>
            <span style={{ fontSize: "0.83rem", fontWeight: 700, color: "var(--ink)" }}>
              {selectedCount} de {bulkSelectionItems.length} carpetas marcadas ({totalFilesCount} archivos)
            </span>
          </div>

          {/* Lista de Subcarpetas Detectadas con Checkboxes */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", paddingRight: "0.2rem" }}>
            {bulkSelectionItems.map((item, idx) => (
              <label
                key={item.id}
                style={{
                  padding: "0.75rem 0.9rem",
                  borderRadius: "10px",
                  background: item.selected ? "rgba(15, 104, 114, 0.08)" : "var(--surface-2)",
                  border: item.selected ? "1px solid var(--accent)" : "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  gap: "0.8rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItem(item.id)}
                    style={{ width: "18px", height: "18px", accentColor: "var(--accent)", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Folder size={15} style={{ color: "var(--accent)" }} />
                      <span>[{idx + 1}] {item.cleanName}</span>
                    </div>
                    <span style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                      Ruta origen: <code>{item.rootPath}</code>
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", background: "var(--surface)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 4, color: "var(--muted)" }}>
                    {item.category} · {item.maker}
                  </span>
                  <span style={{ fontSize: "0.75rem", background: "rgba(15, 104, 114, 0.15)", color: "var(--accent)", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                    {item.fileCount} archivos
                  </span>
                </div>
              </label>
            ))}
          </div>

          {/* Footer de Modal con Botón de Inicio */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.6rem", borderTop: "1px solid var(--line)", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setBulkSelectionModalOpen(false)}
              style={{ padding: "0.55rem 1rem", borderRadius: 8, background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line)", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
            >
              Cancelar
            </button>

            {!driveToken ? (
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={async () => {
                  if (!auth) return;
                  try {
                    const res = await signInWithPopup(auth, googleProvider);
                    const cred = GoogleAuthProvider.credentialFromResult(res);
                    const freshToken = cred?.accessToken || "";
                    if (freshToken) {
                      setDriveToken(freshToken);
                      showToast("Google Drive conectado exitosamente", "success");
                      await startUploadingSelectedFolders(bulkSelectionItems.filter((i) => i.selected), freshToken);
                    } else {
                      alert("No se obtuvo el token de Google Drive. Por favor reintenta.");
                    }
                  } catch (err: any) {
                    alert(`Error de conexión con Google Drive: ${err.message || err}`);
                  }
                }}
                style={{
                  padding: "0.6rem 1.4rem",
                  borderRadius: 8,
                  background: selectedCount > 0 ? "linear-gradient(135deg, #2563eb, #7c3aed)" : "var(--line)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  boxShadow: "var(--shadow)"
                }}
              >
                <Crown size={17} /> Autorizar Google Drive y Subir {selectedCount} Carpetas
              </button>
            ) : (
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={() => startUploadingSelectedFolders(bulkSelectionItems.filter((i) => i.selected), driveToken)}
                style={{
                  padding: "0.6rem 1.4rem",
                  borderRadius: 8,
                  background: selectedCount > 0 ? "var(--accent-gradient)" : "var(--line)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  boxShadow: "var(--shadow)"
                }}
              >
                <Upload size={17} /> Subir {selectedCount} Carpetas a Google Drive
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderAdminPage() {
    if (!user) {
      return (
        <section className="admin-panel admin-access-panel" id="admin">
          <div className="admin-hero">
            <div>
              <p>Panel administrador</p>
              <h2>Ingresa para administrar InfraBIM</h2>
              <span>
                El primer usuario que ingrese crea el control de acceso y queda registrado como Administrador.
              </span>
            </div>
            <dl>
              <div><dt>Ruta</dt><dd>/admin</dd></div>
              <div><dt>Auth</dt><dd>Firebase</dd></div>
              <div><dt>Permisos</dt><dd>Modulares</dd></div>
              <div><dt>Proyecto</dt><dd>{firebaseProjectId}</dd></div>
            </dl>
          </div>
          <div className="admin-actions">
            <button disabled={busy === "auth"} onClick={connectGoogleAccount} type="button">
              Ingresar con Google
            </button>
            <button onClick={() => navigateTo("/")} type="button">Volver al catalogo</button>
          </div>
        </section>
      );
    }

    // Usuarios con sesion pero sin rol Admin → dashboard de rol
    if (dbLoading.access) {
      return (
        <section className="admin-panel" id="admin" aria-busy="true">
          <div className="role-dashboard role-dashboard-skeleton">
            <div className="role-dashboard-hero">
              <span className="role-avatar skeleton-avatar" />
              <div>
                {renderSkeletonLine("skeleton-detail-title")}
                {renderSkeletonLine("skeleton-paragraph short")}
                {renderSkeletonLine("skeleton-chip")}
              </div>
            </div>
            <div className="role-info-box skeleton-info">
              {renderSkeletonLine("skeleton-paragraph")}
              {renderSkeletonLine("skeleton-paragraph short")}
            </div>
            <div className="role-quick-actions">
              {Array.from({ length: 4 }, (_, index) => (
                <article className="role-action-card role-action-skeleton" key={`role-action-skeleton-${index}`}>
                  {renderSkeletonLine("skeleton-icon-box")}
                  {renderSkeletonLine("skeleton-title")}
                  {renderSkeletonLine("skeleton-short")}
                </article>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (!isAdmin || !accessControl) {
      return (
        <section className="admin-panel" id="admin">
          {renderRoleDashboard()}
        </section>
      );
    }

    // ── Admin completo con tabs ──────────────────────────────────────
    const tabs: Array<{ key: typeof adminTab; label: string; Icon: LucideIcon }> = [
      { key: "resumen",  label: "Resumen",           Icon: LayoutDashboard },
      { key: "gestionar",label: `Gestionar (${remoteCatalogRaw.length})`, Icon: FolderKanban },
      { key: "crear",    label: catalogDraft.editingOriginalSlug ? "Editar recurso" : "Crear recurso", Icon: catalogDraft.editingOriginalSlug ? Edit3 : PackagePlus },
      { key: "precios",  label: "Precios",            Icon: CreditCard },
      { key: "permisos", label: "Roles y permisos",   Icon: ShieldCheck },
    ];

    return (
      <section className="admin-panel" id="admin">
        {/* Log bar */}
        <div className="admin-log-bar">
          <span>{connectionLog}</span>
          <button disabled={busy === "drive"} onClick={uploadSelectedToDrive} type="button">
            <FileText aria-hidden="true" size={14} style={{ marginRight: 4 }} />
            Subir ficha a Drive
          </button>
          <button onClick={disconnect} type="button">Cerrar sesion</button>
        </div>

        {/* Tab bar */}
        <div className="admin-panel-tabs" role="tablist">
          {tabs.map(({ key, label, Icon: TabIcon }) => (
            <button
              className={adminTab === key ? "tab-active" : ""}
              key={key}
              onClick={() => setAdminTab(key)}
              role="tab"
              aria-selected={adminTab === key}
              type="button"
            >
              <TabIcon aria-hidden="true" size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Resumen ─────────────────────────────────── */}
        {adminTab === "resumen" && (
          <div className="admin-tab-body create-panel">
            <div className="section-title">
              <div>
                <h3>Panel administrador</h3>
                <p>{user.displayName || user.email} · Proyecto: {firebaseProjectId}</p>
              </div>
            </div>

            <div className="admin-stat-grid">
              <div className="admin-stat-card">
                <span>Objetos Firestore</span>
                <strong>{dbLoading.objects ? renderSkeletonLine("skeleton-stat") : (remoteObjects ?? "-")}</strong>
                <small>bimObjects publicados</small>
              </div>
              <div className="admin-stat-card">
                <span>Drive</span>
                <strong>{driveFiles.length}</strong>
                <small>archivos vinculados</small>
              </div>
              <div className="admin-stat-card">
                <span>Catalogo dinamico</span>
                <strong>{dbLoading.catalog ? renderSkeletonLine("skeleton-stat") : remoteCatalog.length}</strong>
                <small>items en Firestore</small>
              </div>
              <div className="admin-stat-card">
                <span>Plan profesional</span>
                <strong>
                  {dbLoading.plans ? renderSkeletonLine("skeleton-stat") : formatMoney(paymentPlans.profesional.prices.mensual)}
                </strong>
                <small>/ mes · Mercado Pago</small>
              </div>
              <div className="admin-stat-card">
                <span>Plan estudiante</span>
                <strong>
                  {dbLoading.plans ? renderSkeletonLine("skeleton-stat") : formatMoney(paymentPlans.estudiante.prices.mensual)}
                </strong>
                <small>/ mes · con descuento</small>
              </div>
              <div className="admin-stat-card">
                <span>MP configurado</span>
                <strong>{isMercadoPagoConfigured() ? "✓" : "✗"}</strong>
                <small>{isPaymentsApiConfigured() ? "Worker activo" : "Worker pendiente"}</small>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Gestionar Recursos ───────────────────────── */}
        {adminTab === "gestionar" && (
          <div className="admin-tab-body create-panel" id="gestionar">
            <div className="section-title">
              <div>
                <h3>Gestion de recursos ({remoteCatalogRaw.length})</h3>
                <p>Edita metadatos, archiva para ocultar del catalogo publico o elimina permanentemente.</p>
              </div>
              <span><FolderKanban aria-hidden="true" size={18} /> Administrar</span>
            </div>

            <div className="gestionar-controls" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
              <input
                placeholder="Buscar recurso por nombre, marca o disciplina..."
                value={gestionarSearch}
                onChange={(e) => setGestionarSearch(e.target.value)}
                style={{ flex: "1 1 250px", padding: "0.6rem 1rem", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
              />
              <select
                value={gestionarKindFilter}
                onChange={(e) => setGestionarKindFilter(e.target.value as any)}
                style={{ padding: "0.6rem 1rem", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
              >
                <option value="todos">Todos los tipos</option>
                {(Object.keys(catalogMeta) as CatalogKind[]).map((k) => (
                  <option key={k} value={k}>{catalogMeta[k].label}</option>
                ))}
              </select>
              <select
                value={gestionarStatusFilter}
                onChange={(e) => setGestionarStatusFilter(e.target.value as any)}
                style={{ padding: "0.6rem 1rem", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)" }}
              >
                <option value="todos">Todos los estados</option>
                <option value="activos">Solo Activos</option>
                <option value="archivados">Solo Archivados</option>
              </select>
              <button
                disabled={busy === "catalog"}
                onClick={publishDemoCatalog}
                type="button"
                style={{ padding: "0.6rem 1rem", borderRadius: "8px", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600 }}
                title="Publicar catálogo inicial de demo"
              >
                <Database size={15} /> Cargar catálogo demo
              </button>
              <label
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "8px",
                  background: "var(--accent-gradient)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  boxShadow: "var(--shadow)"
                }}
                title="Cargar masivamente recursos desde un archivo de lote JSON generado por el script"
              >
                <PackagePlus size={15} /> Importar Lote JSON
                <input
                  accept=".json"
                  style={{ display: "none" }}
                  type="file"
                  onChange={handleImportBulkJson}
                />
              </label>
            </div>

            {/* Zona de Arrastre Multi-Carpeta y Selección Múltiple */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOverBulk(true);
              }}
              onDragLeave={() => setIsDragOverBulk(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragOverBulk(false);
                const items = Array.from(e.dataTransfer.items || []);
                if (items.length === 0) return;

                const scannedFiles: File[] = [];
                for (const item of items) {
                  const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                  if (entry) {
                    const files = await scanDataTransferEntry(entry);
                    scannedFiles.push(...files);
                  }
                }

                if (scannedFiles.length > 0) {
                  await processBulkFileList(scannedFiles);
                } else if (e.dataTransfer.files.length > 0) {
                  await processBulkFileList(Array.from(e.dataTransfer.files));
                }
              }}
              style={{
                border: isDragOverBulk ? "2px dashed var(--accent)" : "1px dashed var(--line)",
                borderRadius: "12px",
                padding: "1rem 1.2rem",
                background: isDragOverBulk ? "rgba(15, 104, 114, 0.12)" : "var(--surface-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                marginBottom: "1.5rem",
                transition: "all 0.2s ease",
                flexWrap: "wrap"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                <FolderKanban size={26} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: "0.92rem", display: "block" }}>
                    Carga masiva desde D:\RECURSOS INFRABIM
                  </strong>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    Selecciona la carpeta raíz; se subirán solo sus subcarpetas y se ignorarán archivos sueltos.
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                <label
                  style={{
                    padding: "0.55rem 0.9rem",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    boxShadow: "var(--shadow)"
                  }}
                  title="Seleccionar la carpeta raíz D:\RECURSOS INFRABIM"
                >
                  <Folder size={15} /> Seleccionar Carpeta Raíz
                  <input
                    type="file"
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    multiple
                    style={{ display: "none" }}
                    onChange={handleImportBulkFolderToDrive}
                  />
                </label>

                {typeof (window as any).showDirectoryPicker === "function" && (
                  <button
                    type="button"
                    onClick={handleShowDirectoryPicker}
                    style={{
                      padding: "0.55rem 0.9rem",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #059669, #10b981)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      boxShadow: "var(--shadow)"
                    }}
                    title="Elegir D:\RECURSOS INFRABIM con el selector nativo"
                  >
                    <FolderKanban size={15} /> Elegir carpeta raíz
                  </button>
                )}

                <span
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--muted)",
                    maxWidth: "220px",
                    lineHeight: 1.35,
                  }}
                >
                  Archivos sueltos en la raíz: ignorados
                </span>
              </div>
            </div>

            {dbLoading.catalog ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>Cargando catálogo...</div>
            ) : filteredAdminItems.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                No se encontraron recursos con los filtros seleccionados.
              </div>
            ) : (
              <div className="gestionar-items-list" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {filteredAdminItems.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.85rem 1.2rem",
                      background: item.isArchived ? "var(--surface-2)" : "var(--surface)",
                      border: item.isArchived ? "1px dashed var(--line)" : "1px solid var(--line)",
                      borderRadius: "12px",
                      boxShadow: "var(--shadow)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0, flex: 1 }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
                      ) : (
                        <div style={{ width: 48, height: 48, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Box size={20} style={{ color: "var(--muted)" }} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: "0.95rem", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.name}
                        </strong>
                        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {catalogMeta[item.kind]?.singular || item.kind} · {item.maker || "InfraBIM"} · {item.discipline || "General"}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      {item.isArchived ? (
                        <span style={{ fontSize: "0.75rem", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>
                          Archivado
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.75rem", background: "rgba(34, 197, 94, 0.15)", color: "#10b981", border: "1px solid rgba(34, 197, 94, 0.3)", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>
                          Activo
                        </span>
                      )}
                      {item.isPremium && (
                        <span style={{ fontSize: "0.75rem", background: "rgba(168, 85, 247, 0.15)", color: "#a855f7", border: "1px solid rgba(168, 85, 247, 0.3)", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>
                          Premium
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleEditCatalogItem(item)}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "0.45rem 0.85rem", fontSize: "0.82rem", fontWeight: 700, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                        title="Editar recurso"
                      >
                        <Edit3 size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleArchiveCatalogItem(item)}
                        disabled={busy === `archive-${item.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "0.45rem 0.85rem", fontSize: "0.82rem", fontWeight: 700, background: item.isArchived ? "var(--muted)" : "#d97706", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                        title={item.isArchived ? "Restaurar a catálogo público" : "Archivar (ocultar del catálogo)"}
                      >
                        {item.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        {item.isArchived ? "Restaurar" : "Archivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCatalogItem(item)}
                        disabled={busy === `delete-${item.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "0.45rem 0.85rem", fontSize: "0.82rem", fontWeight: 700, background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                        title="Eliminar permanentemente"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Precios ─────────────────────────────────── */}
        {adminTab === "precios" && (
          <div className="admin-tab-body create-panel pricing-admin-panel" id="precios">
            <div className="section-title">
              <div>
                <h3>Precios y configuracion de planes</h3>
                <p>Modifica tarifas, titulos y descripciones. Se publican en Firestore y el Worker los sincroniza en Mercado Pago.</p>
              </div>
              <span><CreditCard aria-hidden="true" size={18} /> Suscripciones</span>
            </div>

            {dbLoading.plans ? (
              <div className="pricing-admin-grid" aria-busy="true">
                {Array.from({ length: 2 }, (_, index) => (
                  <article className="pricing-admin-card pricing-admin-skeleton" key={`pricing-admin-skeleton-${index}`}>
                    <div className="pricing-admin-header">
                      {renderSkeletonLine("skeleton-chip")}
                      {renderSkeletonLine("skeleton-title")}
                    </div>
                    {renderSkeletonLine("skeleton-input")}
                    {renderSkeletonLine("skeleton-textarea")}
                    <div className="pricing-admin-inputs-row">
                      {renderSkeletonLine("skeleton-input")}
                      {renderSkeletonLine("skeleton-input")}
                    </div>
                    {renderSkeletonLine("skeleton-preview")}
                  </article>
                ))}
              </div>
            ) : (
              <div className="pricing-admin-grid">
                {(Object.keys(paymentPlanDraft) as PaidPlanId[]).map((planId) => (
                <article className="pricing-admin-card" key={planId}>
                  <div className="pricing-admin-header">
                    <span className="pricing-admin-badge">{planId.toUpperCase()}</span>
                    <strong>{paymentPlanDraft[planId].label || planId}</strong>
                  </div>
                  <label>
                    Nombre del plan
                    <input
                      onChange={(event) => updatePaymentPlanMeta(planId, "label", event.target.value)}
                      placeholder="Ej. Profesional"
                      type="text"
                      value={paymentPlanDraft[planId].label}
                    />
                  </label>
                  <label>
                    Descripcion
                    <textarea
                      onChange={(event) => updatePaymentPlanMeta(planId, "description", event.target.value)}
                      placeholder="Describe el publico objetivo de este plan"
                      rows={2}
                      value={paymentPlanDraft[planId].description}
                    />
                  </label>
                  <div className="pricing-admin-inputs-row">
                    <label>
                      Precio mensual (S/)
                      <input
                        min="1" step="1" type="number"
                        onChange={(event) => updatePaymentPlanDraft(planId, "mensual", event.target.value)}
                        value={paymentPlanDraft[planId].prices.mensual || ""}
                      />
                    </label>
                    <label>
                      Precio anual (S/)
                      <input
                        min="1" step="1" type="number"
                        onChange={(event) => updatePaymentPlanDraft(planId, "anual", event.target.value)}
                        value={paymentPlanDraft[planId].prices.anual || ""}
                      />
                    </label>
                  </div>
                  <div className="pricing-admin-preview">
                    <small>
                      Mensual: <strong>{formatMoney(paymentPlanDraft[planId].prices.mensual)}</strong> / mes
                    </small>
                    <small>
                      Anual: <strong>{formatMoney(paymentPlanDraft[planId].prices.anual)}</strong> / año
                    </small>
                  </div>
                </article>
                ))}
              </div>
            )}

            <div className="admin-actions pricing-admin-actions">
              <button disabled={busy === "plans" || dbLoading.plans} onClick={persistPaymentPlans} type="button">
                <CreditCard aria-hidden="true" size={17} /> Guardar precios y planes
              </button>
              <button disabled={busy === "plans" || dbLoading.plans} onClick={refreshPaymentPlans} type="button">
                Recargar desde Firestore
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Crear / Editar recurso ────────────────────────────── */}
        {adminTab === "crear" && (
          <div className="admin-tab-body create-panel" id="crear">
            <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3>{catalogDraft.editingOriginalSlug ? `Editar recurso: ${catalogDraft.name}` : "Crear recurso con ruta propia"}</h3>
                <p>Al guardar se publica en Firestore y queda disponible como /tipo/slug sin regenerar la web.</p>
              </div>
              <button
                type="button"
                onClick={() => setMasterModalOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 1rem",
                  background: "var(--accent-gradient)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  boxShadow: "var(--shadow)",
                }}
              >
                <SlidersHorizontal size={16} /> Gestionar Listas Desplegables
              </button>
            </div>

            {catalogDraft.editingOriginalSlug && (
              <div style={{ background: "rgba(15, 104, 114, 0.08)", border: "1px solid #0f6872", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>✏️ Editando recurso: <strong>{catalogDraft.name}</strong> ({catalogDraft.editingOriginalKind}/{catalogDraft.editingOriginalSlug})</span>
                <button onClick={() => setCatalogDraft({ ...emptyCatalogDraft })} type="button" style={{ background: "none", border: "1px solid #0f6872", color: "#0f6872", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "pointer", fontWeight: 600 }}>
                  Cancelar edicion (crear nuevo)
                </button>
              </div>
            )}

            <form
              className="create-grid"
              onSubmit={(event) => { event.preventDefault(); void createCatalogItem(); }}
            >
              <label>
                Tipo
                <select
                  onChange={(event) => setCatalogDraft({ ...catalogDraft, kind: event.target.value as CatalogKind })}
                  value={catalogDraft.kind}
                >
                  {(Object.keys(catalogMeta) as CatalogKind[]).map((kind) => (
                    <option key={kind} value={kind}>{catalogMeta[kind].label}</option>
                  ))}
                </select>
              </label>
              <label>Nombre
                <input onChange={(event) => setCatalogDraft({ ...catalogDraft, name: event.target.value })} placeholder="Ej. Puerta cortafuego 120min" value={catalogDraft.name} />
              </label>

              {renderDynamicSelectField("Fabricante / marca", "makers", catalogDraft.maker, (v) => setCatalogDraft({ ...catalogDraft, maker: v }))}

              {renderDynamicSelectField("Categoría", "categories", catalogDraft.category, (v) => setCatalogDraft({ ...catalogDraft, category: v }))}

              {renderDynamicSelectField("Disciplina", "disciplines", catalogDraft.discipline, (v) => setCatalogDraft({ ...catalogDraft, discipline: v }))}

              {renderDynamicSelectField("País", "countries", catalogDraft.country, (v) => setCatalogDraft({ ...catalogDraft, country: v }))}

              {renderMultiSelectField("Formatos", "formats", catalogDraft.formats, (v) => setCatalogDraft({ ...catalogDraft, formats: v }))}

              {renderMultiSelectField("Versiones", "versions", catalogDraft.versions, (v) => setCatalogDraft({ ...catalogDraft, versions: v }))}

              {renderMultiSelectField("Etiquetas", "tags", catalogDraft.tags, (v) => setCatalogDraft({ ...catalogDraft, tags: v }))}

              {renderMultiSelectField("Specs", "specs", catalogDraft.specs, (v) => setCatalogDraft({ ...catalogDraft, specs: v }))}

              <label>Imagen URL
                <input onChange={(event) => setCatalogDraft({ ...catalogDraft, imageUrl: event.target.value })} placeholder="https://..." value={catalogDraft.imageUrl} />
              </label>

              {renderDynamicSelectField("Estado", "statuses", catalogDraft.feature, (v) => setCatalogDraft({ ...catalogDraft, feature: v }))}
              <label className="wide-field">Descripcion
                <textarea onChange={(event) => setCatalogDraft({ ...catalogDraft, description: event.target.value })} placeholder="Describe el recurso y su uso BIM." value={catalogDraft.description} />
              </label>
              <label className="toggle-field">
                <input checked={catalogDraft.isPremium} onChange={(event) => setCatalogDraft({ ...catalogDraft, isPremium: event.target.checked })} type="checkbox" />
                Premium
              </label>

              {/* ── Subida de Archivos a Google Drive ── */}
              <div className="resource-upload-section">
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <UploadCloud size={18} /> Subida de Archivos a Google Drive (Subcarpeta propia bajo gin.zu.ken@gmail.com)
                </h4>

                {/* 1. Imágenes de portada con previsualización en vivo */}
                <div className="upload-group">
                  <label>
                    <Image size={16} /> Imágenes de portada (cómputo para el Carrusel)
                  </label>
                  <label className="upload-input-btn">
                    <Plus size={16} /> Seleccionar imágenes de portada
                    <input accept="image/*" multiple onChange={handleSelectCoverImages} type="file" />
                  </label>

                  {catalogDraft.coverImages.length > 0 && (
                    <div className="live-preview-grid">
                      {catalogDraft.coverImages.map((img) => (
                        <div className="preview-thumb-card" key={img.id}>
                          <img alt={img.name} src={img.previewUrl} />
                          <button
                            className="remove-btn"
                            onClick={() => handleRemoveCoverImage(img.id)}
                            type="button"
                            title="Eliminar imagen"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {catalogDraft.existingImages && catalogDraft.existingImages.length > 0 && (
                    <div style={{ marginTop: "0.6rem" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: "0.3rem" }}>
                        Imágenes registradas en Google Drive:
                      </span>
                      <div className="live-preview-grid">
                        {catalogDraft.existingImages.map((imgUrl, idx) => {
                          const fileIdMatch = imgUrl.match(/\/(?:d|drive-file)\/([a-zA-Z0-9_-]+)/);
                          const fileId = fileIdMatch ? fileIdMatch[1] : "";
                          return (
                            <div className="preview-thumb-card" key={idx} style={{ position: "relative" }}>
                              <img alt={`Portada ${idx + 1}`} src={imgUrl} />
                              <div style={{ position: "absolute", bottom: 4, right: 4, display: "flex", gap: 3 }}>
                                {fileId && (
                                  <button
                                    type="button"
                                    onClick={() => handleRenameExistingDriveFile(fileId, `Portada_${idx + 1}`, "image")}
                                    style={{ background: "rgba(0,0,0,0.8)", color: "#fff", border: "none", borderRadius: 4, padding: "3px 5px", cursor: "pointer" }}
                                    title="Renombrar en Google Drive"
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExistingDriveFile(fileId || imgUrl, "image", imgUrl)}
                                  style={{ background: "rgba(220,38,38,0.85)", color: "#fff", border: "none", borderRadius: 4, padding: "3px 5px", cursor: "pointer" }}
                                  title="Eliminar de Google Drive"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Modelo 3D GLB / GLTF (Opcional - 3D & Realidad Aumentada) */}
                <div className="upload-group">
                  <label>
                    <Sparkles size={16} /> Modelo 3D (.glb / .gltf) - Habilita Visor 3D y Realidad Aumentada (Opcional)
                  </label>
                  {!catalogDraft.glbFile && !catalogDraft.existingGlbUrl ? (
                    <label className="upload-input-btn">
                      <Plus size={16} /> Seleccionar archivo .glb o .gltf
                      <input accept=".glb,.gltf" onChange={handleSelectGlbFile} type="file" />
                    </label>
                  ) : catalogDraft.glbFile ? (
                    <div className="glb-file-badge">
                      <span>
                        <Sparkles size={15} style={{ marginRight: 6 }} />
                        {catalogDraft.glbFile.name} ({(catalogDraft.glbFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <button className="remove-btn" onClick={handleRemoveGlbFile} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }} type="button">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="glb-file-badge" style={{ background: "rgba(15, 104, 114, 0.12)", border: "1px solid var(--accent)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                        <Sparkles size={15} style={{ color: "var(--accent)" }} />
                        Modelo 3D vinculado en Google Drive
                      </span>
                      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                        {(() => {
                          const fileIdMatch = (catalogDraft.existingGlbUrl || "").match(/\/(?:d|drive-file)\/([a-zA-Z0-9_-]+)/);
                          const fileId = fileIdMatch ? fileIdMatch[1] : "";
                          return (
                            <>
                              {fileId && (
                                <button
                                  type="button"
                                  onClick={() => handleRenameExistingDriveFile(fileId, `${catalogDraft.name}.glb`, "glb")}
                                  style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 3 }}
                                  title="Renombrar en Google Drive"
                                >
                                  <Edit3 size={12} /> Renombrar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteExistingDriveFile(fileId || catalogDraft.existingGlbUrl || "", "glb")}
                                style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)", color: "#ef4444", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 3 }}
                                title="Eliminar de Google Drive"
                              >
                                <Trash2 size={12} /> Eliminar
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Archivos del recurso (RVT, RFA, IFC, DWG, PDF) */}
                <div className="upload-group">
                  <label>
                    <Folder size={16} /> Archivos descargables (RVT, RFA, IFC, DWG, PDF specs)
                  </label>
                  <label className="upload-input-btn">
                    <Plus size={16} /> Agregar archivos al recurso
                    <input accept=".rvt,.rfa,.ifc,.dwg,.pdf,.zip,.rar" multiple onChange={handleSelectAttachedFiles} type="file" />
                  </label>

                  {catalogDraft.attachedFiles.length > 0 && (
                    <div style={{ marginTop: "0.4rem" }}>
                      {catalogDraft.attachedFiles.map((f) => (
                        <span className="attached-file-chip" key={f.id}>
                          <FileText size={14} /> {f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)
                          <button
                            onClick={() => handleRemoveAttachedFile(f.id)}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 0 }}
                            type="button"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {catalogDraft.existingAttachedFiles && catalogDraft.existingAttachedFiles.length > 0 && (
                    <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--muted)" }}>
                        Archivos registrados en Google Drive:
                      </span>
                      {catalogDraft.existingAttachedFiles.map((f) => (
                        <div
                          key={f.id || f.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.45rem 0.8rem",
                            background: "var(--surface-2)",
                            border: "1px solid var(--line)",
                            borderRadius: "8px",
                            fontSize: "0.85rem"
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, minWidth: 0, flex: 1 }}>
                            <FileText size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                          </span>
                          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                            {f.webViewLink && (
                              <a
                                href={f.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "0.78rem", color: "var(--accent)", textDecoration: "none", fontWeight: 600, padding: "2px 6px" }}
                              >
                                Ver en Drive ↗
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRenameExistingDriveFile(f.id || "", f.name, "attached")}
                              style={{ background: "none", border: "none", color: "var(--ink)", cursor: "pointer", padding: "2px 5px" }}
                              title="Renombrar archivo en Google Drive"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExistingDriveFile(f.id || "", "attached", f)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: "2px 5px" }}
                              title="Eliminar archivo de Google Drive"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button disabled={busy === "create"} type="submit" style={{ gridColumn: "1 / -1", marginTop: "0.5rem" }}>
                <UploadCloud aria-hidden="true" size={17} /> {catalogDraft.editingOriginalSlug ? "Guardar cambios en recurso" : "Crear recurso y subir subcarpeta a Drive"}
              </button>
            </form>
          </div>
        )}

        {/* ── Tab: Permisos ─────────────────────────────────── */}
        {adminTab === "permisos" && (
          <div className="admin-tab-body create-panel" id="permisos">
            <div className="section-title">
              <div>
                <h3>Permisos por rol y modulo</h3>
                <p>Activa o desactiva capacidades para cada perfil de usuario. Haz clic en Guardar permisos para aplicar.</p>
              </div>
              <span><ShieldCheck aria-hidden="true" size={18} /> Control de acceso</span>
            </div>

            <div className="admin-layout">
              <aside className="module-list">
                <h3>Modulos del sistema</h3>
                {accessControl.modules.map((module) => (
                  <button key={module.key} type="button" style={{ cursor: "default", pointerEvents: "none" }}>
                    <strong>{module.label}</strong>
                    <small>{module.description}</small>
                  </button>
                ))}
              </aside>

              <div className="permission-matrix">
                {Object.values(accessControl.roles).map((role) => (
                  <article key={role.label}>
                    <div className="role-heading">
                      <div>
                        <strong>{role.label}</strong>
                        <span>{role.description}</span>
                      </div>
                    </div>
                    <div className="permission-grid">
                      {accessControl.modules.map((module) => {
                        const current = role.modules[module.key] ?? { enabled: false, read: false, write: false, publish: false };
                        return (
                          <div className="permission-row" key={`${role.label}-${module.key}`}>
                            <strong>{module.label}</strong>
                            {(["enabled", "read", "write", "publish"] as const).map((field) => (
                              <label key={field}>
                                <input
                                  checked={current[field]}
                                  onChange={() => togglePermission(role.label, module.key, field)}
                                  type="checkbox"
                                />
                                {field === "enabled" ? "Activo" : field === "read" ? "Leer" : field === "write" ? "Editar" : "Publicar"}
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="admin-actions" style={{ marginTop: "1.5rem" }}>
              <button disabled={busy === "access"} onClick={persistAccessControl} type="button">
                <ShieldCheck aria-hidden="true" size={17} /> Guardar permisos
              </button>
            </div>
          </div>
        )}

        {renderMasterOptionsModal()}
      </section>
    );
  }

  if (isAdminPage) {
    return (
      <main className="site-shell admin-route">
        <div className="top-strip">
          <button onClick={goToPlans} type="button">
            {"Desbloquea tu flujo BIM: 9000+ familias en un solo lugar. Ver planes ->"}
          </button>
          <button onClick={() => scrollTo("fabricantes")} type="button">
            {"Para fabricantes: publica tus productos ->"}
          </button>
        </div>

        <header className="main-header">
          <div className="header-row">
            <button className="brand-logo" onClick={() => scrollTo("inicio")} type="button">
              <span className="brand-cube" aria-hidden="true" />
              InfraBIM
            </button>

            <form
              className="header-search"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch();
              }}
            >
              {renderSearchKindControl()}
              <input
                aria-label="Buscar familias BIM"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar familias BIM, fabricantes o formatos"
                value={query}
              />
              <button className="icon-button" type="submit" aria-label="Buscar">
                <Search aria-hidden="true" size={18} />
              </button>
            </form>

            <nav className="desktop-actions" aria-label="Acciones principales">
              <button onClick={goToPlans} type="button">
                Planes
              </button>
              <button className="is-current" onClick={goToAdmin} type="button">
                Admin
              </button>
              <button
                className="login-button"
                disabled={busy === "auth"}
                onClick={user ? disconnect : connectGoogleAccount}
                type="button"
              >
                {user ? "Salir" : "Ingresar"}
              </button>
              <button
                className="theme-button"
                onClick={toggleTheme}
                type="button"
                aria-label={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
                title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button className="language-button" onClick={toggleLanguage} type="button">
                {language}
              </button>
            </nav>
          </div>

          <nav className="secondary-nav" aria-label="Navegacion del catalogo">
            {navigation.map((item) => (
              <button key={item.path} onClick={() => handleNavigation(item.path)} type="button">
                {item.label}
              </button>
            ))}
            <button onClick={() => scrollTo("plugin")} type="button">
              Plugin para Revit
            </button>
          </nav>
        </header>

        {renderAdminPage()}

        <footer className="site-footer">
          <div className="footer-grid">
            {footerGroups.map(([title, ...links]) => (
              <div key={title}>
                <h3>{title}</h3>
                {links.map((link) => (
                  <button key={link} onClick={() => handleFooterAction(link)} type="button">
                    {link}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <strong>InfraBIM</strong>
            <span>InfraBIM Copyright 2026. Todos los derechos reservados.</span>
            <button onClick={toggleLanguage} type="button">
              {language === "ES" ? "Espanol" : "English"}
            </button>
          </div>
        </footer>

        {supportOpen && (
          <aside className="support-panel" aria-live="polite">
            <strong>Soporte InfraBIM</strong>
            <span>{connectionLog}</span>
            <button onClick={user ? goToAdmin : connectGoogleAccount} type="button">
              {user ? "Abrir panel" : "Conectar Google"}
            </button>
            <button onClick={() => scrollTo("plugin")} type="button">
              Ver plugin
            </button>
          </aside>
        )}

        <button className="chat-button" onClick={openSupport} type="button" aria-label="Abrir soporte">
          ?
        </button>
      </main>
    );
  }

  if (isPlansPage) {
    return (
      <main className="site-shell plans-route">
        <div className="top-strip">
          <button onClick={goToPlans} type="button">
            {"Desbloquea tu flujo BIM: 9000+ familias en un solo lugar. Ver planes ->"}
          </button>
          <button onClick={() => navigateTo("/marcas")} type="button">
            {"Para Empresas: impulsa tus productos ->"}
          </button>
        </div>

        <header className="main-header">
          <div className="header-row">
            <button className="brand-logo" onClick={() => scrollTo("inicio")} type="button">
              <span className="brand-cube" aria-hidden="true" />
              InfraBIM
            </button>

            <form
              className="header-search"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch();
              }}
            >
              {renderSearchKindControl()}
              <input
                aria-label="Buscar recursos BIM"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar familias BIM, fabricantes o formatos"
                value={query}
              />
              <button className="icon-button" type="submit" aria-label="Buscar">
                <Search aria-hidden="true" size={18} />
              </button>
            </form>

            <nav className="desktop-actions" aria-label="Acciones principales">
              <button className="is-current" onClick={goToPlans} type="button">
                Planes
              </button>
              {isAdmin && (
                <button onClick={goToAdmin} type="button">
                  Admin
                </button>
              )}
              <button
                className="login-button"
                disabled={busy === "auth"}
                onClick={user ? disconnect : connectGoogleAccount}
                type="button"
              >
                {user ? "Salir" : "Iniciar Sesion"}
              </button>
              <button
                className="theme-button"
                onClick={toggleTheme}
                type="button"
                aria-label={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
                title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button className="language-button" onClick={toggleLanguage} type="button">
                {language}
              </button>
            </nav>
          </div>

          <nav className="secondary-nav" aria-label="Navegacion del catalogo">
            {navigation.map((item) => (
              <button key={item.path} onClick={() => handleNavigation(item.path)} type="button">
                {item.label}
              </button>
            ))}
            <button onClick={() => scrollTo("plugin")} type="button">
              Plugin para Revit
            </button>
          </nav>
        </header>

        {renderPlansPage()}

        <footer className="site-footer">
          <div className="footer-grid">
            {footerGroups.map(([title, ...links]) => (
              <div key={title}>
                <h3>{title}</h3>
                {links.map((link) => (
                  <button key={link} onClick={() => handleFooterAction(link)} type="button">
                    {link}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <strong>InfraBIM</strong>
            <span>InfraBIM Copyright 2026. Todos los derechos reservados.</span>
            <button onClick={toggleLanguage} type="button">
              {language === "ES" ? "Espanol" : "English"}
            </button>
          </div>
        </footer>

        {supportOpen && (
          <aside className="support-panel" aria-live="polite">
            <strong>Soporte InfraBIM</strong>
            <span>{connectionLog}</span>
            <button onClick={user ? goToAdmin : connectGoogleAccount} type="button">
              {user ? "Abrir panel" : "Conectar Google"}
            </button>
            <button onClick={() => scrollTo("plugin")} type="button">
              Ver plugin
            </button>
          </aside>
        )}

        <button className="chat-button" onClick={openSupport} type="button" aria-label="Abrir soporte">
          ?
        </button>
      </main>
    );
  }

  function renderPluginModeView() {
    const pluginCategories = [
      { id: "Mobiliario", label: "Mobiliario", icon: <Armchair size={14} /> },
      { id: "Puertas", label: "Puertas", icon: <DoorOpen size={14} /> },
      { id: "Ventanas", label: "Ventanas", icon: <PanelsTopLeft size={14} /> },
      { id: "Sanitarios", label: "Sanitarios", icon: <Bath size={14} /> },
      { id: "Iluminacion", label: "Iluminación", icon: <Lamp size={14} /> },
      { id: "HVAC", label: "HVAC", icon: <Fan size={14} /> },
    ];

    return (
      <main className="plugin-mode-container" data-theme={theme}>
        {/* Header Plugin (Estilo Blocks RVT con Lucide Icons) */}
        <header className="plugin-header">
          <div className="plugin-user-bar">
            <div className="plugin-user-info">
              <span className="plugin-avatar">
                {user ? (user.displayName?.charAt(0) || "U") : <User2 size={16} />}
              </span>
              <div>
                <strong>Hola, {user ? user.displayName || "Usuario" : "Bienvenido"}</strong>
                <span className="plugin-revit-badge" style={{ marginLeft: "0.4rem" }}>
                  <Layers size={11} style={{ marginRight: "0.2rem" }} />
                  Revit {detectedRevitVersion}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <button
                className="plugin-theme-toggle"
                onClick={toggleTheme}
                type="button"
                aria-label="Cambiar tema"
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              {!user ? (
                <button
                  className="plugin-login-btn"
                  onClick={connectGoogleAccount}
                  type="button"
                >
                  Ingresar
                </button>
              ) : (
                <button
                  className="plugin-logout-btn"
                  onClick={disconnect}
                  type="button"
                  title="Cerrar sesion"
                >
                  Salir
                </button>
              )}
            </div>
          </div>

          {/* Buscador Plugin */}
          <div className="plugin-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder={`Buscar recursos compatibles con Revit ${detectedRevitVersion}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Accesos Directos a Categorias con Iconos Lucide */}
          <div className="plugin-categories-strip">
            {pluginCategories.map((cat) => (
              <button
                key={cat.id}
                className={`plugin-cat-chip ${query.toLowerCase() === cat.id.toLowerCase() ? "active" : ""}`}
                onClick={() => setQuery(query.toLowerCase() === cat.id.toLowerCase() ? "" : cat.id)}
                type="button"
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* Filtros Rapidos y Selector de Modos de Visualizacion */}
        <div className="plugin-sub-bar">
          <span className="plugin-sub-count">{filteredProducts.length} familias disponibles</span>
          <div className="plugin-sub-actions">
            <button
              className={`plugin-fav-chip ${onlyFavorites ? "active" : ""}`}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              type="button"
            >
              <Heart size={13} fill={onlyFavorites ? "currentColor" : "none"} />
              Favoritos ({favorites.length})
            </button>

            {/* Selector de Modo de Visualización */}
            <div className="plugin-view-toggle-group" aria-label="Modo de visualización">
              <button
                className={`plugin-view-btn ${pluginViewMode === "grid" ? "active" : ""}`}
                onClick={() => {
                  setPluginViewMode("grid");
                  localStorage.setItem("infrabim_plugin_view_mode", "grid");
                }}
                type="button"
                title="Vista Cuadrícula Estándar"
                aria-label="Vista Cuadrícula"
              >
                <LayoutGrid size={13} />
              </button>
              <button
                className={`plugin-view-btn ${pluginViewMode === "list" ? "active" : ""}`}
                onClick={() => {
                  setPluginViewMode("list");
                  localStorage.setItem("infrabim_plugin_view_mode", "list");
                }}
                type="button"
                title="Vista Lista Horizontal"
                aria-label="Vista Lista Horizontal"
              >
                <List size={13} />
              </button>
              <button
                className={`plugin-view-btn ${pluginViewMode === "compact" ? "active" : ""}`}
                onClick={() => {
                  setPluginViewMode("compact");
                  localStorage.setItem("infrabim_plugin_view_mode", "compact");
                }}
                type="button"
                title="Vista Compacta Densa"
                aria-label="Vista Compacta"
              >
                <Grid3x3 size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Contenedor de Tarjetas con Modo Dinámico (con Skeleton animado durante carga) */}
        {dbLoading.catalog ? (
          <div className={`plugin-cards-container mode-${pluginViewMode}`}>
            {Array.from({ length: pluginViewMode === "list" ? 6 : pluginViewMode === "compact" ? 9 : 6 }, (_, idx) => (
              <div className={`plugin-skeleton-card mode-${pluginViewMode}`} key={`plugin-skel-${idx}`}>
                <div className="plugin-skeleton-thumb-box" />
                <div className="plugin-skeleton-info-box">
                  <div className="plugin-skeleton-line title" />
                  <div className="plugin-skeleton-line sub" />
                  <div className="plugin-skeleton-line button" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--muted)", fontSize: "0.88rem" }}>
            No se encontraron familias BIM para esta búsqueda en el plugin.
          </div>
        ) : (
          <div className={`plugin-cards-container mode-${pluginViewMode}`}>
            {filteredProducts.map((product) => {
              const isFav = favorites.includes(product.id);

              if (pluginViewMode === "list") {
                return (
                  <div
                    key={product.id}
                    className="plugin-card-list-row"
                    onClick={() => setSelectedPluginProduct(product)}
                  >
                    <div className="plugin-list-thumb">
                      {renderCatalogVisual(product, "plugin-visual-list")}
                    </div>
                    <div className="plugin-list-info">
                      <h4 title={product.name}>{product.name}</h4>
                      <div className="plugin-list-meta">
                        <span className="plugin-maker-tag">{product.maker || "InfraBIM"}</span>
                        <span className="plugin-fmt-chip">{product.formats[0] || "RFA"}</span>
                      </div>
                    </div>
                    <div className="plugin-list-actions">
                      <button
                        className={`plugin-card-fav-inline ${isFav ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteItem(product.id);
                        }}
                        type="button"
                        aria-label="Favorito"
                      >
                        <Heart size={13} fill={isFav ? "currentColor" : "none"} />
                      </button>
                      <button
                        className="plugin-insert-btn-compact"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadOrInsert(product);
                        }}
                        type="button"
                        title="Cargar en Revit"
                      >
                        <Download size={12} />
                        <span>Cargar</span>
                      </button>
                    </div>
                  </div>
                );
              }

              if (pluginViewMode === "compact") {
                return (
                  <div
                    key={product.id}
                    className="plugin-card-compact"
                    onClick={() => setSelectedPluginProduct(product)}
                  >
                    <button
                      className="plugin-card-fav"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteItem(product.id);
                      }}
                      type="button"
                      aria-label="Favorito"
                    >
                      <Heart size={13} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    <div className="plugin-compact-thumb">
                      {renderCatalogVisual(product, "plugin-visual-compact")}
                    </div>
                    <div className="plugin-compact-details">
                      <h4 title={product.name}>{product.name}</h4>
                      <button
                        className="plugin-insert-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadOrInsert(product);
                        }}
                        type="button"
                      >
                        <Download size={13} /> Cargar
                      </button>
                    </div>
                  </div>
                );
              }

              // Default mode "grid"
              return (
                <div
                  key={product.id}
                  className="plugin-card-grid-item"
                  onClick={() => setSelectedPluginProduct(product)}
                >
                  <button
                    className="plugin-card-fav"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteItem(product.id);
                    }}
                    type="button"
                    aria-label="Favorito"
                  >
                    <Heart size={14} fill={isFav ? "currentColor" : "none"} />
                  </button>
                  <div className="plugin-card-thumb">
                    {renderCatalogVisual(product, "plugin-visual")}
                  </div>
                  <div className="plugin-card-details">
                    <h4 title={product.name}>{product.name}</h4>
                    <div className="plugin-card-tags">
                      <span className="plugin-maker-tag">{product.maker || "InfraBIM"}</span>
                      {product.formats.slice(0, 3).map((fmt) => (
                        <span key={fmt} className="plugin-fmt-badge">{fmt}</span>
                      ))}
                    </div>
                    <button
                      className="plugin-insert-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadOrInsert(product);
                      }}
                      type="button"
                    >
                      <Download size={14} /> Cargar en Revit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Emergente con Fondo Desenfocado y Visor 3D */}
        {selectedPluginProduct && (
          <div
            className="plugin-modal-backdrop"
            onClick={() => setSelectedPluginProduct(null)}
          >
            <div
              className="plugin-modal-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Encabezado del Modal */}
              <div className="plugin-modal-header">
                <div className="plugin-modal-title-group">
                  <div className="plugin-modal-cat-chip">
                    {getCategoryIcon(selectedPluginProduct.category, selectedPluginProduct.kind)}
                    <span>{selectedPluginProduct.category || catalogMeta[selectedPluginProduct.kind]?.singular}</span>
                  </div>
                  <h3>{selectedPluginProduct.name}</h3>
                  <p className="plugin-modal-subtitle">
                    {selectedPluginProduct.maker || "InfraBIM"} • {selectedPluginProduct.discipline || "Arquitectura"}
                  </p>
                </div>
                <button
                  className="plugin-modal-close"
                  onClick={() => setSelectedPluginProduct(null)}
                  type="button"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Cuerpo del Modal: Visor 3D e Información */}
              <div className="plugin-modal-body">
                <div className="plugin-modal-viewer-box">
                  {selectedPluginProduct.glbUrl ? (
                    <Model3DViewer alt={selectedPluginProduct.name} glbUrl={selectedPluginProduct.glbUrl} />
                  ) : (
                    <div className="plugin-modal-fallback-box">
                      {renderCatalogVisual(selectedPluginProduct, "plugin-modal-visual")}
                      <div className="plugin-modal-3d-badge">
                        <Sparkles size={13} />
                        <span>Visualización 3D & BIM</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="plugin-modal-details-grid">
                  <div className="plugin-modal-pills">
                    <span className="plugin-pill">
                      <strong>Formatos:</strong> {selectedPluginProduct.formats.join(", ") || "RFA, IFC"}
                    </span>
                    <span className="plugin-pill">
                      <strong>Versión:</strong> {selectedPluginProduct.versions.join(", ") || "Revit 2020-2026"}
                    </span>
                    <span className="plugin-pill">
                      <strong>País:</strong> {selectedPluginProduct.country || "Global"}
                    </span>
                  </div>

                  {selectedPluginProduct.description && (
                    <div className="plugin-modal-desc">
                      <h4>Descripción</h4>
                      <p>{selectedPluginProduct.description}</p>
                    </div>
                  )}

                  {selectedPluginProduct.specs && selectedPluginProduct.specs.length > 0 && (
                    <div className="plugin-modal-specs">
                      <h4>Especificaciones Técnicas</h4>
                      <ul>
                        {selectedPluginProduct.specs.map((spec, idx) => (
                          <li key={idx}>
                            <CheckCircle2 size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
                            <span>{spec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Pie del Modal con Acciones */}
              <div className="plugin-modal-footer">
                <button
                  className={`plugin-modal-fav-btn ${favorites.includes(selectedPluginProduct.id) ? "active" : ""}`}
                  onClick={() => toggleFavoriteItem(selectedPluginProduct.id)}
                  type="button"
                >
                  <Heart size={14} fill={favorites.includes(selectedPluginProduct.id) ? "currentColor" : "none"} />
                  <span>{favorites.includes(selectedPluginProduct.id) ? "Favorito" : "Guardar"}</span>
                </button>

                {selectedPluginProduct.driveFolderLink && (
                  <button
                    className="plugin-modal-drive-btn"
                    onClick={() => window.open(selectedPluginProduct.driveFolderLink, "_blank")}
                    type="button"
                  >
                    <ExternalLink size={13} />
                    <span>Drive</span>
                  </button>
                )}

                <button
                  className="plugin-modal-insert-btn"
                  onClick={() => {
                    handleDownloadOrInsert(selectedPluginProduct);
                    setSelectedPluginProduct(null);
                  }}
                  type="button"
                >
                  <Download size={15} />
                  <span>Cargar en Revit</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="toast-container" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-item toast-${t.type}`}>
              {t.message}
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (isPluginMode) {
    return renderPluginModeView();
  }

  if (isCatalogListPage || isCatalogDetailPage) {
    return (
      <main className="site-shell catalog-route">
        <div className="top-strip">
          <button onClick={goToPlans} type="button">
            {"Desbloquea tu flujo BIM: 9000+ familias en un solo lugar. Ver planes ->"}
          </button>
          <button onClick={() => navigateTo("/marcas")} type="button">
            {"Para Empresas: impulsa tus productos ->"}
          </button>
        </div>

        <header className="main-header">
          <div className="header-row">
            <button className="brand-logo" onClick={() => scrollTo("inicio")} type="button">
              <span className="brand-cube" aria-hidden="true" />
              InfraBIM
            </button>

            <form
              className="header-search"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch();
              }}
            >
              {renderSearchKindControl()}
              <input
                aria-label="Buscar recursos BIM"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Buscar en ${catalogMeta[searchKind].label.toLowerCase()}`}
                value={query}
              />
              <button className="icon-button" type="submit" aria-label="Buscar">
                <Search aria-hidden="true" size={18} />
              </button>
            </form>

            <nav className="desktop-actions" aria-label="Acciones principales">
              <button onClick={goToPlans} type="button">
                Planes
              </button>
              {isAdmin && (
                <button onClick={goToAdmin} type="button">
                  Admin
                </button>
              )}
              <button
                className="login-button"
                disabled={busy === "auth"}
                onClick={user ? disconnect : connectGoogleAccount}
                type="button"
              >
                {user ? "Salir" : "Iniciar Sesion"}
              </button>
              <button
                className="theme-button"
                onClick={toggleTheme}
                type="button"
                aria-label={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
                title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button className="language-button" onClick={toggleLanguage} type="button">
                {language}
              </button>
            </nav>
          </div>

          <nav className="secondary-nav" aria-label="Navegacion del catalogo">
            {navigation.map((item) => (
              <button
                className={route === item.path ? "is-current" : ""}
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <button onClick={() => scrollTo("plugin")} type="button">
              Plugin para Revit
            </button>
          </nav>
        </header>

        {isCatalogDetailPage ? renderCatalogDetailPage() : renderCatalogListPage()}

        <footer className="site-footer">
          <div className="footer-grid">
            {footerGroups.map(([title, ...links]) => (
              <div key={title}>
                <h3>{title}</h3>
                {links.map((link) => (
                  <button key={link} onClick={() => handleFooterAction(link)} type="button">
                    {link}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <strong>InfraBIM</strong>
            <span>InfraBIM Copyright 2026. Todos los derechos reservados.</span>
            <button onClick={toggleLanguage} type="button">
              {language === "ES" ? "Espanol" : "English"}
            </button>
          </div>
        </footer>

        {supportOpen && (
          <aside className="support-panel" aria-live="polite">
            <strong>Soporte InfraBIM</strong>
            <span>{connectionLog}</span>
            <button onClick={user ? goToAdmin : connectGoogleAccount} type="button">
              {user ? "Abrir panel" : "Conectar Google"}
            </button>
            <button onClick={() => scrollTo("plugin")} type="button">
              Ver plugin
            </button>
          </aside>
        )}

        <button className="chat-button" onClick={openSupport} type="button" aria-label="Abrir soporte">
          ?
        </button>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <header className="main-header">
        <div className="header-row home-header-row">
          <button className="brand-logo" onClick={() => scrollTo("inicio")} type="button">
            <span className="brand-cube" aria-hidden="true" />
            InfraBIM
          </button>

          <nav className="home-primary-nav" aria-label="Navegacion principal">
            {navigation.map((item) => (
              <button key={item.path} onClick={() => handleNavigation(item.path)} type="button">
                {item.label}
              </button>
            ))}
            <button onClick={() => navigateTo("/galeria")} type="button">
              Mas...
            </button>
            <button className="plugin-link" onClick={() => scrollTo("plugin")} type="button">
              Plugin para Revit
            </button>
          </nav>

          <nav className="desktop-actions" aria-label="Acciones principales">
            <button onClick={goToPlans} type="button">
              Planes
            </button>
            {isAdmin && (
              <button onClick={goToAdmin} type="button">
                Admin
              </button>
            )}
            <button
              className="login-button"
              disabled={busy === "auth"}
              onClick={user ? disconnect : connectGoogleAccount}
              type="button"
            >
              {user ? "Salir" : "Iniciar Sesion"}
            </button>
            <button
              className="theme-button"
              onClick={toggleTheme}
              type="button"
              aria-label={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
              title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="language-button" onClick={toggleLanguage} type="button">
              {language}
            </button>
          </nav>
        </div>
      </header>

      <section className="hero-section" id="inicio">
        <div className="hero-copy">
          <p>Biblioteca BIM para Latinoamerica</p>
          <h1>Dale vida a tus proyectos con familias BIM listas para Revit.</h1>
          <span>
            Busca, guarda, publica y descarga objetos con metadatos tecnicos, visor 3D, Firestore y respaldo en Google Drive.
          </span>
        </div>

        <form
          className="hero-search"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          {renderSearchKindControl()}
          <input
            aria-label="Busqueda principal"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Puerta cortafuego 90 cm para hospital"
            value={query}
          />
          <button className="icon-button" type="submit" aria-label="Buscar familias">
            <Search aria-hidden="true" size={18} />
          </button>
        </form>

        <p className="common-searches">
          Busquedas comunes: <button onClick={() => setCommonSearch("lavamanos accesible")} type="button">lavamanos</button>{" "}
          <button onClick={() => setCommonSearch("ventana corrediza")} type="button">ventana</button>{" "}
          <button onClick={() => setCommonSearch("bomba MEP")} type="button">bomba MEP</button>
        </p>

        <div className="category-row" aria-label="Categorias BIM">
          {categories.map(({ label, filter: itemFilter, Icon }) => (
            <button
              className={filter === itemFilter ? "category-pill is-active" : "category-pill"}
              key={label}
              onClick={() => {
                setFilter(itemFilter);
                navigateTo("/familias");
              }}
              type="button"
            >
              <span>
                <Icon aria-hidden="true" size={20} />
              </span>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="catalog-section" id="familias">
        <div className="section-title">
          <div>
            <h2>Populares</h2>
            <p>Familias Revit mejor valoradas por usuarios de InfraBIM.</p>
          </div>
          <button onClick={() => scrollTo("detalle")} type="button">
            {"Ver detalle ->"}
          </button>
        </div>

        {dbLoading.catalog ? (
          <div className="popular-grid">{renderCatalogCardSkeletons(7, "family")}</div>
        ) : catalogItems.filter((product) => product.kind === "familias").length > 0 ? (
          <div className="popular-grid">
            {catalogItems.filter((product) => product.kind === "familias").slice(0, 7).map((product) => (
              <button className="family-card" key={product.id} onClick={() => selectProduct(product.id)} type="button">
                {renderCatalogVisual(product, "family-visual")}
                <strong>{product.name}</strong>
                <small>{product.maker}</small>
                <span className="card-footer">
                  <i>
                    <Download aria-hidden="true" size={13} />
                    <span>{product.downloads}</span>
                  </i>
                  <b>
                    <Download aria-hidden="true" size={13} />
                    <span>Descargar</span>
                  </b>
                </span>
              </button>
            ))}
          </div>
        ) : (
          renderDatabaseMessage(
            "Catalogo sin publicaciones",
            catalogError || "Cuando publiques recursos en Firestore apareceran aqui.",
            () => void refreshCatalogItems(),
          )
        )}
      </section>

      <section className="brand-section" id="fabricantes">
        <div className="section-title">
          <div>
            <h2>Fabricantes</h2>
            <p>Marcas con catalogos BIM, fichas tecnicas y analitica comercial.</p>
          </div>
        </div>
        <div className="brand-row">
          {brands.map((brand) => (
            <span key={brand}>{brand}</span>
          ))}
        </div>
      </section>

      <section className="module-showcase" id="materiales">
        <div className="section-title">
          <div>
            <h2>Materiales</h2>
            <p>Acabados, fichas tecnicas y parametros listos para presupuestos.</p>
          </div>
          <button onClick={() => setFilter("Arquitectura")} type="button">
            Ver materiales
          </button>
        </div>
        <div className="module-card-grid">
          {["Concreto aparente", "Melamina nogal", "Vidrio templado", "Acero galvanizado"].map((item) => (
            <button key={item} onClick={() => setCommonSearch(item)} type="button">
              <span />
              <strong>{item}</strong>
              <small>Material BIM con ficha tecnica</small>
            </button>
          ))}
        </div>
      </section>

      <section className="module-showcase" id="colecciones">
        <div className="section-title">
          <div>
            <h2>Colecciones</h2>
            <p>Paquetes completos para descargar objetos por ambiente o tipo de proyecto.</p>
          </div>
          <button onClick={() => setCommonSearch("bano accesible")} type="button">
            Abrir coleccion
          </button>
        </div>
        <div className="collection-grid">
          {[
            ["Bano accesible", "8 objetos", "Sanitarios, barras, espejo, puerta e iluminacion."],
            ["Habitacion hotel", "22 objetos", "Mobiliario, HVAC, tomas y luminarias."],
            ["Cuarto de bombas", "31 objetos", "Bombas, valvulas, tuberias, tableros y sensores."],
          ].map(([title, count, description]) => (
            <button key={title} onClick={() => setCommonSearch(title)} type="button">
              <span>{count}</span>
              <strong>{title}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="module-showcase" id="proyectos">
        <div className="section-title">
          <div>
            <h2>Proyectos</h2>
            <p>Organiza modelos, documentos y objetos usados por cada expediente BIM.</p>
          </div>
          <button onClick={user ? goToAdmin : connectGoogleAccount} type="button">
            Gestionar
          </button>
        </div>
        <div className="project-grid">
          {["Hospital Pucallpa", "Colegio Yarinacocha", "Edificio multifamiliar"].map((project) => (
            <button key={project} onClick={user ? goToAdmin : connectGoogleAccount} type="button">
              <strong>{project}</strong>
              <small>ARQ.rvt / EST.rvt / MEP.rvt</small>
              <span>128 objetos vinculados</span>
            </button>
          ))}
        </div>
      </section>

      <section className="module-showcase" id="galeria">
        <div className="section-title">
          <div>
            <h2>Galeria</h2>
            <p>Previsualizaciones, escenas AR y ejemplos de uso para fabricantes.</p>
          </div>
          <button onClick={() => scrollTo("plugin")} type="button">
            Ver plugin
          </button>
        </div>
        <div className="gallery-strip">
          <img src="/bim-hero.png" alt="Escena BIM con objetos de arquitectura" />
          <div>
            <h3>Vista BIM enriquecida</h3>
            <p>Combina catalogo, visor 3D, descarga, Drive y analitica en una experiencia unificada.</p>
          </div>
        </div>
      </section>

      <section className="families-page">
        <div className="breadcrumb">Inicio / Familias</div>
        <div className="list-heading">
          <h2>{filteredProducts.length.toLocaleString("es-PE")} resultados</h2>
          <button onClick={toggleSortMode} type="button">
            {sortMode === "recent" ? "Recientes" : "Populares"}
          </button>
        </div>

        <div className="filter-row">
          <span>Filtrar por</span>
          {categoryFilters.map((item) => (
            <button className={filter === item ? "is-active" : ""} key={item} onClick={() => setFilter(item)} type="button">
              {item}
            </button>
          ))}
        </div>

        {dbLoading.catalog ? (
          <div className="family-grid">{renderCatalogCardSkeletons(8)}</div>
        ) : filteredProducts.length > 0 ? (
          <div className="family-grid">
            {filteredProducts.map((product) => (
              <button className="library-card" key={product.id} onClick={() => selectProduct(product.id)} type="button">
                <span className="fresh-badge">{product.feature}</span>
                {product.isPremium && <span className="crown-badge" aria-label="Premium" />}
                {renderCatalogVisual(product, "library-visual")}
                <strong>{product.name}</strong>
                <small>{product.maker}</small>
                <span className="card-footer">
                  <i>{product.downloads}</i>
                  <b>Descargar</b>
                </span>
              </button>
            ))}
          </div>
        ) : (
          renderDatabaseMessage(
            "Sin resultados reales",
            catalogError || "No hay recursos publicados para esta busqueda en Firestore.",
            () => void refreshCatalogItems(),
          )
        )}
      </section>

      {dbLoading.catalog ? (
        <section className="detail-section" id="detalle" aria-busy="true">
          <div className="detail-visual detail-skeleton-visual">
            <span className="skeleton-block" />
          </div>
          <div className="detail-copy">
            {renderSkeletonLine("skeleton-chip")}
            <div className="detail-title">
              <div>
                {renderSkeletonLine("skeleton-route")}
                {renderSkeletonLine("skeleton-detail-title")}
                {renderSkeletonLine("skeleton-short")}
              </div>
              {renderSkeletonLine("skeleton-button")}
            </div>
            <div className="meta-pills skeleton-meta">
              {renderSkeletonLine("skeleton-chip")}
              {renderSkeletonLine("skeleton-chip")}
              {renderSkeletonLine("skeleton-chip")}
            </div>
            {renderSkeletonLine("skeleton-title")}
            {renderSkeletonLine("skeleton-paragraph")}
            {renderSkeletonLine("skeleton-paragraph short")}
          </div>
        </section>
      ) : catalogItems.length > 0 ? (
        <>
          <section className="detail-section" id="detalle">
            <div className="detail-visual">
              <span className="crown-badge large" aria-label="Premium" />
              {renderCatalogVisual(selectedProduct, "library-visual detail")}
            </div>

            <div className="detail-copy">
              <span className="fresh-badge detail-badge">{selectedProduct.feature}</span>
              <div className="detail-title">
                <div>
                  <p>Inicio / Familias / {selectedProduct.name}</p>
                  <h2>{selectedProduct.name}</h2>
                  <span>{selectedProduct.isPremium ? "Premium" : "Gratis"}</span>
                </div>
                <button disabled={busy === "drive"} onClick={uploadSelectedToDrive} type="button">
                  Descargar
                </button>
              </div>

              <div className="meta-pills">
                <span>{selectedProduct.maker}</span>
                <span>{selectedProduct.category}</span>
                <span>{selectedProduct.formats.join(" / ")}</span>
              </div>

              <h3>Descripcion</h3>
              <p>{selectedProduct.description}</p>

              <h3>Informacion tecnica</h3>
              <div className="technical-grid">
                {selectedProduct.specs.map((spec) => (
                  <span key={spec}>{spec}</span>
                ))}
              </div>

              <div className="detail-actions">
                <button disabled={busy === "firestore"} onClick={publishSelected} type="button">
                  Publicar en Firestore
                </button>
                <button disabled={busy === "favorite"} onClick={saveSelectedFavorite} type="button">
                  Guardar favorito
                </button>
              </div>
            </div>
          </section>
          {renderSimilarProducts(selectedProduct)}
        </>
      ) : (
        <section className="families-page">
          {renderDatabaseMessage(
            "Detalle pendiente",
            catalogError || "Publica un recurso en Firestore para mostrar su detalle real.",
            () => void refreshCatalogItems(),
          )}
        </section>
      )}

      <section className="plugin-section" id="plugin">
        <div className="plugin-copy">
          <p>Plugin para Revit</p>
          <h2>Inserta familias BIM con un clic desde tu flujo de trabajo.</h2>
          <span>
            Busca objetos, revisa metadatos, guarda favoritos y sincroniza fichas con Google Drive.
          </span>
          <div>
            <button onClick={goToPlans} type="button">
              Ver planes
            </button>
            <button onClick={() => scrollTo("familias")} type="button">
              Descargar gratis
            </button>
          </div>
        </div>
        <img src="/bim-hero.png" alt="Visual BIM de interiores y objetos listos para Revit" />
      </section>

      <section className="plans-section" id="planes">
        <div className="section-title">
          <div>
            <h2>Planes InfraBIM</h2>
            <p>Activa capacidades por usuario, creador, fabricante o empresa.</p>
          </div>
          <button onClick={user ? goToAdmin : connectGoogleAccount} type="button">
            {user ? "Abrir panel" : "Ingresar"}
          </button>
        </div>
        <div className="plans-grid">
          {[
            ["Free", "Explorar y descargar contenido gratuito", "Biblioteca, favoritos y visor."],
            ["BIM Pro", "IA, premium y herramientas BIM", "Descargas Pro, colecciones y Drive."],
            ["Fabricante", "Catalogo comercial y analitica", "Productos, leads y paginas de marca."],
          ].map(([title, subtitle, detail]) => (
            <button key={title} onClick={user ? goToAdmin : connectGoogleAccount} type="button">
              <strong>{title}</strong>
              <span>{subtitle}</span>
              <small>{detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="pre-footer">
        <div>
          <h2>Con InfraBIM Plugin accedes a una biblioteca completa de familias BIM.</h2>
          <button onClick={() => scrollTo("plugin")} type="button">
            {"Descarga gratuita ->"}
          </button>
        </div>
        <img src="/bim-hero.png" alt="Biblioteca BIM para proyectos de arquitectura e ingenieria" />
      </section>

      <footer className="site-footer">
        <div className="footer-grid">
          {footerGroups.map(([title, ...links]) => (
            <div key={title}>
              <h3>{title}</h3>
              {links.map((link) => (
                <button key={link} onClick={() => handleFooterAction(link)} type="button">
                  {link}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <strong>InfraBIM</strong>
          <span>InfraBIM Copyright 2026. Todos los derechos reservados.</span>
          <div className="footer-actions">
            <button className="theme-button" onClick={toggleTheme} type="button" aria-label="Cambiar tema">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === "dark" ? "Modo Claro" : "Modo Oscuro"}</span>
            </button>
            <button onClick={toggleLanguage} type="button">
              {language === "ES" ? "Espanol" : "English"}
            </button>
          </div>
        </div>
      </footer>

      {supportOpen && (
        <aside className="support-panel" aria-live="polite">
          <strong>Soporte InfraBIM</strong>
          <span>{connectionLog}</span>
          <button onClick={user ? goToAdmin : connectGoogleAccount} type="button">
            {user ? "Abrir panel" : "Conectar Google"}
          </button>
          <button onClick={() => scrollTo("plugin")} type="button">
            Ver plugin
          </button>
        </aside>
      )}

      <button className="chat-button" onClick={openSupport} type="button" aria-label="Abrir soporte">
        ?
      </button>

      {renderMasterOptionsModal()}
      {renderBulkSelectionModal()}
      {renderBulkProgressModal()}
      {renderBulkPreparingModal()}

      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-item toast-${toast.type || "info"}`}>
              {toast.type === "success" ? <CheckCircle2 size={17} /> : <Info size={17} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
