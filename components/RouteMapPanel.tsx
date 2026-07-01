import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2, Navigation, ListOrdered, RotateCcw, X,
  Trash2, Save, Check, MapPin,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const GEO_KEY    = 'inncempro_geo_cache';
const ROUTES_KEY = 'inncempro_saved_routes';
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

interface Stop { id: string; company: any; coords: Coords | null; marker: L.Marker | null; loading: boolean; }

interface Props {
  companies: any[];
  onClose: () => void;
}

const DEFAULT_START = 'Lansinkesweg 4, 7553 AE Hengelo';

const RouteMapPanel: React.FC<Props> = ({ companies, onClose }) => {
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
    const companyIds = new Set(companies.map(c => c.id));

    // Remove stops no longer in selection
    stopsRef.current.filter(s => !companyIds.has(s.id)).forEach(s => s.marker?.remove());
    const kept = stopsRef.current.filter(s => companyIds.has(s.id));
    const keptIds = new Set(kept.map(s => s.id));
    const newCompanies = companies.filter(c => !keptIds.has(c.id));

    const newStops: Stop[] = [
      ...kept,
      ...newCompanies.map(c => ({ id: c.id, company: c, coords: null, marker: null, loading: true })),
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
  }, [companies]);

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

  const removeStop = (id: string) => {
    stopsRef.current.find(s => s.id === id)?.marker?.remove();
    stopsRef.current = stopsRef.current.filter(s => s.id !== id);
    stopsRef.current.forEach((s, i) => { if (s.marker && s.coords) s.marker.setIcon(makePin('#E85E26', i + 1)); });
    setStops([...stopsRef.current]);
    setRouteMode(false); setOrderedStops([]);
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
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Map ── */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapDiv} className="w-full h-full" />
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
      {stops.length > 0 && (
        <div className="flex-shrink-0 bg-white border-t border-slate-200">

          {/* Stop list */}
          <div className="max-h-40 overflow-y-auto px-3 pt-3 space-y-0.5">
            {displayStops.map((s, i) => {
              const raw = s.company._raw || s.company;
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-slate-50 group transition-colors">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: routeMode ? '#009FE3' : '#E85E26' }}>
                    {i + 1}
                  </span>
                  {s.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-300 flex-shrink-0" />}
                  <span className="flex-1 font-semibold text-slate-700 truncate">{raw.naam || s.company.name || '—'}</span>
                  <span className="text-slate-400 flex-shrink-0 text-[10px] truncate max-w-[70px]">{raw.stad || s.company.city || ''}</span>
                  {!routeMode && (
                    <button onClick={() => removeStop(s.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 flex-shrink-0 transition-opacity">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
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
    </div>
  );
};

export default RouteMapPanel;
