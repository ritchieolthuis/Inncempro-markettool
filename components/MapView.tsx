import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Loader2, AlertTriangle, CheckSquare, Square, Navigation, Check,
  ListOrdered, Save, Trash2, RotateCcw, ChevronDown, ChevronUp, X,
  Map as MapIcon, MapPin, Plus, Search, ExternalLink, Pencil, GripVertical, Globe, ShieldCheck,
  CalendarDays, Building2, HardHat, Repeat,
} from 'lucide-react';
import { scoreBedrijven, scoreInsertionCandidates, BezoekType } from '../utils/dagbezoek';
import cityCoords from '../city_coords.json';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Colours ──────────────────────────────────────────────────────────────────
const SRC_COLOR: Record<string, string> = {
  Bouwgarant:           '#009FE3',
  Architectenweb:       '#E85E26',
  Stiho:                '#EA580C',
  Jongeneel:            '#16A34A',
  BouwPartner:          '#CA8A04',
  PontMeyer:            '#DC2626',
  'Van Wijnen':         '#0D9488',
  Onbekend:             '#64748B',
  Handmatig:            '#9333EA',
  Favorieten:           '#E11D48',
  'Mijn Adressen':      '#7C3AED',
  'Geselecteerde items': '#E85E26',
};
const ALL_SOURCES = ['Bouwgarant', 'Architectenweb', 'Stiho', 'Jongeneel', 'BouwPartner', 'PontMeyer', 'Van Wijnen', 'Handmatig', 'Onbekend'];

// ─── Vestigingen (branch locations van hetzelfde bedrijf) ─────────────────────
// Herleidt de "kernnaam" van een bedrijf door rechtsvorm-suffixen en, als de
// naam eindigt op de eigen plaatsnaam (bv. "INBO Amsterdam"), ook die plaats
// te strippen — zo groeperen "INBO Amsterdam" en "INBO Rotterdam" onder "inbo".
function coreCompanyName(naam: string, stad: string): string {
  let n = (naam || '').toLowerCase()
    .replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const s = (stad || '').toLowerCase().trim();
  if (s) {
    if (n === s) n = '';
    else if (n.endsWith(' ' + s)) n = n.slice(0, -(s.length + 1)).trim();
  }
  return n;
}

// Unieke sleutel per fysieke vestiging (naam + adres), gebruikt om markers terug te vinden.
function vestigingKey(b: any): string {
  return `${(b.naam || '').toLowerCase().trim()}|${(b.straat || '').toLowerCase().trim()}|${(b.stad || '').toLowerCase().trim()}`;
}

function addrKey(b: any): string {
  return `${(b.straat || '').toLowerCase().trim()}|${(b.postcode || '').toLowerCase().replace(/\s/g, '')}`;
}

// Zoekt andere vestigingen (andere adressen) van hetzelfde bedrijf op via een
// vooraf gebouwde index (coreCompanyName -> alle bedrijven met die kernnaam).
function getVestigingen(entry: any, coreIndex: Map<string, any[]>): any[] {
  const core = coreCompanyName(entry.naam, entry.stad);
  if (!core || core.length < 3) return [];
  const group = coreIndex.get(core);
  if (!group || group.length < 2) return [];
  const seen = new Set<string>([addrKey(entry)]);
  const out: any[] = [];
  for (const b of group) {
    const k = addrKey(b);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out.sort((a, b) => (a.stad || '').localeCompare(b.stad || '', 'nl'));
}

// Globaal register zodat de (platte HTML) popup-knoppen een zustermarker kunnen
// terugvinden en de kaart ernaartoe kunnen laten vliegen — werkt over alle
// laadflows heen omdat het register buiten de component-instantie leeft.
const vestigingRegistry = new Map<string, L.Marker>();
(window as any)._inncemGoToVestiging = (key: string) => {
  const m = vestigingRegistry.get(key);
  if (!m) return;
  const map = (m as any)._map;
  if (map) map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 14));
  m.openPopup();
};

// ─── Geo cache ────────────────────────────────────────────────────────────────
const toUrl = (u: string) => u && /^https?:\/\//i.test(u) ? u : `https://${u}`;
const GEO_KEY     = 'inncempro_geo_cache';
const MAPS_KEY    = 'inncempro_saved_maps';
const ROUTES_KEY  = 'inncempro_saved_routes';
const CUSTOM_KEY  = 'inncempro_custom_addresses';

// ─── Custom address type ──────────────────────────────────────────────────────
interface CustomAddress {
  id: string;
  naam: string;
  straat: string;
  postcode: string;
  stad: string;
  provincie: string;
  telefoon: string;
  website: string;
  notitie: string;
  source: 'Mijn Adressen';
  addedAt: number;
}

const EMPTY_FORM: Omit<CustomAddress, 'id' | 'source' | 'addedAt'> = {
  naam: '', straat: '', postcode: '', stad: '', provincie: '', telefoon: '', website: '', notitie: '',
};

function loadCustom(): CustomAddress[] { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; } }
function saveCustom(a: CustomAddress[]) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(a)); }

type Coords   = [number, number];
type GeoCache = Record<string, Coords | null>;

function loadCache(): GeoCache { try { return JSON.parse(localStorage.getItem(GEO_KEY) || '{}'); } catch { return {}; } }
function saveCache(c: GeoCache) { localStorage.setItem(GEO_KEY, JSON.stringify(c)); }

async function nominatim(q: string): Promise<Coords | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=nl&limit=1`,
      { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
    );
    const d = await r.json();
    return d?.[0] ? [parseFloat(d[0].lat), parseFloat(d[0].lon)] : null;
  } catch { return null; }
}

async function geocodeEntry(b: any, cache: GeoCache): Promise<{ coords: Coords | null; fresh: boolean }> {
  const candidates = [
    [b.straat, b.postcode, b.stad, 'Nederland'].filter(Boolean).join(', '),
    [b.postcode, b.stad, 'Nederland'].filter(Boolean).join(', '),
    [(b.stad || ''), 'Nederland'].filter(Boolean).join(', '),
  ].filter(Boolean);

  for (const key of candidates) {
    if (key in cache) {
      if (cache[key] !== null) return { coords: cache[key], fresh: false };
      continue;
    }
    const coords = await nominatim(key);
    cache[key] = coords;
    return { coords, fresh: true };
  }
  return { coords: null, fresh: false };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Icons ────────────────────────────────────────────────────────────────────
function makePin(color: string, label?: string | number) {
  const lbl = label != null ? String(label) : '';
  const inner = lbl
    ? `<text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="700" font-family="system-ui">${lbl}</text>`
    : `<circle cx="12" cy="12" r="5" fill="white"/>`;
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 7.5 12 24 12 24s12-16.5 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>${inner}</svg>`,
    className: '', iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -38],
  });
}

function makePopup(b: any, color: string, isFav: boolean, stopNum?: number, vestigingen: any[] = []) {
  const q = encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
  const naam = (b.naam || '').replace(/'/g, "\\'");
  const badge = stopNum != null
    ? `<span style="background:${color};color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">Stop ${stopNum}</span>`
    : `<span style="background:${color}22;color:${color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">${isFav ? 'Favoriet' : (b.source || 'Onbekend')}</span>`;
  const vestigingenHtml = vestigingen.length ? `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0">
      <div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:4px">Andere vestigingen (${vestigingen.length})</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        ${vestigingen.map(v => `<button onclick="window._inncemGoToVestiging('${vestigingKey(v).replace(/'/g, "\\'")}')" style="font-size:11px;color:#1e293b;background:#f8fafc;border:1px solid #e2e8f0;padding:4px 8px;border-radius:4px;cursor:pointer;text-align:left">📍 ${(v.stad || v.naam || '')}${v.straat ? ` <span style="color:#94a3b8">· ${v.straat}</span>` : ''}</button>`).join('')}
      </div>
    </div>` : '';
  return `<div style="font-family:system-ui,sans-serif;min-width:220px;max-width:280px">
    <b style="font-size:13px;color:#1e293b">${b.naam || ''}</b>
    ${b.straat ? `<div style="color:#64748b;font-size:12px;margin-top:2px">${b.straat}</div>` : ''}
    <div style="color:#64748b;font-size:12px">${[b.postcode, b.stad].filter(Boolean).join(' ')}</div>
    ${b.telefoon ? `<div style="font-size:12px;color:#374151;margin-top:4px;display:flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.45 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${b.telefoon}</div>` : ''}
    ${b.email ? `<div style="font-size:12px;color:#374151;margin-top:2px;display:flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>${b.email}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${b.website ? `<a href="${toUrl(b.website)}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Maps →</a>
    </div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
      <button onclick="window._inncemNav('database','${naam}')" style="font-size:11px;color:#1e293b;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>Database</button>
      <button onclick="window._inncemNav('search','${naam}')" style="font-size:11px;color:#E85E26;background:#fff7f5;border:1px solid #E85E26;padding:3px 8px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Live Zoeken</button>
    </div>
    ${vestigingenHtml}
    <div style="margin-top:8px">${badge}</div>
  </div>`;
}

// ─── Route helpers ────────────────────────────────────────────────────────────
function dist([a, b]: Coords, [c, d]: Coords) { return (a - c) ** 2 + (b - d) ** 2; }

function nearestNeighbour(start: Coords, pts: GeoEntry[]): GeoEntry[] {
  const rem = [...pts];
  const out: GeoEntry[] = [];
  let cur = start;
  while (rem.length) {
    let bi = 0;
    rem.forEach((p, i) => { if (dist(cur, p.coords!) < dist(cur, rem[bi].coords!)) bi = i; });
    out.push(rem[bi]);
    cur = rem[bi].coords!;
    rem.splice(bi, 1);
  }
  return out;
}

function buildMapsUrl(stops: GeoEntry[], start: string, returnHome: boolean) {
  const enc = (b: any) => encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
  const limited = stops.slice(0, 10);
  const parts = [encodeURIComponent(start), ...limited.map(s => enc(s.entry)), ...(returnHome ? [encodeURIComponent(start)] : [])];
  return `https://www.google.com/maps/dir/${parts.join('/')}?travelmode=driving`;
}

// ─── Address verification ─────────────────────────────────────────────────────
type VerifyStatus = 'idle' | 'checking' | 'ok' | 'suspect' | 'not_found';
interface AddressSuggestion { straat: string; postcode: string; stad: string; display: string; allStadFields?: string[]; }
interface Verification { status: VerifyStatus; suggestion?: AddressSuggestion; reason?: string; accepted?: boolean; }

function extractStadFields(a: any): string[] {
  return [a.city, a.town, a.village, a.suburb, a.hamlet, a.neighbourhood, a.municipality, a.county]
    .filter(Boolean) as string[];
}

async function reverseGeocode(lat: number, lon: number): Promise<AddressSuggestion | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
    );
    const d = await r.json();
    if (!d?.address) return null;
    const a = d.address;
    const allStadFields = extractStadFields(a);
    return { straat: [a.road, a.house_number].filter(Boolean).join(' '), postcode: a.postcode || '', stad: allStadFields[0] || '', allStadFields, display: d.display_name || '' };
  } catch { return null; }
}

async function searchByName(naam: string, stad: string): Promise<AddressSuggestion | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(`${naam} ${stad} Nederland`)}&countrycodes=nl&limit=1`,
      { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
    );
    const d = await r.json();
    if (!d?.[0]?.address) return null;
    const a = d[0].address;
    const allStadFields = extractStadFields(a);
    return { straat: [a.road, a.house_number].filter(Boolean).join(' '), postcode: a.postcode || '', stad: allStadFields[0] || '', allStadFields, display: d[0].display_name || '' };
  } catch { return null; }
}

function normalizePostcode(p: string) { return (p || '').replace(/\s+/g, '').toUpperCase(); }
function normalizeSad(s: string) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }

async function verifyEntry(b: any, coords: Coords | null): Promise<Verification> {
  const storedStraat   = (b.straat || '').toLowerCase().trim();
  const storedPostcode = normalizePostcode(b.postcode);
  const storedStad     = normalizeSad(b.stad);

  if (!coords) {
    const found = await searchByName(b.naam, b.stad || '');
    if (found) return { status: 'suspect', suggestion: found, reason: 'Adres kon niet worden opgezocht. Gevonden via naam:' };
    return { status: 'not_found', reason: 'Adres niet gevonden, geen alternatief beschikbaar.' };
  }

  const canonical = await reverseGeocode(coords[0], coords[1]);
  if (!canonical) return { status: 'ok' };

  // Check stored city against ALL place-name fields Nominatim returns
  // (covers villages inside a larger municipality, e.g. Bornerbroek inside Almelo)
  const canonStadFields = (canonical.allStadFields || [canonical.stad]).map(normalizeSad);
  const stadMatch = !storedStad || canonStadFields.some(f => f.includes(storedStad) || storedStad.includes(f));

  const canonPost = normalizePostcode(canonical.postcode);
  const canonStr  = canonical.straat.toLowerCase().trim();
  const postMismatch = storedPostcode && canonPost && storedPostcode.slice(0, 4) !== canonPost.slice(0, 4);
  const strMismatch  = storedStraat && canonStr && !canonStr.includes(storedStraat.split(' ')[0]) && !storedStraat.split(' ')[0].includes(canonStr.split(' ')[0]);

  if (!stadMatch || postMismatch || (strMismatch && postMismatch)) {
    const reason = !stadMatch
      ? `Opgeslagen stad "${b.stad}" wijkt af van gevonden stad "${canonical.stad}".`
      : `Postcode/straat wijkt af van geverifieerd adres.`;
    return { status: 'suspect', suggestion: canonical, reason };
  }
  return { status: 'ok' };
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeoEntry {
  entry: any;
  coords: Coords | null;
  color: string;
  isFav: boolean;
  marker?: L.Marker;
}
interface SavedMap   { id: string; name: string; sources: string[]; includeFavorites: boolean; province: string; city: string; savedAt: number; }
interface SavedRoute { id: string; name: string; startAddress: string; returnToStart: boolean; stops: string[]; savedAt: number; }
interface Props {
  allData: any[];
  favorites: { name: string; city: string; _raw?: any }[];
  selectedItems?: any[];
  selectedIds?: Set<string>;
  onToggleSelect?: (naam: string, raw: any) => void;
  onClearSelection?: () => void;
  bottomOffset?: number;
  onNavigate?: (target: 'database' | 'search', naam: string) => void;
  onAddressCorrection?: (naam: string, correction: { straat: string; postcode: string; stad: string }) => void;
  onDeleteEntry?: (naam: string, straat?: string) => void;
  onMarkerCountChange?: (count: number) => void;
  onAddCompany?: () => void;
}

const DEFAULT_START = 'Lansinkesweg 4, 7553 AE Hengelo';

// ─── Component ────────────────────────────────────────────────────────────────
const MapView: React.FC<Props> = ({ allData, favorites, selectedItems = [], selectedIds = new Set(), onToggleSelect, onClearSelection, bottomOffset = 0, onNavigate, onAddressCorrection, onDeleteEntry, onMarkerCountChange, onAddCompany }) => {
  const hasSelection = selectedItems.length > 0;
  const [mapSearch, setMapSearch] = useState('');
  const searchResults = useMemo(() => {
    const q = mapSearch.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    const terms = q.split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 0) return [];

    // Discipline-aliassen: zoekterm → wat het betekent in de data
    const DISCIPLINE_MAP: Record<string, (b: any) => boolean> = {
      'architect':    b => (b.source||'').toLowerCase() === 'architectenweb' || (b.naam||'').toLowerCase().includes('architect'),
      'architecten':  b => (b.source||'').toLowerCase() === 'architectenweb' || (b.naam||'').toLowerCase().includes('architect'),
      'aannemer':     b => (b.source||'').toLowerCase() === 'bouwgarant' || (b.naam||'').toLowerCase().includes('aannemer'),
      'aannemers':    b => (b.source||'').toLowerCase() === 'bouwgarant' || (b.naam||'').toLowerCase().includes('aannemer'),
      'bouwbedrijf':  b => (b.naam||'').toLowerCase().includes('bouw'),
      'bouwbedrijven':b => (b.naam||'').toLowerCase().includes('bouw'),
      'hout':         b => ['stiho','jongeneel'].includes((b.source||'').toLowerCase()) || (b.naam||'').toLowerCase().includes('hout'),
      'houthandel':   b => ['stiho','jongeneel'].includes((b.source||'').toLowerCase()),
      'nieuwbouw':    b => [b.spec1,b.spec2,b.spec3].filter(Boolean).join(' ').toLowerCase().includes('nieuwbouw'),
      'renovatie':    b => { const s=[b.spec1,b.spec2,b.spec3].filter(Boolean).join(' ').toLowerCase(); return s.includes('verbouw')||s.includes('renovatie')||s.includes('aanbouw'); },
      'verduurzaming':b => { const s=[b.spec1,b.spec2,b.spec3].filter(Boolean).join(' ').toLowerCase(); return s.includes('verduurzam')||s.includes('isoler')||s.includes('nul-op-de-meter'); },
      'restauratie':  b => { const s=[b.spec1,b.spec2,b.spec3].filter(Boolean).join(' ').toLowerCase(); return s.includes('restauratie')||s.includes('monumentaal'); },
      'allround':     b => [b.spec1,b.spec2,b.spec3].filter(Boolean).join(' ').toLowerCase().includes('allround'),
    };

    const score = (b: any): number => {
      const naam  = (b.naam     || '').toLowerCase();
      const stad  = (b.stad     || '').toLowerCase();
      const pc    = (b.postcode || '').toLowerCase().replace(/\s/g, '');
      const src   = (b.source   || '').toLowerCase();
      const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
      const fields = naam + ' ' + stad + ' ' + pc + ' ' + src + ' ' + specs;
      let s = 0;
      let matchedTerms = 0;

      for (const t of terms) {
        let termScore = 0;

        // Naam-matching (fijnmazige stappen)
        if (naam === t)                                         termScore += 2000;
        else if (naam.startsWith(t + ' ') || naam === t)       termScore += 1500;
        else if (naam.startsWith(t))                            termScore += 1400;
        else if (naam.includes(' ' + t + ' ') || naam.includes('-' + t)) termScore += 900;
        else if (naam.includes(' ' + t))                        termScore += 800;
        else if (naam.includes(t))                              termScore += 400 + Math.min(200, t.length * 20);

        // Stad-matching
        if (stad === t)                                         termScore += 650;
        else if (stad.startsWith(t))                            termScore += 450;
        else if (stad.includes(t))                              termScore += 220;

        // Postcode
        if (pc.startsWith(t.replace(/\s/g, '')))               termScore += 350;

        // Bron/specs (directe tekst)
        if (specs.includes(t))                                  termScore += 150;
        if (src.includes(t))                                    termScore += 80;

        // Discipline-alias: term herkend als categorie
        const disciplineFn = DISCIPLINE_MAP[t];
        if (disciplineFn && disciplineFn(b))                   termScore += 500;

        if (termScore > 0) matchedTerms++;
        s += termScore;
      }

      // Bonus: alle termen matchen
      if (matchedTerms === terms.length && terms.length > 1)   s += terms.length * 250;
      // Kleine bonus voor volledigheid data
      if (b.website) s += 10;
      if (b.telefoon || b.email) s += 5;

      return s;
    };

    const isDisciplineTerm = (t: string) => !!DISCIPLINE_MAP[t];

    return allData
      .filter(b => {
        if (!(b.naam || '').trim()) return false;
        const naam  = (b.naam     || '').toLowerCase();
        const stad  = (b.stad     || '').toLowerCase();
        const pc    = (b.postcode || '').toLowerCase().replace(/\s/g, '');
        const src   = (b.source   || '').toLowerCase();
        const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
        const fields = naam + ' ' + stad + ' ' + pc + ' ' + src + ' ' + specs;
        return terms.some(t =>
          fields.includes(t) || (isDisciplineTerm(t) && DISCIPLINE_MAP[t](b))
        );
      })
      .map(b => ({ b, s: score(b) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 15)
      .map(({ b }) => b);
  }, [mapSearch, allData]);
  const mapDiv  = useRef<HTMLDivElement>(null);
  const mapRef  = useRef<L.Map | null>(null);
  const abortRef = useRef(false);

  // Responsive: collapse the split-screen (sidebar + map) into a stacked layout on mobile
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Draggable split between sidebar and map
  const [sidebarWidth, setSidebarWidth] = useState(420); // px
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingMap = useRef(false);
  const startMapDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingMap.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingMap.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newWidth = Math.min(520, Math.max(180, ev.clientX - rect.left));
      setSidebarWidth(newWidth);
      mapRef.current?.invalidateSize();
    };
    const onUp = () => { isDraggingMap.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Filters
  const [sources,   setSources]   = useState<string[]>([]);
  const [inclFavs,  setInclFavs]  = useState(false);
  const [province,  setProvince]  = useState('');
  const [city,      setCity]      = useState('');

  // Loading state
  const [isLoading,  setIsLoading]  = useState(false);
  const [progDone,   setProgDone]   = useState(0);
  const [progTotal,  setProgTotal]  = useState(0);

  // Map entries (currently displayed)
  const [entries,      setEntries]      = useState<GeoEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => { onMarkerCountChange?.(entries.length); }, [entries.length]);
  const [msg,          setMsg]          = useState('');

  // Route
  const [routeMode,    setRouteMode]    = useState(false);
  const dragIdx = useRef<number | null>(null);

  const reorderRouteStops = (from: number, to: number) => {
    if (from === to) return;
    setRouteStops(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      next.forEach((ge, i) => {
        if (ge.coords && ge.marker && mapRef.current) {
          ge.marker.remove();
          ge.marker = L.marker(ge.coords, { icon: makePin(ge.color, i + 1) })
            .bindPopup(makePopup(ge.entry, ge.color, ge.isFav, i + 1), { maxWidth: 290 })
            .addTo(mapRef.current!);
        }
      });
      return next;
    });
  };
  const [startAddr,    setStartAddr]    = useState(DEFAULT_START);
  const [returnHome,   setReturnHome]   = useState(true);
  const [stopMenuOpen,     setStopMenuOpen]     = useState<number | null>(null);
  const [replacingStopIdx, setReplacingStopIdx] = useState<number | null>(null);
  const [replaceStopQuery, setReplaceStopQuery] = useState('');

  const removeRouteStop = (i: number) => {
    setRouteStops(prev => {
      prev[i]?.marker?.remove();
      const next = prev.filter((_, idx) => idx !== i);
      next.forEach((ge, idx) => {
        if (ge.coords && ge.marker && mapRef.current) {
          ge.marker.remove();
          ge.marker = L.marker(ge.coords, { icon: makePin(ge.color, idx + 1) })
            .bindPopup(makePopup(ge.entry, ge.color, ge.isFav, idx + 1), { maxWidth: 290 })
            .addTo(mapRef.current!);
        }
      });
      return next;
    });
  };

  const replaceRouteStop = async (i: number, raw: any) => {
    const cache = loadCache();
    const { coords } = await geocodeEntry(raw, cache);
    const color = SRC_COLOR[raw.source] || SRC_COLOR['Onbekend'];
    setRouteStops(prev => {
      prev[i]?.marker?.remove();
      const next = [...prev];
      const ge: GeoEntry = { entry: raw, coords, color, isFav: false };
      if (coords && mapRef.current) {
        ge.marker = L.marker(coords, { icon: makePin(color, i + 1) })
          .bindPopup(makePopup(raw, color, false, i + 1), { maxWidth: 290 })
          .addTo(mapRef.current);
      }
      next[i] = ge;
      return next;
    });
    setReplacingStopIdx(null);
    setReplaceStopQuery('');
  };

  const [insertAfterIdx,  setInsertAfterIdx]  = useState<number | null>(null);
  const [insertQuery,     setInsertQuery]     = useState('');

  const insertRouteStop = async (afterIdx: number, raw: any) => {
    const cache = loadCache();
    const { coords } = await geocodeEntry(raw, cache);
    const color = SRC_COLOR[raw.source] || SRC_COLOR['Onbekend'];
    setRouteStops(prev => {
      const next = [...prev];
      const ge: GeoEntry = { entry: raw, coords, color, isFav: false };
      next.splice(afterIdx + 1, 0, ge);
      next.forEach((s, idx) => {
        if (s.coords && mapRef.current) {
          s.marker?.remove();
          s.marker = L.marker(s.coords, { icon: makePin(s.color, idx + 1) })
            .bindPopup(makePopup(s.entry, s.color, s.isFav, idx + 1), { maxWidth: 290 })
            .addTo(mapRef.current);
        }
      });
      return next;
    });
    setInsertAfterIdx(null);
    setInsertQuery('');
  };
  const [routeStops,   setRouteStops]   = useState<GeoEntry[]>([]);
  const [isOptimising, setIsOptimising] = useState(false);

  // Draw-area mode
  const [drawMode,     setDrawMode]     = useState(false);
  const [drawStep,     setDrawStep]     = useState<0|1>(0); // 0=waiting for center, 1=center placed
  const [drawCenter,   setDrawCenter]   = useState<{lat: number; lng: number} | null>(null);
  const [drawRadiusM,  setDrawRadiusM]  = useState<number>(0);
  const [drawPlanType, setDrawPlanType] = useState<BezoekType>('mix');
  const [drawPlanMax,  setDrawPlanMax]  = useState(10);
  const drawCircleRef  = useRef<L.Circle | null>(null);
  const drawMarkerRef  = useRef<L.Marker | null>(null);
  const drawCenterRef  = useRef<{lat: number; lng: number} | null>(null);

  // Dagbezoek planner
  const [planOpen,    setPlanOpen]    = useState(false);
  const [planLocatie, setPlanLocatie] = useState('');
  const [planType,    setPlanType]    = useState<BezoekType>('mix');
  const [planMax,     setPlanMax]     = useState(12);
  const [planLoading, setPlanLoading] = useState(false);
  const [planMsg,     setPlanMsg]     = useState('');

  // Address verification
  const [verifications, setVerifications] = useState<Record<string, Verification>>({});
  const [showVerify,    setShowVerify]    = useState(false);
  const [isVerifying,   setIsVerifying]   = useState(false);
  const HANDLED_KEY = 'inncempro_verify_handled';
  const [handledVerify, setHandledVerify] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('inncempro_verify_handled') || '[]')); } catch { return new Set(); }
  });
  const markHandled = (naam: string) => {
    setHandledVerify(prev => {
      const next = new Set(prev);
      next.add(naam);
      localStorage.setItem(HANDLED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Save / load
  const [savedMaps,   setSavedMaps]   = useState<SavedMap[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [saveWhat,    setSaveWhat]    = useState<'map'|'route'|null>(null);
  const [saveName,    setSaveName]    = useState('');
  const [showSaved,   setShowSaved]   = useState(true);

  const provinces = useMemo(
    () => Array.from(new Set(allData.map(b => b.provincie).filter(Boolean))).sort() as string[],
    [allData],
  );

  // Index van kernnaam -> alle bedrijven met die kernnaam, voor het vinden van vestigingen.
  const coreIndex = useMemo(() => {
    const idx = new Map<string, any[]>();
    for (const b of allData) {
      const core = coreCompanyName(b.naam, b.stad);
      if (!core || core.length < 3) continue;
      if (!idx.has(core)) idx.set(core, []);
      idx.get(core)!.push(b);
    }
    return idx;
  }, [allData]);

  // ── Filtered count (no geocoding needed) ────────────────────────────────────
  const filteredCount = useMemo(() => {
    const inclSel = sources.includes('Geselecteerde items');
    let items = allData.filter(b => {
      const src = b.source || 'Onbekend';
      if (!sources.includes(src)) return false;
      if (province && b.provincie !== province) return false;
      if (city.trim()) {
        const q   = city.trim().toLowerCase();
        const st  = (b.stad || '').toLowerCase();
        const pc  = (b.postcode || '').toLowerCase().replace(/\s/g, '');
        if (!st.startsWith(q) && !pc.startsWith(q.replace(/\s/g, ''))) return false;
      }
      return true;
    });
    const seenKeys = new Set(items.map(b => `${b.naam}|${b.stad}`));
    const selExtra = inclSel ? selectedItems.filter(b => {
      const k = `${b.naam}|${b.stad}`;
      if (seenKeys.has(k)) return false;
      if (province && b.provincie !== province) return false;
      if (city.trim()) {
        const q = city.trim().toLowerCase();
        const st = (b.stad || '').toLowerCase();
        const pc = (b.postcode || '').toLowerCase().replace(/\s/g, '');
        if (!st.startsWith(q) && !pc.startsWith(q.replace(/\s/g, ''))) return false;
      }
      return true;
    }) : [];
    const favExtra = inclFavs
      ? favorites.filter(fav => !items.find(b =>
          b.naam?.toLowerCase().trim() === fav.name?.toLowerCase().trim() &&
          b.stad?.toLowerCase().trim() === fav.city?.toLowerCase().trim()
        ))
      : [];
    return items.length + selExtra.length + favExtra.length;
  }, [sources, inclFavs, province, city, allData, favorites, selectedItems]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    mapRef.current = L.map(mapDiv.current, { center: [52.15, 5.2], zoom: 7 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapRef.current);
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(mapDiv.current);
    return () => { abortRef.current = true; ro.disconnect(); mapRef.current?.remove(); mapRef.current = null; delete (window as any)._inncemNav; };
  }, []);

  // Keep global nav handler in sync with prop
  useEffect(() => {
    (window as any)._inncemNav = (target: 'database' | 'search', naam: string) => onNavigate?.(target, naam);
  }, [onNavigate]);

  // Auto-select "Geselecteerde items" when items are provided and nothing is selected yet
  useEffect(() => {
    if (hasSelection && !sources.includes('Geselecteerde items')) {
      setSources(prev => [...prev, 'Geselecteerde items']);
    }
  }, [hasSelection]);

  // ── Load persisted ──────────────────────────────────────────────────────────
  useEffect(() => {
    try { setSavedMaps(JSON.parse(localStorage.getItem(MAPS_KEY) || '[]')); } catch {}
    try { setSavedRoutes(JSON.parse(localStorage.getItem(ROUTES_KEY) || '[]')); } catch {}
  }, []);

  // ── Haversine distance (meters) ─────────────────────────────────────────────
  const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // ── Draw-area map event handlers ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();

    if (!drawMode) {
      container.style.cursor = '';
      // clean up any leftover overlays
      drawCircleRef.current?.remove(); drawCircleRef.current = null;
      drawMarkerRef.current?.remove(); drawMarkerRef.current = null;
      return;
    }

    container.style.cursor = 'crosshair';

    const onClick = (e: L.LeafletMouseEvent) => {
      if (!drawCenterRef.current) {
        // First click → set center
        drawCenterRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
        setDrawStep(1);
        drawMarkerRef.current?.remove();
        drawMarkerRef.current = L.marker(e.latlng, {
          icon: L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:50%;background:#009FE3;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>', iconSize: [12,12], iconAnchor: [6,6] })
        }).addTo(map);
        drawCircleRef.current?.remove();
        drawCircleRef.current = L.circle(e.latlng, { radius: 1, color: '#009FE3', fillColor: '#009FE3', fillOpacity: 0.08, weight: 2 }).addTo(map);
      } else {
        // Second click → confirm radius
        const radiusM = haversineM(drawCenterRef.current.lat, drawCenterRef.current.lng, e.latlng.lat, e.latlng.lng);
        setDrawCenter({ ...drawCenterRef.current });
        setDrawRadiusM(radiusM);
        setDrawMode(false);
        setDrawStep(0);
        container.style.cursor = '';
      }
    };

    const onMove = (e: L.LeafletMouseEvent) => {
      if (!drawCenterRef.current || !drawCircleRef.current) return;
      const radiusM = haversineM(drawCenterRef.current.lat, drawCenterRef.current.lng, e.latlng.lat, e.latlng.lng);
      drawCircleRef.current.setRadius(radiusM);
    };

    map.on('click', onClick);
    map.on('mousemove', onMove);
    return () => { map.off('click', onClick); map.off('mousemove', onMove); };
  }, [drawMode]);

  // Dim markers outside the drawn area
  useEffect(() => {
    entries.forEach(ge => {
      if (!ge.marker) return;
      if (drawCenter && ge.coords) {
        const inside = haversineM(drawCenter.lat, drawCenter.lng, ge.coords[0], ge.coords[1]) <= drawRadiusM;
        ge.marker.setOpacity(inside ? 1 : 0.2);
      } else {
        ge.marker.setOpacity(1);
      }
    });
  }, [drawCenter, drawRadiusM, entries]);

  const clearDrawArea = () => {
    drawCircleRef.current?.remove(); drawCircleRef.current = null;
    drawMarkerRef.current?.remove(); drawMarkerRef.current = null;
    drawCenterRef.current = null;
    setDrawCenter(null);
    setDrawRadiusM(0);
    setDrawStep(0);
  };

  // Normalise a company name for dedup comparison (strips legal suffixes/punctuation)
  const normNaam = (s: string) => (s || '').toLowerCase()
    .replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  // ── Load best-matching companies in drawn area into the route ─────────────────
  const planBezoekInArea = async (center: {lat: number; lng: number}, radiusM: number, type: BezoekType, max: number) => {
    setMsg('');
    abortRef.current = false;
    clearMarkers(entries);
    setEntries([]);
    setRouteMode(false);
    setRouteStops([]);

    // Score only companies within the drawn radius — small overfetch buffer for geocode misses
    const radiusKm = radiusM / 1000;
    const types: BezoekType[] = type === 'mix' ? [] : [type];
    const scored = scoreBedrijven(allData, center.lat, center.lng, types, cityCoords as any, Math.ceil(max * 1.5), radiusKm);

    setProgDone(0);
    setProgTotal(max);
    setIsLoading(true);

    const cache = loadCache();
    const pool: GeoEntry[] = [];
    const seenNames = new Set<string>();
    let added = 0;

    for (let i = 0; i < scored.length && added < max; i++) {
      if (abortRef.current) break;
      const { bedrijf } = scored[i];
      const nn = normNaam(bedrijf.naam);
      if (nn && seenNames.has(nn)) continue; // never place the same company twice
      const { coords, fresh } = await geocodeEntry(bedrijf, cache);
      if (fresh) await sleep(1100);

      if (!coords || haversineM(center.lat, center.lng, coords[0], coords[1]) > radiusM) continue;

      seenNames.add(nn);
      const color = SRC_COLOR[bedrijf.source] || SRC_COLOR['Onbekend'];
      const ge: GeoEntry = { entry: bedrijf, coords, color, isFav: false };
      if (mapRef.current) {
        ge.marker = L.marker(coords, { icon: makePin(color, added + 1) })
          .bindPopup(makePopup(bedrijf, color, false, undefined, getVestigingen(bedrijf, coreIndex)), { maxWidth: 290 })
          .addTo(mapRef.current);
        vestigingRegistry.set(vestigingKey(bedrijf), ge.marker);
      }
      pool.push(ge);
      added++;
      setProgDone(added);
    }

    setEntries(pool);
    setVisibleCount(pool.length);
    setIsLoading(false);

    if (pool.length > 0 && mapRef.current) {
      mapRef.current.fitBounds(L.latLngBounds(pool.map(e => e.coords!)), { padding: [30, 30] });
    }
    if (pool.length === 0) setMsg('Geen bedrijven gevonden in dit gebied. Probeer een groter gebied of ander type.');
  };

  // ── Clear markers from map ───────────────────────────────────────────────────
  const clearMarkers = (pool: GeoEntry[]) => pool.forEach(e => e.marker?.remove());

  // ── Dagbezoek planner ─────────────────────────────────────────────────────────
  const planBezoek = async () => {
    const loc = planLocatie.trim();
    if (!loc) { setPlanMsg('Vul een stad, dorp of provincie in.'); return; }
    setPlanLoading(true); setPlanMsg('');
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(loc + ' Nederland')}&countrycodes=nl&limit=1`,
        { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
      );
      const d = await r.json();
      if (!d?.[0]) { setPlanMsg(`"${loc}" niet gevonden.`); setPlanLoading(false); return; }
      const lat = parseFloat(d[0].lat);
      const lon = parseFloat(d[0].lon);

      const scored = scoreBedrijven(allData, lat, lon, planType, cityCoords as any, planMax);
      if (scored.length === 0) { setPlanMsg('Geen bedrijven gevonden in de buurt.'); setPlanLoading(false); return; }

      // Clear map and load the scored companies
      clearMarkers(entries);
      setEntries([]);
      setRouteMode(false);
      setRouteStops([]);
      abortRef.current = false;

      const cache = loadCache();
      const pool: GeoEntry[] = [];
      const seenNames = new Set<string>();
      setProgTotal(scored.length); setProgDone(0); setIsLoading(true);

      for (let i = 0; i < scored.length; i++) {
        if (abortRef.current) break;
        const { bedrijf } = scored[i];
        const nn = normNaam(bedrijf.naam);
        if (nn && seenNames.has(nn)) { setProgDone(i + 1); continue; } // never place the same company twice
        seenNames.add(nn);
        const { coords, fresh } = await geocodeEntry(bedrijf, cache);
        if (fresh) await sleep(1100);
        const color = SRC_COLOR[bedrijf.source] || SRC_COLOR['Onbekend'];
        const ge: GeoEntry = { entry: bedrijf, coords, color, isFav: false };
        if (coords && mapRef.current) {
          ge.marker = L.marker(coords, { icon: makePin(color) })
            .bindPopup(makePopup(bedrijf, color, false, undefined, getVestigingen(bedrijf, coreIndex)), { maxWidth: 290 })
            .addTo(mapRef.current);
          vestigingRegistry.set(vestigingKey(bedrijf), ge.marker);
        }
        pool.push(ge);
        setProgDone(i + 1);
      }

      setEntries(pool);
      setVisibleCount(pool.filter(e => e.coords).length);
      setIsLoading(false);

      const placed = pool.filter(e => e.coords);
      if (placed.length > 0 && mapRef.current) {
        mapRef.current.fitBounds(L.latLngBounds(placed.map(e => e.coords!)), { padding: [30, 30] });
      }
      setPlanOpen(false);
    } catch { setPlanMsg('Er ging iets mis. Probeer opnieuw.'); }
    setPlanLoading(false);
  };

  // ── Address verification ─────────────────────────────────────────────────────
  const runVerification = async () => {
    if (entries.length === 0) return;
    setIsVerifying(true);
    setShowVerify(true);
    const next: Record<string, Verification> = {};
    for (const ge of entries) {
      const key = ge.entry.naam;
      if (handledVerify.has(key)) continue;  // skip already-handled
      next[key] = { status: 'checking' };
      setVerifications({ ...next });
      const result = await verifyEntry(ge.entry, ge.coords);
      if (result.status === 'ok' || result.status === 'not_found') {
        markHandled(key);  // silently skip: ok = correct, not_found = unresolvable
        continue;
      }
      next[key] = result;
      setVerifications({ ...next });
      await sleep(1100);
    }
    setIsVerifying(false);
  };

  const acceptCorrection = (entry: any, suggestion: AddressSuggestion) => {
    onAddressCorrection?.(entry.naam, { straat: suggestion.straat, postcode: suggestion.postcode, stad: suggestion.stad });
    setVerifications(prev => ({ ...prev, [entry.naam]: { ...prev[entry.naam], accepted: true } }));
    markHandled(entry.naam);
  };

  const dismissVerification = (naam: string) => {
    setVerifications(prev => ({ ...prev, [naam]: { ...prev[naam], accepted: true } }));
    markHandled(naam);
  };

  const deleteEntry = (naam: string, straat?: string) => {
    onDeleteEntry?.(naam, straat);
    setVerifications(prev => ({ ...prev, [naam]: { ...prev[naam], accepted: true } }));
    setEntries(prev => prev.filter(ge => ge.entry.naam !== naam));
    markHandled(naam);
  };

  const addAsExtraVestiging = (entry: any, suggestion: AddressSuggestion) => {
    const existing = loadCustom();
    const newEntry: CustomAddress = {
      id: Date.now().toString(),
      naam: entry.naam,
      straat: suggestion.straat,
      postcode: suggestion.postcode,
      stad: suggestion.stad,
      provincie: entry.provincie || '',
      telefoon: entry.telefoon || '',
      website: entry.website || '',
      notitie: `Extra vestiging (gevonden via adresverificatie)`,
      source: 'Mijn Adressen',
      addedAt: Date.now(),
    };
    saveCustom([...existing, newEntry]);
    setVerifications(prev => ({ ...prev, [entry.naam]: { ...prev[entry.naam], accepted: true } }));
    markHandled(entry.naam);
  };

  // ── GENERATE MAP (on demand) ─────────────────────────────────────────────────
  const generateMap = async () => {
    if (filteredCount === 0) { setMsg('Selecteer eerst een bron of filter.'); return; }
    setMsg('');
    abortRef.current = false;

    // Clear current markers + route
    clearMarkers(entries);
    setEntries([]);
    setRouteMode(false);
    setRouteStops([]);

    // Build the list to geocode
    const inclSel = sources.includes('Geselecteerde items');
    const filtered = allData.filter(b => {
      const src = b.source || 'Onbekend';
      if (!sources.includes(src)) return false;
      if (province && b.provincie !== province) return false;
      if (city.trim()) {
        const q  = city.trim().toLowerCase();
        const st = (b.stad || '').toLowerCase();
        const pc = (b.postcode || '').toLowerCase().replace(/\s/g, '');
        if (!st.startsWith(q) && !pc.startsWith(q.replace(/\s/g, ''))) return false;
      }
      return true;
    });

    const seenKeys = new Set(filtered.map(b => `${b.naam}|${b.stad}`));
    const selEntries: { entry: any; isFav: boolean; isSel: boolean }[] = inclSel
      ? selectedItems.filter(b => {
          const k = `${b.naam}|${b.stad}`;
          if (seenKeys.has(k)) return false;
          if (province && b.provincie !== province) return false;
          if (city.trim()) {
            const q = city.trim().toLowerCase();
            const st = (b.stad || '').toLowerCase();
            const pc = (b.postcode || '').toLowerCase().replace(/\s/g, '');
            if (!st.startsWith(q) && !pc.startsWith(q.replace(/\s/g, ''))) return false;
          }
          seenKeys.add(k);
          return true;
        }).map(b => ({ entry: b, isFav: false, isSel: true }))
      : [];

    const favEntries: { entry: any; isFav: boolean }[] = inclFavs
      ? favorites.flatMap(fav => {
          const raw   = (fav as any)._raw;
          const entry = raw || allData.find(b =>
            b.naam?.toLowerCase().trim() === fav.name?.toLowerCase().trim() &&
            b.stad?.toLowerCase().trim() === fav.city?.toLowerCase().trim()
          );
          if (!entry) return [];
          const k = `${entry.naam}|${entry.stad}`;
          if (seenKeys.has(k)) return [];
          seenKeys.add(k);
          return [{ entry, isFav: true }];
        })
      : [];

    const toGeocode = [
      ...filtered.map(b => ({ entry: b, isFav: false, isSel: false })),
      ...selEntries,
      ...favEntries.map(fe => ({ ...fe, isSel: false })),
    ];

    setProgDone(0);
    setProgTotal(toGeocode.length);
    setIsLoading(true);

    const cache = loadCache();
    const pool: GeoEntry[] = [];
    let placed = 0;

    for (let i = 0; i < toGeocode.length; i++) {
      if (abortRef.current) break;
      const { entry, isFav, isSel } = toGeocode[i];
      const src   = entry.source || 'Onbekend';
      const color = isFav ? SRC_COLOR.Favorieten : isSel ? SRC_COLOR['Geselecteerde items'] : (SRC_COLOR[src] || '#64748B');
      const { coords, fresh } = await geocodeEntry(entry, cache);

      const ge: GeoEntry = { entry, coords, color, isFav };
      if (coords && mapRef.current) {
        ge.marker = L.marker(coords, { icon: makePin(color) })
          .bindPopup(makePopup(entry, color, isFav, undefined, getVestigingen(entry, coreIndex)), { maxWidth: 290 })
          .addTo(mapRef.current);
        vestigingRegistry.set(vestigingKey(entry), ge.marker);
        placed++;
      }
      pool.push(ge);
      setProgDone(i + 1);

      if (fresh) { saveCache(cache); await sleep(1100); }
    }

    saveCache(cache);
    setEntries(pool);
    setVisibleCount(placed);
    setIsLoading(false);

    // Fit bounds
    const coords = pool.filter(e => e.coords).map(e => e.coords!);
    if (coords.length > 0 && mapRef.current) {
      mapRef.current.fitBounds(coords as L.LatLngBoundsExpression, { padding: [50, 50], maxZoom: 14 });
    }
    if (placed === 0) setMsg('Geen adressen gevonden voor deze selectie.');
  };

  // ── Route ────────────────────────────────────────────────────────────────────
  const handlePlanRoute = async () => {
    const visible = entries.filter(e => e.coords && e.marker);
    if (visible.length === 0) { setMsg('Geen zichtbare locaties voor route.'); return; }
    setIsOptimising(true);
    const cache = loadCache();
    let startCoords: Coords = [52.265, 6.795];
    if (startAddr in cache && cache[startAddr]) { startCoords = cache[startAddr]!; }
    else {
      const c = await nominatim(startAddr);
      if (c) { startCoords = c; cache[startAddr] = c; saveCache(cache); }
    }
    const ordered = nearestNeighbour(startCoords, visible);
    setRouteStops(ordered);
    setRouteMode(true);
    setIsOptimising(false);

    // Redraw with numbered pins
    entries.forEach(e => e.marker?.remove());
    ordered.forEach((ge, idx) => {
      if (!mapRef.current || !ge.coords) return;
      ge.marker = L.marker(ge.coords, { icon: makePin(ge.color, idx + 1) })
        .bindPopup(makePopup(ge.entry, ge.color, ge.isFav, idx + 1), { maxWidth: 290 })
        .addTo(mapRef.current!);
    });
  };

  const cancelRoute = () => {
    setRouteMode(false);
    setRouteStops([]);
    // Restore normal pins
    entries.forEach(e => {
      e.marker?.remove();
      if (e.coords && mapRef.current) {
        e.marker = L.marker(e.coords, { icon: makePin(e.color) })
          .bindPopup(makePopup(e.entry, e.color, e.isFav, undefined, getVestigingen(e.entry, coreIndex)), { maxWidth: 290 })
          .addTo(mapRef.current!);
        vestigingRegistry.set(vestigingKey(e.entry), e.marker);
      }
    });
  };

  // ── Save / load ──────────────────────────────────────────────────────────────
  const doSave = () => {
    if (!saveName.trim() || !saveWhat) return;
    if (saveWhat === 'map') {
      const m: SavedMap = { id: Date.now().toString(), name: saveName.trim(), sources, includeFavorites: inclFavs, province, city, savedAt: Date.now() };
      const u = [m, ...savedMaps]; setSavedMaps(u); localStorage.setItem(MAPS_KEY, JSON.stringify(u));
    } else {
      const r: SavedRoute = { id: Date.now().toString(), name: saveName.trim(), startAddress: startAddr, returnToStart: returnHome, stops: routeStops.map(ge => `${ge.entry.naam}|${ge.entry.stad}`), savedAt: Date.now() };
      const u = [r, ...savedRoutes]; setSavedRoutes(u); localStorage.setItem(ROUTES_KEY, JSON.stringify(u));
    }
    setSaveName(''); setSaveWhat(null);
  };

  const loadMap = (m: SavedMap) => {
    setSources(m.sources); setInclFavs(m.includeFavorites);
    setProvince(m.province || ''); setCity(m.city || '');
  };

  const loadRoute = (r: SavedRoute) => {
    setStartAddr(r.startAddress); setReturnHome(r.returnToStart);
    const keyMap = new Map(entries.map(ge => [`${ge.entry.naam}|${ge.entry.stad}`, ge]));
    const ordered = r.stops.map(k => keyMap.get(k)).filter(Boolean) as GeoEntry[];
    if (ordered.length === 0) { setMsg('Genereer eerst een kaart met de juiste filters.'); return; }
    setRouteStops(ordered); setRouteMode(true);
    entries.forEach(e => e.marker?.remove());
    ordered.forEach((ge, idx) => {
      if (!mapRef.current || !ge.coords) return;
      ge.marker = L.marker(ge.coords, { icon: makePin(ge.color, idx + 1) })
        .bindPopup(makePopup(ge.entry, ge.color, ge.isFav, idx + 1), { maxWidth: 290 })
        .addTo(mapRef.current!);
    });
  };

  const delItem = (id: string, type: 'map'|'route', e: React.MouseEvent) => {
    e.stopPropagation();
    if (type === 'map')   { const u = savedMaps.filter(m => m.id !== id);   setSavedMaps(u);   localStorage.setItem(MAPS_KEY,   JSON.stringify(u)); }
    else                  { const u = savedRoutes.filter(r => r.id !== id); setSavedRoutes(u); localStorage.setItem(ROUTES_KEY, JSON.stringify(u)); }
  };

  const srcCount = (src: string) => allData.filter(b => {
    if ((b.source || 'Onbekend') !== src) return false;
    if (province && b.provincie !== province) return false;
    if (city.trim()) {
      const q  = city.trim().toLowerCase();
      const st = (b.stad || '').toLowerCase();
      const pc = (b.postcode || '').toLowerCase().replace(/\s/g, '');
      if (!st.startsWith(q) && !pc.startsWith(q.replace(/\s/g, ''))) return false;
    }
    return true;
  }).length;
  const mapsUrl  = routeMode && routeStops.length > 0 ? buildMapsUrl(routeStops, startAddr, returnHome) : null;
  const pct      = progTotal > 0 ? Math.round(progDone / progTotal * 100) : 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={splitContainerRef} className="flex flex-col md:flex-row h-auto md:h-[calc(100dvh-220px)] min-h-0 md:min-h-[520px]">

      {/* ── Sidebar ── */}
      <div
        style={isMobile ? undefined : { width: sidebarWidth, minWidth: 180, maxWidth: 520 }}
        className="flex-shrink-0 flex flex-col gap-3 overflow-y-auto pb-4 pr-1 w-full max-h-[42vh] md:max-h-none md:w-auto">

        {/* Zoeken & Selectie */}
        <div className="bg-white rounded-sm border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Zoeken & selecteren</div>
            {onAddCompany && (
              <button onClick={onAddCompany} className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-slate-300 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-500 rounded-sm transition-all bg-white">
                <Plus className="w-3 h-3" /> Toevoegen
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={mapSearch}
              onChange={e => setMapSearch(e.target.value)}
              placeholder="Naam, stad of postcode…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:border-[#009FE3]"
            />
            {mapSearch && (
              <button onClick={() => setMapSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Zoekresultaten */}
          {searchResults.length > 0 && (
            <div className="space-y-0.5 max-h-48 overflow-y-auto -mx-1">
              {searchResults.map((b, i) => {
                const sel = selectedIds.has(b.naam);
                return (
                  <div
                    key={i}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${sel ? 'bg-[#E85E26]/10' : 'hover:bg-slate-50'}`}>
                    {/* Checkbox — toggles selection */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleSelect?.(b.naam, b); }}
                      className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center flex-shrink-0 transition-colors ${sel ? 'bg-[#E85E26] border-[#E85E26]' : 'border-slate-300 hover:border-[#E85E26]'}`}>
                      {sel && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                    {/* Naam — opent in database */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onNavigate?.('database', b.naam); }}
                      className={`flex-1 min-w-0 text-left font-semibold truncate transition-colors ${sel ? 'text-[#E85E26]' : 'text-slate-700 hover:text-[#009FE3]'}`}>
                      {b.naam}
                    </button>
                    <span className="text-slate-400 flex-shrink-0 text-[10px]">{b.stad}</span>
                  </div>
                );
              })}
            </div>
          )}
          {mapSearch.length >= 2 && searchResults.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-1">Geen resultaten</p>
          )}

          {/* Selectie teller + wis */}
          {hasSelection && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">{selectedItems.length} geselecteerd</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClearSelection?.(); }}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 font-medium transition-colors">
                <X className="w-3 h-3" /> Alles deselecteren
              </button>
            </div>
          )}
        </div>

        {/* Genereer Kaart — ALTIJD BOVENAAN */}
        <div className="bg-white rounded-sm border border-slate-200 p-4">
          {isLoading ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#009FE3]" /> Laden…
                </span>
                <span className="text-xs text-slate-400">{progDone}/{progTotal}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#009FE3] transition-all duration-200 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Eerste keer langzamer (1/sec). Daarna gecachet.</p>
              <button onClick={() => { abortRef.current = true; setIsLoading(false); }}
                className="mt-2 w-full py-1.5 text-xs text-slate-500 border border-slate-200 rounded-sm hover:bg-slate-50">
                Stoppen
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={generateMap}
                disabled={filteredCount === 0}
                className="w-full py-3 bg-[#009FE3] hover:bg-[#008ac5] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm rounded-sm flex items-center justify-center gap-2 transition-colors">
                <MapPin className="w-4 h-4" />
                {filteredCount > 0 ? `Genereer Kaart (${filteredCount})` : 'Selecteer bronnen hieronder'}
              </button>
              {visibleCount > 0 && (
                <p className="mt-2 text-center text-xs text-slate-400">{visibleCount} locaties op de kaart</p>
              )}
              {/* Teken gebied — always visible */}
              <div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
                {drawCenter ? (
                  <>
                    <div className="flex items-center justify-between text-xs text-[#009FE3] font-semibold">
                      <span>Gebied getekend</span>
                      <button onClick={clearDrawArea} className="text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {/* Radius slider */}
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Straal: {(drawRadiusM / 1000).toFixed(1)} km</p>
                      <input
                        type="range"
                        min={1}
                        max={200000}
                        step={500}
                        value={drawRadiusM}
                        onChange={e => {
                          const r = Number(e.target.value);
                          setDrawRadiusM(r);
                          drawCircleRef.current?.setRadius(r);
                        }}
                        className="w-full accent-[#009FE3] h-1.5"
                      />
                    </div>
                    {/* Type selector */}
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Type bedrijf</p>
                      <div className="grid grid-cols-2 gap-1">
                        {([['mix','Mix'], ['architecten','Architecten'], ['aannemers','Aannemers'], ['bouwbedrijven','Bouwbedrijven']] as [BezoekType, string][]).map(([v, l]) => (
                          <button key={v} onClick={() => setDrawPlanType(v)}
                            className={`py-1.5 text-[10px] font-bold rounded-sm border transition-colors ${drawPlanType === v ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'border-slate-200 text-slate-600 hover:border-[#009FE3] hover:text-[#009FE3]'}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Max slider */}
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Max resultaten: {drawPlanMax}</p>
                      <div className="flex gap-1">
                        {[5, 10, 20, 50].map(n => (
                          <button key={n} onClick={() => setDrawPlanMax(n)}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-sm border transition-colors ${drawPlanMax === n ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'border-slate-200 text-slate-600 hover:border-[#E85E26] hover:text-[#E85E26]'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Load button */}
                    <button
                      onClick={() => planBezoekInArea(drawCenter, drawRadiusM, drawPlanType, drawPlanMax)}
                      disabled={isLoading}
                      className="w-full py-2.5 bg-[#E85E26] hover:bg-[#d14d1b] disabled:opacity-50 text-white text-xs font-bold rounded-sm flex items-center justify-center gap-1.5 transition-colors">
                      <MapPin className="w-3.5 h-3.5" />
                      {isLoading ? 'Laden…' : `Laad ${drawPlanMax} bedrijven in dit gebied`}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { drawCenterRef.current = null; setDrawMode(true); }}
                    className={`w-full py-2 text-xs font-semibold rounded-sm flex items-center justify-center gap-1.5 transition-colors border ${drawMode ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'border-slate-300 text-slate-600 hover:border-[#009FE3] hover:text-[#009FE3]'}`}>
                    <MapPin className="w-3.5 h-3.5" />
                    {drawMode ? 'Klik op kaart voor middelpunt…' : 'Teken gebied'}
                  </button>
                )}
              </div>
            </>
          )}
          {msg && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{msg}
            </div>
          )}
          {/* Address verification button — shown after map is generated */}
          {visibleCount > 0 && !isLoading && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                onClick={runVerification}
                disabled={isVerifying}
                className="w-full py-2 border border-[#009FE3] text-[#009FE3] hover:bg-blue-50 disabled:opacity-50 text-xs font-semibold rounded-sm flex items-center justify-center gap-1.5 transition-colors">
                {isVerifying
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifiëren…</>
                  : <><Search className="w-3.5 h-3.5" /> Adressen verifiëren</>}
              </button>
              {/* Verification results */}
              {Object.keys(verifications).length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowVerify(v => !v)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 py-1">
                    <span>Verificatie resultaten ({(Object.values(verifications) as Verification[]).filter(v => v.status === 'suspect').length} afwijkingen)</span>
                    {showVerify ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showVerify && (
                    <div className="space-y-2 mt-1 max-h-64 overflow-y-auto pr-1">
                      {entries.map(ge => {
                        const v = verifications[ge.entry.naam];
                        if (!v || v.status === 'idle') return null;
                        return (
                          <div key={ge.entry.naam} className="border border-slate-100 rounded p-2 text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-700">
                              {v.status === 'checking' && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                              {v.status === 'ok'       && <ShieldCheck className="w-3 h-3 text-green-500" />}
                              {v.status === 'suspect'  && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                              {v.status === 'not_found'&& <AlertTriangle className="w-3 h-3 text-red-400" />}
                              <span className="truncate">{ge.entry.naam}</span>
                            </div>
                            {v.status === 'ok' && <p className="text-green-600 mt-0.5">Adres geverifieerd ✓</p>}
                            {v.status === 'not_found' && <p className="text-red-500 mt-0.5">{v.reason}</p>}
                            {v.status === 'suspect' && v.suggestion && !v.accepted && (
                              <div className="mt-1 bg-amber-50 rounded p-1.5">
                                <p className="text-amber-700 mb-1">{v.reason}</p>
                                <p className="text-slate-600 mb-1.5">Voorstel: {v.suggestion.straat}, {v.suggestion.postcode} {v.suggestion.stad}</p>
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    onClick={() => acceptCorrection(ge.entry, v.suggestion!)}
                                    className="px-2 py-1 bg-[#009FE3] text-white rounded text-[10px] font-semibold hover:bg-[#008ac5]">
                                    Adres corrigeren
                                  </button>
                                  <button
                                    onClick={() => addAsExtraVestiging(ge.entry, v.suggestion!)}
                                    className="px-2 py-1 bg-[#E85E26] text-white rounded text-[10px] font-semibold hover:bg-[#d14d1b]">
                                    + Extra vestiging
                                  </button>
                                  <button
                                    onClick={() => dismissVerification(ge.entry.naam)}
                                    className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-semibold hover:bg-slate-200">
                                    Afwijzen
                                  </button>
                                  <button
                                    onClick={() => deleteEntry(ge.entry.naam, ge.entry.straat)}
                                    className="px-2 py-1 bg-red-500 text-white rounded text-[10px] font-semibold hover:bg-red-600">
                                    Verwijder
                                  </button>
                                </div>
                              </div>
                            )}
                            {v.accepted && <p className="text-green-600 mt-0.5">Verwerkt ✓</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Plan een bezoek */}
        <div className="bg-white rounded-sm border border-slate-200">
          <button
            onClick={() => setPlanOpen(v => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <CalendarDays className="w-3.5 h-3.5 text-[#E85E26]" />
              Plan een bezoek
            </div>
            {planOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          {planOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
              <div>
                <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Waar naartoe?</label>
                <input
                  type="text"
                  value={planLocatie}
                  onChange={e => setPlanLocatie(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && planBezoek()}
                  placeholder="stad, dorp of provincie…"
                  className="w-full border border-slate-200 rounded-sm px-2.5 py-2 text-sm focus:outline-none focus:border-[#009FE3]"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Type bedrijven</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { val: 'mix',          label: 'Mix',          icon: <Building2 className="w-3.5 h-3.5" /> },
                    { val: 'architecten',  label: 'Architecten',  icon: <Pencil className="w-3.5 h-3.5" /> },
                    { val: 'bouwbedrijven',label: 'Bouwbedrijven',icon: <HardHat className="w-3.5 h-3.5" /> },
                    { val: 'aannemers',    label: 'Aannemers',    icon: <HardHat className="w-3.5 h-3.5" /> },
                  ] as { val: BezoekType; label: string; icon: React.ReactNode }[]).map(({ val, label, icon }) => (
                    <button key={val} onClick={() => setPlanType(val)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-bold border transition-colors ${planType === val ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]'}`}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Max stops</label>
                <div className="flex gap-1.5">
                  {[10, 12, 15].map(n => (
                    <button key={n} onClick={() => setPlanMax(n)}
                      className={`flex-1 py-2 rounded-sm text-xs font-bold border transition-colors ${planMax === n ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {planMsg && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{planMsg}
                </div>
              )}
              <button
                onClick={planBezoek}
                disabled={planLoading || !planLocatie.trim()}
                className="w-full py-3 bg-[#E85E26] hover:bg-[#d14d1b] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-sm flex items-center justify-center gap-2 transition-colors">
                {planLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Bedrijven zoeken…</>
                  : <><CalendarDays className="w-4 h-4" /> Plan bezoek{planLocatie.trim() ? ` → ${planLocatie.trim()}` : ''}</>}
              </button>
            </div>
          )}
        </div>

        {/* Route plannen — verschijnt zodra kaart gegenereerd is */}
        {visibleCount > 0 && !isLoading && (
          <div className="bg-white rounded-sm border border-[#E85E26]/30 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Route plannen</div>
            <div className="space-y-2 mb-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Startadres</label>
                <input type="text" value={startAddr} onChange={e => setStartAddr(e.target.value)}
                  className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-xs focus:outline-none focus:border-[#009FE3]"
                  placeholder="Adres, stad" />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={returnHome} onChange={e => setReturnHome(e.target.checked)} className="accent-[#009FE3]" />
                Terugkeer naar startadres
              </label>
            </div>
            {!routeMode ? (
              <button onClick={handlePlanRoute} disabled={isOptimising}
                className="w-full py-2.5 bg-[#E85E26] hover:bg-[#d14d1b] disabled:opacity-40 text-white text-sm font-bold rounded-sm flex items-center justify-center gap-2">
                {isOptimising
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Optimaliseren…</>
                  : <><ListOrdered className="w-4 h-4" /> Route optimaliseren</>}
              </button>
            ) : (
              <div className="space-y-2">
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold rounded-sm flex items-center justify-center gap-2 block text-center">
                    <Navigation className="w-4 h-4 inline mr-1" /> Open in Google Maps
                  </a>
                )}
                {routeStops.length > 10 && (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">Google Maps toont max 10 stops. De eerste 10 worden geopend.</p>
                )}
                <button onClick={cancelRoute}
                  className="w-full py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs rounded-sm flex items-center justify-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Terug naar kaartweergave
                </button>
              </div>
            )}
          </div>
        )}

        {/* Opslaan */}
        {(visibleCount > 0 || routeMode) && !isLoading && (
          <div className="bg-white rounded-sm border border-slate-200 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Opslaan</div>
            {saveWhat ? (
              <div className="space-y-2">
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSave()} autoFocus placeholder="Naam…"
                  className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#009FE3]" />
                <div className="flex gap-2">
                  <button onClick={doSave} disabled={!saveName.trim()} className="flex-1 py-2 bg-[#009FE3] disabled:opacity-40 text-white text-xs font-bold rounded-sm">Opslaan</button>
                  <button onClick={() => { setSaveWhat(null); setSaveName(''); }} className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-sm">Annuleer</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleCount > 0 && <button onClick={() => setSaveWhat('map')} className="w-full py-2 border border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-600 text-sm font-medium rounded-sm flex items-center justify-center gap-2"><Save className="w-4 h-4" /> Kaart opslaan</button>}
                {routeMode && <button onClick={() => setSaveWhat('route')} className="w-full py-2 border border-[#E85E26] text-[#E85E26] hover:bg-orange-50 text-sm font-medium rounded-sm flex items-center justify-center gap-2"><Save className="w-4 h-4" /> Route opslaan</button>}
              </div>
            )}
          </div>
        )}

        {/* Opgeslagen */}
        {(savedMaps.length > 0 || savedRoutes.length > 0) && (
          <div className="bg-white rounded-sm border border-slate-200 p-4">
            <button onClick={() => setShowSaved(v => !v)} className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Opgeslagen {showSaved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showSaved && (
              <div className="mt-2 space-y-1">
                {savedMaps.map(m => (
                  <button key={m.id} onClick={() => loadMap(m)} className="w-full text-left px-2 py-2 rounded hover:bg-slate-50 group flex items-start gap-2">
                    <MapIcon className="w-3.5 h-3.5 text-[#009FE3] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{m.name}</div>
                      <div className="text-xs text-slate-400 truncate">{[...m.sources, m.includeFavorites ? 'Favorieten' : ''].filter(Boolean).join(', ')}{m.province ? ` · ${m.province}` : ''}{m.city ? ` · ${m.city}` : ''}</div>
                    </div>
                    <button onClick={e => delItem(m.id, 'map', e)} className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </button>
                ))}
                {savedRoutes.map(r => (
                  <button key={r.id} onClick={() => loadRoute(r)} className="w-full text-left px-2 py-2 rounded hover:bg-orange-50 group flex items-start gap-2">
                    <Navigation className="w-3.5 h-3.5 text-[#E85E26] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.stops.length} stops · {r.startAddress.split(',')[0]}</div>
                    </div>
                    <button onClick={e => delItem(r.id, 'route', e)} className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bronnen */}
        <div className="bg-white rounded-sm border border-slate-200 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Bronnen</div>
          <div className="space-y-1">
            {ALL_SOURCES.map(src => {
              const active = sources.includes(src);
              return (
                <button key={src}
                  onClick={() => setSources(prev => active ? prev.filter(s => s !== src) : [...prev, src])}
                  className={`flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${active ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                  {active
                    ? <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: SRC_COLOR[src] }} />
                    : <Square className="w-4 h-4 flex-shrink-0 text-slate-300" />}
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SRC_COLOR[src] }} />
                  <span className="flex-1 font-medium text-slate-700">{src}</span>
                  <span className="text-xs text-slate-400">{srcCount(src)}</span>
                </button>
              );
            })}
            <button onClick={() => setInclFavs(v => !v)}
              className={`flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${inclFavs ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
              {inclFavs
                ? <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: SRC_COLOR.Favorieten }} />
                : <Square className="w-4 h-4 flex-shrink-0 text-slate-300" />}
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SRC_COLOR.Favorieten }} />
              <span className="flex-1 font-medium text-slate-700">Favorieten</span>
              <span className="text-xs text-slate-400">{favorites.length}</span>
            </button>
            {hasSelection && (() => {
              const active = sources.includes('Geselecteerde items');
              return (
                <button
                  onClick={() => setSources(prev => active ? prev.filter(s => s !== 'Geselecteerde items') : [...prev, 'Geselecteerde items'])}
                  className={`flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded transition-colors border border-dashed border-[#E85E26]/40 mt-1 ${active ? 'bg-orange-50' : 'hover:bg-orange-50/50'}`}>
                  {active
                    ? <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: SRC_COLOR['Geselecteerde items'] }} />
                    : <Square className="w-4 h-4 flex-shrink-0 text-slate-300" />}
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SRC_COLOR['Geselecteerde items'] }} />
                  <span className="flex-1 font-medium text-[#E85E26]">Geselecteerde items</span>
                  <span className="text-xs text-[#E85E26] font-bold">{selectedItems.length}</span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Locatiefilter */}
        <div className="bg-white rounded-sm border border-slate-200 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Locatie filter</div>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Provincie</label>
              <select value={province} onChange={e => setProvince(e.target.value)}
                className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-[#009FE3]">
                <option value="">Alle provincies</option>
                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Stad / postcode</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                placeholder="bv. Rotterdam of 3011"
                className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-[#009FE3]" />
            </div>
            {(province || city) && (
              <button onClick={() => { setProvince(''); setCity(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <X className="w-3 h-3" /> Filter wissen
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ── Drag handle (desktop only — mobile stacks sidebar above map) ── */}
      <div
        onMouseDown={startMapDrag}
        className="hidden md:block w-1.5 flex-shrink-0 mx-1 cursor-col-resize hover:bg-[#009FE3]/40 bg-slate-200 rounded-full transition-colors"
        title="Slepen om formaat aan te passen"
      />

      {/* ── Map + route list ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex-1 rounded-sm border border-slate-200 overflow-hidden relative min-h-[420px] md:min-h-[300px]">
          <div ref={mapDiv} className="w-full h-full" />
          {drawMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <div className="bg-[#009FE3] text-white text-xs font-semibold px-4 py-2 rounded-sm shadow-lg flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                {drawStep === 0 ? 'Klik op de kaart voor het middelpunt' : 'Klik nogmaals om de straal te bevestigen'}
                <button className="pointer-events-auto ml-2 opacity-70 hover:opacity-100" onClick={() => { setDrawMode(false); setDrawStep(0); drawCenterRef.current = null; drawCircleRef.current?.remove(); drawCircleRef.current = null; drawMarkerRef.current?.remove(); drawMarkerRef.current = null; }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          {entries.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center bg-white/90 rounded-sm p-8 border border-slate-200 shadow-sm max-w-xs">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Kaart leeg</p>
                {hasSelection
                  ? <p className="text-xs text-slate-400"><b>{selectedItems.length} geselecteerde items</b> klaarstaan — klik <b>Genereer Kaart</b></p>
                  : <p className="text-xs text-slate-400">Kies bronnen en klik <b>Genereer Kaart</b></p>}
              </div>
            </div>
          )}
        </div>

        {routeMode && routeStops.length > 0 && (
          <div className="bg-white rounded-sm border border-slate-200 p-4 max-h-48 overflow-y-auto flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Route — {routeStops.length} stops{returnHome ? ' (met terugkeer)' : ''}
              </span>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#16a34a] font-bold hover:underline flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> Google Maps
                </a>
              )}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs text-slate-400 py-1 border-b border-slate-100">
                <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">S</span>
                <span className="truncate">{startAddr}</span>
              </div>
              {routeStops.map((ge, i) => {
                const website = ge.entry.website || ge.entry.url;
                const googleUrl = `https://www.google.com/search?q=${encodeURIComponent((ge.entry.naam || '') + ' ' + (ge.entry.stad || ''))}`;

                if (replacingStopIdx === i) {
                  const q = replaceStopQuery.toLowerCase().trim();
                  const existingNames = new Set<string>(routeStops.filter((_, idx) => idx !== i).map(s => (s.entry.naam || '').toLowerCase()));
                  const prevCoords = routeStops[i - 1]?.coords;
                  const nextCoords = routeStops[i + 1]?.coords;
                  const candidates = (prevCoords || nextCoords)
                    ? scoreInsertionCandidates(allData, prevCoords ? { lat: prevCoords[0], lng: prevCoords[1] } : null, nextCoords ? { lat: nextCoords[0], lng: nextCoords[1] } : null, cityCoords as any, existingNames, 8, q).map(c => c.bedrijf)
                    : q.length >= 2
                      ? allData.filter((cand: any) => !existingNames.has((cand.naam || '').toLowerCase()) && [cand.naam, cand.stad].join(' ').toLowerCase().includes(q)).slice(0, 8)
                      : [];
                  return (
                    <div key={i} className="border border-[#009FE3] rounded-sm p-2 my-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vervang "{ge.entry.naam}"</span>
                        <button onClick={() => { setReplacingStopIdx(null); setReplaceStopQuery(''); }} className="text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      {!q && (prevCoords || nextCoords) && <p className="text-[10px] text-slate-400 mb-1">Beste tussenopties op deze plek in de route:</p>}
                      <input
                        autoFocus
                        type="text"
                        value={replaceStopQuery}
                        onChange={e => setReplaceStopQuery(e.target.value)}
                        placeholder="Of zoek zelf op naam/stad..."
                        className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-xs focus:outline-none focus:border-[#009FE3] mb-1"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {candidates.map((cand: any, ci: number) => (
                          <button key={ci} onClick={() => replaceRouteStop(i, cand)}
                            className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                            <span className="font-semibold text-slate-700">{cand.naam}</span>
                            <span className="text-slate-400 text-[10px]">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                          </button>
                        ))}
                        {candidates.length === 0 && (
                          <p className="text-[10px] text-slate-400 py-1">Geen bedrijven gevonden.</p>
                        )}
                      </div>
                    </div>
                  );
                }

                if (insertAfterIdx === i) {
                  const q = insertQuery.toLowerCase().trim();
                  const existingNames = new Set<string>(routeStops.map(s => (s.entry.naam || '').toLowerCase()));
                  const prevCoords = routeStops[i]?.coords;
                  const nextCoords = routeStops[i + 1]?.coords;
                  const candidates = (prevCoords || nextCoords)
                    ? scoreInsertionCandidates(allData, prevCoords ? { lat: prevCoords[0], lng: prevCoords[1] } : null, nextCoords ? { lat: nextCoords[0], lng: nextCoords[1] } : null, cityCoords as any, existingNames, 8, q).map(c => c.bedrijf)
                    : q.length >= 2
                      ? allData.filter((cand: any) => !existingNames.has((cand.naam || '').toLowerCase()) && [cand.naam, cand.stad].join(' ').toLowerCase().includes(q)).slice(0, 8)
                      : [];
                  return (
                    <div key={`insert-${i}`} className="border border-[#E85E26] rounded-sm p-2 my-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nieuwe stop na "{ge.entry.naam}"</span>
                        <button onClick={() => { setInsertAfterIdx(null); setInsertQuery(''); }} className="text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      {!q && (prevCoords || nextCoords) && <p className="text-[10px] text-slate-400 mb-1">Beste tussenopties op deze plek in de route:</p>}
                      <input
                        autoFocus
                        type="text"
                        value={insertQuery}
                        onChange={e => setInsertQuery(e.target.value)}
                        placeholder="Of zoek zelf op naam/stad..."
                        className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-xs focus:outline-none focus:border-[#E85E26] mb-1"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {candidates.map((cand: any, ci: number) => (
                          <button key={ci} onClick={() => insertRouteStop(i, cand)}
                            className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                            <span className="font-semibold text-slate-700">{cand.naam}</span>
                            <span className="text-slate-400 text-[10px]">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                          </button>
                        ))}
                        {candidates.length === 0 && (
                          <p className="text-[10px] text-slate-400 py-1">Geen bedrijven gevonden.</p>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <React.Fragment key={i}>
                  <div
                    draggable
                    onDragStart={() => { dragIdx.current = i; }}
                    onDragOver={e => { e.preventDefault(); if (dragIdx.current !== null && dragIdx.current !== i) { reorderRouteStops(dragIdx.current, i); dragIdx.current = i; } }}
                    onDragEnd={() => { dragIdx.current = null; }}
                    className="relative flex items-center gap-1.5 text-xs text-slate-700 py-1 rounded hover:bg-slate-50 group cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-3 h-3 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white" style={{ background: ge.color }}>{i + 1}</span>
                    <span className="font-medium flex-1 truncate">{ge.entry.naam}</span>
                    <span className="text-slate-400 flex-shrink-0 text-[10px]">{[ge.entry.postcode, ge.entry.stad].filter(Boolean).join(' ')}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {website && (
                        <a href={toUrl(website)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-[#009FE3] hover:text-[#007bbf] transition-opacity" title="Website">
                          <Globe className="w-3 h-3" />
                        </a>
                      )}
                      <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-600 transition-opacity" title="Zoek op Google">
                        <Search className="w-3 h-3" />
                      </a>
                      <button onClick={e => { e.stopPropagation(); setStopMenuOpen(stopMenuOpen === i ? null : i); }}
                        className="p-0.5 text-slate-300 hover:text-slate-600 transition-colors" title="Opties">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {stopMenuOpen === i && (
                      <div className="absolute right-0 top-6 z-10 w-32 bg-white border border-slate-200 rounded-sm shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { removeRouteStop(i); setStopMenuOpen(null); }} className="w-full text-left px-2.5 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 flex items-center gap-1.5"><Trash2 className="w-3 h-3" />Verwijderen</button>
                        <button onClick={() => { setReplacingStopIdx(i); setReplaceStopQuery(''); setStopMenuOpen(null); }} className="w-full text-left px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 border-t border-slate-100"><Repeat className="w-3 h-3" />Vervangen</button>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center -my-0.5">
                    <button onClick={() => { setInsertAfterIdx(i); setInsertQuery(''); setStopMenuOpen(null); }}
                      title="Stop invoegen op deze plek" className="opacity-40 hover:opacity-100 p-0.5 text-slate-300 hover:text-[#E85E26] transition-opacity">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  </React.Fragment>
                );
              })}
              {returnHome && (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-1 border-t border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">S</span>
                  <span>Terug: {startAddr}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapView;
