import React, { useEffect, useRef, useState } from 'react';
import { Navigation, MapPin, X, Loader2, Search, Check, RotateCcw, Save, Plus } from 'lucide-react';
import { haversineKm, detectType } from '../utils/dagbezoek';
import { getDrivingDistancesKm } from '../services/routingService';
import { getClusterData, makeId } from '../services/geoclusterService';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Coords = { lat: number; lng: number };

// Exact dezelfde popup-inhoud (naam, adres, telefoon, email, website-link, Google Maps-link,
// "Open in database") als op de Kaart-tab (components/ClusterMapView.tsx popupHtml) — bewust
// gekopieerd i.p.v. een eigen variant verzonnen, zodat je hier precies dezelfde informatie ziet.
function popupHtml(b: any, extra?: string): string {
  const website = b.website ? (/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`) : '';
  const naamEsc = (b.naam || '').replace(/'/g, "\\'");
  const mapsQuery = encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
  return `<div style="font-family:system-ui;font-size:13px;min-width:210px">
    ${extra ? `<div style="font-size:10px;font-weight:700;color:#E85E26;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${extra}</div>` : ''}
    <b style="color:#1e293b">${b.naam || ''}</b><br/>
    <span style="color:#64748b;font-size:12px">${b.straat || ''}</span><br/>
    <span style="color:#64748b;font-size:12px">${[b.postcode, b.stad].filter(Boolean).join(' ')}</span>
    ${b.telefoon ? `<div style="margin-top:4px;color:#374151;font-size:12px">📞 ${b.telefoon}</div>` : ''}
    ${b.email ? `<div style="color:#374151;font-size:12px">✉️ ${b.email}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${website ? `<a href="${website}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Google Maps →</a>
      <button onclick="window._inncemRideNav('${naamEsc}')" style="font-size:11px;color:#1e293b;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px;border-radius:4px;cursor:pointer">Open in database →</button>
    </div>
    ${b.source ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">${b.source}</div>` : ''}
  </div>`;
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

interface RideStop {
  id: string;
  bedrijf: any;
  coords: Coords;
  km: number; // afstand vanaf de vorige stop (of het startpunt bij de eerste)
}

interface Suggestion {
  bedrijf: any;
  coords: Coords;
  km: number;
  driving: boolean; // true = echte rijafstand (OSRM), false = hemelsbrede fallback
}

interface RidePanelProps {
  allData: any[];
  cityCoords: Record<string, { lat: number; lng: number }>;
  isVisitedCompany: (b: any) => boolean;
  onSaveAsList: (naam: string, bedrijven: any[]) => void;
  onLogVisits: (bedrijven: any[]) => void;
  onOpenInDatabase?: (naam: string) => void;
  // true = wordt getoond binnen een bestaande kaart/sectie (Mijn bezoeken) — laat dan de eigen
  // buitenste kaart-rand/titel weg zodat het niet dubbel oogt.
  embedded?: boolean;
}

const DISCIPLINES: Array<{ key: 'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen'; label: string }> = [
  { key: 'architect', label: 'Architecten' },
  { key: 'bouwbedrijf', label: 'Bouwbedrijven' },
  { key: 'aannemer', label: 'Aannemers' },
  { key: 'materialen', label: 'Bouwmaterialen' },
];

// Haalt de beste bekende coördinaat voor een bedrijf op: eerst de precieze straat-coördinaat
// uit de al-draaiende achtergrond-geocoding (zelfde cache als Kaart/Route Kaart gebruiken),
// anders het centrum van de plaats als benadering.
function coordsFor(b: any, cityCoords: Record<string, Coords>): Coords | null {
  const cluster = getClusterData();
  const exact = cluster?.get(makeId(b))?.coords;
  if (exact) return { lat: exact[0], lng: exact[1] };
  const stad = (b.stad || '').toUpperCase().trim();
  return cityCoords[stad] || cityCoords[(b.stad || '').trim()] || null;
}

const RidePanel: React.FC<RidePanelProps> = ({ allData, cityCoords, isVisitedCompany, onSaveAsList, onLogVisits, onOpenInDatabase, embedded }) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [startMode, setStartMode] = useState<'gps' | 'search'>('gps');
  const [startQuery, setStartQuery] = useState('');
  const [startCoords, setStartCoords] = useState<Coords | null>(null);
  const [startLabel, setStartLabel] = useState('');
  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [chain, setChain] = useState<RideStop[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestCount, setSuggestCount] = useState(8);
  const [filterTypes, setFilterTypes] = useState<Set<'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen'>>(new Set());
  const [onlyUnvisited, setOnlyUnvisited] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [finished, setFinished] = useState(false);
  const [saveListName, setSaveListName] = useState('');

  const requestIdRef = useRef(0);

  const currentPosition = (): Coords | null => {
    if (chain.length > 0) return chain[chain.length - 1].coords;
    return startCoords;
  };

  // Zoekt de N dichtstbijzijnde nog-niet-in-de-rit-zittende bedrijven vanaf de huidige positie,
  // met echte rijafstand (gratis publieke OSRM-server, zelfde als Route Kaart al gebruikt) —
  // valt per kandidaat stil terug op hemelsbrede afstand als die specifieke opzoek mislukt.
  const computeSuggestions = async (from: Coords) => {
    const myRequestId = ++requestIdRef.current;
    setLoadingSuggestions(true);
    const inChain = new Set(chain.map(s => (s.bedrijf.naam || '').toLowerCase().trim()));

    const candidates: Array<{ bedrijf: any; coords: Coords; haversine: number }> = [];
    for (const b of allData) {
      const naam = (b.naam || '').toLowerCase().trim();
      if (!naam || inChain.has(naam)) continue;
      if (filterTypes.size > 0 && !filterTypes.has(detectType(b) as any)) continue;
      if (onlyUnvisited && isVisitedCompany(b)) continue;
      const coords = coordsFor(b, cityCoords);
      if (!coords) continue;
      const hv = haversineKm(from.lat, from.lng, coords.lat, coords.lng);
      if (hv > 75) continue; // ruime radius, scheelt duizenden onnodige OSRM-aanvragen
      candidates.push({ bedrijf: b, coords, haversine: hv });
    }
    // Alleen de dichtstbijzijnde ~40 (hemelsbreed) daadwerkelijk aan OSRM voorleggen voor
    // echte rijafstand — genoeg marge om de top-N na herordening nog te kloppen, zonder de
    // gratis publieke server met duizenden punten tegelijk te belasten.
    candidates.sort((a, b) => a.haversine - b.haversine);
    const shortlist = candidates.slice(0, 40);

    let driving: (number | null)[] = [];
    try {
      driving = await getDrivingDistancesKm(from, shortlist.map(c => c.coords));
    } catch {
      driving = shortlist.map(() => null);
    }
    if (myRequestId !== requestIdRef.current) return; // een nieuwere aanvraag heeft dit al ingehaald

    const withDistance: Suggestion[] = shortlist.map((c, i) => ({
      bedrijf: c.bedrijf,
      coords: c.coords,
      km: driving[i] ?? c.haversine,
      driving: driving[i] != null,
    }));
    withDistance.sort((a, b) => a.km - b.km);
    setSuggestions(withDistance.slice(0, suggestCount));
    setLoadingSuggestions(false);
  };

  useEffect(() => {
    const pos = currentPosition();
    if (pos) computeSuggestions(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, filterTypes, onlyUnvisited, suggestCount, startCoords]);

  // "Open in database" vanuit een kaart-popup — zelfde patroon als de Kaart-tab
  // (window._inncemMapNav daar), maar onder een eigen naam zodat ze elkaar niet overschrijven
  // als beide ooit tegelijk in de DOM zitten.
  useEffect(() => {
    (window as any)._inncemRideNav = (naam: string) => onOpenInDatabase?.(naam);
    return () => { delete (window as any)._inncemRideNav; };
  }, [onOpenInDatabase]);

  // De kaart initialiseert pas zodra er een startpunt is (dus pas ná "vanaf mijn locatie" of
  // "zoek startpunt") — hiervoor is er nog niets zinvols te tonen, en dit hele paneel zit al
  // achter de "Onderweg"-inklapper, dus de kaart komt sowieso nooit vanzelf in beeld bovenop
  // de bezoekhistorie. Zelfde Google-tegels als de Kaart-tab, voor een herkenbaar beeld.
  useEffect(() => {
    if (!startCoords || !mapDivRef.current || mapRef.current) return;
    mapRef.current = L.map(mapDivRef.current, { preferCanvas: true }).setView([startCoords.lat, startCoords.lng], 12);
    const googleMapsApiKey = 'AIzaSyDtsaBhb-Uq3xWvqE6mnmv3sXYM3dM3TUY';
    L.tileLayer(`https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}&scale=2&key=${googleMapsApiKey}`, {
      attribution: '© Google Maps', maxZoom: 20, minZoom: 1, tileSize: 256,
    }).addTo(mapRef.current);
    markersLayerRef.current = L.layerGroup().addTo(mapRef.current);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, [startCoords]);

  // Markers herbouwen zodra startpunt, route of voorstellen wijzigen: startpunt (blauw "S"),
  // route-stops genummerd (oranje, zelfde stijl als Route Kaart), voorstellen als kleinere
  // grijze pins zodat je meteen ziet wat er verderop ligt vóórdat je 'm aanklikt.
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current || !startCoords) return;
    markersLayerRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [[startCoords.lat, startCoords.lng]];

    L.marker([startCoords.lat, startCoords.lng], { icon: makePin('#1e293b', 'S') })
      .bindPopup(`<div style="font-family:system-ui;font-size:13px"><b>${startLabel || 'Startpunt'}</b></div>`)
      .addTo(markersLayerRef.current);

    chain.forEach((s, i) => {
      L.marker([s.coords.lat, s.coords.lng], { icon: makePin('#E85E26', i + 1) })
        .bindPopup(popupHtml(s.bedrijf, `Stop ${i + 1} van de route`))
        .addTo(markersLayerRef.current!);
      bounds.push([s.coords.lat, s.coords.lng]);
    });

    suggestions.forEach(s => {
      L.marker([s.coords.lat, s.coords.lng], { icon: makePin('#94a3b8', '') })
        .bindPopup(popupHtml(s.bedrijf, `${s.km.toFixed(1)} km ${s.driving ? 'rijden' : '(hemelsbreed)'}`))
        .addTo(markersLayerRef.current!);
      bounds.push([s.coords.lat, s.coords.lng]);
    });

    mapRef.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
  }, [startCoords, startLabel, chain, suggestions]);

  // Zelfde geolocation-opties als "Gebruik mijn locatie" bij Live Zoeken (useMyLocation in
  // App.tsx), die daar wél altijd werkt. enableHighAccuracy:true vraagt om GPS-precisie, en op
  // apparaten zonder GPS-chip (de meeste desktops/laptops) laat dat de opzoek regelmatig
  // mislukken of hangen i.p.v. netjes terugvallen op WiFi/IP-positionering — enableHighAccuracy:
  // false gebruikt diezelfde snellere, breder beschikbare methode die bij Live Zoeken al werkt.
  const useMyLocation = () => {
    setStartError(null);
    setStartLoading(true);
    if (!navigator.geolocation) { setStartError('Locatiebepaling niet ondersteund door je browser.'); setStartLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStartLabel('Mijn locatie');
        setStartLoading(false);
      },
      (err) => {
        setStartLoading(false);
        setStartError(
          err.code === err.PERMISSION_DENIED
            ? 'Locatietoegang geweigerd. Sta dit toe in je browserinstellingen, of zoek handmatig.'
            : 'Kon je locatie niet bepalen. Probeer het opnieuw, of zoek handmatig.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
  };

  // Vindt het best passende bedrijf voor een combinatie als "OMA Rotterdam": een simpele
  // .includes(hele zoekterm) op de naam mist dit compleet, want de plaatsnaam staat in een
  // ANDER veld (stad) dan de bedrijfsnaam. Telt daarom per zoekwoord punten op, of het nou in
  // de naam zit (zwaarder) of in de stad (lichter), en pakt de hoogst scorende match — zolang
  // elk getypt woord ergens teruggevonden wordt.
  const findCompanyForStart = (q: string): any | null => {
    const qWords = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (qWords.length === 0) return null;
    let best: any = null;
    let bestScore = 0;
    for (const b of allData) {
      const naam = (b.naam || '').toLowerCase();
      if (!naam) continue;
      const stad = (b.stad || '').toLowerCase();
      let score = 0;
      for (const w of qWords) {
        if (naam.includes(w)) score += 2;
        else if (stad.includes(w)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return bestScore >= qWords.length ? best : null;
  };

  const searchStart = async () => {
    const q = startQuery.trim();
    if (!q) return;
    setStartError(null);
    setStartLoading(true);
    // Eerst proberen als bedrijfsnaam (evt. met plaats erachter, bv. "OMA Rotterdam") in de
    // eigen database — anders als plaatsnaam via Nominatim (gratis, geen key nodig).
    const companyMatch = findCompanyForStart(q);
    if (companyMatch) {
      const coords = coordsFor(companyMatch, cityCoords);
      if (coords) {
        setStartCoords(coords);
        setStartLabel(`${companyMatch.naam}${companyMatch.stad ? `, ${companyMatch.stad}` : ''}`);
        setStartLoading(false);
        return;
      }
    }
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ' Nederland')}&countrycodes=nl&limit=1`, {
        headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' },
      });
      const d = await r.json();
      if (d?.[0]) {
        setStartCoords({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) });
        setStartLabel(q);
      } else {
        setStartError(`"${q}" niet gevonden.`);
      }
    } catch {
      setStartError('Zoeken mislukt, probeer opnieuw.');
    }
    setStartLoading(false);
  };

  const advanceTo = (s: Suggestion) => {
    setChain(prev => [...prev, { id: `${(s.bedrijf.naam || '')}_${Date.now()}`, bedrijf: s.bedrijf, coords: s.coords, km: s.km }]);
  };

  const dismissSuggestion = (bedrijf: any) => {
    setSuggestions(prev => prev.filter(s => s.bedrijf !== bedrijf));
  };

  const undoLast = () => {
    setChain(prev => prev.slice(0, -1));
  };

  const resetRide = () => {
    setChain([]);
    setStartCoords(null);
    setStartLabel('');
    setStartQuery('');
    setSuggestions([]);
    setFinished(false);
  };

  const manualCandidates = manualQuery.trim().length >= 2
    ? allData
        .filter((b: any) => {
          const naam = (b.naam || '').toLowerCase();
          if (!naam || chain.some(s => s.bedrijf.naam === b.naam)) return false;
          return `${naam} ${(b.stad || '').toLowerCase()}`.includes(manualQuery.toLowerCase());
        })
        .slice(0, 8)
    : [];

  const addManual = (b: any) => {
    const coords = coordsFor(b, cityCoords);
    if (!coords) return;
    const from = currentPosition();
    const km = from ? haversineKm(from.lat, from.lng, coords.lat, coords.lng) : 0;
    setChain(prev => [...prev, { id: `${b.naam}_${Date.now()}`, bedrijf: b, coords, km }]);
    setManualQuery('');
  };

  // Google Maps-route in de juiste, betrouwbare volgorde: startpunt -> stop 1 -> stop 2 -> ...
  // met naam + adres per stop (niet alleen coördinaten), in het officiële ?api=1-formaat.
  const mapsUrl = (() => {
    if (chain.length === 0 || !startCoords) return null;
    const encBedrijf = (b: any) => encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
    const origin = startLabel ? encodeURIComponent(startLabel) : `${startCoords.lat},${startCoords.lng}`;
    const last = chain[chain.length - 1];
    const destination = encBedrijf(last.bedrijf);
    const waypoints = chain.slice(0, -1).map(s => encBedrijf(s.bedrijf)).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    return url;
  })();

  const finishRide = () => {
    onLogVisits(chain.map(s => s.bedrijf));
    if (saveListName.trim()) onSaveAsList(saveListName.trim(), chain.map(s => s.bedrijf));
    setFinished(true);
  };

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <>{children}</> : <div className="w-full max-w-2xl mx-auto"><div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">{children}</div></div>;

  return (
    <Wrapper>
        {!embedded && (
        <div className="p-6 border-b border-slate-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm bg-[#009FE3] flex items-center justify-center flex-shrink-0">
            <Navigation className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Onderweg</h2>
            <p className="text-xs text-slate-400">Rijd van bedrijf naar bedrijf, telkens de dichtstbijzijnde eerst</p>
          </div>
        </div>
        )}

        {!startCoords ? (
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setStartMode('gps')}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm border transition-colors ${startMode === 'gps' ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Vanaf mijn locatie
              </button>
              <button
                onClick={() => setStartMode('search')}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm border transition-colors ${startMode === 'search' ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Zoek startpunt
              </button>
            </div>

            {startMode === 'gps' ? (
              <button
                onClick={useMyLocation}
                disabled={startLoading}
                className="w-full py-3 bg-[#E85E26] hover:bg-[#d54f1a] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2"
              >
                {startLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                Start bij mijn huidige locatie
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={startQuery}
                  onChange={e => { setStartQuery(e.target.value); setStartError(null); }}
                  onKeyDown={e => e.key === 'Enter' && searchStart()}
                  placeholder="Bijv. Rotterdam, of OMA Rotterdam"
                  autoFocus
                  className="flex-1 border border-slate-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-[#009FE3]"
                />
                <button
                  onClick={searchStart}
                  disabled={startLoading || !startQuery.trim()}
                  className="px-4 bg-[#009FE3] hover:bg-[#008ac5] disabled:opacity-50 text-white rounded-sm"
                >
                  {startLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            )}
            {startError && <p className="text-xs text-red-500">{startError}</p>}
          </div>
        ) : finished ? (
          <div className="p-8 text-center space-y-3">
            <Check className="w-10 h-10 text-green-500 mx-auto" />
            <p className="text-sm font-bold text-slate-800">Rit afgerond — {chain.length} bezoeken gelogd{saveListName.trim() ? ` en opgeslagen als lijst "${saveListName.trim()}"` : ''}.</p>
            <button onClick={resetRide} className="text-xs font-bold uppercase tracking-wider text-[#009FE3] hover:underline">Nieuwe rit starten</button>
          </div>
        ) : (
          <>
            {/* Huidige route */}
            <div className="px-6 pt-5 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route tot nu toe</span>
                <button onClick={resetRide} title="Rit resetten" className="text-slate-400 hover:text-red-500"><RotateCcw className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">0</span>
                  <span className="text-slate-700 font-medium truncate">{startLabel || 'Startpunt'}</span>
                </div>
                {chain.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 h-5 rounded-full bg-[#E85E26] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span className="text-slate-800 font-medium truncate flex-1">{s.bedrijf.naam}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{s.km.toFixed(1)} km</span>
                    {i === chain.length - 1 && (
                      <button onClick={undoLast} title="Laatste verwijderen" className="text-slate-400 hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
              {chain.length > 0 && mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 bg-white border border-[#009FE3] text-[#009FE3] text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-[#009FE3]/5">
                  <MapPin className="w-3.5 h-3.5" /> Open route in Google Maps
                </a>
              )}
            </div>

            {/* Kaart: zelfde tegels en popup-info (adres, telefoon, email, website, Google
                Maps, "open in database") als op de Kaart-tab. Startpunt = blauw "S", route-
                stops genummerd oranje, voorstellen als grijze pins zodat je ziet wat verderop
                ligt vóórdat je erop klikt. */}
            <div className="border-b border-slate-100">
              <div ref={mapDivRef} className="w-full h-72" />
            </div>

            {/* Filters */}
            <div className="px-6 py-4 border-b border-slate-100 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {DISCIPLINES.map(d => {
                  const active = filterTypes.has(d.key);
                  return (
                    <button
                      key={d.key}
                      onClick={() => setFilterTypes(prev => { const next = new Set(prev); next.has(d.key) ? next.delete(d.key) : next.add(d.key); return next; })}
                      className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-colors ${active ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={onlyUnvisited} onChange={e => setOnlyUnvisited(e.target.checked)} className="accent-[#E85E26]" />
                  Alleen nog niet bezocht
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">Voorstellen:</span>
                  <input type="range" min={1} max={20} value={suggestCount} onChange={e => setSuggestCount(Number(e.target.value))} className="w-20 accent-[#009FE3]" />
                  <span className="text-xs font-bold text-slate-700 w-5">{suggestCount}</span>
                </div>
              </div>
            </div>

            {/* Voorstellen */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Dichtstbijzijnde vanaf {chain.length > 0 ? chain[chain.length - 1].bedrijf.naam : (startLabel || 'startpunt')}
                </span>
                {loadingSuggestions && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
              </div>
              {suggestions.length === 0 && !loadingSuggestions && (
                <p className="text-xs text-slate-400 py-4 text-center">Geen bedrijven gevonden binnen bereik met deze filters.</p>
              )}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 border border-slate-100 rounded-sm hover:border-[#009FE3]/40 transition-colors">
                    <button onClick={() => advanceTo(s)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.bedrijf.naam}</p>
                      <p className="text-[10px] text-slate-400">{s.bedrijf.stad} · {s.km.toFixed(1)} km{s.driving ? ' rijden' : ' (hemelsbreed)'}</p>
                    </button>
                    <button onClick={() => advanceTo(s)} title="Dit is de volgende stop" className="p-1.5 rounded-full text-green-600 hover:bg-green-50 flex-shrink-0"><Check className="w-4 h-4" /></button>
                    <button onClick={() => dismissSuggestion(s.bedrijf)} title="Overslaan" className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>

              {/* Handmatig toevoegen */}
              <div className="mt-3">
                <input
                  type="text"
                  value={manualQuery}
                  onChange={e => setManualQuery(e.target.value)}
                  placeholder="Of zoek zelf een bedrijf om toe te voegen..."
                  className="w-full border border-slate-200 rounded-sm px-3 py-2 text-xs focus:outline-none focus:border-[#009FE3]"
                />
                {manualCandidates.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-sm divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {manualCandidates.map((b: any, i: number) => (
                      <button key={i} onClick={() => addManual(b)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-[#009FE3]/5 flex items-center gap-2">
                        <Plus className="w-3 h-3 text-[#009FE3] flex-shrink-0" />
                        {b.naam}{b.stad ? `, ${b.stad}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rit afronden */}
            {chain.length > 0 && (
              <div className="px-6 pb-6 pt-2 border-t border-slate-100 space-y-2">
                <input
                  type="text"
                  value={saveListName}
                  onChange={e => setSaveListName(e.target.value)}
                  placeholder="Naam voor deze rit als lijst (optioneel)"
                  className="w-full border border-slate-200 rounded-sm px-3 py-2 text-xs focus:outline-none focus:border-[#009FE3]"
                />
                <button
                  onClick={finishRide}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Klaar voor vandaag — log {chain.length} bezoek{chain.length !== 1 ? 'en' : ''}
                </button>
              </div>
            )}
          </>
        )}
    </Wrapper>
  );
};

export default RidePanel;
