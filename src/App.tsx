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
import { createDriveFolderClient, listDriveFiles, uploadFileToDriveClient, uploadJsonToDrive, type DriveFile } from "./lib/googleDrive";
import "./styles.css";

type UploadFileItem = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  previewUrl?: string;
  size: number;
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
    "RFA, IFC",
    "RVT",
    "RVT, RFA",
    "IFC",
    "IFC, DWG",
    "RFA, SKP",
    "PDF, DWG",
    "DWG",
    "SKP",
  ],
  versions: [
    "2026",
    "2025",
    "2024",
    "2023",
    "2022",
    "2026, 2025, 2024",
    "Todas las versiones",
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

const driveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || undefined;
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
      return saved ? { ...defaultMasterOptions, ...JSON.parse(saved) } : defaultMasterOptions;
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

  function addMasterOption(fieldKey: keyof MasterOptions, optionValue: string) {
    const val = optionValue.trim();
    if (!val) return;
    if (masterOptions[fieldKey].includes(val)) {
      showToast(`La opción '${val}' ya existe en la lista`, "info");
      return;
    }
    const updated = {
      ...masterOptions,
      [fieldKey]: [...masterOptions[fieldKey], val],
    };
    setMasterOptions(updated);
    showToast(`Opción '${val}' agregada a la lista`, "success");
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
  const [driveToken, setDriveToken] = useState("");
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
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2);

    const matches = catalogItems.filter((product) => {
      const matchesKind = !activeRouteKind || product.kind === activeRouteKind;
      const matchesFilter = filter === "Todos" || product.discipline === filter || product.category === filter;
      const matchesFormat = selectedFormat === "Todos" || product.formats.includes(selectedFormat);
      const matchesVersion = selectedVersion === "Todas" || product.versions.includes(selectedVersion);
      const matchesPricing =
        selectedPricing === "Todos" ||
        (selectedPricing === "Gratis" ? !product.isPremium : product.isPremium);
      const matchesFavorites = !onlyFavorites || favorites.includes(product.id);

      const searchable = [
        product.name,
        product.maker,
        product.category,
        product.discipline,
        product.country,
        ...product.tags,
        ...product.formats,
        ...product.versions,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = terms.length === 0 || terms.every((term) => searchable.includes(term));

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
      const searchLower = gestionarSearch.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        item.name.toLowerCase().includes(searchLower) ||
        (item.maker && item.maker.toLowerCase().includes(searchLower)) ||
        (item.category && item.category.toLowerCase().includes(searchLower)) ||
        (item.discipline && item.discipline.toLowerCase().includes(searchLower));

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
    if (!window.confirm(`⚠️ ¿Estás seguro de ELIMINAR permanentemente el recurso "${item.name}"?\nEsta acción no se puede deshacer.`)) {
      return;
    }
    setBusy(`delete-${item.id}`);
    try {
      await deleteCatalogItem(item.kind, item.slug);
      await refreshCatalogItems();
      setConnectionLog(`Recurso "${item.name}" eliminado de Firestore.`);
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
        const folder = await createDriveFolderClient(currentDriveToken, folderName, "1rgmaezSy8mEwkYi0RTqHSne1fLue1p6U");
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

              {renderDynamicSelectField("Formatos", "formats", catalogDraft.formats, (v) => setCatalogDraft({ ...catalogDraft, formats: v }))}

              {renderDynamicSelectField("Versiones", "versions", catalogDraft.versions, (v) => setCatalogDraft({ ...catalogDraft, versions: v }))}

              {renderDynamicSelectField("Etiquetas", "tags", catalogDraft.tags, (v) => setCatalogDraft({ ...catalogDraft, tags: v }))}

              {renderDynamicSelectField("Specs", "specs", catalogDraft.specs, (v) => setCatalogDraft({ ...catalogDraft, specs: v }))}

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
                </div>

                {/* 2. Modelo 3D GLB / GLTF (Opcional - 3D & Realidad Aumentada) */}
                <div className="upload-group">
                  <label>
                    <Sparkles size={16} /> Modelo 3D (.glb / .gltf) - Habilita Visor 3D y Realidad Aumentada (Opcional)
                  </label>
                  {!catalogDraft.glbFile ? (
                    <label className="upload-input-btn">
                      <Plus size={16} /> Seleccionar archivo .glb o .gltf
                      <input accept=".glb,.gltf" onChange={handleSelectGlbFile} type="file" />
                    </label>
                  ) : (
                    <div className="glb-file-badge">
                      <span>
                        <Sparkles size={15} style={{ marginRight: 6 }} />
                        {catalogDraft.glbFile.name} ({(catalogDraft.glbFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <button className="remove-btn" onClick={handleRemoveGlbFile} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }} type="button">
                        <X size={16} />
                      </button>
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

        {/* Contenedor de Tarjetas con Modo Dinámico */}
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
