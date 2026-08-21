/**
 * Intelligent Bilingual Search & Synonym Expansion Engine for InfraBIM
 * Supports English <-> Spanish translation and terminology matching for BIM objects.
 */

// Helper to remove diacritics / accents (e.g., "sofá" -> "sofa", "válvula" -> "valvula")
export function normalizeSearchText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Synonyms dictionary grouping equivalent English and Spanish BIM terms
const synonymGroups: string[][] = [
  // Furniture / Mobiliario
  ["chair", "chairs", "silla", "sillas", "sillón", "sillon", "sillones", "butaca", "butacas", "asiento", "asientos", "blocco", "seat", "seating"],
  ["sofa", "sofas", "sofá", "sofás", "sillón", "sillon", "couch", "diván", "divan", "milo", "kokuyo"],
  ["table", "tables", "mesa", "mesas", "escritorio", "escritorios", "monza", "desk", "desks", "tablero"],
  ["credenza", "credenzas", "credensa", "mueble", "muebles", "cabinet", "cabinets", "aparador", "aparadores", "archivero", "cajonera", "armario", "closet", "sideboard", "storage"],
  ["bed", "beds", "cama", "camas", "tarima", "cabecera", "matrimonial"],
  ["furniture", "mobiliario", "mueble", "muebles", "decoracion", "interiorismo"],

  // Openings / Cerramientos
  ["door", "doors", "puerta", "puertas", "portón", "porton", "gate", "gates", "cortafuego", "cortafuegos", "fire-rated"],
  ["window", "windows", "ventana", "ventanas", "ventanal", "ventanales", "mampara", "mamparas", "glazing", "cristal"],

  // MEP - Plumbing & Sanitary / Sanitarios & Plomería
  ["sink", "sinks", "lavabo", "lavabos", "lavatorio", "lavatorios", "fregadero", "fregaderos", "lavadero", "basin", "basins"],
  ["toilet", "toilets", "inodoro", "inodoros", "wc", "retrete", "taza", "water closet", "sanitario", "sanitarios"],
  ["bathtub", "tub", "tina", "tinas", "bañera", "bañeras", "jacuzzi"],
  ["shower", "showers", "ducha", "duchas", "regadera", "regaderas"],
  ["pipe", "pipes", "piping", "tubería", "tuberia", "tuberías", "tuberias", "tubo", "tubos", "cañería"],
  ["valve", "valves", "válvula", "valvula", "válvulas", "valvulas", "llave", "grifo", "faucet"],
  ["pump", "pumps", "bomba", "bombas", "electrobomba", "electrobombas"],

  // MEP - HVAC & Electrical / Climatización & Electricidad
  ["fan", "fans", "ventilador", "ventiladores", "extractor", "extractores", "blower", "soplador"],
  ["chiller", "chillers", "enfriador", "enfriadores", "climatizador", "ac", "air conditioner", "aire acondicionado"],
  ["light", "lights", "lighting", "lamp", "lamps", "lámpara", "lampara", "lámparas", "luminaria", "luminarias", "foco", "spot"],
  ["generator", "generators", "generador", "generadores", "grupo electrógeno", "electrogeno"],
  ["transformer", "transformers", "transformador", "transformadores"],
  ["panel", "panels", "tablero", "tableros", "cuadro eléctrico", "breaker"],

  // Architecture & Structure / Arquitectura y Estructura
  ["wall", "walls", "muro", "muros", "pared", "paredes", "tabique", "partition"],
  ["floor", "floors", "piso", "pisos", "losa", "losas", "pavimento", "slab"],
  ["roof", "roofs", "techo", "techos", "cubierta", "cubiertas", "ceiling"],
  ["column", "columns", "columna", "columnas", "pilar", "pilares", "pillar"],
  ["beam", "beams", "viga", "vigas", "joist"],
  ["stair", "stairs", "staircase", "escalera", "escaleras", "peldaño", "step"],
  ["railing", "railings", "baranda", "barandas", "pasamanos", "barandilla", "balustrade"],
  ["plant", "plants", "tree", "trees", "árbol", "arbol", "árboles", "vegetación", "vegetacion", "planta", "plantas"],
];

// Pre-process index for fast lookup
const termToSynonymMap = new Map<string, Set<string>>();

synonymGroups.forEach((group) => {
  const normalizedGroup = group.map(normalizeSearchText);
  const groupSet = new Set(normalizedGroup);

  normalizedGroup.forEach((term) => {
    if (!termToSynonymMap.has(term)) {
      termToSynonymMap.set(term, new Set());
    }
    const targetSet = termToSynonymMap.get(term)!;
    groupSet.forEach((syn) => targetSet.add(syn));
  });
});

/**
 * Returns a Set of synonyms (including English/Spanish equivalents) for a query term.
 */
export function getBilingualSynonyms(term: string): Set<string> {
  const normalized = normalizeSearchText(term);
  if (!normalized) return new Set();

  const synonyms = new Set<string>([normalized]);
  const mapped = termToSynonymMap.get(normalized);
  if (mapped) {
    mapped.forEach((syn) => synonyms.add(syn));
  }

  return synonyms;
}

/**
 * Evaluates whether a searchable target string contains all query terms (or their bilingual synonyms).
 */
export function matchesBilingualSearch(query: string, targetText: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const normalizedTarget = normalizeSearchText(targetText);
  if (!normalizedTarget) return false;

  const queryTerms = normalizedQuery.split(/\s+/).filter((t) => t.length > 1);
  if (queryTerms.length === 0) return true;

  // Check that EVERY term in the query has at least ONE synonym matching the target text
  return queryTerms.every((term) => {
    const synonyms = getBilingualSynonyms(term);
    for (const syn of synonyms) {
      if (normalizedTarget.includes(syn)) {
        return true;
      }
    }
    return false;
  });
}
