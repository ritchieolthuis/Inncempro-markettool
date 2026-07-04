// ─── Dagbezoek Planner utility ────────────────────────────────────────────────
// Research-based bekendheid scores for Dutch construction market.
// Source: market knowledge of largest/most prominent firms per segment.

export type BezoekType = 'architecten' | 'bouwbedrijven' | 'aannemers' | 'mix';

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

function bekendheidBonus(naam: string, type: BezoekType): number {
  const n = naam.toLowerCase();
  let best = 0;
  for (const b of BEKENDHEID) {
    if (!b.types.includes(type) && type !== 'mix') continue;
    if (n.includes(b.fragment)) best = Math.max(best, b.bonus);
  }
  return best;
}

// ── Type detection ─────────────────────────────────────────────────────────────
function detectType(b: any): 'architect' | 'bouwbedrijf' | 'aannemer' | 'overig' {
  const naam = (b.naam || '').toLowerCase();
  const src  = (b.source || '').toLowerCase();
  const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
  if (src === 'architectenweb' || naam.includes('architect')) return 'architect';
  if (naam.includes('aannemer') || specs.includes('aannemer')) return 'aannemer';
  if (naam.includes('bouw') || src === 'bouwgarant') return 'bouwbedrijf';
  return 'overig';
}

function typeScore(b: any, filter: BezoekType): number {
  const t = detectType(b);
  if (filter === 'mix') {
    if (t === 'architect')   return 30;
    if (t === 'bouwbedrijf') return 20;
    if (t === 'aannemer')    return 15;
    return 5;
  }
  if (filter === 'architecten' && t === 'architect')   return 50;
  if (filter === 'bouwbedrijven' && t === 'bouwbedrijf') return 50;
  if (filter === 'aannemers' && t === 'aannemer')      return 50;
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
  type: BezoekType,
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

    const ts = typeScore(b, type);
    if (type !== 'mix' && ts === 0) continue; // wrong type, skip

    const score =
      distanceScore(km) * 1.5 +
      ts +
      bekendheidBonus(b.naam || '', type) * 0.8 +
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
