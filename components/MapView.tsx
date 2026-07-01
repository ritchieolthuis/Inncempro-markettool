import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Loader2, AlertTriangle, CheckSquare, Square, Navigation,
  ListOrdered, Save, Trash2, RotateCcw, ChevronDown, ChevronUp, X,
  Map, MapPin, Plus, Search, ExternalLink, Pencil,
} from 'lucide-react';
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
  Bouwgarant:      '#009FE3',
  Architectenweb:  '#E85E26',
  Stiho:           '#EA580C',
  Jongeneel:       '#16A34A',
  BouwPartner:     '#CA8A04',
  PontMeyer:       '#DC2626',
  Onbekend:        '#64748B',
  Favorieten:      '#E11D48',
  'Mijn Adressen': '#7C3AED',
};
const ALL_SOURCES = ['Bouwgarant', 'Architectenweb', 'Stiho', 'Jongeneel', 'BouwPartner', 'PontMeyer', 'Onbekend'];

// ─── Geo cache ────────────────────────────────────────────────────────────────
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

function makePopup(b: any, color: string, isFav: boolean, stopNum?: number) {
  const q = encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
  const naam = (b.naam || '').replace(/'/g, "\\'");
  const badge = stopNum != null
    ? `<span style="background:${color};color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">Stop ${stopNum}</span>`
    : `<span style="background:${color}22;color:${color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">${isFav ? 'Favoriet' : (b.source || 'Onbekend')}</span>`;
  return `<div style="font-family:system-ui,sans-serif;min-width:220px;max-width:280px">
    <b style="font-size:13px;color:#1e293b">${b.naam || ''}</b>
    ${b.straat ? `<div style="color:#64748b;font-size:12px;margin-top:2px">${b.straat}</div>` : ''}
    <div style="color:#64748b;font-size:12px">${[b.postcode, b.stad].filter(Boolean).join(' ')}</div>
    ${b.telefoon ? `<div style="font-size:12px;color:#374151;margin-top:4px;display:flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.45 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${b.telefoon}</div>` : ''}
    ${b.email ? `<div style="font-size:12px;color:#374151;margin-top:2px;display:flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>${b.email}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${b.website ? `<a href="${b.website}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Maps →</a>
    </div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
      <button onclick="window._inncemNav('database','${naam}')" style="font-size:11px;color:#1e293b;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>Database</button>
      <button onclick="window._inncemNav('search','${naam}')" style="font-size:11px;color:#E85E26;background:#fff7f5;border:1px solid #E85E26;padding:3px 8px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Live Zoeken</button>
    </div>
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
  onNavigate?: (target: 'database' | 'search', naam: string) => void;
}

const DEFAULT_START = 'Lansinkesweg 4, 7553 AE Hengelo';

// ─── Component ────────────────────────────────────────────────────────────────
const MapView: React.FC<Props> = ({ allData, favorites, onNavigate }) => {
  const mapDiv  = useRef<HTMLDivElement>(null);
  const mapRef  = useRef<L.Map | null>(null);
  const abortRef = useRef(false);

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
  const [msg,          setMsg]          = useState('');

  // Route
  const [routeMode,    setRouteMode]    = useState(false);
  const [startAddr,    setStartAddr]    = useState(DEFAULT_START);
  const [returnHome,   setReturnHome]   = useState(true);
  const [routeStops,   setRouteStops]   = useState<GeoEntry[]>([]);
  const [isOptimising, setIsOptimising] = useState(false);

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

  // ── Filtered count (no geocoding needed) ────────────────────────────────────
  const filteredCount = useMemo(() => {
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
    const favExtra = inclFavs
      ? favorites.filter(fav => !items.find(b =>
          b.naam?.toLowerCase().trim() === fav.name?.toLowerCase().trim() &&
          b.stad?.toLowerCase().trim() === fav.city?.toLowerCase().trim()
        ))
      : [];
    return items.length + favExtra.length;
  }, [sources, inclFavs, province, city, allData, favorites]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    mapRef.current = L.map(mapDiv.current, { center: [52.3, 5.3], zoom: 7 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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

  // ── Load persisted ──────────────────────────────────────────────────────────
  useEffect(() => {
    try { setSavedMaps(JSON.parse(localStorage.getItem(MAPS_KEY) || '[]')); } catch {}
    try { setSavedRoutes(JSON.parse(localStorage.getItem(ROUTES_KEY) || '[]')); } catch {}
  }, []);

  // ── Clear markers from map ───────────────────────────────────────────────────
  const clearMarkers = (pool: GeoEntry[]) => pool.forEach(e => e.marker?.remove());

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
      ...filtered.map(b => ({ entry: b, isFav: false })),
      ...favEntries,
    ];

    setProgDone(0);
    setProgTotal(toGeocode.length);
    setIsLoading(true);

    const cache = loadCache();
    const pool: GeoEntry[] = [];
    let placed = 0;

    for (let i = 0; i < toGeocode.length; i++) {
      if (abortRef.current) break;
      const { entry, isFav } = toGeocode[i];
      const src   = entry.source || 'Onbekend';
      const color = isFav ? SRC_COLOR.Favorieten : (SRC_COLOR[src] || '#64748B');
      const { coords, fresh } = await geocodeEntry(entry, cache);

      const ge: GeoEntry = { entry, coords, color, isFav };
      if (coords && mapRef.current) {
        ge.marker = L.marker(coords, { icon: makePin(color) })
          .bindPopup(makePopup(entry, color, isFav), { maxWidth: 290 })
          .addTo(mapRef.current);
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
          .bindPopup(makePopup(e.entry, e.color, e.isFav), { maxWidth: 290 })
          .addTo(mapRef.current!);
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

  const srcCount = (src: string) => allData.filter(b => (b.source || 'Onbekend') === src).length;
  const mapsUrl  = routeMode && routeStops.length > 0 ? buildMapsUrl(routeStops, startAddr, returnHome) : null;
  const pct      = progTotal > 0 ? Math.round(progDone / progTotal * 100) : 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[520px]">

      {/* ── Sidebar ── */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pb-4 pr-1">

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

        {/* Genereer Kaart */}
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
            <button
              onClick={generateMap}
              disabled={filteredCount === 0}
              className="w-full py-3 bg-[#009FE3] hover:bg-[#008ac5] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm rounded-sm flex items-center justify-center gap-2 transition-colors">
              <MapPin className="w-4 h-4" />
              {filteredCount > 0
                ? `Genereer Kaart (${filteredCount})`
                : 'Selecteer bronnen'}
            </button>
          )}
          {visibleCount > 0 && !isLoading && (
            <p className="mt-2 text-center text-xs text-slate-400">{visibleCount} locaties op de kaart</p>
          )}
          {msg && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{msg}
            </div>
          )}
        </div>

        {/* Route */}
        {visibleCount > 0 && !isLoading && (
          <div className="bg-white rounded-sm border border-slate-200 p-4">
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
                    className="w-full py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold rounded-sm flex items-center justify-center gap-2">
                    <Navigation className="w-4 h-4" /> Open in Google Maps
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
                    <Map className="w-3.5 h-3.5 text-[#009FE3] flex-shrink-0 mt-0.5" />
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
      </div>

      {/* ── Map + route list ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex-1 rounded-sm border border-slate-200 overflow-hidden relative min-h-[300px]">
          <div ref={mapDiv} className="w-full h-full" />
          {entries.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center bg-white/90 rounded-sm p-8 border border-slate-200 shadow-sm max-w-xs">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Kaart leeg</p>
                <p className="text-xs text-slate-400">Kies bronnen en klik <b>Genereer Kaart</b></p>
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
              {routeStops.map((ge, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-700 py-1">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white" style={{ background: ge.color }}>{i + 1}</span>
                  <span className="font-medium flex-1 truncate">{ge.entry.naam}</span>
                  <span className="text-slate-400 flex-shrink-0">{[ge.entry.postcode, ge.entry.stad].filter(Boolean).join(' ')}</span>
                </div>
              ))}
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
