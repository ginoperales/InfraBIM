import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "./lib/firebase";
import {
  Armchair,
  Bath,
  Box,
  Boxes,
  Building2,
  ChevronDown,
  CookingPot,
  CreditCard,
  Crown,
  Database,
  DoorOpen,
  Download,
  Factory,
  Fan,
  FileText,
  FolderKanban,
  Images,
  Lamp,
  Layers,
  PackagePlus,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trees,
  UploadCloud,
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
  type AccessControl,
  type BimObjectPayload,
  type CatalogItemPayload,
  type CatalogKind,
  type ModuleKey,
  type PaymentPlansConfig,
  type RoleKey,
  defaultPaymentPlansConfig,
} from "./lib/firestore";
import { listDriveFiles, uploadJsonToDrive, type DriveFile } from "./lib/googleDrive";
import "./styles.css";

type Product = BimObjectPayload & {
  description: string;
  specs: string[];
  visual: string;
  feature: string;
  isPremium: boolean;
  imageUrl?: string;
};

type CatalogProduct = Product & {
  kind: CatalogKind;
  slug: string;
  route: string;
  source: "demo" | "firestore";
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
};

type CheckoutMethod = "card" | "yape";

type CheckoutState = {
  method: CheckoutMethod;
  planId: PaidPlanId;
};

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
    kind: item.kind,
    slug: item.slug,
    route: item.route,
    source: "firestore",
  };
}

export default function App() {
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [remoteCatalog, setRemoteCatalog] = useState<CatalogProduct[]>([]);
  const [searchKind, setSearchKind] = useState<CatalogKind>(() => searchKindFromRoute(window.location.pathname) ?? "familias");
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(emptyCatalogDraft);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<RoleKey>("Usuario");
  const [accessControl, setAccessControl] = useState<AccessControl | null>(null);
  const [language, setLanguage] = useState<"ES" | "EN">("ES");
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
  const [busy, setBusy] = useState("");
  const [connectionLog, setConnectionLog] = useState(
    isFirebaseConfigured
      ? "Firebase listo para autenticar, publicar objetos y enlazar Drive."
      : "Completa .env.local con tu configuracion Firebase.",
  );

  const catalogItems = useMemo(() => {
    const demoItems = products.map((product) => productToCatalog(product));
    const remoteIds = new Set(remoteCatalog.map((item) => `${item.kind}/${item.slug}`));

    return [
      ...remoteCatalog,
      ...demoItems.filter((item) => !remoteIds.has(`${item.kind}/${item.slug}`)),
    ];
  }, [remoteCatalog]);

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
      const searchable = [
        product.name,
        product.maker,
        product.category,
        product.discipline,
        product.country,
        ...product.tags,
        ...product.formats,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = terms.length === 0 || terms.every((term) => searchable.includes(term));

      return matchesKind && matchesFilter && matchesQuery;
    });

    return matches.sort((first, second) =>
      sortMode === "popular"
        ? downloadsScore(second.downloads) - downloadsScore(first.downloads)
        : catalogItems.indexOf(first) - catalogItems.indexOf(second),
    );
  }, [activeRouteKind, catalogItems, filter, query, sortMode]);

  const selectedProduct =
    routeCatalogItem ??
    catalogItems.find((product) => product.id === selectedId) ??
    filteredProducts[0] ??
    productToCatalog(products[0]);
  const isAdmin = userRole === "Administrador";
  const isAdminPage = route === "/admin";
  const isPlansPage = route === "/planes";

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
        return;
      }

      try {
        const access = await initializeUserAccess(currentUser);
        setAccessControl(access.access);
        setUserRole(access.role);
        const objects = await fetchBimObjects();
        setRemoteObjects(objects.length);
      } catch (error) {
        setConnectionLog(error instanceof Error ? error.message : "No se pudo leer Firestore.");
      }
    });
  }, []);

  useEffect(() => {
    void refreshCatalogItems();
    void refreshPaymentPlans();
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
    try {
      const items = await fetchCatalogItems();
      setRemoteCatalog(items.map(remoteToCatalog));
    } catch (error) {
      if (isFirebaseConfigured) {
        setConnectionLog(error instanceof Error ? error.message : "No se pudo cargar el catalogo dinamico.");
      }
    }
  }

  async function refreshPaymentPlans() {
    try {
      const plans = await fetchPaymentPlans();
      setPaymentPlans(plans);
      setPaymentPlanDraft(plans);
    } catch (error) {
      if (isFirebaseConfigured) {
        setConnectionLog(error instanceof Error ? error.message : "No se pudieron cargar los precios.");
      }
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
      return;
    }

    setBusy("auth");
    try {
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
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo conectar Google.");
    } finally {
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
    try {
      await publishBimObject(toPayload(selectedProduct));
      const objects = await fetchBimObjects();
      setRemoteObjects(objects.length);
      setConnectionLog(`${selectedProduct.name} fue publicado en Firestore.`);
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo publicar en Firestore.");
    } finally {
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
    try {
      await Promise.all([
        ...products.map((product) => publishBimObject(toPayload(product))),
        ...products.map((product) => saveCatalogItem(productToCatalog(product))),
      ]);
      const objects = await fetchBimObjects();
      setRemoteObjects(objects.length);
      await refreshCatalogItems();
      setConnectionLog("Catalogo de ejemplo publicado en Firestore.");
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo publicar el catalogo.");
    } finally {
      setBusy("");
    }
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
      imageUrl: catalogDraft.imageUrl || undefined,
      ownerUid: user.uid,
    };

    setBusy("create");
    try {
      await saveCatalogItem(item);
      await refreshCatalogItems();
      setCatalogDraft({ ...emptyCatalogDraft, kind: catalogDraft.kind });
      navigateTo(item.route);
      setConnectionLog(`${item.name} fue creado y ya esta visible en ${item.route}.`);
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudo crear el recurso.");
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

    setBusy("plans");
    try {
      await savePaymentPlans(paymentPlanDraft);
      const plans = await fetchPaymentPlans();
      setPaymentPlans(plans);
      setPaymentPlanDraft(plans);
      setConnectionLog("Precios de planes actualizados para la pagina y los cobros.");
    } catch (error) {
      setConnectionLog(error instanceof Error ? error.message : "No se pudieron guardar los precios.");
    } finally {
      setBusy("");
    }
  }

  function startCheckout(planId: PaidPlanId, method: CheckoutMethod) {
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
      setCheckoutStatus("Configura VITE_PAYMENTS_API_URL con tu Worker de Cloudflare.");
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
      setCheckoutStatus(error instanceof Error ? error.message : "No se pudo procesar Yape.");
    } finally {
      setBusy("");
    }
  }

  function renderCatalogVisual(product: CatalogProduct, className: string) {
    return (
      <span className={`${className} ${product.imageUrl ? "image-backed" : product.visual}`} aria-hidden="true">
        {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span />}
      </span>
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
              <span className="fresh-badge">{product.feature}</span>
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
                  {product.downloads} <Download aria-hidden="true" size={13} />
                </i>
                <b>Descargar</b>
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
                  inputMode="tel"
                  onChange={(event) => setYapeDraft({ ...yapeDraft, phoneNumber: event.target.value })}
                  placeholder="999999999"
                  value={yapeDraft.phoneNumber}
                />
              </label>
              <label>
                Codigo de aprobacion
                <input
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setYapeDraft({ ...yapeDraft, otp: event.target.value })}
                  placeholder="000000"
                  value={yapeDraft.otp}
                />
              </label>
              <button className="plan-cta" disabled={busy === "payment-yape"} type="submit">
                Pagar con Yape
              </button>
            </form>
          )}

          <p className="payment-status" aria-live="polite">
            {checkoutStatus || "Checkout listo."}
          </p>
        </section>
      </div>
    );
  }

  function renderPlansPage() {
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
        <div className="plans-page-hero">
          <span>Planes InfraBIM</span>
          <h1>Los mejores proyectos empiezan aqui</h1>
          <p>Todo lo que necesitas, directamente en Revit, Firestore y Google Drive.</p>
        </div>

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
            <h2>{filteredProducts.length.toLocaleString("es-PE")} resultados</h2>
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

        <div className="family-grid">
          {filteredProducts.map((product) => (
            <button className="library-card" key={`${product.kind}-${product.slug}`} onClick={() => selectProduct(product.id)} type="button">
              <span className="fresh-badge">{product.feature}</span>
              {product.isPremium && (
                <span className="crown-badge icon-crown" aria-label="Premium">
                  <Crown aria-hidden="true" size={18} />
                </span>
              )}
              {renderCatalogVisual(product, "library-visual")}
              <strong>{product.name}</strong>
              <small>{product.maker}</small>
              <span className="card-footer">
                <i>{product.downloads} <Download aria-hidden="true" size={13} /></i>
                <b>Descargar</b>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderCatalogDetailPage() {
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

    return (
      <>
        <section className="detail-section catalog-detail-page" id="detalle">
          <div className="detail-visual">
            {routeCatalogItem.isPremium && (
              <span className="crown-badge large icon-crown" aria-label="Premium">
                <Crown aria-hidden="true" size={22} />
              </span>
            )}
            {renderCatalogVisual(routeCatalogItem, "library-visual detail")}
          </div>

          <div className="detail-copy">
            <span className="fresh-badge detail-badge">{routeCatalogItem.feature}</span>
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
        {renderSimilarProducts(routeCatalogItem)}
      </>
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
              <div>
                <dt>Ruta</dt>
                <dd>/admin</dd>
              </div>
              <div>
                <dt>Auth</dt>
                <dd>Firebase</dd>
              </div>
              <div>
                <dt>Permisos</dt>
                <dd>Modulares</dd>
              </div>
              <div>
                <dt>Proyecto</dt>
                <dd>{firebaseProjectId}</dd>
              </div>
            </dl>
          </div>
          <div className="admin-actions">
            <button disabled={busy === "auth"} onClick={connectGoogleAccount} type="button">
              Ingresar con Google
            </button>
            <button onClick={() => scrollTo("inicio")} type="button">
              Volver al catalogo
            </button>
          </div>
        </section>
      );
    }

    if (!isAdmin || !accessControl) {
      return (
        <section className="admin-panel admin-access-panel" id="admin">
          <div className="admin-hero">
            <div>
              <p>Acceso restringido</p>
              <h2>Tu cuenta no tiene permisos de administrador</h2>
              <span>
                Rol actual: {userRole}. El administrador podra activar modulos y accesos para otros roles desde
                esta misma pagina.
              </span>
            </div>
            <dl>
              <div>
                <dt>Usuario</dt>
                <dd>{user.displayName || user.email || "Cuenta Google"}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{accessControl ? "Sin permiso" : "Cargando"}</dd>
              </div>
              <div>
                <dt>Ruta</dt>
                <dd>/admin</dd>
              </div>
              <div>
                <dt>Proyecto</dt>
                <dd>{firebaseProjectId}</dd>
              </div>
            </dl>
          </div>
          <div className="admin-actions">
            <button onClick={() => scrollTo("inicio")} type="button">
              Volver al catalogo
            </button>
            <button onClick={disconnect} type="button">
              Cerrar sesion
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="admin-panel" id="admin">
        <div className="admin-hero">
          <div>
            <p>Panel administrador</p>
            <h2>{user.displayName || user.email || "Administrador InfraBIM"}</h2>
            <span>{connectionLog}</span>
          </div>
          <dl>
            <div>
              <dt>Proyecto Firebase</dt>
              <dd>{firebaseProjectId}</dd>
            </div>
            <div>
              <dt>Firestore</dt>
              <dd>{remoteObjects ?? 0} objetos</dd>
            </div>
            <div>
              <dt>Google Drive</dt>
              <dd>{driveFiles.length} archivos</dd>
            </div>
            <div>
              <dt>Rol actual</dt>
              <dd>{userRole}</dd>
            </div>
          </dl>
        </div>

        <div className="admin-actions">
          <button disabled={busy === "catalog"} onClick={publishDemoCatalog} type="button">
            <Database aria-hidden="true" size={17} />
            Publicar catalogo demo
          </button>
          <button disabled={busy === "access"} onClick={persistAccessControl} type="button">
            <ShieldCheck aria-hidden="true" size={17} />
            Guardar permisos
          </button>
          <button disabled={busy === "drive"} onClick={uploadSelectedToDrive} type="button">
            <FileText aria-hidden="true" size={17} />
            Subir ficha seleccionada a Drive
          </button>
          <button onClick={disconnect} type="button">
            Cerrar sesion
          </button>
        </div>

        <section className="create-panel pricing-admin-panel" id="precios">
          <div className="section-title">
            <div>
              <h3>Precios de planes</h3>
              <p>Estos montos se publican en Firestore y el Worker los usa al crear cobros en Mercado Pago.</p>
            </div>
            <span>
              <CreditCard aria-hidden="true" size={18} />
              Suscripciones
            </span>
          </div>

          <div className="pricing-admin-grid">
            {(Object.keys(paymentPlanDraft) as PaidPlanId[]).map((planId) => (
              <article key={planId}>
                <div>
                  <strong>{paymentPlanDraft[planId].label}</strong>
                  <span>{paymentPlanDraft[planId].description}</span>
                </div>
                <label>
                  Precio mensual
                  <input
                    min="1"
                    onChange={(event) => updatePaymentPlanDraft(planId, "mensual", event.target.value)}
                    step="1"
                    type="number"
                    value={paymentPlanDraft[planId].prices.mensual}
                  />
                </label>
                <label>
                  Precio anual
                  <input
                    min="1"
                    onChange={(event) => updatePaymentPlanDraft(planId, "anual", event.target.value)}
                    step="1"
                    type="number"
                    value={paymentPlanDraft[planId].prices.anual}
                  />
                </label>
                <small>
                  Visible en /planes: {formatMoney(paymentPlanDraft[planId].prices[billingCycle])} por usuario.
                </small>
              </article>
            ))}
          </div>

          <div className="admin-actions pricing-admin-actions">
            <button disabled={busy === "plans"} onClick={persistPaymentPlans} type="button">
              <CreditCard aria-hidden="true" size={17} />
              Guardar precios
            </button>
            <button disabled={busy === "plans"} onClick={refreshPaymentPlans} type="button">
              Recargar desde Firestore
            </button>
          </div>
        </section>

        <section className="create-panel" id="crear">
          <div className="section-title">
            <div>
              <h3>Crear recurso con ruta propia</h3>
              <p>Al guardar se publica en Firestore y queda disponible como /tipo/slug sin regenerar la web.</p>
            </div>
            <span>
              <PackagePlus aria-hidden="true" size={18} />
              Catalogo dinamico
            </span>
          </div>

          <form
            className="create-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void createCatalogItem();
            }}
          >
            <label>
              Tipo
              <select
                onChange={(event) =>
                  setCatalogDraft({ ...catalogDraft, kind: event.target.value as CatalogKind })
                }
                value={catalogDraft.kind}
              >
                {(Object.keys(catalogMeta) as CatalogKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {catalogMeta[kind].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, name: event.target.value })}
                placeholder="Ej. Camara inteligente WiFi"
                value={catalogDraft.name}
              />
            </label>
            <label>
              Fabricante / marca
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, maker: event.target.value })}
                placeholder="Ej. Blocks, Logitech, MODASA"
                value={catalogDraft.maker}
              />
            </label>
            <label>
              Categoria
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, category: event.target.value })}
                placeholder="Ej. Electronica"
                value={catalogDraft.category}
              />
            </label>
            <label>
              Disciplina
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, discipline: event.target.value })}
                placeholder="Arquitectura, MEP, Estructuras"
                value={catalogDraft.discipline}
              />
            </label>
            <label>
              Pais
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, country: event.target.value })}
                value={catalogDraft.country}
              />
            </label>
            <label>
              Formatos
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, formats: event.target.value })}
                placeholder="RFA, IFC, RVT"
                value={catalogDraft.formats}
              />
            </label>
            <label>
              Versiones
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, versions: event.target.value })}
                placeholder="2024, 2025, 2026"
                value={catalogDraft.versions}
              />
            </label>
            <label>
              Etiquetas
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, tags: event.target.value })}
                placeholder="electronica, camara, wifi"
                value={catalogDraft.tags}
              />
            </label>
            <label>
              Specs
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, specs: event.target.value })}
                placeholder="LOD 300, Manual PDF, Bajo peso"
                value={catalogDraft.specs}
              />
            </label>
            <label>
              Imagen o archivo URL
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, imageUrl: event.target.value })}
                placeholder="https://..."
                value={catalogDraft.imageUrl}
              />
            </label>
            <label>
              Estado
              <input
                onChange={(event) => setCatalogDraft({ ...catalogDraft, feature: event.target.value })}
                placeholder="Nuevo, 1 dia, Popular"
                value={catalogDraft.feature}
              />
            </label>
            <label className="wide-field">
              Descripcion
              <textarea
                onChange={(event) => setCatalogDraft({ ...catalogDraft, description: event.target.value })}
                placeholder="Describe el recurso y su uso BIM."
                value={catalogDraft.description}
              />
            </label>
            <label className="toggle-field">
              <input
                checked={catalogDraft.isPremium}
                onChange={(event) => setCatalogDraft({ ...catalogDraft, isPremium: event.target.checked })}
                type="checkbox"
              />
              Premium
            </label>
            <button disabled={busy === "create"} type="submit">
              <UploadCloud aria-hidden="true" size={17} />
              Crear y abrir ruta
            </button>
          </form>
        </section>

        <div className="admin-layout">
          <aside className="module-list">
            <h3>Modulos disponibles</h3>
            <button onClick={() => scrollTo("crear")} type="button">
              <strong>Crear recursos</strong>
              <small>Alta de familias, materiales, colecciones, marcas, proyectos y galeria.</small>
            </button>
            <button onClick={() => scrollTo("precios")} type="button">
              <strong>Precios de planes</strong>
              <small>Editar montos mensual y anual usados por Mercado Pago.</small>
            </button>
            {accessControl.modules.map((module) => (
              <button key={module.key} onClick={() => scrollTo("permisos")} type="button">
                <strong>{module.label}</strong>
                <small>{module.description}</small>
              </button>
            ))}
          </aside>

          <div className="permission-matrix" id="permisos">
            <h3>Permisos por rol</h3>
            <p>Estas opciones quedan listas para asignar acceso a futuros roles sin cambiar la interfaz.</p>
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
                    const current = role.modules[module.key] ?? {
                      enabled: false,
                      read: false,
                      write: false,
                      publish: false,
                    };

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
                            {field === "enabled"
                              ? "Activo"
                              : field === "read"
                                ? "Leer"
                                : field === "write"
                                  ? "Editar"
                                  : "Publicar"}
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

        <div className="popular-grid">
          {catalogItems.filter((product) => product.kind === "familias").slice(0, 7).map((product) => (
            <button className="family-card" key={product.id} onClick={() => selectProduct(product.id)} type="button">
              {renderCatalogVisual(product, "family-visual")}
              <strong>{product.name}</strong>
              <small>{product.maker}</small>
              <span className="card-footer">
                <i>{product.downloads}</i>
                <b>Descargar</b>
              </span>
            </button>
          ))}
        </div>
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
      </section>

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
