import React, { useEffect, useRef, useState } from 'react';
import { Navigation, MapPin, X, Loader2, Search, Check, RotateCcw, Save, Plus, GripVertical, ChevronUp, ChevronDown, Maximize2, Minimize2, Wand2, Trash2, Repeat } from 'lucide-react';
import { haversineKm, detectType, optimizeRoute, scoreInsertionCandidates } from '../utils/dagbezoek';
import { getDrivingDistancesKm } from '../services/routingService';
import { getClusterData, makeId } from '../services/geoclusterService';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Coords = { lat: number; lng: number };

// Zelfde popup-opzet (naam, adres, telefoon, email) als op de Kaart-tab
// (components/ClusterMapView.tsx popupHtml), met drie link/knoppen: Live Zoeken (voor de
// rij-afstand in meters), Google Maps en Website.
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
      <button onclick="window._inncemRideLiveZoeken('${naamEsc}')" style="font-size:11px;color:#E85E26;background:none;border:1px solid #E85E26;padding:3px 8px;border-radius:4px;cursor:pointer">Live Zoeken →</button>
      <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Google Maps →</a>
      ${website ? `<a href="${website}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
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
  // Zelfde "Zoeken in Live"-actie als de Bedrijvendatabase-kaartjes: zoekt dit bedrijf op in
  // Live Zoeken, dat (in tegenstelling tot de database) ook de rij-afstand in meters toont.
  onOpenInLiveZoeken?: (naam: string) => void;
  // Route + startpunt worden vanuit App aangeleverd (gecontroleerd), zodat ze blijven bestaan
  // als je naar een ander tabblad gaat en terugkomt (RidePanel unmount, App niet).
  startCoords: Coords | null;
  setStartCoords: (c: Coords | null) => void;
  startLabel: string;
  setStartLabel: (s: string) => void;
  chain: RideStop[];
  setChain: React.Dispatch<React.SetStateAction<RideStop[]>>;
  // Als Live Zoeken al een locatie heeft bepaald, bieden we die als 1-klik startpunt aan
  // (exact dezelfde coördinaat die Live Zoeken gebruikt — die werkt bij de gebruiker altijd).
  liveLocationCoords?: Coords | null;
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

const RidePanel: React.FC<RidePanelProps> = ({
  allData, cityCoords, isVisitedCompany, onSaveAsList, onLogVisits, onOpenInDatabase, onOpenInLiveZoeken,
  startCoords, setStartCoords, startLabel, setStartLabel, chain, setChain, liveLocationCoords, embedded,
}) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [startMode, setStartMode] = useState<'gps' | 'search'>('gps');
  const [startQuery, setStartQuery] = useState('');
  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Startpunt aanpassen (exact adres typen) terwijl er al een route loopt.
  const [editStart, setEditStart] = useState(false);
  const [editStartQuery, setEditStartQuery] = useState('');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestCount, setSuggestCount] = useState(8);
  const [filterTypes, setFilterTypes] = useState<Set<'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen'>>(new Set());
  const [onlyUnvisited, setOnlyUnvisited] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [saveListName, setSaveListName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Geselecteerde stops (voor bulk verwijderen/vervangen) — sleutel = stop-id.
  const [selectedStops, setSelectedStops] = useState<Set<string>>(new Set());
  // Welke stop wordt nu vervangen (toont buurt-suggesties); null = geen.
  const [replaceStopId, setReplaceStopId] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const currentPosition = (): Coords | null => {
    if (chain.length > 0) return chain[chain.length - 1].coords;
    return startCoords;
  };

  // Zoekt de N dichtstbijzijnde nog-niet-in-de-rit-zittende bedrijven vanaf de huidige positie.
  // Toont eerst meteen de hemelsbrede sortering (instant, geen netwerk nodig) en verfijnt die
  // daarna op de achtergrond met echte rijafstand (gratis publieke OSRM-server) — zo hoef je
  // nooit op een lege/ladende lijst te wachten, en de volgorde klopt binnen een paar tellen.
  const computeSuggestions = async (from: Coords) => {
    const myRequestId = ++requestIdRef.current;
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
    candidates.sort((a, b) => a.haversine - b.haversine);

    // Stap 1 — meteen tonen op hemelsbrede afstand, geen wachttijd.
    const instant: Suggestion[] = candidates.slice(0, suggestCount).map(c => ({
      bedrijf: c.bedrijf, coords: c.coords, km: c.haversine, driving: false,
    }));
    setSuggestions(instant);

    // Stap 2 — op de achtergrond verfijnen met echte rijafstand. Kleinere shortlist (25 i.p.v.
    // eerder 40) voor een snellere OSRM-respons; genoeg marge om de top-N na herordening nog
    // te kloppen.
    setLoadingSuggestions(true);
    const shortlist = candidates.slice(0, 25);
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

  // "Open in database" + "Live Zoeken" vanuit een kaart-popup — zelfde patroon als de Kaart-tab
  // (window._inncemMapNav daar), maar onder eigen namen zodat ze elkaar niet overschrijven
  // als beide ooit tegelijk in de DOM zitten.
  useEffect(() => {
    (window as any)._inncemRideNav = (naam: string) => onOpenInDatabase?.(naam);
    (window as any)._inncemRideLiveZoeken = (naam: string) => onOpenInLiveZoeken?.(naam);
    return () => { delete (window as any)._inncemRideNav; delete (window as any)._inncemRideLiveZoeken; };
  }, [onOpenInDatabase, onOpenInLiveZoeken]);

  // De kaart initialiseert zodra dit paneel opengeklapt wordt (niet pas na het kiezen van een
  // startpunt) — zelfde Nederland-overzicht en Google-tegels als de Kaart-tab, zodat je meteen
  // iets ziet en voorstellen er automatisch bij komen zodra je een startpunt kiest.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    // React 18 StrictMode (aan in dit project) mount elke effect twee keer (mount->cleanup->
    // mount) om bugs bloot te leggen. Leaflet zet een interne `_leaflet_id` op de container-DOM-
    // node; blijft die na de eerste cleanup onverhoopt hangen, dan gooit de TWEEDE L.map()-
    // aanroep "Map container is already initialized" — een fout die nergens zichtbaar wordt
    // voor de gebruiker (geen console open), waarna mapRef.current voorgoed null blijft en de
    // kaart voor de rest van de sessie leeg oogt. Expliciet opruimen + try/catch met logging
    // voorkomt dit en maakt een eventuele andere oorzaak voortaan zichtbaar in de console.
    delete (mapDivRef.current as any)._leaflet_id;
    let map: L.Map;
    try {
      map = L.map(mapDivRef.current, { preferCanvas: true }).setView([52.1326, 5.2913], 7);
      mapRef.current = map;
      const googleMapsApiKey = 'AIzaSyDtsaBhb-Uq3xWvqE6mnmv3sXYM3dM3TUY';
      const tileLayer = L.tileLayer(`https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}&scale=2&key=${googleMapsApiKey}`, {
        attribution: '© Google Maps', maxZoom: 20, minZoom: 1, tileSize: 256,
      }).addTo(map);
      tileLayerRef.current = tileLayer;
      // Zichtbaar maken in de console als Google's tegel-server een tegel weigert (bv.
      // rate-limit/quota) — zonder dit faalt een tegel stil en zie je alleen een grijs vlak
      // zonder enige aanwijzing waarom.
      tileLayer.on('tileerror', (e: any) => {
        console.error('[Onderweg] Kaarttegel kon niet laden:', e?.tile?.src || e);
      });
      markersLayerRef.current = L.layerGroup().addTo(map);
    } catch (e) {
      console.error('[Onderweg] Kaart kon niet initialiseren:', e);
      return;
    }

    // Leaflet bakt de containergrootte in op het moment van L.map(...) — dit paneel verschijnt
    // pas net (net ná het inklappen van "Onderweg"), dus de browser heeft de layout soms nog
    // niet definitief berekend op dat exacte moment, wat een grijze/lege kaart oplevert totdat
    // er iets anders 'm dwingt te hertekenen. invalidateSize() forceert Leaflet de echte
    // afmetingen opnieuw te meten; redraw() dwingt de tegellaag daarna alle zichtbare tegels
    // opnieuw op te vragen (invalidateSize alleen update soms niet elke nieuw-zichtbare tegel,
    // vooral bij een grote, plotselinge sprong in grootte zoals in/uit fullscreen).
    const resync = () => { map.invalidateSize(); tileLayerRef.current?.redraw(); };
    const raf = requestAnimationFrame(resync);
    const t = setTimeout(resync, 200);
    const ro = new ResizeObserver(resync);
    ro.observe(mapDivRef.current);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro.disconnect();
      map.remove();
      if (mapDivRef.current) delete (mapDivRef.current as any)._leaflet_id;
      mapRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Markers + route-lijn herbouwen zodra startpunt, route of voorstellen wijzigen. Consistent
  // met de Route Kaart (Lijsten): startpunt = blauwe "S"-pin, route-stops = genummerde oranje
  // pins, verbonden door een oranje route-lijn in volgorde. Voorstellen = kleine grijze
  // bolletjes (duidelijk anders dan de route zelf, maar één consistente stijl).
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    const routeLine: L.LatLngExpression[] = [];

    if (startCoords) {
      bounds.push([startCoords.lat, startCoords.lng]);
      routeLine.push([startCoords.lat, startCoords.lng]);
      L.marker([startCoords.lat, startCoords.lng], { icon: makePin('#1e293b', 'S') })
        .bindPopup(`<div style="font-family:system-ui;font-size:13px"><b>${startLabel || 'Startpunt'}</b></div>`)
        .addTo(markersLayerRef.current);
    }

    chain.forEach((s, i) => {
      routeLine.push([s.coords.lat, s.coords.lng]);
      L.marker([s.coords.lat, s.coords.lng], { icon: makePin('#E85E26', i + 1) })
        .bindPopup(popupHtml(s.bedrijf, `Stop ${i + 1} van de route`))
        .addTo(markersLayerRef.current!);
      bounds.push([s.coords.lat, s.coords.lng]);
    });

    // Route-lijn (zelfde idee als de Route Kaart bij Lijsten) zodat je de volgorde als een echte
    // route ziet i.p.v. losse punten.
    if (routeLine.length >= 2) {
      L.polyline(routeLine, { color: '#E85E26', weight: 3, opacity: 0.7 }).addTo(markersLayerRef.current!);
    }

    // Zelfde tikstraal-verruiming voor aanraakschermen als de Kaart-tab (ClusterMapView) —
    // een bolletje van een paar pixels is op een telefoon vrijwel onmogelijk precies te raken.
    const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const suggestionRadius = isTouchDevice ? 11 : 6;

    suggestions.forEach(s => {
      L.circleMarker([s.coords.lat, s.coords.lng], {
        radius: suggestionRadius, color: '#fff', weight: 1.5, fillColor: '#94a3b8', fillOpacity: 0.9, interactive: true,
      })
        .bindPopup(popupHtml(s.bedrijf, `${s.km.toFixed(1)} km ${s.driving ? 'rijden' : '(hemelsbreed)'}`))
        .addTo(markersLayerRef.current!);
      bounds.push([s.coords.lat, s.coords.lng]);
    });

    if (bounds.length > 0) {
      // Leaflet's interne maatcache kan verouderd zijn tegen de tijd dat er data binnenkomt
      // (startpunt/voorstellen komen pas ná een async opzoek/fetch) — zonder deze her-meting
      // vóór fitBounds kon de kaart daarna leeg/wit ogen omdat tegels buiten het echte,
      // inmiddels veranderde zichtgebied werden geplaatst.
      mapRef.current.invalidateSize();
      mapRef.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [startCoords, startLabel, chain, suggestions]);

  // Fullscreen togglet de containergrootte (klein <-> volledig scherm) in één keer, een veel
  // grotere sprong dan de geleidelijke resizes die de ResizeObserver hierboven normaal opvangt.
  // invalidateSize() alleen laat Leaflet soms geloven dat de zichtbare tegels nog kloppen
  // terwijl de container inmiddels veel groter is — expliciet redraw() ná de her-meting dwingt
  // de tegellaag alle nu-zichtbare tegels opnieuw op te vragen. Twee pogingen (vroeg + iets
  // later) omdat de `fixed`+`flex`-layout in sommige browsers pas na een extra reflow z'n
  // definitieve afmeting heeft.
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const resync = () => { map.invalidateSize(); tileLayerRef.current?.redraw(); };
    const raf = requestAnimationFrame(resync);
    const t1 = setTimeout(resync, 120);
    const t2 = setTimeout(resync, 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [isFullscreen]);

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
      async (err) => {
        // Browser-locatie faalde (geweigerd, geen WiFi-scan mogelijk, timeout) — val terug op
        // een gratis IP-gebaseerde locatiedienst (stad-niveau, geen browserpermissie nodig)
        // i.p.v. de gebruiker met een doodlopende foutmelding achter te laten.
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const r = await fetch('https://ipwho.is/', { signal: controller.signal });
          clearTimeout(timeout);
          const d = await r.json();
          if (d?.success !== false && typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
            setStartCoords({ lat: d.latitude, lng: d.longitude });
            setStartLabel(`Mijn locatie${d.city ? ` (${d.city}, via IP)` : ' (via IP)'}`);
            setStartLoading(false);
            return;
          }
        } catch { /* ook dit mislukt — val door naar de foutmelding hieronder */ }
        setStartLoading(false);
        setStartError(
          err.code === err.PERMISSION_DENIED
            ? 'Locatietoegang geweigerd. Sta dit toe in je browserinstellingen, of zoek handmatig.'
            : 'Kon je locatie niet bepalen. Probeer het opnieuw, of zoek handmatig.'
        );
      },
      // maximumAge: 60s — zelfde versnelling als bij Live Zoeken: een al bekende recente
      // locatie mag hergebruikt worden i.p.v. altijd een volledig verse opzoek te forceren.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
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

  // Alle huidige voorstellen in één keer toevoegen (in hun huidige, al op afstand gesorteerde
  // volgorde) i.p.v. ze één voor één te moeten accepteren. Na het toevoegen berekent de bestaande
  // useEffect automatisch een nieuwe lijst voorstellen vanaf de nieuwe laatste stop.
  const advanceAll = () => {
    if (suggestions.length === 0) return;
    setChain(prev => [
      ...prev,
      ...suggestions.map((s, i) => ({ id: `${(s.bedrijf.naam || '')}_${Date.now()}_${i}`, bedrijf: s.bedrijf, coords: s.coords, km: s.km })),
    ]);
  };

  const dismissSuggestion = (bedrijf: any) => {
    setSuggestions(prev => prev.filter(s => s.bedrijf !== bedrijf));
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

  // Tussenstop op plaatsnaam (bv. "Apeldoorn" tussen Nijmegen en Deventer) i.p.v. alleen een
  // bedrijf uit de database — zelfde gratis Nominatim-opzoek als bij het zoeken van een
  // startpunt. Wordt geprobeerd als er geen bedrijf-match is voor de getypte tekst.
  const addPlaceWaypoint = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setManualError(null);
    setManualLoading(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Nederland')}&countrycodes=nl&limit=1`, {
        headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' },
      });
      const d = await r.json();
      if (d?.[0]) {
        const coords = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
        const from = currentPosition();
        const km = from ? haversineKm(from.lat, from.lng, coords.lat, coords.lng) : 0;
        const waypointBedrijf = { naam: query, stad: '', straat: '', postcode: '', isWaypoint: true };
        setChain(prev => [...prev, { id: `${query}_${Date.now()}`, bedrijf: waypointBedrijf, coords, km }]);
        setManualQuery('');
      } else {
        setManualError(`"${query}" niet gevonden als bedrijf of plaats.`);
      }
    } catch {
      setManualError('Zoeken mislukt, probeer opnieuw.');
    }
    setManualLoading(false);
  };

  // Route-volgorde slepen: km per stop is berekend t.o.v. de vorige stop op het moment van
  // toevoegen, dus na het verwisselen van volgorde herberekenen we die (hemelsbreed) opnieuw
  // vanaf het startpunt door de hele keten, anders kloppen de getoonde afstanden niet meer.
  // Herberekent de km-per-stop (hemelsbreed) vanaf het startpunt door de hele keten. Gedeeld
  // door herordenen/optimaliseren/vervangen zodat de getoonde afstanden altijd blijven kloppen.
  const recomputeKm = (stops: RideStop[]): RideStop[] => {
    let from: Coords | null = startCoords;
    return stops.map(s => {
      const km = from ? haversineKm(from.lat, from.lng, s.coords.lat, s.coords.lng) : s.km;
      from = s.coords;
      return { ...s, km };
    });
  };

  const reorderChain = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setChain(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return recomputeKm(next);
    });
  };

  // Optimaliseer de route tot een logische volgorde (Nearest Neighbor vanaf het startpunt) —
  // hergebruikt exact dezelfde helper als de Route Kaart bij Lijsten.
  const optimizeChain = () => {
    if (!startCoords || chain.length < 3) return;
    const ordered = optimizeRoute(
      chain.map(s => ({ ...s, lat: s.coords.lat, lng: s.coords.lng })),
      startCoords,
    ).map(({ lat, lng, ...rest }) => rest as RideStop);
    setChain(recomputeKm(ordered));
  };

  // Startpunt zetten vanuit de al bekende Live Zoeken-locatie (exact dezelfde coördinaat die
  // Live Zoeken gebruikt) — 1 klik, geen nieuwe permissie/opzoek nodig.
  const useLiveLocation = () => {
    if (!liveLocationCoords) return;
    setStartError(null);
    setStartCoords({ lat: liveLocationCoords.lat, lng: liveLocationCoords.lng });
    setStartLabel('Mijn locatie (via Live Zoeken)');
  };

  // Startpunt aanpassen naar een exact adres (straat + plaats): Nominatim geeft straat-niveau
  // coördinaten terug, niet alleen het centrum van een dorp/stad.
  const updateStartAddress = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setStartError(null);
    setStartLoading(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Nederland')}&countrycodes=nl&limit=1&addressdetails=1`, {
        headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' },
      });
      const d = await r.json();
      if (d?.[0]) {
        setStartCoords({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) });
        setStartLabel(query);
        setChain(prev => recomputeKm(prev));
        setEditStart(false);
        setEditStartQuery('');
      } else {
        setStartError(`"${query}" niet gevonden.`);
      }
    } catch {
      setStartError('Zoeken mislukt, probeer opnieuw.');
    }
    setStartLoading(false);
  };

  // Selectie voor bulk-acties.
  const toggleSelectStop = (id: string) => {
    setSelectedStops(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedStops(new Set());
  const removeSelected = () => {
    setChain(prev => recomputeKm(prev.filter(s => !selectedStops.has(s.id))));
    clearSelection();
  };
  const removeStop = (id: string) => {
    setChain(prev => recomputeKm(prev.filter(s => s.id !== id)));
    setSelectedStops(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // Buurt-suggesties om een stop te vervangen: bedrijven dicht bij de vorige én volgende stop,
  // met dezelfde scoring als de Route Kaart (scoreInsertionCandidates). Zo blijft de route
  // logisch als je een stop omruilt.
  const replaceCandidatesFor = (id: string): any[] => {
    const idx = chain.findIndex(s => s.id === id);
    if (idx < 0) return [];
    const prevCoords = idx > 0 ? chain[idx - 1].coords : startCoords;
    const nextCoords = idx < chain.length - 1 ? chain[idx + 1].coords : null;
    const existingNames = new Set<string>(chain.filter(s => s.id !== id).map(s => String(s.bedrijf.naam || '').toLowerCase()));
    return scoreInsertionCandidates(allData, prevCoords, nextCoords, cityCoords as any, existingNames, 8, '')
      .map(c => c.bedrijf);
  };
  const replaceStopWith = (id: string, b: any) => {
    const coords = coordsFor(b, cityCoords);
    if (!coords) return;
    setChain(prev => recomputeKm(prev.map(s => s.id === id ? { ...s, bedrijf: b, coords } : s)));
    setReplaceStopId(null);
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

  // BELANGRIJK: geen wrapper-COMPONENT die binnen deze functie gedefinieerd wordt. Dat gaf een
  // nieuwe component-identiteit bij elke render, waardoor React de héle subtree (inclusief de
  // Leaflet-kaart-div) bij elke state-wijziging weggooide en opnieuw opbouwde — terwijl de
  // init-useEffect (deps []) niet opnieuw draaide, dus de kaart bleef daarna leeg/wit. Nu een
  // gewone conditionele JSX-boom die dezelfde DOM-node behoudt over renders heen.
  const inner = (
    <>
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

        {/* Kaart: ALTIJD renderen, niet in een ternary-branch — anders wordt de div pas
            gerenderd zodra startCoords ingesteld is, en faalt de mapInit useEffect stil
            omdat mapDivRef.current undefined is. In fullscreen wordt de wrapper een vaste
            overlay over het hele scherm (zelfde idee als de Route Kaart bij Lijsten). */}
        <div className={isFullscreen ? 'fixed inset-0 z-[9999] bg-white flex flex-col' : 'relative border-b border-slate-100'}>
          <div ref={mapDivRef} className={isFullscreen ? 'flex-1 w-full bg-slate-200' : 'w-full h-56 sm:h-72 bg-slate-200'} />
          <button
            onClick={() => setIsFullscreen(v => !v)}
            title={isFullscreen ? 'Verklein kaart' : 'Kaart volledig scherm'}
            className="absolute top-2 right-2 z-[1000] bg-white/95 border border-slate-200 rounded-sm p-1.5 shadow-sm hover:bg-white text-slate-600"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

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
              <div className="space-y-2">
                <button
                  onClick={useMyLocation}
                  disabled={startLoading}
                  className="w-full py-3 bg-[#E85E26] hover:bg-[#d54f1a] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2"
                >
                  {startLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  Start bij mijn huidige locatie
                </button>
                {liveLocationCoords && (
                  <button
                    onClick={useLiveLocation}
                    className="w-full py-2 bg-white border border-[#009FE3] text-[#009FE3] text-[11px] font-bold uppercase tracking-wider rounded-sm hover:bg-[#009FE3]/5 flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Gebruik mijn Live Zoeken-locatie
                  </button>
                )}
              </div>
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
                <div className="flex items-center gap-2">
                  {chain.length >= 3 && (
                    <button onClick={optimizeChain} title="Maak er een logische route van (dichtstbijzijnde eerst)" className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] hover:underline flex items-center gap-1">
                      <Wand2 className="w-3 h-3" /> Optimaliseer
                    </button>
                  )}
                  <button onClick={resetRide} title="Rit resetten" className="text-slate-400 hover:text-red-500"><RotateCcw className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Bulk-actiebalk: verschijnt zodra er stops geselecteerd zijn (selectievakjes). */}
              {selectedStops.size > 0 && (
                <div className="mb-2 flex items-center justify-between gap-2 bg-[#009FE3]/5 border border-[#009FE3]/30 rounded-sm px-3 py-2">
                  <span className="text-[11px] font-bold text-[#009FE3]">{selectedStops.size} geselecteerd</span>
                  <div className="flex items-center gap-3">
                    <button onClick={removeSelected} className="text-[10px] font-bold uppercase tracking-wider text-red-600 hover:underline flex items-center gap-1"><Trash2 className="w-3 h-3" /> Verwijder</button>
                    <button onClick={clearSelection} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:underline">Deselecteer</button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {/* Startpunt (0) — aanpasbaar naar een exact adres. */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">0</span>
                  {editStart ? (
                    <div className="flex-1 flex gap-1.5">
                      <input
                        type="text"
                        value={editStartQuery}
                        onChange={e => { setEditStartQuery(e.target.value); setStartError(null); }}
                        onKeyDown={e => e.key === 'Enter' && updateStartAddress(editStartQuery)}
                        placeholder="Exact adres, bv. Lansinkesweg 4 Hengelo"
                        autoFocus
                        className="flex-1 border border-slate-200 rounded-sm px-2 py-1 text-xs focus:outline-none focus:border-[#009FE3]"
                      />
                      <button onClick={() => updateStartAddress(editStartQuery)} disabled={startLoading || !editStartQuery.trim()} className="px-2 bg-[#009FE3] disabled:opacity-50 text-white rounded-sm flex-shrink-0">
                        {startLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { setEditStart(false); setEditStartQuery(''); }} className="px-1.5 text-slate-400 hover:text-slate-700 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-slate-700 font-medium truncate flex-1">{startLabel || 'Startpunt'}</span>
                      <button onClick={() => { setEditStart(true); setEditStartQuery(''); }} title="Startlocatie aanpassen (exact adres)" className="text-slate-400 hover:text-[#009FE3] flex-shrink-0"><MapPin className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>

                {chain.map((s, i) => (
                  <React.Fragment key={s.id}>
                  <div
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={e => { e.preventDefault(); if (dragOverIndex !== i) setDragOverIndex(i); }}
                    onDragLeave={() => setDragOverIndex(prev => (prev === i ? null : prev))}
                    onDrop={e => {
                      e.preventDefault();
                      if (dragIndex !== null) reorderChain(dragIndex, i);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`flex items-center gap-1.5 text-sm rounded-sm transition-colors ${dragOverIndex === i && dragIndex !== null && dragIndex !== i ? 'bg-[#009FE3]/10' : ''} ${dragIndex === i ? 'opacity-40' : ''}`}
                  >
                    <input type="checkbox" checked={selectedStops.has(s.id)} onChange={() => toggleSelectStop(s.id)} className="accent-[#009FE3] flex-shrink-0" title="Selecteer voor bulk-actie" />
                    <GripVertical className="hidden sm:block w-3.5 h-3.5 text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full bg-[#E85E26] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span className="text-slate-800 font-medium truncate flex-1">{s.bedrijf.naam}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 hidden sm:inline">{s.km.toFixed(1)} km</span>
                    {/* Open dit bedrijf in Live Zoeken (waar de rij-afstand in meters staat). */}
                    {!s.bedrijf.isWaypoint && onOpenInLiveZoeken && (
                      <button onClick={() => onOpenInLiveZoeken(s.bedrijf.naam)} title="Open in Live Zoeken" className="text-slate-400 hover:text-[#E85E26] flex-shrink-0"><Search className="w-3.5 h-3.5" /></button>
                    )}
                    {/* Vervang deze stop door een buurt-suggestie. */}
                    {!s.bedrijf.isWaypoint && (
                      <button onClick={() => setReplaceStopId(replaceStopId === s.id ? null : s.id)} title="Vervang deze stop" className={`flex-shrink-0 ${replaceStopId === s.id ? 'text-[#009FE3]' : 'text-slate-400 hover:text-[#009FE3]'}`}><Repeat className="w-3.5 h-3.5" /></button>
                    )}
                    {/* Omhoog/omlaag: werkt overal (ook op telefoon/tablet), in tegenstelling tot
                        native drag-and-drop dat op touch-schermen niet vuurt. */}
                    <button onClick={() => reorderChain(i, i - 1)} disabled={i === 0} title="Omhoog" className="text-slate-400 hover:text-[#009FE3] disabled:opacity-20 disabled:hover:text-slate-400 flex-shrink-0">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => reorderChain(i, i + 1)} disabled={i === chain.length - 1} title="Omlaag" className="text-slate-400 hover:text-[#009FE3] disabled:opacity-20 disabled:hover:text-slate-400 flex-shrink-0">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeStop(s.id)} title="Verwijderen" className="text-slate-400 hover:text-red-500 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Vervang-paneel: buurt-suggesties (scoreInsertionCandidates), zoals de Route Kaart. */}
                  {replaceStopId === s.id && (
                    <div className="ml-7 mb-1 border border-[#009FE3] rounded-sm p-2">
                      <p className="text-[10px] text-slate-400 mb-1">Beste buurt-opties om "{s.bedrijf.naam}" te vervangen:</p>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {replaceCandidatesFor(s.id).map((cand: any, ci: number) => (
                          <button key={ci} onClick={() => replaceStopWith(s.id, cand)} className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                            <span className="font-semibold text-slate-700">{cand.naam}</span>
                            <span className="text-slate-400 text-[10px]">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                          </button>
                        ))}
                        {replaceCandidatesFor(s.id).length === 0 && <p className="text-[10px] text-slate-400 py-1">Geen buurt-opties gevonden.</p>}
                      </div>
                    </div>
                  )}
                  </React.Fragment>
                ))}
              </div>
              {chain.length > 1 && (
                <p className="mt-1.5 text-[10px] text-slate-400">Gebruik <ChevronUp className="w-2.5 h-2.5 inline -mt-0.5" /><ChevronDown className="w-2.5 h-2.5 inline -mt-0.5" /> (of sleep op desktop) om de volgorde te wijzigen.</p>
              )}
              {chain.length > 0 && mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 bg-white border border-[#009FE3] text-[#009FE3] text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-[#009FE3]/5">
                  <MapPin className="w-3.5 h-3.5" /> Open route in Google Maps
                </a>
              )}
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
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Dichtstbijzijnde vanaf {chain.length > 0 ? chain[chain.length - 1].bedrijf.naam : (startLabel || 'startpunt')}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {loadingSuggestions && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
                  {suggestions.length > 0 && (
                    <button
                      onClick={advanceAll}
                      title="Alle onderstaande voorstellen toevoegen aan de route"
                      className="text-[10px] font-bold uppercase tracking-wider text-green-600 hover:text-green-700 hover:underline flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Accepteer alles ({suggestions.length})
                    </button>
                  )}
                </div>
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

              {/* Handmatig toevoegen: een bedrijf uit de database, OF een tussenstop op
                  plaatsnaam (bv. "Apeldoorn" tussen Nijmegen en Deventer). De plaats-optie
                  staat ALTIJD bovenaan zodra je iets typt — ook als er bedrijven in die plaats
                  bestaan — anders kon je een plaats waar toevallig bedrijven zitten nooit als
                  losse tussenstop kiezen. */}
              <div className="mt-3">
                <input
                  type="text"
                  value={manualQuery}
                  onChange={e => { setManualQuery(e.target.value); setManualError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && manualCandidates.length === 0 && manualQuery.trim().length >= 2) addPlaceWaypoint(manualQuery); }}
                  placeholder="Zoek bedrijf, of typ een plaatsnaam als tussenstop..."
                  className="w-full border border-slate-200 rounded-sm px-3 py-2 text-xs focus:outline-none focus:border-[#009FE3]"
                />
                {manualError && <p className="mt-1 text-[10px] text-red-500">{manualError}</p>}
                {manualQuery.trim().length >= 2 && (
                  <div className="mt-1 border border-slate-200 rounded-sm divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {/* Altijd: de getypte tekst als plaats-tussenstop */}
                    <button
                      onClick={() => addPlaceWaypoint(manualQuery)}
                      disabled={manualLoading}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-[#009FE3] hover:bg-[#009FE3]/5 flex items-center gap-2 disabled:opacity-50"
                    >
                      {manualLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : <MapPin className="w-3.5 h-3.5 flex-shrink-0" />}
                      "{manualQuery.trim()}" als tussenstop (plaats)
                    </button>
                    {/* Daaronder: bijpassende bedrijven uit de database */}
                    {manualCandidates.map((b: any, i: number) => (
                      <button key={i} onClick={() => addManual(b)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-[#009FE3]/5 flex items-center gap-2">
                        <Plus className="w-3 h-3 text-slate-400 flex-shrink-0" />
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
    </>
  );

  return embedded
    ? inner
    : <div className="w-full max-w-2xl mx-auto"><div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">{inner}</div></div>;
};

export default RidePanel;
