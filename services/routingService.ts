// Echte rijafstand (over de weg) i.p.v. hemelsbrede afstand.
//
// Waarom dit apart van haversineKm bestaat: hemelsbreed is voor NL vaak 10-25% te laag
// t.o.v. de werkelijke rijafstand (rivieren, geen rechte snelwegen), zoals bv. Hengelo →
// PontMeyer Brielle: 182 km hemelsbreed vs 205-207 km daadwerkelijk rijden. We gebruiken
// de gratis publieke OSRM-server (router.project-osrm.org) via de /table/-endpoint, die
// in één request de afstand van 1 bron naar tot ~90 bestemmingen tegelijk teruggeeft.
//
// Belangrijke grenzen van deze aanpak (bewust, niet iets om "op te lossen"):
// - De publieke OSRM-server is gratis maar niet bedoeld voor zware productie-load, dus we
//   roepen 'm alleen aan voor wat er ECHT op het scherm staat (de huidige pagina, niet alle
//   duizenden bedrijven tegelijk) en cachen agressief in localStorage.
// - Bij een netwerkfout/timeout vallen we stil terug op haversine — de app blijft altijd werken,
//   het is alleen minder precies zonder internet naar de routing-server.

const OSRM_BASE = 'https://router.project-osrm.org';
const CACHE_KEY = 'inncempro_driving_distance_cache';
const CACHE_VERSION = 1;
const CHUNK_SIZE = 90; // veilig onder de limiet van de publieke OSRM-server
const CACHE_MAX_ENTRIES = 5000;

type Coords = { lat: number; lng: number };

interface CacheEntry {
  km: number;
  ts: number;
}

let memCache: Map<string, CacheEntry> | null = null;

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000; // ~11m precisie, genoeg voor cache-hergebruik
}

function cacheKey(origin: Coords, dest: Coords): string {
  return `${roundCoord(origin.lat)},${roundCoord(origin.lng)}|${roundCoord(dest.lat)},${roundCoord(dest.lng)}`;
}

function loadCache(): Map<string, CacheEntry> {
  if (memCache) return memCache;
  memCache = new Map();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === CACHE_VERSION && parsed.entries) {
        for (const [k, v] of Object.entries(parsed.entries as Record<string, CacheEntry>)) {
          memCache.set(k, v);
        }
      }
    }
  } catch {
    // corrupte cache — gewoon leeg beginnen
  }
  return memCache;
}

let saveScheduled = false;
function saveCache() {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => {
    saveScheduled = false;
    try {
      const cache = loadCache();
      // Bij te grote cache: oudste entries eruit gooien (simpele FIFO-achtige trim)
      if (cache.size > CACHE_MAX_ENTRIES) {
        const sorted = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts);
        const toDrop = sorted.slice(0, cache.size - CACHE_MAX_ENTRIES);
        toDrop.forEach(([k]) => cache.delete(k));
      }
      const entries: Record<string, CacheEntry> = {};
      cache.forEach((v, k) => { entries[k] = v; });
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, entries }));
    } catch {
      // localStorage vol of niet beschikbaar — niet fataal, cache leeft dan alleen in memory
    }
  }, 500);
}

async function fetchTableChunk(origin: Coords, destinations: Coords[]): Promise<(number | null)[]> {
  const coordStr = [origin, ...destinations].map(c => `${c.lng},${c.lat}`).join(';');
  const destIdx = destinations.map((_, i) => i + 1).join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coordStr}?sources=0&destinations=${destIdx}&annotations=distance`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return destinations.map(() => null);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.distances?.[0]) return destinations.map(() => null);
    return data.distances[0].map((meters: number | null) => (meters == null ? null : meters / 1000));
  } catch {
    return destinations.map(() => null);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Haalt echte rijafstand (km) op van `origin` naar elk punt in `destinations`.
 * Retourneert een array in dezelfde volgorde als `destinations`; een entry is `null`
 * als de rijafstand niet bepaald kon worden (gebruik dan haversine als fallback).
 * Cachet resultaten in localStorage zodat herhaalde views niet opnieuw bevragen.
 */
export async function getDrivingDistancesKm(origin: Coords, destinations: Coords[]): Promise<(number | null)[]> {
  const cache = loadCache();
  const results: (number | null)[] = new Array(destinations.length).fill(null);
  const toFetch: { idx: number; dest: Coords }[] = [];

  destinations.forEach((dest, idx) => {
    const key = cacheKey(origin, dest);
    const cached = cache.get(key);
    if (cached) {
      results[idx] = cached.km;
    } else {
      toFetch.push({ idx, dest });
    }
  });

  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    const chunkDistances = await fetchTableChunk(origin, chunk.map(c => c.dest));
    chunk.forEach((c, j) => {
      const km = chunkDistances[j];
      results[c.idx] = km;
      if (km != null) {
        cache.set(cacheKey(origin, c.dest), { km, ts: Date.now() });
      }
    });
    if (i + CHUNK_SIZE < toFetch.length) {
      await new Promise(r => setTimeout(r, 200)); // niet te agressief op de gratis publieke server
    }
  }

  if (toFetch.length > 0) saveCache();
  return results;
}

/** Enkele oorsprong→bestemming rijafstand, met dezelfde caching als de batch-variant. */
export async function getDrivingDistanceKm(origin: Coords, destination: Coords): Promise<number | null> {
  const [km] = await getDrivingDistancesKm(origin, [destination]);
  return km;
}
