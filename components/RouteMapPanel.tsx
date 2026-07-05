import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2, Navigation, ListOrdered, RotateCcw, X,
  Trash2, Save, Check, MapPin, GripVertical, Globe, Search,
  ShieldCheck, AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
  CalendarDays, Plus, Repeat,
} from 'lucide-react';
import { scoreBedrijven, scoreInsertionCandidates, detectType, BezoekType } from '../utils/dagbezoek';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const toUrl = (u: string) => u && /^https?:\/\//i.test(u) ? u : `https://${u}`;
const GEO_KEY    = 'inncempro_geo_cache';
const ROUTES_KEY = 'inncempro_saved_routes';
type Coords   = [number, number];
type GeoCache = Record<string, Coords | null>;

type VerifyStatus = 'idle' | 'checking' | 'ok' | 'suspect' | 'not_found';
interface AddressSuggestion {
  straat: string;
  postcode: string;
  stad: string;
  display: string;
  allStadFields?: string[];
}
interface Verification {
  status: VerifyStatus;
  suggestion?: AddressSuggestion;
  reason?: string;
  accepted?: boolean;
}

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

async function verifyStop(b: any, coords: Coords | null): Promise<Verification> {
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

async function geocode(b: any, cache: GeoCache): Promise<Coords | null> {
  const candidates = [
    [b.straat, b.postcode, b.stad, 'Nederland'].filter(Boolean).join(', '),
    [b.postcode, b.stad, 'Nederland'].filter(Boolean).join(', '),
    [b.stad, 'Nederland'].filter(Boolean).join(', '),
  ].filter(Boolean);
  for (const key of candidates) {
    if (key in cache) { if (cache[key]) return cache[key]; continue; }
    const coords = await nominatim(key);
    cache[key] = coords; saveCache(cache);
    return coords;
  }
  return null;
}

function makePin(color: string, label: number | string) {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 7.5 12 24 12 24s12-16.5 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="700" font-family="system-ui">${label}</text>
    </svg>`,
    className: '', iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -38],
  });
}

function dist([a, b]: Coords, [c, d]: Coords) { return (a - c) ** 2 + (b - d) ** 2; }
function nearestNeighbour(start: Coords, pts: { id: string; coords: Coords }[]) {
  const rem = [...pts], out: typeof pts = [];
  let cur = start;
  while (rem.length) {
    let bi = 0;
    rem.forEach((p, i) => { if (dist(cur, p.coords) < dist(cur, rem[bi].coords)) bi = i; });
    out.push(rem[bi]); cur = rem[bi].coords; rem.splice(bi, 1);
  }
  return out;
}

interface Stop { id: string; company: any; coords: Coords | null; marker: L.Marker | null; loading: boolean; origin?: 'selection' | 'manual'; }

import cityCoords from '../city_coords.json';

interface Props {
  companies: any[];
  allData?: any[];
  onClose: () => void;
  onAddressCorrection?: (naam: string, correction: { straat: string; postcode: string; stad: string }) => void;
  onDeleteEntry?: (naam: string, straat?: string) => void;
  onNavigate?: (target: 'database' | 'search', naam: string) => void;
  onAddCompany?: () => void;
}

const DEFAULT_START = 'Lansinkesweg 4, 7553 AE Hengelo';

const RouteMapPanel: React.FC<Props> = ({ companies, allData = [], onClose, onAddressCorrection, onDeleteEntry, onNavigate, onAddCompany }) => {
  const mapDiv   = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<L.Map | null>(null);
  const stopsRef = useRef<Stop[]>([]);

  const [stops,        setStops]        = useState<Stop[]>([]);
  const [routeMode,    setRouteMode]    = useState(false);
  const [startAddr,    setStartAddr]    = useState(DEFAULT_START);
  const [returnHome,   setReturnHome]   = useState(true);
  const [isOptimising, setIsOptimising] = useState(false);
  const [orderedStops, setOrderedStops] = useState<Stop[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [saveName,     setSaveName]     = useState('');
  const [savedMsg,     setSavedMsg]     = useState('');
  const [removedIds,   setRemovedIds]   = useState<Set<string>>(new Set());
  const [stopMenuOpen,     setStopMenuOpen]     = useState<string | null>(null);
  const [replacingStopId,  setReplacingStopId]  = useState<string | null>(null);
  const [replaceStopQuery, setReplaceStopQuery] = useState('');
  const [insertAfterId,   setInsertAfterId]     = useState<string | 'start' | null>(null);
  const [insertQuery,     setInsertQuery]       = useState('');
  const dragIdx = useRef<number | null>(null);

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

  // Dagbezoek planner
  const [planOpen,       setPlanOpen]       = useState(false);
  const [planLocatie,    setPlanLocatie]    = useState('');
  const [planTypes,      setPlanTypes]      = useState<BezoekType[]>([]);
  const [planMax,        setPlanMax]        = useState(12);
  const [planLoading,    setPlanLoading]    = useState(false);
  const [planMsg,        setPlanMsg]        = useState('');

  // Draw-area mode (circle on map → load companies in that area)
  const [drawMode,      setDrawMode]      = useState(false);
  const [drawStep,      setDrawStep]      = useState<0|1>(0);
  const [drawCenter,    setDrawCenter]    = useState<[number,number] | null>(null);
  const [drawRadiusM,   setDrawRadiusM]   = useState(0);
  const [drawPlanType,  setDrawPlanType]  = useState<BezoekType>('mix');
  const [drawPlanMax,   setDrawPlanMax]   = useState(10);
  const [drawLoading,   setDrawLoading]   = useState(false);
  const drawCircleRef   = useRef<L.Circle | null>(null);
  const drawMarkerRef   = useRef<L.Marker | null>(null);
  const drawCenterRef   = useRef<[number,number] | null>(null);

  const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };


  const reorderStops = (from: number, to: number) => {
    if (from === to) return;
    if (routeMode) {
      setOrderedStops(prev => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        // Redraw map pins with new numbers
        next.forEach((s, i) => {
          if (s.coords && s.marker && mapRef.current) {
            s.marker.remove();
            s.marker = L.marker(s.coords, { icon: makePin('#009FE3', i + 1) })
              .bindPopup(`<b>${(s.company._raw || s.company).naam || s.company.name || ''}</b>`)
              .addTo(mapRef.current);
          }
        });
        return next;
      });
    } else {
      stopsRef.current = (() => {
        const next = [...stopsRef.current];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        next.forEach((s, i) => {
          if (s.coords && s.marker && mapRef.current) {
            s.marker.remove();
            s.marker = L.marker(s.coords, { icon: makePin('#E85E26', i + 1) })
              .bindPopup(`<b>${(s.company._raw || s.company).naam || s.company.name || ''}</b>`)
              .addTo(mapRef.current!);
          }
        });
        return next;
      })();
      setStops([...stopsRef.current]);
    }
  };

  // Init map
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    mapRef.current = L.map(mapDiv.current, { center: [52.3, 5.3], zoom: 7 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(mapDiv.current);
    return () => { ro.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Sync companies → stops
  useEffect(() => {
    const cache = loadCache();
    const companyIds = new Set(companies.map(c => c.id).filter(id => !removedIds.has(id)));

    // Remove stops no longer in selection — but never drop manually-added stops
    // (draw-area / plan-bezoek / dagbezoek-planner), those aren't tracked by the checkbox selection.
    const toDrop = stopsRef.current.filter(s => s.origin !== 'manual' && !companyIds.has(s.id));
    toDrop.forEach(s => s.marker?.remove());
    const kept = stopsRef.current.filter(s => s.origin === 'manual' || companyIds.has(s.id));
    const keptIds = new Set(kept.map(s => s.id));
    const newCompanies = companies.filter(c => !keptIds.has(c.id) && companyIds.has(c.id));

    const newStops: Stop[] = [
      ...kept,
      ...newCompanies.map(c => ({ id: c.id, company: c, coords: null, marker: null, loading: true, origin: 'selection' as const })),
    ];
    stopsRef.current = newStops;
    setStops([...newStops]);
    setRouteMode(false);
    setOrderedStops([]);

    newCompanies.forEach(async (c) => {
      const raw    = (c as any)._raw || c;
      const coords = await geocode(raw, cache);
      const stop   = stopsRef.current.find(s => s.id === c.id);
      if (!stop) return;
      stop.coords  = coords;
      stop.loading = false;

      if (coords && mapRef.current) {
        const idx    = stopsRef.current.indexOf(stop) + 1;
        stop.marker  = L.marker(coords, { icon: makePin('#E85E26', idx) })
          .bindPopup(
            `<div style="font-family:system-ui;min-width:180px">
              <b style="font-size:13px;color:#1e293b">${raw.naam || c.name || ''}</b>
              <div style="color:#64748b;font-size:12px;margin-top:2px">${[raw.straat, raw.postcode, raw.stad].filter(Boolean).join(', ')}</div>
            </div>`,
            { maxWidth: 240 },
          ).addTo(mapRef.current!);

        const allCoords = stopsRef.current.filter(s => s.coords).map(s => s.coords!);
        if (allCoords.length > 0)
          mapRef.current.fitBounds(allCoords as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
      }
      setStops([...stopsRef.current]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, removedIds]);

  // Renumber pins when stops change (normal mode)
  useEffect(() => {
    if (routeMode) return;
    stopsRef.current.forEach((s, i) => {
      if (s.marker && s.coords) s.marker.setIcon(makePin('#E85E26', i + 1));
    });
  }, [stops, routeMode]);

  const handleOptimise = async () => {
    const withCoords = stopsRef.current.filter(s => s.coords);
    if (!withCoords.length) return;
    setIsOptimising(true);
    const cache = loadCache();
    let startCoords: Coords = [52.265, 6.795];
    const cached = cache[startAddr];
    if (cached) { startCoords = cached; }
    else {
      const c = await nominatim(startAddr);
      if (c) { startCoords = c; cache[startAddr] = c; saveCache(cache); }
    }
    const ordered = nearestNeighbour(startCoords, withCoords.map(s => ({ id: s.id, coords: s.coords! })))
      .map(p => stopsRef.current.find(s => s.id === p.id)!);

    stopsRef.current.forEach(s => s.marker?.remove());
    ordered.forEach((s, i) => {
      if (!mapRef.current || !s.coords) return;
      s.marker = L.marker(s.coords, { icon: makePin('#009FE3', i + 1) })
        .bindPopup(`<b>${(s.company._raw || s.company).naam || s.company.name || ''}</b>`)
        .addTo(mapRef.current!);
    });
    setOrderedStops(ordered);
    setRouteMode(true);
    setIsOptimising(false);
  };

  const cancelRoute = () => {
    setRouteMode(false); setOrderedStops([]);
    stopsRef.current.forEach((s, i) => {
      s.marker?.remove();
      if (s.coords && mapRef.current) {
        s.marker = L.marker(s.coords, { icon: makePin('#E85E26', i + 1) })
          .bindPopup(`<b>${(s.company._raw || s.company).naam || s.company.name || ''}</b>`)
          .addTo(mapRef.current!);
      }
    });
    setStops([...stopsRef.current]);
  };

  const runVerification = async () => {
    if (!stopsRef.current.length) return;
    setIsVerifying(true);
    setShowVerify(true);
    const init: Record<string, Verification> = {};
    stopsRef.current.forEach(s => { init[s.id] = { status: 'checking' }; });
    setVerifications(init);

    for (const stop of stopsRef.current) {
      const raw = stop.company._raw || stop.company;
      if (handledVerify.has(raw.naam)) {
        setVerifications(prev => ({ ...prev, [stop.id]: { status: 'ok' } }));
        continue;
      }
      await new Promise(r => setTimeout(r, 1100));
      const result = await verifyStop(raw, stop.coords);
      if (result.status === 'ok' || result.status === 'not_found') {
        markHandled(raw.naam);
        continue;
      }
      setVerifications(prev => ({ ...prev, [stop.id]: result }));
    }
    setIsVerifying(false);
  };

  const acceptCorrection = (stop: Stop) => {
    const v = verifications[stop.id];
    if (!v?.suggestion) return;
    const raw = stop.company._raw || stop.company;
    onAddressCorrection?.(raw.naam, {
      straat:   v.suggestion.straat,
      postcode: v.suggestion.postcode,
      stad:     v.suggestion.stad,
    });
    setVerifications(prev => ({ ...prev, [stop.id]: { ...prev[stop.id], accepted: true, status: 'ok' } }));
    markHandled(raw.naam);
  };

  const dismissVerification = (stop: Stop) => {
    const raw = stop.company._raw || stop.company;
    setVerifications(prev => ({ ...prev, [stop.id]: { ...prev[stop.id], accepted: true } }));
    markHandled(raw.naam);
  };

  const CUSTOM_KEY = 'inncempro_custom_addresses';
  const deleteStop = (stop: Stop) => {
    const raw = stop.company._raw || stop.company;
    onDeleteEntry?.(raw.naam, raw.straat);
    markHandled(raw.naam);
    stop.marker?.remove();
    stopsRef.current = stopsRef.current.filter(s => s.id !== stop.id);
    setStops([...stopsRef.current]);
    setVerifications(prev => { const n = { ...prev }; delete n[stop.id]; return n; });
  };

  const addAsExtraVestiging = (stop: Stop) => {
    const v = verifications[stop.id];
    if (!v?.suggestion) return;
    const raw = stop.company._raw || stop.company;
    try {
      const existing = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
      existing.push({
        id: Date.now().toString(),
        naam: raw.naam,
        straat: v.suggestion.straat,
        postcode: v.suggestion.postcode,
        stad: v.suggestion.stad,
        provincie: raw.provincie || '',
        telefoon: raw.telefoon || '',
        website: raw.website || '',
        notitie: 'Extra vestiging (gevonden via adresverificatie)',
        source: 'Mijn Adressen',
        addedAt: Date.now(),
      });
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(existing));
    } catch {}
    setVerifications(prev => ({ ...prev, [stop.id]: { ...prev[stop.id], accepted: true } }));
    markHandled(raw.naam);
  };

  // Draw-area event handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    if (!drawMode) {
      container.style.cursor = '';
      drawCircleRef.current?.remove(); drawCircleRef.current = null;
      drawMarkerRef.current?.remove(); drawMarkerRef.current = null;
      return;
    }
    container.style.cursor = 'crosshair';
    const onClick = (e: L.LeafletMouseEvent) => {
      if (!drawCenterRef.current) {
        drawCenterRef.current = [e.latlng.lat, e.latlng.lng];
        setDrawStep(1);
        drawMarkerRef.current?.remove();
        drawMarkerRef.current = L.marker(e.latlng, {
          icon: L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:50%;background:#E85E26;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>', iconSize: [12,12], iconAnchor: [6,6] })
        }).addTo(map);
        drawCircleRef.current?.remove();
        drawCircleRef.current = L.circle(e.latlng, { radius: 1, color: '#E85E26', fillColor: '#E85E26', fillOpacity: 0.08, weight: 2 }).addTo(map);
      } else {
        const [clat, clng] = drawCenterRef.current;
        const radiusM = haversineM(clat, clng, e.latlng.lat, e.latlng.lng);
        setDrawCenter([clat, clng]);
        setDrawRadiusM(radiusM);
        setDrawMode(false);
        setDrawStep(0);
        container.style.cursor = '';
      }
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (!drawCenterRef.current || !drawCircleRef.current) return;
      const [clat, clng] = drawCenterRef.current;
      drawCircleRef.current.setRadius(haversineM(clat, clng, e.latlng.lat, e.latlng.lng));
    };
    map.on('click', onClick);
    map.on('mousemove', onMove);
    return () => { map.off('click', onClick); map.off('mousemove', onMove); };
  }, [drawMode]);

  const clearDrawArea = () => {
    drawCircleRef.current?.remove(); drawCircleRef.current = null;
    drawMarkerRef.current?.remove(); drawMarkerRef.current = null;
    drawCenterRef.current = null;
    setDrawCenter(null); setDrawRadiusM(0); setDrawStep(0);
  };

  const normNaam = (s: string) => (s || '').toLowerCase()
    .replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  const planBezoekInArea = async (center: [number,number], radiusM: number, type: BezoekType, max: number) => {
    setDrawLoading(true);
    const radiusKm = radiusM / 1000;
    const types = type === 'mix' ? [] : [type];
    const scored = scoreBedrijven(allData, center[0], center[1], types, cityCoords as any, Math.ceil(max * 1.5), radiusKm);
    const cache = loadCache();
    const seenNames = new Set(stopsRef.current.map(s => normNaam(s.company._raw?.naam || s.company.name)));
    let added = 0;
    for (let i = 0; i < scored.length && added < max; i++) {
      const { bedrijf } = scored[i];
      const nn = normNaam(bedrijf.naam);
      if (nn && seenNames.has(nn)) continue; // never place the same company twice
      const coords = await geocode(bedrijf, cache);
      await new Promise(res => setTimeout(res, 300));
      if (!coords || haversineM(center[0], center[1], coords[0], coords[1]) > radiusM) continue;
      seenNames.add(nn);
      const id = `area_${Date.now()}_${Math.random()}`;
      const stop: Stop = { id, company: { id, name: bedrijf.naam, city: bedrijf.stad || '', _raw: bedrijf }, coords, marker: null, loading: false, origin: 'manual' };
      if (mapRef.current) {
        stop.marker = L.marker(coords, { icon: makePin('#E85E26', stopsRef.current.length + 1) })
          .bindPopup(`<b>${bedrijf.naam}</b><br>${[bedrijf.straat, bedrijf.postcode, bedrijf.stad].filter(Boolean).join(', ')}`)
          .addTo(mapRef.current);
      }
      stopsRef.current = [...stopsRef.current, stop];
      setStops([...stopsRef.current]);
      added++;
    }
    const allCoords = stopsRef.current.filter(s => s.coords).map(s => s.coords!);
    if (allCoords.length > 0 && mapRef.current) {
      mapRef.current.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });
    }
    setDrawLoading(false);
    setRouteMode(false); setOrderedStops([]);
  };

  const addCompanyToRoute = async (company: any) => {
    const raw = company._raw || company;
    const naam = raw.naam || company.name || '';
    if (!naam) return;
    if (stopsRef.current.some(s => (s.company._raw?.naam || s.company.name) === naam)) return; // already added
    const id = `drop_${Date.now()}_${Math.random()}`;
    const stop: Stop = { id, company: { id, name: naam, city: raw.stad || company.city || '', _raw: raw }, coords: null, marker: null, loading: true, origin: 'manual' };
    stopsRef.current = [...stopsRef.current, stop];
    setStops([...stopsRef.current]);
    const cache = loadCache();
    const coords = await geocode(raw, cache);
    const idx = stopsRef.current.findIndex(s => s.id === id);
    if (idx === -1) return;
    stopsRef.current[idx].coords = coords;
    stopsRef.current[idx].loading = false;
    if (coords && mapRef.current) {
      stopsRef.current[idx].marker = L.marker(coords, { icon: makePin('#E85E26', idx + 1) })
        .bindPopup(`<b>${naam}</b><br>${[raw.straat, raw.postcode, raw.stad].filter(Boolean).join(', ')}`)
        .addTo(mapRef.current);
      const allCoords = stopsRef.current.filter(s => s.coords).map(s => s.coords!);
      if (allCoords.length > 1) mapRef.current.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });
      else mapRef.current.setView(coords, 13);
    }
    setStops([...stopsRef.current]);
    setRouteMode(false); setOrderedStops([]);
  };

  const removeStop = (id: string) => {
    stopsRef.current.find(s => s.id === id)?.marker?.remove();
    stopsRef.current = stopsRef.current.filter(s => s.id !== id);
    stopsRef.current.forEach((s, i) => { if (s.marker && s.coords) s.marker.setIcon(makePin('#E85E26', i + 1)); });
    setStops([...stopsRef.current]);
    setRemovedIds(prev => new Set(prev).add(id));
    setRouteMode(false); setOrderedStops([]);
  };

  const replaceStop = async (id: string, raw: any) => {
    const cache = loadCache();
    const coords = await geocode(raw, cache);
    const idx = stopsRef.current.findIndex(s => s.id === id);
    if (idx === -1) return;
    stopsRef.current[idx]?.marker?.remove();
    const newId = `manual_${Date.now()}_${Math.random()}`;
    const newStop: Stop = { id: newId, company: { id: newId, name: raw.naam, city: raw.stad || '', _raw: raw }, coords, marker: null, loading: false, origin: 'manual' };
    if (coords && mapRef.current) {
      newStop.marker = L.marker(coords, { icon: makePin('#E85E26', idx + 1) })
        .bindPopup(`<b>${raw.naam || ''}</b><br>${[raw.straat, raw.postcode, raw.stad].filter(Boolean).join(', ')}`)
        .addTo(mapRef.current);
    }
    stopsRef.current[idx] = newStop;
    stopsRef.current.forEach((s, i) => { if (s.marker && s.coords) s.marker.setIcon(makePin('#E85E26', i + 1)); });
    setStops([...stopsRef.current]);
    setRemovedIds(prev => new Set(prev).add(id));
    setRouteMode(false); setOrderedStops([]);
    setReplacingStopId(null); setReplaceStopQuery('');
  };

  const insertStopAfter = async (afterId: string | 'start', raw: any) => {
    const cache = loadCache();
    const coords = await geocode(raw, cache);
    const newId = `manual_${Date.now()}_${Math.random()}`;
    const newStop: Stop = { id: newId, company: { id: newId, name: raw.naam, city: raw.stad || '', _raw: raw }, coords, marker: null, loading: false, origin: 'manual' };
    const insertIdx = afterId === 'start' ? 0 : stopsRef.current.findIndex(s => s.id === afterId) + 1;
    stopsRef.current = [...stopsRef.current.slice(0, insertIdx), newStop, ...stopsRef.current.slice(insertIdx)];
    stopsRef.current.forEach((s, i) => {
      if (s.coords && mapRef.current) {
        s.marker?.remove();
        s.marker = L.marker(s.coords, { icon: makePin('#E85E26', i + 1) })
          .bindPopup(`<b>${(s.company._raw || s.company).naam || s.company.name || ''}</b>`)
          .addTo(mapRef.current);
      }
    });
    setStops([...stopsRef.current]);
    setRouteMode(false); setOrderedStops([]);
    setInsertAfterId(null); setInsertQuery('');
  };

  const doSave = () => {
    if (!saveName.trim()) return;
    const displayStops = routeMode ? orderedStops : stopsRef.current.filter(s => s.coords);
    const saved = JSON.parse(localStorage.getItem(ROUTES_KEY) || '[]');
    saved.unshift({
      id: Date.now().toString(),
      name: saveName.trim(),
      startAddress: startAddr,
      returnToStart: returnHome,
      stops: displayStops.map(s => {
        const raw = s.company._raw || s.company;
        return `${raw.naam || s.company.name}|${raw.stad || s.company.city || ''}`;
      }),
      savedAt: Date.now(),
    });
    localStorage.setItem(ROUTES_KEY, JSON.stringify(saved));
    setSaving(false); setSaveName('');
    setSavedMsg('Opgeslagen! Beschikbaar onder Kaart → Opgeslagen.');
    setTimeout(() => setSavedMsg(''), 4000);
  };

  const planBezoek = async () => {
    const loc = planLocatie.trim();
    if (!loc) { setPlanMsg('Vul een stad, dorp of provincie in.'); return; }
    setPlanLoading(true); setPlanMsg('');
    try {
      // Geocode the entered location
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(loc + ' Nederland')}&countrycodes=nl&limit=1`,
        { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
      );
      const d = await r.json();
      if (!d?.[0]) { setPlanMsg(`"${loc}" niet gevonden. Probeer een andere naam.`); setPlanLoading(false); return; }
      const lat = parseFloat(d[0].lat);
      const lon = parseFloat(d[0].lon);

      const scored = scoreBedrijven(allData, lat, lon, planTypes, cityCoords as any, planMax);
      if (scored.length === 0) { setPlanMsg('Geen bedrijven gevonden in de buurt. Probeer een grotere stad.'); setPlanLoading(false); return; }

      // Clear existing stops and load the new ones
      stopsRef.current.forEach(s => s.marker?.remove());
      stopsRef.current = [];
      setStops([]);
      setRouteMode(false);
      setOrderedStops([]);

      // Add stops (they will be geocoded via the existing addStop flow)
      const cache = loadCache();
      const seenNames = new Set<string>();
      for (const { bedrijf } of scored) {
        const nn = normNaam(bedrijf.naam);
        if (nn && seenNames.has(nn)) continue; // never place the same company twice
        seenNames.add(nn);
        const id = `plan_${Date.now()}_${Math.random()}`;
        const coords = await geocode(bedrijf, cache);
        await new Promise(res => setTimeout(res, 300));
        const stop: Stop = { id, company: { id, name: bedrijf.naam, city: bedrijf.stad, _raw: bedrijf }, coords, marker: null, loading: false, origin: 'manual' };
        if (coords && mapRef.current) {
          stop.marker = L.marker(coords, { icon: makePin('#E85E26', stopsRef.current.length + 1) })
            .bindPopup(`<b>${bedrijf.naam || ''}</b><br>${[bedrijf.straat, bedrijf.postcode, bedrijf.stad].filter(Boolean).join(', ')}`)
            .addTo(mapRef.current);
        }
        stopsRef.current = [...stopsRef.current, stop];
        setStops([...stopsRef.current]);
      }

      // Fit map to stops
      const placed = stopsRef.current.filter(s => s.coords);
      if (placed.length > 0 && mapRef.current) {
        const bounds = L.latLngBounds(placed.map(s => s.coords!));
        mapRef.current.fitBounds(bounds, { padding: [30, 30] });
      }
      setPlanOpen(false);
      setPlanMsg('');
    } catch { setPlanMsg('Er ging iets mis. Probeer opnieuw.'); }
    setPlanLoading(false);
  };

  const displayStops = routeMode ? orderedStops : stops;
  const readyCount   = stops.filter(s => s.coords).length;
  const mapsUrl = (() => {
    if (!routeMode || !orderedStops.length) return null;
    const enc = (s: Stop) => {
      const r = s.company._raw || s.company;
      return encodeURIComponent([r.naam, r.straat, r.postcode, r.stad].filter(Boolean).join(', '));
    };
    const parts = [
      encodeURIComponent(startAddr),
      ...orderedStops.slice(0, 10).map(enc),
      ...(returnHome ? [encodeURIComponent(startAddr)] : []),
    ];
    return `https://www.google.com/maps/dir/${parts.join('/')}?travelmode=driving`;
  })();

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-sm bg-[#009FE3] flex items-center justify-center flex-shrink-0">
            <Navigation className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 uppercase tracking-wide leading-none">Route Kaart</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {stops.length === 0
                ? 'Vink bedrijven aan in de lijst'
                : `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} · ${readyCount} op kaart`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!routeMode && (
            <button onClick={() => { onAddCompany?.(); setInsertAfterId('start'); setInsertQuery(''); }} title="Bedrijf toevoegen" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-[#009FE3] transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={mapDiv}
          className="w-full h-full"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('application/company');
            if (raw) { try { addCompanyToRoute(JSON.parse(raw)); } catch {} }
          }}
        />
        {drawMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="bg-[#E85E26] text-white text-xs font-semibold px-4 py-2 rounded-sm shadow-lg flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {drawStep === 0 ? 'Klik op de kaart voor het middelpunt' : 'Klik nogmaals om de straal te bevestigen'}
              <button className="pointer-events-auto ml-2 opacity-70 hover:opacity-100" onClick={() => { setDrawMode(false); setDrawStep(0); drawCenterRef.current = null; drawCircleRef.current?.remove(); drawCircleRef.current = null; drawMarkerRef.current?.remove(); drawMarkerRef.current = null; }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        {stops.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-sm p-8 text-center shadow-sm mx-4">
              <MapPin className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Geen stops</p>
              <p className="text-xs text-slate-400 mt-1">Vink bedrijven aan links om ze hier te zien</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls (alleen als er stops zijn) ── */}
      {(stops.length > 0 || insertAfterId === 'start') && (
        <div className="flex-shrink-0 bg-white border-t border-slate-200">

          {/* Stop list — also a drop zone for dragged company cards */}
          <div
            className="max-h-44 overflow-y-auto px-3 pt-3 space-y-0.5"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const raw = e.dataTransfer.getData('application/company');
              if (raw) { try { addCompanyToRoute(JSON.parse(raw)); } catch {} }
            }}>
            {insertAfterId === 'start' && (() => {
              const q = insertQuery.toLowerCase().trim();
              const existingNames = new Set<string>(displayStops.map(o => ((o.company._raw || o.company).naam || o.company.name || '').toLowerCase()));
              const nextCoords = displayStops[0]?.coords;
              const candidates = nextCoords
                ? scoreInsertionCandidates(allData, null, { lat: nextCoords[0], lng: nextCoords[1] }, cityCoords as any, existingNames, 8, q).map(c => c.bedrijf)
                : q.length >= 2
                  ? allData.filter((cand: any) => !existingNames.has((cand.naam || '').toLowerCase()) && [cand.naam, cand.stad].join(' ').toLowerCase().includes(q)).slice(0, 8)
                  : [];
              return (
                <div className="border border-[#E85E26] rounded-sm p-2 my-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nieuwe stop toevoegen</span>
                    <button onClick={() => { setInsertAfterId(null); setInsertQuery(''); }} className="text-slate-400 hover:text-slate-700 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {!q && nextCoords && <p className="text-[10px] text-slate-400 mb-1">Beste opties om mee te beginnen:</p>}
                  <input autoFocus type="text" value={insertQuery} onChange={e => setInsertQuery(e.target.value)}
                    placeholder="Zoek op naam/stad..."
                    className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-xs focus:outline-none focus:border-[#E85E26] mb-1" />
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {candidates.map((cand: any, ci: number) => (
                      <button key={ci} onClick={() => insertStopAfter('start', cand)}
                        className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                        <span className="font-semibold text-slate-700">{cand.naam}</span>
                        <span className="text-slate-400 text-[10px]">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                      </button>
                    ))}
                    {candidates.length === 0 && <p className="text-[10px] text-slate-400 py-1">Geen bedrijven gevonden.</p>}
                  </div>
                </div>
              );
            })()}
            {displayStops.map((s, i) => {
              const raw = s.company._raw || s.company;
              const website = raw.website || raw.url;
              const googleUrl = `https://www.google.com/search?q=${encodeURIComponent((raw.naam || s.company.name || '') + ' ' + (raw.stad || s.company.city || ''))}`;

              if (!routeMode && replacingStopId === s.id) {
                const q = replaceStopQuery.toLowerCase().trim();
                const existingNames = new Set<string>(displayStops.filter(o => o.id !== s.id).map(o => ((o.company._raw || o.company).naam || o.company.name || '').toLowerCase()));
                const prevCoords = displayStops[i - 1]?.coords;
                const nextCoords = displayStops[i + 1]?.coords;
                const candidates = (prevCoords || nextCoords)
                  ? scoreInsertionCandidates(allData, prevCoords ? { lat: prevCoords[0], lng: prevCoords[1] } : null, nextCoords ? { lat: nextCoords[0], lng: nextCoords[1] } : null, cityCoords as any, existingNames, 8, q).map(c => c.bedrijf)
                  : q.length >= 2
                    ? allData.filter((cand: any) => !existingNames.has((cand.naam || '').toLowerCase()) && [cand.naam, cand.stad].join(' ').toLowerCase().includes(q)).slice(0, 8)
                    : [];
                return (
                  <div key={s.id} className="border border-[#009FE3] rounded-sm p-2 my-1 mx-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Vervang "{raw.naam || s.company.name}"</span>
                      <button onClick={() => { setReplacingStopId(null); setReplaceStopQuery(''); }} className="text-slate-400 hover:text-slate-700 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {!q && (prevCoords || nextCoords) && <p className="text-[10px] text-slate-400 mb-1">Beste tussenopties op deze plek in de route:</p>}
                    <input autoFocus type="text" value={replaceStopQuery} onChange={e => setReplaceStopQuery(e.target.value)}
                      placeholder="Of zoek zelf op naam/stad..."
                      className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-xs focus:outline-none focus:border-[#009FE3] mb-1" />
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {candidates.map((cand: any, ci: number) => (
                        <button key={ci} onClick={() => replaceStop(s.id, cand)}
                          className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                          <span className="font-semibold text-slate-700">{cand.naam}</span>
                          <span className="text-slate-400 text-[10px]">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                        </button>
                      ))}
                      {candidates.length === 0 && <p className="text-[10px] text-slate-400 py-1">Geen bedrijven gevonden.</p>}
                    </div>
                  </div>
                );
              }

              if (!routeMode && insertAfterId === s.id) {
                const q = insertQuery.toLowerCase().trim();
                const existingNames = new Set<string>(displayStops.map(o => ((o.company._raw || o.company).naam || o.company.name || '').toLowerCase()));
                const prevCoords = s.coords;
                const nextCoords = displayStops[i + 1]?.coords;
                const candidates = (prevCoords || nextCoords)
                  ? scoreInsertionCandidates(allData, prevCoords ? { lat: prevCoords[0], lng: prevCoords[1] } : null, nextCoords ? { lat: nextCoords[0], lng: nextCoords[1] } : null, cityCoords as any, existingNames, 8, q).map(c => c.bedrijf)
                  : q.length >= 2
                    ? allData.filter((cand: any) => !existingNames.has((cand.naam || '').toLowerCase()) && [cand.naam, cand.stad].join(' ').toLowerCase().includes(q)).slice(0, 8)
                    : [];
                return (
                  <div key={`insert-${s.id}`} className="border border-[#E85E26] rounded-sm p-2 my-1 mx-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Nieuwe stop na "{raw.naam || s.company.name}"</span>
                      <button onClick={() => { setInsertAfterId(null); setInsertQuery(''); }} className="text-slate-400 hover:text-slate-700 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {!q && (prevCoords || nextCoords) && <p className="text-[10px] text-slate-400 mb-1">Beste tussenopties op deze plek in de route:</p>}
                    <input autoFocus type="text" value={insertQuery} onChange={e => setInsertQuery(e.target.value)}
                      placeholder="Of zoek zelf op naam/stad..."
                      className="w-full border border-slate-200 rounded-sm px-2 py-1.5 text-xs focus:outline-none focus:border-[#E85E26] mb-1" />
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {candidates.map((cand: any, ci: number) => (
                        <button key={ci} onClick={() => insertStopAfter(s.id, cand)}
                          className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                          <span className="font-semibold text-slate-700">{cand.naam}</span>
                          <span className="text-slate-400 text-[10px]">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                        </button>
                      ))}
                      {candidates.length === 0 && <p className="text-[10px] text-slate-400 py-1">Geen bedrijven gevonden.</p>}
                    </div>
                  </div>
                );
              }

              return (
                <React.Fragment key={s.id}>
                <div
                  draggable
                  onDragStart={() => { dragIdx.current = i; }}
                  onDragOver={e => { e.preventDefault(); if (dragIdx.current !== null && dragIdx.current !== i) { reorderStops(dragIdx.current, i); dragIdx.current = i; } }}
                  onDragEnd={() => { dragIdx.current = null; }}
                  className="relative flex items-center gap-1.5 text-xs py-1.5 px-2 rounded hover:bg-slate-50 group transition-colors cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-3 h-3 text-slate-300 flex-shrink-0 group-hover:text-slate-400" />
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: routeMode ? '#009FE3' : '#E85E26' }}>
                    {i + 1}
                  </span>
                  {s.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-300 flex-shrink-0" />}
                  <span
                    className="flex-1 font-semibold text-slate-700 truncate hover:text-[#009FE3] cursor-pointer"
                    onClick={e => { e.stopPropagation(); const nm = raw.naam || s.company.name; if (nm) onNavigate?.('database', nm); }}
                    title="Zoek in database">
                    {raw.naam || s.company.name || '—'}
                  </span>
                  <span className="text-slate-400 flex-shrink-0 text-[10px] truncate max-w-[60px] hidden sm:block">{raw.stad || s.company.city || ''}</span>
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
                    {!routeMode && (
                      <button onClick={e => { e.stopPropagation(); setStopMenuOpen(stopMenuOpen === s.id ? null : s.id); }}
                        className="p-0.5 text-slate-300 hover:text-slate-600 flex-shrink-0 transition-colors" title="Opties">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {stopMenuOpen === s.id && (
                    <div className="absolute right-1 top-7 z-10 w-32 bg-white border border-slate-200 rounded-sm shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { removeStop(s.id); setStopMenuOpen(null); }} className="w-full text-left px-2.5 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 flex items-center gap-1.5"><Trash2 className="w-3 h-3" />Verwijderen</button>
                      <button onClick={() => { setReplacingStopId(s.id); setReplaceStopQuery(''); setStopMenuOpen(null); }} className="w-full text-left px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 border-t border-slate-100"><Repeat className="w-3 h-3" />Vervangen</button>
                    </div>
                  )}
                </div>
                {!routeMode && (
                  <div className="flex justify-center -my-0.5">
                    <button onClick={() => { setInsertAfterId(s.id); setInsertQuery(''); setStopMenuOpen(null); }}
                      title="Stop invoegen op deze plek" className="opacity-40 hover:opacity-100 p-0.5 text-slate-300 hover:text-[#E85E26] transition-opacity">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="p-3 space-y-2.5">
            {/* Start address + retour */}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={startAddr}
                onChange={e => setStartAddr(e.target.value)}
                placeholder="Startadres"
                className="flex-1 border border-slate-200 rounded-sm px-3 py-2 text-xs focus:outline-none focus:border-[#009FE3] bg-slate-50 focus:bg-white transition-colors"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap cursor-pointer select-none">
                <input type="checkbox" checked={returnHome} onChange={e => setReturnHome(e.target.checked)} className="accent-[#009FE3]" />
                Retour
              </label>
            </div>

            {/* Action buttons */}
            {!routeMode ? (
              <button
                onClick={handleOptimise}
                disabled={isOptimising || readyCount === 0}
                className="w-full py-2.5 bg-[#E85E26] hover:bg-[#d14d1b] disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 transition-colors">
                {isOptimising
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Optimaliseren…</>
                  : <><ListOrdered className="w-3.5 h-3.5" /> Route optimaliseren ({readyCount} stops)</>}
              </button>
            ) : (
              <div className="flex gap-2">
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-1.5 transition-colors">
                    <Navigation className="w-3.5 h-3.5" /> Open Google Maps
                  </a>
                )}
                <button onClick={cancelRoute}
                  className="py-2.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs rounded-sm flex items-center gap-1 transition-colors" title="Opnieuw">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {orderedStops.length > 10 && (
              <p className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">Google Maps toont max 10 stops. De eerste 10 worden geopend.</p>
            )}

            {/* Address verification button */}
            <button
              onClick={showVerify ? () => setShowVerify(false) : runVerification}
              disabled={isVerifying}
              className="w-full py-2 border border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-500 text-xs font-semibold rounded-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
              {isVerifying
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adressen controleren…</>
                : showVerify
                ? <><ChevronUp className="w-3.5 h-3.5" /> Verificatie verbergen</>
                : <><ShieldCheck className="w-3.5 h-3.5" /> Adressen verifiëren</>}
            </button>

            {/* Verification panel */}
            {showVerify && (
              <div className="border border-slate-200 rounded-sm bg-slate-50 overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#009FE3]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Adresverificatie</span>
                  {isVerifying && <span className="text-[10px] text-slate-400 ml-auto">Nominatim API · max 1/sec…</span>}
                </div>
                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {stopsRef.current.map(stop => {
                    const raw = stop.company._raw || stop.company;
                    const v = verifications[stop.id];
                    if (!v) return null;
                    return (
                      <div key={stop.id} className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          {v.status === 'checking' && <Loader2 className="w-3 h-3 animate-spin text-slate-400 flex-shrink-0" />}
                          {v.status === 'ok'        && <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                          {v.status === 'suspect'   && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                          {v.status === 'not_found' && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                          <span className="font-semibold text-slate-700 truncate flex-1">{raw.naam}</span>
                          {v.accepted && <span className="text-[10px] text-emerald-600 font-semibold">Bijgewerkt</span>}
                        </div>
                        {v.status === 'ok' && !v.accepted && (
                          <p className="text-slate-400 text-[10px] mt-0.5 pl-4.5">
                            {[raw.straat, raw.postcode, raw.stad].filter(Boolean).join(', ')} — OK
                          </p>
                        )}
                        {(v.status === 'suspect' || v.status === 'not_found') && v.reason && (
                          <p className="text-amber-600 text-[10px] mt-0.5 pl-4">{v.reason}</p>
                        )}
                        {v.suggestion && !v.accepted && (
                          <div className="mt-1.5 pl-4 space-y-1">
                            <div className="bg-white border border-amber-200 rounded p-1.5 text-[10px]">
                              <p className="text-slate-500 font-semibold mb-0.5">Voorstel:</p>
                              <p className="text-slate-700">{[v.suggestion.straat, v.suggestion.postcode, v.suggestion.stad].filter(Boolean).join(', ')}</p>
                              <p className="text-slate-400 truncate text-[9px] mt-0.5">{v.suggestion.display}</p>
                            </div>
                            <div className="text-slate-400 text-[10px]">
                              <span className="font-semibold">Huidig: </span>
                              {[raw.straat, raw.postcode, raw.stad].filter(Boolean).join(', ')}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => acceptCorrection(stop)}
                                className="flex items-center gap-1 px-2 py-1 bg-[#009FE3] text-white text-[10px] font-bold rounded hover:bg-[#008ac5] transition-colors">
                                <Check className="w-2.5 h-2.5" /> Adres corrigeren
                              </button>
                              <button
                                type="button"
                                onClick={() => addAsExtraVestiging(stop)}
                                className="flex items-center gap-1 px-2 py-1 bg-[#E85E26] text-white text-[10px] font-bold rounded hover:bg-[#d14d1b] transition-colors">
                                + Extra vestiging
                              </button>
                              <button
                                type="button"
                                onClick={() => dismissVerification(stop)}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded hover:bg-slate-200 transition-colors">
                                Afwijzen
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteStop(stop)}
                                className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded hover:bg-red-600 transition-colors">
                                Verwijder
                              </button>
                            </div>
                          </div>
                        )}
                        {v.status === 'checking' && (
                          <p className="text-slate-400 text-[10px] mt-0.5 pl-4">Controleren…</p>
                        )}
                      </div>
                    );
                  })}
                  {stopsRef.current.length === 0 && (
                    <p className="px-3 py-4 text-[10px] text-slate-400 text-center">Geen stops om te verifiëren.</p>
                  )}
                </div>
              </div>
            )}

            {/* Save to Kaart */}
            {saving ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { setSaving(false); setSaveName(''); } }}
                  placeholder="Naam voor deze route…"
                  className="flex-1 border border-[#009FE3] rounded-sm px-3 py-2 text-xs focus:outline-none bg-white"
                />
                <button onClick={doSave} disabled={!saveName.trim()}
                  className="px-3 py-2 bg-[#009FE3] disabled:opacity-40 text-white text-xs font-bold rounded-sm flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { setSaving(false); setSaveName(''); }}
                  className="px-3 py-2 border border-slate-200 text-slate-400 text-xs rounded-sm hover:bg-slate-50">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setSaving(true)}
                className="w-full py-2 border border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-500 text-xs font-semibold rounded-sm flex items-center justify-center gap-1.5 transition-colors">
                <Save className="w-3.5 h-3.5" /> Opslaan naar Kaart
              </button>
            )}

            {savedMsg && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-3 py-2 rounded border border-emerald-200">
                <Check className="w-3 h-3 flex-shrink-0" /> {savedMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Teken gebied ── */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-2.5">
        {drawCenter ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#E85E26] font-semibold">
              <span>Gebied getekend</span>
              <button onClick={clearDrawArea} className="text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
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
                className="w-full accent-[#E85E26] h-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              {([['mix','Mix'],['architect','Architecten'],['aannemer','Aannemers'],['bouwbedrijf','Bouwbedrijven']] as [BezoekType,string][]).map(([v,l]) => (
                <button key={v} onClick={() => setDrawPlanType(v)}
                  className={`py-1 text-[10px] font-bold rounded-sm border transition-colors ${drawPlanType === v ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'border-slate-200 text-slate-600 hover:border-[#E85E26]'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[5,10,20,50].map(n => (
                <button key={n} onClick={() => setDrawPlanMax(n)}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-sm border transition-colors ${drawPlanMax === n ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'border-slate-200 text-slate-600 hover:border-[#009FE3]'}`}>
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => planBezoekInArea(drawCenter, drawRadiusM, drawPlanType, drawPlanMax)}
              disabled={drawLoading}
              className="w-full py-2 bg-[#E85E26] hover:bg-[#d14d1b] disabled:opacity-50 text-white text-xs font-bold rounded-sm flex items-center justify-center gap-1.5 transition-colors">
              <MapPin className="w-3.5 h-3.5" />
              {drawLoading ? 'Laden…' : `Laad ${drawPlanMax} bedrijven in route`}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { drawCenterRef.current = null; setDrawMode(true); }}
            className={`w-full py-2 text-xs font-semibold rounded-sm flex items-center justify-center gap-1.5 transition-colors border ${drawMode ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'border-slate-300 text-slate-600 hover:border-[#E85E26] hover:text-[#E85E26]'}`}>
            <MapPin className="w-3.5 h-3.5" />
            {drawMode ? 'Klik op kaart voor middelpunt…' : 'Teken gebied'}
          </button>
        )}
      </div>

      {/* ── Dagbezoek planner ── */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200">
        <button
          onClick={() => setPlanOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <CalendarDays className="w-3.5 h-3.5 text-[#E85E26]" />
            Plan een bezoek
          </div>
          {planOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {planOpen && (
          <div className="px-4 pb-3 space-y-2.5 overflow-y-auto max-h-72">
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Waar naartoe?</label>
              <input
                type="text"
                value={planLocatie}
                onChange={e => setPlanLocatie(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && planBezoek()}
                placeholder="stad, dorp of provincie…"
                className="w-full border border-slate-200 rounded-sm px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#009FE3]"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Type bedrijven</label>
              <div className="space-y-1.5">
                {([
                  { val: 'architecten',  label: 'Architecten',  match: 'architect' },
                  { val: 'bouwbedrijven',label: 'Bouwbedrijven',match: 'bouwbedrijf' },
                  { val: 'aannemers',    label: 'Aannemers',    match: 'aannemer' },
                  { val: 'materialen',   label: 'Bouwmaterialen',match: 'materialen' },
                ] as { val: BezoekType; label: string; match: string }[]).map(({ val, label, match }) => {
                  const count = allData.filter((b: any) => detectType(b) === match).length;
                  const isSelected = planTypes.includes(val);
                  return (
                    <label key={val} className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center rounded-sm ${isSelected ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-300'}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className={`text-[11px] flex-1 ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>{label}</span>
                      <span className="text-[10px] text-slate-300 font-medium">{count.toLocaleString('nl-NL')}</span>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={isSelected}
                        onChange={() => setPlanTypes(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Max stops</label>
              <div className="flex gap-1">
                {[10, 12, 15].map(n => (
                  <button key={n} onClick={() => setPlanMax(n)}
                    className={`flex-1 py-1.5 rounded-sm text-[10px] font-bold border transition-colors ${planMax === n ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}>
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
              className="w-full py-2.5 bg-[#E85E26] hover:bg-[#d14d1b] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-sm flex items-center justify-center gap-2 transition-colors">
              {planLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bedrijven zoeken…</>
                : <><CalendarDays className="w-3.5 h-3.5" /> Plan bezoek{planLocatie.trim() ? ` → ${planLocatie.trim()}` : ''}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RouteMapPanel;
