import { useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "./lib/firebase";
import {
  fetchBimObjects,
  logDriveFile,
  publishBimObject,
  saveFavorite,
  upsertUserProfile,
  type BimObjectPayload,
} from "./lib/firestore";
import { listDriveFiles, uploadJsonToDrive, type DriveFile } from "./lib/googleDrive";
import "./styles.css";

type Product = BimObjectPayload & {
  specs: string[];
};

type Plan = {
  name: string;
  price: string;
  detail: string;
  points: string[];
};

const navItems = [
  ["library", "Library"],
  ["viewer", "Viewer"],
  ["ai", "BIM IA"],
  ["market", "Market"],
  ["projects", "Projects"],
  ["makers", "Fabricantes"],
  ["learn", "Learn"],
];

const disciplines = ["Todas", "Arquitectura", "Estructuras", "MEP", "Infraestructura"];
const formats = ["Todos", "RFA", "RVT", "IFC", "DWG", "SKP", "PDF"];

const products: Product[] = [
  {
    id: "door-fire-90",
    name: "Puerta P-01 cortafuego 90 cm",
    maker: "MODASA",
    category: "Puertas",
    discipline: "Arquitectura",
    country: "Peru",
    formats: ["RFA", "RVT", "IFC", "DWG"],
    versions: ["2024", "2025", "2026"],
    downloads: "12,430",
    price: "Gratis",
    tags: ["hospital", "accesible", "madera", "fuego"],
    specs: ["RF 60", "0.90 x 2.10 m", "Peso 46 kg", "OmniClass 23-17 11 17"],
  },
  {
    id: "sink-accessible",
    name: "Lavamanos accesible con griferia",
    maker: "SaniPro",
    category: "Sanitarios",
    discipline: "MEP",
    country: "Colombia",
    formats: ["RFA", "IFC", "SKP", "PDF"],
    versions: ["2023", "2024", "2025", "2026"],
    downloads: "8,915",
    price: "BIM Pro",
    tags: ["bano", "accesible", "hospital", "mep"],
    specs: ["600 mm", "Altura 800 mm", "Zona libre", "Manual PDF"],
  },
  {
    id: "pump-set",
    name: "Sistema de bombas para edificio 8 pisos",
    maker: "HydroAndes",
    category: "Bombas",
    discipline: "MEP",
    country: "Chile",
    formats: ["RVT", "IFC", "DWG", "PDF"],
    versions: ["2024", "2025", "2026"],
    downloads: "5,204",
    price: "USD 39",
    tags: ["bomba", "presion", "cuarto tecnico", "8 pisos"],
    specs: ["Q 6.2 l/s", "H 44 m", "Conexiones MEP", "Ficha tecnica"],
  },
  {
    id: "bridge-joint",
    name: "Junta modular para puente vial",
    maker: "InfraParts",
    category: "Infraestructura",
    discipline: "Infraestructura",
    country: "Mexico",
    formats: ["IFC", "DWG", "RVT"],
    versions: ["2024", "2025"],
    downloads: "2,760",
    price: "Gratis",
    tags: ["vial", "puente", "obra civil", "ifc"],
    specs: ["MasterFormat 34 71 13", "LOD 350", "Acero galvanizado", "Certificacion"],
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
    downloads: "6,188",
    price: "Gratis",
    tags: ["concreto", "acero", "estructura", "metrados"],
    specs: ["Concreto 280", "Acero fy 4200", "Volumen 2.43 m3", "Parametro LOD"],
  },
];

const blocks = [
  ["Bano accesible", "8 objetos", "Sanitarios, barras, espejo, puerta e iluminacion"],
  ["Habitacion hotel", "22 objetos", "Mobiliario, HVAC, tomas y luminarias"],
  ["Cuarto de bombas", "31 objetos", "Bombas, valvulas, tuberias, tableros y sensores"],
];

const makerStats = [
  ["Objetos publicados", "182"],
  ["Descargas", "8,421"],
  ["Visualizaciones", "31,830"],
  ["Proyectos", "743"],
];

const plans: Plan[] = [
  {
    name: "BIM Pro",
    price: "S/ 49",
    detail: "Premium + IA + herramientas",
    points: ["Familias premium", "Busquedas con IA", "IFC a cantidades"],
  },
  {
    name: "Creator",
    price: "8%",
    detail: "Comision por venta",
    points: ["Wallet interno", "Cupones", "Analitica de descargas"],
  },
  {
    name: "Manufacturer",
    price: "S/ 299",
    detail: "Catalogo + analitica comercial",
    points: ["Pagina de marca", "Productos destacados", "Leads y mapas"],
  },
];

const roadmap = [
  ["MVP", "Registro, biblioteca, buscador, fichas, fabricantes, favoritos, descargas y administrador"],
  ["Fase 2", "Visor IFC, colecciones, BIM IA, panel fabricante, analitica y marketplace"],
  ["Fase 3", "Plugin Revit, BIM Projects, Model Checker, API y BIM Blocks"],
  ["Fase 4", "IA avanzada, generador de familias, metrados, compras, Digital Twin y GIS"],
];

const driveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || undefined;
const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "infrabim";

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

export default function App() {
  const [activeSection, setActiveSection] = useState("library");
  const [discipline, setDiscipline] = useState("Todas");
  const [format, setFormat] = useState("Todos");
  const [query, setQuery] = useState("puerta cortafuego 90 cm para hospital");
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [viewerMode, setViewerMode] = useState("Arquitectura");
  const [activePlan, setActivePlan] = useState(plans[0].name);
  const [user, setUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [remoteObjects, setRemoteObjects] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [connectionLog, setConnectionLog] = useState(
    isFirebaseConfigured
      ? "Firebase listo. Conecta Google para Auth, Firestore y Drive."
      : "Completa .env.local con tu configuracion Firebase.",
  );

  const filteredProducts = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2);

    return products.filter((product) => {
      const matchesDiscipline = discipline === "Todas" || product.discipline === discipline;
      const matchesFormat = format === "Todos" || product.formats.includes(format);
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
      const matchesQuery = terms.length === 0 || terms.some((term) => searchable.includes(term));

      return matchesDiscipline && matchesFormat && matchesQuery;
    });
  }, [discipline, format, query]);

  const selectedProduct =
    products.find((product) => product.id === selectedId) ?? filteredProducts[0] ?? products[0];

  const activePlanData = plans.find((plan) => plan.name === activePlan) ?? plans[0];

  useEffect(() => {
    if (!auth) {
      return undefined;
    }

    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setRemoteObjects(null);
        return;
      }

      try {
        await upsertUserProfile(currentUser);
        const objects = await fetchBimObjects();
        setRemoteObjects(objects.length);
      } catch (error) {
        setConnectionLog(error instanceof Error ? error.message : "No se pudo leer Firestore.");
      }
    });
  }, []);

  function jumpTo(section: string) {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      await upsertUserProfile(result.user);

      if (accessToken) {
        const files = await listDriveFiles(accessToken, driveFolderId);
        setDriveFiles(files);
      }

      setConnectionLog("Firebase Auth, Firestore y Google Drive quedaron conectados para esta sesion.");
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

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="Navegacion principal">
        <div className="brand-block">
          <span className="brand-mark">IB</span>
          <div>
            <strong>InfraBIM</strong>
            <small>Hub</small>
          </div>
        </div>

        <nav>
          {navItems.map(([id, label]) => (
            <button
              aria-current={activeSection === id}
              className={activeSection === id ? "nav-item is-active" : "nav-item"}
              key={id}
              onClick={() => jumpTo(id)}
              type="button"
            >
              <span aria-hidden="true">{label.slice(0, 2)}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="phase-chip">
          <span>Firebase activo</span>
          <strong>{firebaseProjectId}</strong>
        </div>
      </aside>

      <div className="workspace">
        <section className="command-center" id="library">
          <div className="intro-panel">
            <p className="eyebrow">InfraBIM Hub</p>
            <h1>Todo el ecosistema BIM en un solo lugar</h1>
            <p>
              Biblioteca BIM, visor IFC, IA, fabricantes, marketplace, pagos, realidad aumentada,
              proyectos, comunidad y aprendizaje para Peru y Latinoamerica.
            </p>

            <form className="search-console" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="bim-search">Busqueda inteligente</label>
              <div className="search-row">
                <input
                  id="bim-search"
                  onChange={(event) => setQuery(event.target.value)}
                  value={query}
                />
                <button type="submit">Buscar con IA</button>
              </div>
            </form>

            <div className="quick-stats" aria-label="Resumen de plataforma">
              <span>
                <strong>18k</strong>
                objetos BIM
              </span>
              <span>
                <strong>{remoteObjects ?? 42}</strong>
                en Firestore
              </span>
              <span>
                <strong>{driveFiles.length}</strong>
                archivos Drive
              </span>
            </div>
          </div>

          <div className="product-focus" aria-label="Ficha de producto seleccionada">
            <div className="viewer-card-mini">
              <div className="mini-model" aria-hidden="true">
                <span className="mini-door" />
                <span className="mini-grid" />
              </div>
              <div className="product-actions">
                <button disabled={busy === "drive"} onClick={uploadSelectedToDrive} type="button">
                  Subir a Drive
                </button>
                <button disabled={busy === "favorite"} onClick={saveSelectedFavorite} type="button">
                  Guardar
                </button>
                <button onClick={() => jumpTo("viewer")} type="button">
                  Abrir en Revit
                </button>
              </div>
            </div>
            <div>
              <p className="eyebrow">{selectedProduct.category}</p>
              <h2>{selectedProduct.name}</h2>
              <dl className="product-meta">
                <div>
                  <dt>Fabricante</dt>
                  <dd>{selectedProduct.maker}</dd>
                </div>
                <div>
                  <dt>Disciplina</dt>
                  <dd>{selectedProduct.discipline}</dd>
                </div>
                <div>
                  <dt>Versiones</dt>
                  <dd>{selectedProduct.versions.join(", ")}</dd>
                </div>
                <div>
                  <dt>Formatos</dt>
                  <dd>{selectedProduct.formats.join(", ")}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="integration-strip" aria-label="Estado de integraciones">
          <div className="integration-card">
            <p className="eyebrow">Firebase Auth</p>
            <h2>{user ? user.displayName || user.email : "Google provider"}</h2>
            <p>{user ? user.email : "Autenticacion con Google y alcance Drive file."}</p>
          </div>
          <div className="integration-card">
            <p className="eyebrow">Firestore</p>
            <h2>{isFirebaseConfigured ? "Base conectable" : "Config pendiente"}</h2>
            <p>{connectionLog}</p>
          </div>
          <div className="integration-actions">
            <button disabled={busy === "auth"} onClick={connectGoogleAccount} type="button">
              {user ? "Reconectar Drive" : "Conectar Google"}
            </button>
            <button disabled={busy === "firestore"} onClick={publishSelected} type="button">
              Publicar objeto
            </button>
            <button disabled={!user} onClick={disconnect} type="button">
              Salir
            </button>
          </div>
        </section>

        <section className="toolband" aria-label="Filtros de biblioteca">
          <div>
            <p className="eyebrow">Disciplina</p>
            <div className="segmented">
              {disciplines.map((item) => (
                <button
                  className={discipline === item ? "is-selected" : ""}
                  key={item}
                  onClick={() => setDiscipline(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow">Formato</p>
            <div className="segmented">
              {formats.map((item) => (
                <button
                  className={format === item ? "is-selected" : ""}
                  key={item}
                  onClick={() => setFormat(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="library-grid">
          <div className="results-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">BIM Library</p>
                <h2>Objetos compatibles</h2>
              </div>
              <span>{filteredProducts.length} resultados</span>
            </div>

            <div className="object-list">
              {filteredProducts.map((product) => (
                <button
                  className={selectedProduct.id === product.id ? "object-card is-active" : "object-card"}
                  key={product.id}
                  onClick={() => setSelectedId(product.id)}
                  type="button"
                >
                  <span className="object-thumb" aria-hidden="true">
                    <span />
                  </span>
                  <span className="object-copy">
                    <strong>{product.name}</strong>
                    <small>
                      {product.maker} - {product.discipline} - {product.country}
                    </small>
                    <span className="tag-row">
                      {product.formats.slice(0, 4).map((item) => (
                        <i key={item}>{item}</i>
                      ))}
                    </span>
                  </span>
                  <span className="object-price">{product.price}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="spec-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Ficha tecnica</p>
                <h2>{selectedProduct.maker}</h2>
              </div>
              <span>{selectedProduct.downloads} descargas</span>
            </div>
            <ul className="spec-list">
              {selectedProduct.specs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="classification-row">
              <span>OmniClass</span>
              <span>UniClass</span>
              <span>MasterFormat</span>
            </div>
            <button className="wide-action" onClick={() => jumpTo("market")} type="button">
              Ver compra y licencia
            </button>
          </div>
        </section>

        <section className="viewer-section" id="viewer">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BIM Viewer</p>
              <h2>Inspeccion IFC sin instalar software</h2>
            </div>
            <div className="viewer-actions" aria-label="Herramientas del visor">
              {["Rotar", "Medir", "Seccion", "Aislar"].map((item) => (
                <button key={item} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="viewer-layout">
            <div className="model-tree">
              {["Planta 01", "Planta 02", "Muros", "Puertas", "Ventanas", "MEP"].map((item) => (
                <button
                  className={viewerMode === item ? "is-selected" : ""}
                  key={item}
                  onClick={() => setViewerMode(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className={`model-stage mode-${viewerMode.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="building-visual" aria-label="Modelo BIM 3D simulado">
                <span className="slab slab-one" />
                <span className="slab slab-two" />
                <span className="slab slab-three" />
                <span className="core" />
                <span className="mep-line mep-one" />
                <span className="mep-line mep-two" />
                <span className="selected-wall" />
              </div>
            </div>

            <div className="properties-panel">
              <p className="eyebrow">Propiedades</p>
              <dl>
                <div>
                  <dt>IFCClass</dt>
                  <dd>{viewerMode === "MEP" ? "IfcFlowSegment" : "IfcWall"}</dd>
                </div>
                <div>
                  <dt>Material</dt>
                  <dd>{viewerMode === "MEP" ? "PVC sanitario" : "Concreto"}</dd>
                </div>
                <div>
                  <dt>Volumen</dt>
                  <dd>2.43 m3</dd>
                </div>
                <div>
                  <dt>Nivel</dt>
                  <dd>{viewerMode}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="ai-section" id="ai">
          <div className="ai-answer">
            <p className="eyebrow">InfraBIM IA</p>
            <h2>{`Respuesta para: "${query}"`}</h2>
            <p>
              Se priorizan objetos con formatos {format === "Todos" ? "RFA, RVT e IFC" : format},
              versiones 2024-2026, fabricante verificable y metadatos de accesibilidad, costo,
              disponibilidad, manuales y certificaciones.
            </p>
            <div className="ai-rules">
              <span>RNE Peru</span>
              <span>ISO 19650</span>
              <span>OpenBIM</span>
              <span>COBie</span>
            </div>
          </div>

          <div className="blocks-panel">
            <p className="eyebrow">BIM Blocks</p>
            <h2>Conjuntos listos para proyecto</h2>
            <div className="block-list">
              {blocks.map(([name, count, detail]) => (
                <article key={name}>
                  <span>{count}</span>
                  <strong>{name}</strong>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="market-section" id="market">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BIM Marketplace</p>
              <h2>Pagos, suscripciones y wallet</h2>
            </div>
            <span>Yape, tarjeta, QR, transferencia</span>
          </div>

          <div className="plan-grid">
            {plans.map((plan) => (
              <button
                className={activePlan === plan.name ? "plan-card is-active" : "plan-card"}
                key={plan.name}
                onClick={() => setActivePlan(plan.name)}
                type="button"
              >
                <strong>{plan.name}</strong>
                <span>{plan.price}</span>
                <small>{plan.detail}</small>
              </button>
            ))}
          </div>

          <div className="checkout-flow">
            <div>
              <p className="eyebrow">Plan seleccionado</p>
              <h3>{activePlanData.name}</h3>
              <ul>
                {activePlanData.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <ol>
              <li>Carrito</li>
              <li>Pago</li>
              <li>Validacion automatica</li>
              <li>Descarga habilitada</li>
              <li>Comision al creador</li>
            </ol>
          </div>
        </section>

        <section className="project-section" id="projects">
          <div className="project-board">
            <p className="eyebrow">BIM Projects</p>
            <h2>Hospital Pucallpa</h2>
            <div className="file-grid">
              {["ARQ.rvt", "EST.rvt", "MEP.rvt", "Planos", "Memorias", "128 objetos"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="ar-panel">
            <p className="eyebrow">Realidad aumentada</p>
            <h2>Ver en mi espacio</h2>
            <div className="phone-frame" aria-label="Vista AR simulada">
              <span className="camera-top" />
              <span className="ar-object" />
              <span className="ar-dim dim-width">600 mm</span>
              <span className="ar-dim dim-height">800 mm</span>
              <span className="ar-scale">Escala 1:1</span>
            </div>
            <div className="qr-actions">
              <button type="button">Ver en 3D</button>
              <button type="button">Ver en AR</button>
              <button type="button">QR BIM</button>
            </div>
          </div>
        </section>

        <section className="makers-section" id="makers">
          <div>
            <p className="eyebrow">Fabricantes</p>
            <h2>Panel SIKA</h2>
            <div className="maker-stats">
              {makerStats.map(([label, value]) => (
                <span key={label}>
                  <strong>{value}</strong>
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="map-panel" aria-label="Mapa comercial simplificado">
            {[
              ["Peru", "4,200", "72%"],
              ["Colombia", "1,300", "48%"],
              ["Chile", "900", "36%"],
              ["Ecuador", "650", "28%"],
              ["Mexico", "500", "21%"],
            ].map(([country, value, width]) => (
              <div className="country-row" key={country}>
                <span>{country}</span>
                <i style={{ width }} />
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="learn-section" id="learn">
          <div>
            <p className="eyebrow">InfraBIM Learn</p>
            <h2>Ruta de crecimiento</h2>
          </div>
          <div className="roadmap-grid">
            {roadmap.map(([phase, detail]) => (
              <article key={phase}>
                <strong>{phase}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
