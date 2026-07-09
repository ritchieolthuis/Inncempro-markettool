import bouwgarantData from '../bouwgarant_data.json';
import cityCoords from '../city_coords.json';
import { mergeEntries, isNederlandBedrijf } from '../utils/mergeBedrijven';
import { queuedNominatim } from './nominatimQueue';

// Zelfde dedup/NL-filter als Live Zoeken en Bedrijvendatabase (App.tsx's `activeData`) —
// zonder dit telde de kaart losse scrapes van hetzelfde bedrijf (bv. via Bouwgarant én
// "Onbekend") als aparte bedrijven mee, wat een hoger totaal gaf dan de rest van de app.
const MERGED_BEDRIJVEN: any[] = mergeEntries((bouwgarantData as any[]).filter(isNederlandBedrijf));

// city_coords.json has mixed-case keys (e.g. "Amsterdam", "'S-Gravenhage") and uses
// `lng` (not `lon`) — normalize once into a lowercase-keyed lookup so city-based
// geocoding actually hits instead of silently falling through to slow Nominatim calls.
const CITY_COORDS_LOOKUP: Record<string, [number, number]> = {};
Object.keys(cityCoords as any).forEach((key) => {
  const entry = (cityCoords as any)[key];
  const lat = entry?.lat;
  const lng = entry?.lng ?? entry?.lon;
  if (typeof lat === 'number' && typeof lng === 'number') {
    CITY_COORDS_LOOKUP[key.toLowerCase().trim()] = [lat, lng];
  }
});

function lookupCityCoords(stad: string): [number, number] | null {
  const key = (stad || '').toLowerCase().trim();
  return key ? (CITY_COORDS_LOOKUP[key] || null) : null;
}

// Approximate centers of the 12 Dutch provinces — last-resort fallback for the
// small number of steden not present in city_coords.json. Deliberately NOT using
// Nominatim here: hitting it per-record during bulk preload is unreliable (rate
// limiting causes net::ERR_FAILED, and each failed request can hang for seconds),
// which previously made the initial load take minutes or stall entirely.
const PROVINCE_CENTER: Record<string, [number, number]> = {
  drenthe: [52.86, 6.62],
  flevoland: [52.55, 5.65],
  friesland: [53.13, 5.75],
  fryslân: [53.13, 5.75],
  gelderland: [52.06, 5.83],
  groningen: [53.22, 6.75],
  limburg: [51.25, 5.90],
  'noord-brabant': [51.56, 5.15],
  'noord-holland': [52.60, 4.85],
  overijssel: [52.45, 6.45],
  utrecht: [52.10, 5.15],
  zeeland: [51.50, 3.85],
  'zuid-holland': [52.02, 4.48],
};

function lookupProvinceCenter(provincie: string): [number, number] | null {
  const key = (provincie || '').toLowerCase().trim();
  return key ? (PROVINCE_CENTER[key] || null) : null;
}

// Lat/lon bounding boxes per province — used to sanity-check a city-name lookup before
// trusting it. city_coords.json is a flat "stad name → coord" dict with only ONE entry
// per name, but several Dutch place names exist in more than one province (e.g. "Bergen"
// is a village in both Limburg and Noord-Holland) — and some city_coords.json entries are
// themselves corrupt (e.g. "Kessel Lb" and "Zevenhuizen Zh" point nowhere near Limburg /
// Zuid-Holland). Zonder deze check plaatst een bedrijf uit "Bergen, Noord-Holland" zich op
// de coördinaten van "Bergen, Limburg" — 130+ km fout, zichtbaar in de verkeerde provincie.
//
// The boxes are derived EMPIRICALLY from the dataset itself (2nd–98th percentile of every
// stad-name that maps to exactly one provincie, i.e. names we can trust, + padding) rather
// than hand-typed: a hand-typed Noord-Holland box rejected real Gooi-region towns (Hilversum,
// Huizen, Laren, 's-Graveland) that sit further south than a naive guess assumes, even though
// they genuinely are in Noord-Holland. Deriving it from the data self-calibrates around
// reality and avoids that false-positive class while still catching genuine collisions/corrupt
// entries.
function buildProvinceBBoxes(): Record<string, { latMin: number; latMax: number; lonMin: number; lonMax: number }> {
  const stadProvincies: Record<string, Set<string>> = {};
  MERGED_BEDRIJVEN.forEach((b: any) => {
    const stad = (b.stad || '').trim();
    const prov = (b.provincie || '').trim();
    if (!stad || !prov) return;
    (stadProvincies[stad] ||= new Set()).add(prov);
  });

  const provinceCoords: Record<string, [number, number][]> = {};
  Object.entries(stadProvincies).forEach(([stad, provs]) => {
    if (provs.size !== 1) return; // ambiguous name — can't trust which province's coord this is
    const coord = CITY_COORDS_LOOKUP[stad.toLowerCase().trim()];
    if (!coord) return;
    const provKey = Array.from(provs)[0].toLowerCase().trim();
    (provinceCoords[provKey] ||= []).push(coord);
  });

  const percentile = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b);
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };

  const PADDING_DEG = 0.15; // ~15km marge rond het 2e-98e percentiel
  const bboxes: Record<string, { latMin: number; latMax: number; lonMin: number; lonMax: number }> = {};
  Object.entries(provinceCoords).forEach(([provKey, coords]) => {
    if (coords.length < 3) return; // te weinig betrouwbare punten om een box op te bouwen
    const lats = coords.map(c => c[0]);
    const lons = coords.map(c => c[1]);
    bboxes[provKey] = {
      latMin: percentile(lats, 0.02) - PADDING_DEG,
      latMax: percentile(lats, 0.98) + PADDING_DEG,
      lonMin: percentile(lons, 0.02) - PADDING_DEG,
      lonMax: percentile(lons, 0.98) + PADDING_DEG,
    };
  });
  return bboxes;
}

const PROVINCE_BBOX = buildProvinceBBoxes();

function isPlausibleForProvince(coords: [number, number], provincie: string): boolean {
  const key = (provincie || '').toLowerCase().trim();
  const bbox = PROVINCE_BBOX[key];
  if (!bbox) return true; // onbekende/lege provincie — niets om tegen te toetsen, niet afwijzen
  const [lat, lon] = coords;
  return lat >= bbox.latMin && lat <= bbox.latMax && lon >= bbox.lonMin && lon <= bbox.lonMax;
}

// We only have city-level (or province-level) coordinates, so every business in the
// same city would otherwise land on the exact same point and stack invisibly on top
// of each other — you'd see "one dot" for a city with 300 businesses and could only
// ever click the topmost one. Spread them deterministically (same business always
// lands in the same spot, so it doesn't jump around between reloads) within a small
// radius around their city/province center, so each business is its own visible,
// clickable point.
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function jitter(base: [number, number], seed: string, radiusMeters: number): [number, number] {
  const angle = ((hashSeed(seed + '|a') % 10000) / 10000) * Math.PI * 2;
  const frac = Math.sqrt(((hashSeed(seed + '|b') >>> 0) % 10000) / 10000); // sqrt for uniform area distribution
  const dist = frac * radiusMeters;
  const dLat = (dist * Math.cos(angle)) / 111320;
  const dLon = (dist * Math.sin(angle)) / (111320 * Math.cos((base[0] * Math.PI) / 180));
  return [base[0] + dLat, base[1] + dLon];
}

export interface GeoEntry {
  id: string;
  naam: string;
  straat: string;
  postcode: string;
  stad: string;
  provincie: string;
  source: string;
  coords?: [number, number];
  telefoon?: string;
  email?: string;
  website?: string;
  openingstijden?: string;
  // true wanneer coords al exact zijn (Jongeneel/PontMeyer API, PDOK-geocoding) — de
  // achtergrond-Nominatim-refinement moet deze nooit overschrijven met een grovere gok.
  isExact?: boolean;
}

export interface GeoclusterProgress {
  status: 'idle' | 'loading' | 'geocoding' | 'ready' | 'error';
  current: number;
  total: number;
  message: string;
  error?: string;
}

const GEO_CACHE_KEY = 'inncempro_geo_cluster_cache';
const GEO_TIMESTAMP_KEY = 'inncempro_geo_cluster_timestamp';
const CACHE_VERSION = 9;
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

let progressCallbacks: Set<(p: GeoclusterProgress) => void> = new Set();

const emitProgress = (p: GeoclusterProgress) => {
  progressCallbacks.forEach(cb => cb(p));
};

export const onGeoclusterProgress = (cb: (p: GeoclusterProgress) => void) => {
  progressCallbacks.add(cb);
  return () => progressCallbacks.delete(cb);
};

export function makeId(b: any): string {
  return `${(b.naam || '').toLowerCase().trim()}|${(b.straat || '').toLowerCase().trim()}|${(b.postcode || '').toLowerCase().replace(/\s/g, '')}`;
}

function loadCachedClusterData(): Map<string, GeoEntry> | null {
  try {
    const stored = localStorage.getItem(GEO_CACHE_KEY);
    const timestamp = localStorage.getItem(GEO_TIMESTAMP_KEY);

    if (!stored || !timestamp) return null;

    const age = Date.now() - parseInt(timestamp, 10);
    if (age > CACHE_DURATION) return null;

    const data = JSON.parse(stored);
    if (data.version !== CACHE_VERSION) return null;

    const map = new Map<string, GeoEntry>();
    data.entries.forEach((e: GeoEntry) => {
      map.set(e.id, e);
    });
    return map;
  } catch {
    return null;
  }
}

function saveCachedClusterData(entries: Map<string, GeoEntry>) {
  try {
    const data = {
      version: CACHE_VERSION,
      entries: Array.from(entries.values())
    };
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(GEO_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
    console.error('Failed to cache cluster data:', e);
  }
}

export async function preloadAllAddresses(): Promise<Map<string, GeoEntry>> {
  // Check if already cached. Vergelijk EXACT met het huidige totaal, niet "dekt >=90%" —
  // die oude drempel liet een cache die simpelweg nog niet was bijgewerkt na het toevoegen
  // van nieuwe bedrijven (bv. een import) alsnog als "compleet genoeg" doorgaan, zodra de
  // nieuwe bedrijven <10% van het totaal uitmaakten. Gevolg: nieuw toegevoegde bedrijven
  // (bv. de Archined-architecten) verschenen dan nooit op de Kaart, want de cache werd
  // nooit herbouwd om ze mee te nemen.
  const totalRecords = MERGED_BEDRIJVEN.length;
  const cached = loadCachedClusterData();
  if (cached && cached.size === totalRecords) {
    emitProgress({
      status: 'ready',
      current: cached.size,
      total: cached.size,
      message: `Geladen ${cached.size} adressen uit cache`
    });
    startBackgroundPreciseGeocoding();
    return cached;
  }

  emitProgress({
    status: 'loading',
    current: 0,
    total: totalRecords,
    message: 'Adressen laden...'
  });

  const entries = new Map<string, GeoEntry>();
  const allData = MERGED_BEDRIJVEN;

  // Purely synchronous lookups (city coords, then province-center fallback) —
  // no network calls in the bulk path, so this loop runs in well under a second
  // for ~4200 records regardless of Nominatim availability.
  for (let i = 0; i < allData.length; i++) {
    const b = allData[i];
    const id = makeId(b);

    if (entries.has(id)) continue; // Skip duplicates

    // Exacte, geverifieerde coördinaten (Jongeneel/PontMeyer API, PDOK-geocoding voor Stiho)
    // gaan altijd voor de stad-centrum-benadering — geen jitter nodig, dit IS het adres.
    let coords: [number, number];
    if (typeof b.lat === 'number' && typeof b.lng === 'number') {
      coords = [b.lat, b.lng];
    } else {
      const cityMatch = lookupCityCoords(b.stad);
      // Reject a city match that lands outside the bedrijf's own province — that means the
      // stad-name collided with a same-named place elsewhere in the country (see PROVINCE_BBOX
      // comment above). Fall back to the (always-correct) province center instead of the wrong city.
      const cityMatchValid = !!cityMatch && isPlausibleForProvince(cityMatch, b.provincie);
      const provCenter = lookupProvinceCenter(b.provincie);
      const base = cityMatchValid ? cityMatch : (provCenter || cityMatch);
      if (!base) continue;
      // Much tighter spread now that background geocoding refines quickly.
      // Keep it small so initial placement is close to real address.
      coords = jitter(base, id, cityMatchValid ? 150 : 800);
    }

    entries.set(id, {
      id,
      naam: b.naam || '',
      straat: b.straat || '',
      postcode: b.postcode || '',
      stad: b.stad || '',
      provincie: b.provincie || '',
      source: b.source || 'Onbekend',
      coords,
      telefoon: b.telefoon || '',
      email: b.email || '',
      website: b.website || '',
      openingstijden: b.openingstijden || '',
      isExact: typeof b.lat === 'number' && typeof b.lng === 'number',
    });

    if (i % 200 === 0) {
      emitProgress({
        status: 'geocoding',
        current: i + 1,
        total: allData.length,
        message: `Adressen verwerken... ${i + 1}/${allData.length}`
      });
    }
  }

  saveCachedClusterData(entries);

  emitProgress({
    status: 'ready',
    current: entries.size,
    total: entries.size,
    message: `Alle ${entries.size} adressen geladen en gecached`
  });

  startBackgroundPreciseGeocoding();
  return entries;
}

export function getClusterData(): Map<string, GeoEntry> | null {
  return loadCachedClusterData();
}

export function clearClusterCache() {
  localStorage.removeItem(GEO_CACHE_KEY);
  localStorage.removeItem(GEO_TIMESTAMP_KEY);
}

// ─── Achtergrond-verfijning: echte adres-geocoding via Nominatim (gratis) ──────────────
//
// De preload hierboven plaatst elk bedrijf op stad-niveau + willekeurige spreiding —
// snel, maar niet het echte adres, dus een pin kan best in een naburig gehucht/meer
// terechtkomen. Nominatim geeft wel het echte adres, maar staat maar ~1 verzoek/seconde
// toe — voor 4.200 bedrijven in één keer zou dat over een uur duren en de eerste kaart-load
// blokkeren. Daarom draait dit los, op de achtergrond, na de snelle initiële load: het
// vervangt de coördinaten van elk bedrijf één voor één door het echte geocode-resultaat
// (zelfde cache-formaat/key als de Routekaart, dus resultaten worden hergebruikt tussen
// de twee features), met voortgang die overleeft tussen paginaherladingen — een sessie
// hoeft dus nooit opnieuw bij nul te beginnen.
const ADDR_GEO_CACHE_KEY = 'inncempro_geo_cache'; // zelfde key/formaat als RouteMapPanel.tsx
const ATTEMPTED_KEY = 'inncempro_geo_precise_attempted';

type AddrGeoCache = Record<string, [number, number] | null>;

function loadAddrCache(): AddrGeoCache {
  try { return JSON.parse(localStorage.getItem(ADDR_GEO_CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveAddrCache(c: AddrGeoCache) {
  try { localStorage.setItem(ADDR_GEO_CACHE_KEY, JSON.stringify(c)); } catch { /* quota vol o.i.d. — negeren */ }
}
function loadAttempted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ATTEMPTED_KEY) || '[]')); } catch { return new Set(); }
}
function saveAttempted(s: Set<string>) {
  try { localStorage.setItem(ATTEMPTED_KEY, JSON.stringify(Array.from(s))); } catch { /* negeren */ }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Probeert eerst het volledige adres, dan postcode+stad — bewust GEEN stad-only variant:
// die winst hebben we al via de snelle jitter-fallback, dus dat is geen verbetering waard
// om er een kostbaar Nominatim-verzoek aan te besteden. `queuedNominatim` (gedeeld met
// RouteMapPanel) zorgt zelf al voor de verplichte pauze tussen verzoeken — hier dus geen
// eigen delay meer nodig, en geen risico dat twee features tegelijk Nominatim bestoken.
async function geocodePreciseAddress(entry: GeoEntry, cache: AddrGeoCache): Promise<[number, number] | null> {
  const candidates = [
    [entry.straat, entry.postcode, entry.stad, 'Nederland'].filter(Boolean).join(', '),
    [entry.postcode, entry.stad, 'Nederland'].filter(Boolean).join(', '),
  ].filter(Boolean);

  for (const key of candidates) {
    if (key in cache) {
      if (cache[key]) return cache[key];
      continue;
    }
    const coords = await queuedNominatim(key);
    cache[key] = coords;
    saveAddrCache(cache);
    if (coords) return coords;
  }
  return null;
}

let backgroundRefinementStarted = false;

// Vuur-en-vergeet: loopt op de achtergrond door, respecteert Nominatim's rate limit,
// en stopt vanzelf zodra alles geprobeerd is. Bij herhaalde netwerkfouten (bv. Nominatim
// tijdelijk onbereikbaar) wordt er langer gewacht i.p.v. de servers te blijven bestoken.
export function startBackgroundPreciseGeocoding() {
  if (backgroundRefinementStarted) return;
  backgroundRefinementStarted = true;

  (async () => {
    const entries = loadCachedClusterData();
    if (!entries || entries.size === 0) return;

    const addrCache = loadAddrCache();
    const attempted = loadAttempted();
    let updatedSinceSave = 0;
    let consecutiveFailures = 0;

    for (const [id, entry] of entries) {
      if (attempted.has(id)) continue;
      if (entry.isExact) { attempted.add(id); continue; }
      if (!entry.straat && !entry.postcode) { attempted.add(id); continue; }

      const before = addrCache && Object.keys(addrCache).length;
      const precise = await geocodePreciseAddress(entry, addrCache);
      const madeNetworkCall = Object.keys(addrCache).length !== before;

      attempted.add(id);
      saveAttempted(attempted);

      if (precise) {
        entry.coords = precise;
        updatedSinceSave++;
        consecutiveFailures = 0;
      } else if (madeNetworkCall) {
        consecutiveFailures++;
      }

      if (updatedSinceSave >= 25) {
        saveCachedClusterData(entries);
        updatedSinceSave = 0;
      }

      if (consecutiveFailures >= 5) {
        await delay(60000); // Nominatim lijkt niet bereikbaar — even flink terugschakelen
        consecutiveFailures = 0;
      }
    }

    saveCachedClusterData(entries);
  })();
}
