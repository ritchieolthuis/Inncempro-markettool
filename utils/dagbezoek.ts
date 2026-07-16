// ─── Dagbezoek Planner utility ────────────────────────────────────────────────
// Research-based bekendheid scores for Dutch construction market.
// Source: market knowledge of largest/most prominent firms per segment.

export type BezoekType = 'architecten' | 'bouwbedrijven' | 'aannemers' | 'materialen' | 'mix';

// Name fragments (lowercase) → bekendheid bonus (0–100)
// Covers the largest and most well-known firms nationally and per region.
const BEKENDHEID: Array<{ fragment: string; bonus: number; types: BezoekType[] }> = [
  // ── Nationale top aannemers / bouwbedrijven ────────────────────────────────
  { fragment: 'bam ',         bonus: 100, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'heijmans',     bonus: 100, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'volkerwessels',bonus: 100, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'volker wessels',bonus:100, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'dura vermeer', bonus: 95,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'ballast nedam',bonus: 95,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'strukton',     bonus: 90,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'tbi ',         bonus: 85,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'van wijnen',   bonus: 85,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'janssen de jong', bonus: 80, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'hurks',        bonus: 75,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'kondor wessels',bonus:75,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'jp van eesteren',bonus:75, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'j.p. van eesteren',bonus:75,types:['bouwbedrijven','aannemers','mix']},
  { fragment: 'roosdom tijhuis',bonus:70, types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'proper-stok',  bonus: 65,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'proper stok',  bonus: 65,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'era contour',  bonus: 65,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'synchroon',    bonus: 60,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'de nijs',      bonus: 60,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'klokgebouw',   bonus: 55,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'geveke',       bonus: 55,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'bouwbedrijf van de ven', bonus:55, types:['bouwbedrijven','aannemers','mix']},
  { fragment: 'ten brinke',   bonus: 55,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'koopmans',     bonus: 50,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'plegt-vos',    bonus: 50,  types: ['bouwbedrijven','aannemers','mix'] },
  { fragment: 'hendriks',     bonus: 45,  types: ['aannemers','mix'] },
  { fragment: 'van agtmaal',  bonus: 45,  types: ['aannemers','mix'] },
  { fragment: 'klerk',        bonus: 40,  types: ['bouwbedrijven','aannemers','mix'] },
  // ── Architectenbureaus ─────────────────────────────────────────────────────
  { fragment: 'oma ',         bonus: 100, types: ['architecten','mix'] },
  { fragment: 'mecanoo',      bonus: 100, types: ['architecten','mix'] },
  { fragment: 'mvrdv',        bonus: 100, types: ['architecten','mix'] },
  { fragment: 'unstudio',     bonus: 95,  types: ['architecten','mix'] },
  { fragment: 'un studio',    bonus: 95,  types: ['architecten','mix'] },
  { fragment: 'de zwarte hond',bonus:90,  types: ['architecten','mix'] },
  { fragment: 'powerhouse company',bonus:90,types:['architecten','mix'] },
  { fragment: 'benthem crouwel',bonus:90, types: ['architecten','mix'] },
  { fragment: 'cepezed',      bonus: 85,  types: ['architecten','mix'] },
  { fragment: 'inbo',         bonus: 85,  types: ['architecten','mix'] },
  { fragment: 'atelier pro',  bonus: 80,  types: ['architecten','mix'] },
  { fragment: 'neutelings',   bonus: 80,  types: ['architecten','mix'] },
  { fragment: 'braaksma',     bonus: 75,  types: ['architecten','mix'] },
  { fragment: 'claus en kaan',bonus: 75,  types: ['architecten','mix'] },
  { fragment: 'ector hoogstad',bonus:70,  types: ['architecten','mix'] },
  { fragment: 'zecc',         bonus: 65,  types: ['architecten','mix'] },
  { fragment: 'diederendirrix',bonus:65,  types: ['architecten','mix'] },
  { fragment: 'dok architecten',bonus:60, types: ['architecten','mix'] },
  { fragment: 'bureau sla',   bonus: 60,  types: ['architecten','mix'] },
  { fragment: 'studio rap',   bonus: 55,  types: ['architecten','mix'] },
  { fragment: 'twin architects',bonus:55, types: ['architecten','mix'] },
];

// `filters` is a list of selected BezoekTypes; an empty list means "alle" (equivalent to the old 'mix').
function bekendheidBonus(naam: string, filters: BezoekType[]): number {
  const n = naam.toLowerCase();
  let best = 0;
  for (const b of BEKENDHEID) {
    const matches = filters.length === 0 ? b.types.includes('mix') : b.types.some(t => filters.includes(t));
    if (!matches) continue;
    if (n.includes(b.fragment)) best = Math.max(best, b.bonus);
  }
  return best;
}

// ── Type detection ─────────────────────────────────────────────────────────────
export function detectType(b: any): 'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen' | 'overig' {
  const naam = (b.naam || '').toLowerCase();
  const src  = (b.source || '').toLowerCase();
  const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
  if (src === 'architectenweb' || specs.includes('architect') || naam.includes('architect')) return 'architect';
  if (specs.includes('houthandel') || specs.includes('bouwmaterial') || src === 'stiho' || src === 'jongeneel') return 'materialen';
  if (specs.includes('bouwbedrijf') || naam.includes('bouwbedrijf') || naam.includes(' bouw ') || naam.endsWith(' bouw')) return 'bouwbedrijf';
  if (specs.includes('aannemer') || naam.includes('aannemer') || src === 'bouwgarant') return 'aannemer';
  return 'overig';
}

function typeScore(b: any, filters: BezoekType[]): number {
  const t = detectType(b);
  if (filters.length === 0) {
    if (t === 'architect')   return 30;
    if (t === 'bouwbedrijf') return 20;
    if (t === 'aannemer')    return 15;
    if (t === 'materialen')  return 15;
    return 5;
  }
  if (filters.includes('architecten') && t === 'architect')     return 50;
  if (filters.includes('bouwbedrijven') && t === 'bouwbedrijf') return 50;
  if (filters.includes('aannemers') && t === 'aannemer')        return 50;
  if (filters.includes('materialen') && t === 'materialen')     return 50;
  return 0;
}

// ── Distance ───────────────────────────────────────────────────────────────────
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Bedrijven langs een rijroute ─────────────────────────────────────────────
// Voor de "Van → Naar"-modus: bepaal welke bedrijven ECHT op de gereden route liggen (i.p.v.
// binnen een cirkel/straal, wat nooit klopte). We krijgen de route als een reeks punten (de
// weggeometrie van OSRM) en meten per bedrijf twee dingen:
//   • distKm     — hoe ver het bedrijf van de route af ligt (loodrecht op de dichtstbijzijnde
//                  plek van de lijn). Klein = ligt op/vlak langs de route.
//   • progressKm — hoe ver LANGS de route (vanaf het startpunt) die dichtstbijzijnde plek ligt.
//                  Hiermee sorteer je op rijvolgorde: op de heenweg oplopend, op de terugweg
//                  draai je simpelweg de route om (dan wordt begin↔eind gewisseld).
// De projectie is een simpele equirectangular-benadering rond Nederland (ref-breedtegraad 52°);
// ruim nauwkeurig genoeg op deze schaal om "ligt het op de route"-beslissingen te nemen.
const NL_REF_LAT = 52;
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG = 111.32 * Math.cos(NL_REF_LAT * Math.PI / 180);

function toXY(lat: number, lng: number): { x: number; y: number } {
  return { x: lng * KM_PER_DEG_LNG, y: lat * KM_PER_DEG_LAT };
}

export interface RoutePosition { distKm: number; progressKm: number; }

export function nearestPointOnRoute(
  lat: number, lng: number,
  route: Array<{ lat: number; lng: number }>,
): RoutePosition {
  const p = toXY(lat, lng);
  let best: RoutePosition = { distKm: Infinity, progressKm: 0 };
  let cumulative = 0; // afgelegde route-lengte tot aan het begin van het huidige segment
  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i].lat, route[i].lng);
    const b = toXY(route[i + 1].lat, route[i + 1].lng);
    const abx = b.x - a.x, aby = b.y - a.y;
    const segLen = Math.hypot(abx, aby);
    // Projecteer p op segment [a,b], geklemd tussen de eindpunten (t in [0,1]).
    const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (segLen * segLen)));
    const projX = a.x + t * abx, projY = a.y + t * aby;
    const dist = Math.hypot(p.x - projX, p.y - projY);
    if (dist < best.distKm) {
      best = { distKm: dist, progressKm: cumulative + t * segLen };
    }
    cumulative += segLen;
  }
  return best;
}

// Route-optimalisatie via de Nearest Neighbor-heuristiek: begint bij het startpunt en pakt
// telkens de dichtstbijzijnde nog-niet-bezochte stop. Levert een korte, "logische" volgorde
// i.p.v. kriskras. Gedeeld door RouteMapPanel (Lijsten-kaart) en RidePanel (Onderweg) zodat
// beide exact hetzelfde gedrag houden.
export function optimizeRoute<T extends { lat: number; lng: number }>(
  stops: T[],
  startCoords: { lat: number; lng: number },
): T[] {
  if (stops.length <= 2) return stops;
  let current: { lat: number; lng: number } = startCoords;
  const remaining = [...stops];
  const route: T[] = [];
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Math.hypot(remaining[0].lat - current.lat, remaining[0].lng - current.lng);
    for (let i = 1; i < remaining.length; i++) {
      const dist = Math.hypot(remaining[i].lat - current.lat, remaining[i].lng - current.lng);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    const [next] = remaining.splice(nearestIdx, 1);
    route.push(next);
    current = { lat: next.lat, lng: next.lng };
  }
  return route;
}

function distanceScore(km: number): number {
  if (km <= 5)  return 100;
  if (km <= 10) return 80;
  if (km <= 20) return 60;
  if (km <= 35) return 35;
  if (km <= 50) return 15;
  return 0;
}

// ── Data completeness ─────────────────────────────────────────────────────────
function completenessScore(b: any): number {
  let s = 0;
  if (b.telefoon) s += 5;
  if (b.email)    s += 5;
  if (b.website)  s += 5;
  if (b.straat)   s += 3;
  return s;
}

// ── Main scoring ──────────────────────────────────────────────────────────────
export interface ScoredBedrijf { bedrijf: any; score: number; km: number; }

export function scoreBedrijven(
  allData: any[],
  targetLat: number,
  targetLon: number,
  types: BezoekType[],
  cityCoords: Record<string, { lat: number; lng: number }>,
  maxResults = 15,
  maxKm = 60,
): ScoredBedrijf[] {
  const scored: ScoredBedrijf[] = [];

  for (const b of allData) {
    const stad = (b.stad || '').toUpperCase().trim();
    const coords = cityCoords[stad] || cityCoords[(b.stad || '').trim()];
    if (!coords) continue;

    const km = haversineKm(targetLat, targetLon, coords.lat, coords.lng);
    if (km > maxKm) continue; // cut off beyond the given radius

    const ts = typeScore(b, types);
    if (types.length > 0 && ts === 0) continue; // wrong type, skip

    const score =
      distanceScore(km) * 1.5 +
      ts +
      bekendheidBonus(b.naam || '', types) * 0.8 +
      completenessScore(b);

    scored.push({ bedrijf: b, score, km });
  }

  // Sort by score desc, then deduplicate by naam (keep highest score)
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const deduped: ScoredBedrijf[] = [];
  for (const s of scored) {
    const key = (s.bedrijf.naam || '').toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
    if (deduped.length >= maxResults) break;
  }
  return deduped;
}

// ── Route insertion scoring ──────────────────────────────────────────────────────
// Ranks candidates by how little detour they add if inserted between `prev` and `next`
// (or by plain distance to whichever of the two is given, for start/end slots).
export interface InsertionCandidate { bedrijf: any; cost: number; km: number; }

export function scoreInsertionCandidates(
  allData: any[],
  prev: { lat: number; lng: number } | null,
  next: { lat: number; lng: number } | null,
  cityCoords: Record<string, { lat: number; lng: number }>,
  excludeNames: Set<string>,
  maxResults = 8,
  query = '',
): InsertionCandidate[] {
  const base = prev && next ? haversineKm(prev.lat, prev.lng, next.lat, next.lng) : 0;
  const scored: InsertionCandidate[] = [];
  const q = query.toLowerCase().trim();

  for (const b of allData) {
    const nn = (b.naam || '').toLowerCase().trim();
    if (!nn || excludeNames.has(nn)) continue;
    if (q && !`${nn} ${(b.stad || '').toLowerCase()}`.includes(q)) continue;
    const stad = (b.stad || '').toUpperCase().trim();
    const coords = cityCoords[stad] || cityCoords[(b.stad || '').trim()];
    if (!coords) continue;

    let cost: number, km: number;
    if (prev && next) {
      const dPrev = haversineKm(prev.lat, prev.lng, coords.lat, coords.lng);
      const dNext = haversineKm(coords.lat, coords.lng, next.lat, next.lng);
      cost = dPrev + dNext - base;
      km = Math.min(dPrev, dNext);
    } else {
      const ref = (prev || next)!;
      cost = haversineKm(ref.lat, ref.lng, coords.lat, coords.lng);
      km = cost;
    }
    scored.push({ bedrijf: b, cost, km });
  }

  scored.sort((a, b) => a.cost - b.cost);
  const seen = new Set<string>();
  const out: InsertionCandidate[] = [];
  for (const s of scored) {
    const key = (s.bedrijf.naam || '').toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxResults) break;
  }
  return out;
}
