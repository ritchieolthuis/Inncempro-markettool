import cityCoordsRaw from '../city_coords.json';
import { scoreBedrijven, haversineKm, detectType, BezoekType } from '../utils/dagbezoek';

// Normalized lookup — city_coords.json zelf heeft gemixte casing. `scoreBedrijven` (in
// dagbezoek.ts) doet zijn EIGEN lookup op UPPERCASE stad-namen, terwijl onze eigen
// `cityCoords()` helper hieronder lowercase gebruikt — dus beide casings erin zetten,
// anders mist scoreBedrijven alles (zelfde soort bug als eerder in geoclusterService.ts).
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {};
Object.keys(cityCoordsRaw as any).forEach((key) => {
  const entry = (cityCoordsRaw as any)[key];
  if (typeof entry?.lat === 'number' && typeof entry?.lng === 'number') {
    const coords = { lat: entry.lat, lng: entry.lng };
    CITY_COORDS[key.toLowerCase().trim()] = coords;
    CITY_COORDS[key.toUpperCase().trim()] = coords;
    CITY_COORDS[key.trim()] = coords;
  }
});
function cityCoords(stad: string): { lat: number; lng: number } | null {
  return CITY_COORDS[(stad || '').toLowerCase().trim()] || null;
}

// We hebben alleen stad-niveau coördinaten, dus alle bedrijven in dezelfde stad zouden
// zonder correctie exact hetzelfde punt delen (0 km ertussen — nutteloos voor een route).
// Zelfde deterministische spreiding als in geoclusterService.ts (kaart), hier gebruikt
// zodat een route binnen één stad toch een zinnige, stabiele volgorde + afstand geeft.
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
function jitteredCoords(b: any): { lat: number; lng: number } | null {
  const base = cityCoords(b.stad);
  if (!base) return null;
  const seed = `${b.naam}|${b.straat}|${b.stad}`;
  const angle = ((hashSeed(seed + '|a') % 10000) / 10000) * Math.PI * 2;
  const frac = Math.sqrt(((hashSeed(seed + '|b') >>> 0) % 10000) / 10000);
  const dist = frac * 900; // meter
  const dLat = (dist * Math.cos(angle)) / 111320;
  const dLng = (dist * Math.sin(angle)) / (111320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat: base.lat + dLat, lng: base.lng + dLng };
}

const norm = (s: string) => (s || '').toLowerCase().trim();

// Woorden die te generiek zijn om op te matchen ("Groep", "Bouw", "B.V.") — een zoekterm
// als "Ter Steege Groep" moet het echte "Ter Steege Bouw Regio X B.V." vinden, maar een
// kale substring-check (`naam.includes(zoekterm)`) faalt zodra er ook maar één woord
// verschilt. Strip eerst het generieke ruis, vergelijk dan op overlappende kernwoorden.
const GENERIC_COMPANY_WORDS = /\b(b\.?v\.?|n\.?v\.?|vof|cv|stichting|groep|holding|bouwbedrijf|bouwbedrijven|bouw|aannemersbedrijf|aannemingsbedrijf|aannemers|architecten|architectuur|bna)\b/g;
function significantWords(s: string): string[] {
  return norm(s).replace(/[^a-z0-9\s]/g, ' ').replace(GENERIC_COMPANY_WORDS, ' ').split(/\s+/).filter(w => w.length >= 3);
}

// Vindt het beste bedrijf voor een vrije naam-zoekterm: eerst exacte match, dan substring,
// dan (als niets daarvan raak is) het bedrijf met de meeste overlappende betekenisvolle
// woorden — zodat "Ter Steege Groep" ook "Ter Steege Bouw Regio Noord B.V." vindt.
function findBestNameMatch(allData: any[], query: string): any | undefined {
  const q = norm(query);
  if (!q) return undefined;
  let match = allData.find((b) => norm(b.naam) === q);
  if (match) return match;
  match = allData.find((b) => norm(b.naam).includes(q));
  if (match) return match;

  const qWords = significantWords(query);
  if (qWords.length === 0) return undefined;
  let best: any;
  let bestScore = 0;
  for (const b of allData) {
    const nameWords = new Set(significantWords(b.naam));
    const score = qWords.filter(w => nameWords.has(w)).length;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  // Vereis minstens de helft van de betekenisvolle zoekwoorden, anders is de match te los.
  return bestScore >= Math.max(1, Math.ceil(qWords.length / 2)) ? best : undefined;
}

// Zelfde "vestigingen"-logica als in App.tsx (getAndereVestigingen) / MapView.tsx,
// hier los gehouden zodat deze tools zonder circulaire import op zichzelf staan.
const VESTIGING_CHAIN_SOURCES = new Set(['stiho', 'jongeneel', 'pontmeyer', 'van wijnen', 'plegt-vos']);
const REGIO_SUFFIXES = /\b(noordoost|noordwest|zuidoost|zuidwest|noord|oost|zuid|west|midden)\b/g;
function coreNaam(naam: string, stad: string, source?: string): string {
  const src = norm(source || '');
  if (VESTIGING_CHAIN_SOURCES.has(src)) return `keten:${src}`;
  let n = norm(naam).replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const s = norm(stad);
  if (s) {
    if (n === s) n = '';
    else if (n.endsWith(' ' + s)) n = n.slice(0, -(s.length + 1)).trim();
  }
  return n.replace(REGIO_SUFFIXES, '').replace(/\s+/g, ' ').trim();
}
function addrKey(b: any): string { return `${norm(b.straat)}|${norm(b.postcode).replace(/\s/g, '')}`; }

function vestigingenVan(b: any, allData: any[]): any[] {
  const core = coreNaam(b.naam, b.stad, b.source);
  if (!core || core.length < 3) return [];
  const seen = new Set([addrKey(b)]);
  const out: any[] = [];
  for (const cand of allData) {
    if (coreNaam(cand.naam, cand.stad, cand.source) !== core) continue;
    const key = addrKey(cand);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cand);
  }
  return out;
}

function summarize(b: any) {
  return {
    naam: b.naam || '',
    straat: b.straat || '',
    postcode: b.postcode || '',
    stad: b.stad || '',
    provincie: b.provincie || '',
    telefoon: b.telefoon || '',
    email: b.email || '',
    website: b.website || '',
    bron: b.source || 'Onbekend',
    specialisaties: [b.spec1, b.spec2, b.spec3].filter(Boolean),
  };
}

const TYPE_MAP: Record<string, BezoekType> = {
  architect: 'architecten', architecten: 'architecten',
  bouwbedrijf: 'bouwbedrijven', bouwbedrijven: 'bouwbedrijven',
  aannemer: 'aannemers', aannemers: 'aannemers',
  materiaal: 'materialen', materialen: 'materialen', bouwmaterialen: 'materialen',
};

// Fisher-Yates — zonder shuffle geeft `.slice(0, max)` bij elke identieke zoekopdracht
// exact dezelfde eerste N (data-volgorde is stabiel), waardoor "geef eens andere" of
// "vervang X door iets anders" altijd hetzelfde resultaat teruggaf. Nu varieert elke oproep.
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ZoekBedrijvenArgs { zoekterm?: string; stad?: string; provincie?: string; type?: string; bron?: string; max?: number; exclude_namen?: string[] }
export function zoekBedrijven(allData: any[], args: ZoekBedrijvenArgs) {
  const { zoekterm, stad, provincie, type, bron, max = 10, exclude_namen } = args;
  const q = norm(zoekterm || '');
  const wantType = type ? TYPE_MAP[norm(type)] : undefined;
  const excluded = new Set((exclude_namen || []).map(norm));

  const matches = allData.filter((b) => {
    if (excluded.has(norm(b.naam))) return false;
    if (q) {
      const hay = norm([b.naam, b.stad, b.straat, b.email, b.website].filter(Boolean).join(' '));
      if (!hay.includes(q)) return false;
    }
    if (stad && norm(b.stad) !== norm(stad)) return false;
    if (provincie && norm(b.provincie) !== norm(provincie)) return false;
    if (bron && norm(b.source) !== norm(bron)) return false;
    if (wantType) {
      const t = detectType(b);
      const detectedMatches =
        (wantType === 'architecten' && t === 'architect') ||
        (wantType === 'bouwbedrijven' && t === 'bouwbedrijf') ||
        (wantType === 'aannemers' && t === 'aannemer') ||
        (wantType === 'materialen' && t === 'materialen');
      if (!detectedMatches) return false;
    }
    return true;
  });

  return {
    totaal_gevonden: matches.length,
    getoond: Math.min(max, matches.length),
    bedrijven: shuffled(matches).slice(0, max).map(summarize),
  };
}

export interface BedrijfDetailsArgs { naam: string }
export function bedrijfDetails(allData: any[], args: BedrijfDetailsArgs) {
  const match = findBestNameMatch(allData, args.naam);
  if (!match) return { gevonden: false };

  const vestigingen = vestigingenVan(match, allData);
  return {
    gevonden: true,
    bedrijf: summarize(match),
    aantal_vestigingen: vestigingen.length,
    vestigingen: vestigingen.map(summarize),
  };
}

export interface VergelijkBedrijvenArgs { namen: string[] }
export function vergelijkBedrijven(allData: any[], args: VergelijkBedrijvenArgs) {
  const gevonden = (args.namen || []).slice(0, 4).map((naam) => {
    const match = findBestNameMatch(allData, naam);
    return match ? summarize(match) : { naam, gevonden: false };
  });
  return { bedrijven: gevonden };
}

// Zelfde resultaatvorm als zoekBedrijven (totaal_gevonden/getoond/bedrijven) — géén
// zoekfilter, gewoon de exacte namen opzoeken. Bestaat specifiek voor het BIJWERKEN van
// een al getoonde lijst/route: na het vervangen van één bedrijf (via exclude_namen in
// zoekBedrijven) roept de agent dit aan met ALLE namen van de nieuwe lijst, zodat er
// opnieuw een "Route op kaart"/"Google Maps"-kaart verschijnt voor de VOLLEDIGE bijgewerkte
// set — de gebruiker werkt dan zijn bestaande route bij i.p.v. een nieuwe te starten.
export interface BedrijvenLijstArgs { namen: string[] }
export function bedrijvenLijst(allData: any[], args: BedrijvenLijstArgs) {
  const bedrijven = (args.namen || [])
    .map((naam) => findBestNameMatch(allData, naam))
    .filter(Boolean)
    .map(summarize);
  return {
    totaal_gevonden: bedrijven.length,
    getoond: bedrijven.length,
    bedrijven,
  };
}

export interface PlanRouteArgs { locatie: string; type?: string; max_stops?: number; start_adres?: string }
export function planRoute(allData: any[], args: PlanRouteArgs) {
  const { locatie, type, max_stops = 8 } = args;
  const startCoords = cityCoords(args.start_adres || locatie) || cityCoords(locatie);
  if (!startCoords) {
    return { gelukt: false, reden: `Locatie "${locatie}" kon niet gevonden worden.` };
  }

  const wantType = type ? TYPE_MAP[norm(type)] : undefined;
  const scored = scoreBedrijven(allData, startCoords.lat, startCoords.lng, wantType ? [wantType] : [], CITY_COORDS, max_stops * 3, 60);
  if (scored.length === 0) {
    return { gelukt: false, reden: `Geen bedrijven gevonden rond "${locatie}".` };
  }

  // Nearest-neighbour volgorde vanaf het startpunt — een ECHTE route, geen willekeurige lijst.
  const pool = scored.slice(0, Math.max(max_stops * 2, max_stops)).map(s => s.bedrijf);
  const stops: any[] = [];
  let cur = startCoords;
  const remaining = [...pool];
  while (remaining.length && stops.length < max_stops) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((b, i) => {
      const c = jitteredCoords(b);
      if (!c) return;
      const d = haversineKm(cur.lat, cur.lng, c.lat, c.lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    const chosen = remaining.splice(bestIdx, 1)[0];
    const c = jitteredCoords(chosen)!;
    stops.push({ ...summarize(chosen), afstand_vorige_km: Math.round(bestDist * 10) / 10 });
    cur = c;
  }

  const totaalKm = stops.reduce((sum, s) => sum + (s.afstand_vorige_km || 0), 0);
  return {
    gelukt: true,
    start: args.start_adres || locatie,
    aantal_stops: stops.length,
    totale_afstand_km: Math.round(totaalKm * 10) / 10,
    volgorde: stops,
  };
}
