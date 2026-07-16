import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigation, MapPin, X, Loader2, Search, Check, RotateCcw, Save, Plus, GripVertical, ChevronUp, ChevronDown, Maximize2, Minimize2, Wand2, Repeat, ArrowRight, ArrowLeftRight, Home } from 'lucide-react';
import { haversineKm, detectType, optimizeRoute, scoreInsertionCandidates, nearestPointOnRoute } from '../utils/dagbezoek';
import { getDrivingDistancesKm, getRoutePolyline } from '../services/routingService';
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

const HOVER_ZOOM_MAX = 16;
const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

// Exact dezelfde "hoe langer je erop blijft staan, hoe meer inzoomen"-hover als de Kaart-tab
// (components/ClusterMapView.tsx) — bewust hergebruikt i.p.v. een eigen variant, zodat het
// hier hetzelfde aanvoelt. Geleidelijk, niet in één sprong: eerst een korte wachttijd (voorkomt
// zoomen terwijl de muis gewoon voorbijglijdt), dan één zoomniveau per keer zolang je blijft
// staan. setZoomAround (niet setView/panTo) houdt het aangewezen punt op exact dezelfde
// schermpositie terwijl er wordt ingezoomd. Uitgeschakeld op touch (geen "hover" op een
// telefoon; tikken vuurt mouseover/click vlak na elkaar af, wat daar zou hinderen).
//
// BEWUST GEEN openPopup() hier (in tegenstelling tot ClusterMapView): op de smalle Onderweg-
// kaart (relatief kort, en de popup hier heeft 3 knoppen dus is breder) botste Leaflet's eigen
// "pan popup in beeld"-gedrag (autoPan, standaard aan) elke hover met de lopende zoom-timer —
// bij iedere hover sprong de kaart daardoor naar een hoek i.p.v. rustig in te zoomen. Een klik/
// tik opent de popup nog gewoon (Leaflet's eigen standaardgedrag, hier niet aangeraakt); hover
// doet nu uitsluitend het geleidelijke inzoomen.
function attachHoverZoom(layer: L.Marker | L.CircleMarker, map: L.Map, onHover?: () => void, onLeave?: () => void) {
  if (isTouchDevice) return;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomInterval: ReturnType<typeof setInterval> | null = null;
  layer.on('mouseover', function () {
    onHover?.();
    const latlng = layer.getLatLng();
    hoverTimer = setTimeout(() => {
      zoomInterval = setInterval(() => {
        const z = map.getZoom();
        if (z >= HOVER_ZOOM_MAX) { if (zoomInterval) clearInterval(zoomInterval); zoomInterval = null; return; }
        map.setZoomAround(latlng, z + 1, { animate: true });
      }, 900);
    }, 400);
  });
  layer.on('mouseout', function () {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (zoomInterval) { clearInterval(zoomInterval); zoomInterval = null; }
    onLeave?.();
    // Geen closePopup() hier: er wordt niet meer op hover geopend, dus dit zou anders een
    // popup die je zelf via een klik/tik open hebt gezet, weer dichtgooien zodra de muis er
    // toevallig overheen beweegt.
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
  // Bestemming ("Naar") voor de Van→Naar-richtingmodus — opgetild naar App voor persistentie.
  destCoords: Coords | null;
  setDestCoords: (c: Coords | null) => void;
  destLabel: string;
  setDestLabel: (s: string) => void;
  // Thuisadres uit instellingen (Lansinksweg 4, Hengelo standaard) — als 1-klik "naar huis".
  homeAddress?: string;
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

// Gedeelde adres-opzoek (gratis, geen key nodig) voor startpunt/tussenstop/adres-aanpassen —
// vóórdien had elke plek zijn eigen los fetch-aanroepje, met elk net iets andere query-opbouw.
// Herkent eerst "straat huisnummer, plaats" (bv. "Handelsweg 14, Wierden") en zoekt dan
// GESTRUCTUREERD (straat- en plaatsveld apart) — betrouwbaarder voor een exact adres dan één
// vrije zoekstring, die bij Nominatim regelmatig niks teruggeeft voor net dat soort input.
// Valt daarna terug op een vrije zoekstring (voor plaatsnamen, bedrijfsnamen, etc.).
async function geocodeAddress(query: string): Promise<Coords | null> {
  const q = query.trim();
  if (!q) return null;
  const headers = { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' };

  const commaIdx = q.indexOf(',');
  if (commaIdx > 0 && /\d/.test(q.slice(0, commaIdx))) {
    const street = q.slice(0, commaIdx).trim();
    const city = q.slice(commaIdx + 1).trim();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&country=Nederland&limit=1`, { headers });
      const d = await r.json();
      if (d?.[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
    } catch (e) {
      console.error('[Onderweg] Gestructureerd adres zoeken mislukt:', e);
    }
  }

  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', Nederland')}&countrycodes=nl&limit=1`, { headers });
    const d = await r.json();
    if (d?.[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch (e) {
    console.error('[Onderweg] Adres zoeken mislukt:', e);
  }
  return null;
}

const RidePanel: React.FC<RidePanelProps> = ({
  allData, cityCoords, isVisitedCompany, onSaveAsList, onLogVisits, onOpenInDatabase, onOpenInLiveZoeken,
  startCoords, setStartCoords, startLabel, setStartLabel, chain, setChain,
  destCoords, setDestCoords, destLabel, setDestLabel, homeAddress, liveLocationCoords, embedded,
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

  // Bestemming ("Naar") invoer + status voor de Van→Naar-richtingmodus.
  const [destQuery, setDestQuery] = useState('');
  const [destLoading, setDestLoading] = useState(false);
  const [destError, setDestError] = useState<string | null>(null);
  // De echte rijroute (weggeometrie) van start → bestemming, opgehaald via OSRM. Bepaalt welke
  // bedrijven "op de route" liggen en in welke volgorde. null = geen richtingmodus actief.
  const [routeLine, setRouteLine] = useState<Coords[] | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Zoekstraal — zelfde sleepbare "Straal"-slider als Live Zoeken (0 tot max), i.p.v. een vaste
  // 75 km harde grens. Bepaalt hoeveel bedrijven er ÜBERHAUPT in de resultaten (en dus de
  // paginering) terechtkomen. Wordt genegeerd zodra er een bestemming (routemodus) is gekozen.
  const [radiusKm, setRadiusKm] = useState(75);
  // Hoe ver een bedrijf van de gereden route mag liggen om nog "op de route" te heten (km,
  // hemelsbreed loodrecht op de lijn). Bewust een vaste, ruime waarde i.p.v. een slider: de
  // gebruiker wil geen knoppen, gewoon "de architecten die op mijn route liggen". 12 km vangt
  // bedrijven net naast de snelweg/doorgaande weg zonder de hele provincie mee te nemen.
  const ROUTE_CORRIDOR_KM = 12;
  // Aantal per pagina (10 of 20) — beperkt hoeveel er tegelijk op de kaart/lijst komt, maar
  // niet meer het totaal: alle bedrijven binnen bereik zijn bereikbaar via de paginering
  // hieronder, net als bij Live Zoeken.
  const [suggestCount, setSuggestCount] = useState(10);
  const [suggestPage, setSuggestPage] = useState(1);
  const [suggestTotal, setSuggestTotal] = useState(0);
  const [filterTypes, setFilterTypes] = useState<Set<'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen'>>(new Set());
  const [filterSources, setFilterSources] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'afstand' | 'az'>('afstand');
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
  // Verhoogt telkens als de kaart volledig opnieuw opgebouwd wordt (fullscreen-toggle) — laat
  // de marker-herbouw-effect hieronder weten dat het de markers op de NIEUWE kaartinstantie
  // opnieuw moet tekenen.
  const [mapGeneration, setMapGeneration] = useState(0);
  // Welke stop wordt nu vervangen (toont buurt-suggesties); null = geen.
  const [replaceStopId, setReplaceStopId] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  // Beschikbare bronnen (bv. Bouwgarant, Architectenweb, BNA, ...) voor het bronfilter —
  // afgeleid uit de echte data i.p.v. hardgecodeerd, zodat 'm altijd klopt met wat er is.
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const b of allData) set.add(b.source || 'Onbekend');
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [allData]);

  const currentPosition = (): Coords | null => {
    if (chain.length > 0) return chain[chain.length - 1].coords;
    return startCoords;
  };

  // Zoekt ALLE nog-niet-in-de-rit-zittende bedrijven binnen bereik vanaf de huidige positie
  // (niet meer alleen de eerste N) en toont die gepagineerd — net als Live Zoeken, maar dan op
  // afstand gesorteerd. `page` kiest welk blok van `suggestCount` (10/20) je ziet; de kaart/
  // lijst plot alleen de huidige pagina, zodat het nooit vol/complex oogt. Toont eerst meteen
  // de hemelsbrede sortering (instant, geen netwerk nodig) en verfijnt die pagina daarna op de
  // achtergrond met echte rijafstand (gratis publieke OSRM-server, alleen voor de zichtbare
  // pagina — scheelt onnodige aanvragen voor bedrijven die je toch niet ziet).
  const computeSuggestions = async (from: Coords, page: number) => {
    const myRequestId = ++requestIdRef.current;
    const inChain = new Set(chain.map(s => (s.bedrijf.naam || '').toLowerCase().trim()));
    // Routemodus is actief zodra de echte routelijn (start→bestemming) is opgehaald: dan tonen
    // we alleen bedrijven die ECHT op die weg liggen (corridor), gesorteerd op rijvolgorde —
    // en negeren we de straal volledig.
    const inRouteMode = !!(routeLine && routeLine.length >= 2);

    // Goedkope bounding-box om de route (+ corridor-marge) zodat we de dure per-segment-meting
    // alleen doen voor bedrijven die überhaupt in de buurt van de route kunnen liggen — scheelt
    // bij duizenden bedrijven miljoenen berekeningen. Marge ~ corridor omgerekend naar graden.
    let routeBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null;
    if (inRouteMode) {
      const mLat = ROUTE_CORRIDOR_KM / 110.57;
      const mLng = ROUTE_CORRIDOR_KM / (111.32 * Math.cos(52 * Math.PI / 180));
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const c of routeLine!) {
        if (c.lat < minLat) minLat = c.lat; if (c.lat > maxLat) maxLat = c.lat;
        if (c.lng < minLng) minLng = c.lng; if (c.lng > maxLng) maxLng = c.lng;
      }
      routeBox = { minLat: minLat - mLat, maxLat: maxLat + mLat, minLng: minLng - mLng, maxLng: maxLng + mLng };
    }

    const candidates: Array<{ bedrijf: any; coords: Coords; haversine: number; progress: number }> = [];
    for (const b of allData) {
      const naam = (b.naam || '').toLowerCase().trim();
      if (!naam || inChain.has(naam)) continue;
      if (filterTypes.size > 0 && !filterTypes.has(detectType(b) as any)) continue;
      if (filterSources.size > 0 && !filterSources.has(b.source || 'Onbekend')) continue;
      if (onlyUnvisited && isVisitedCompany(b)) continue;
      const coords = coordsFor(b, cityCoords);
      if (!coords) continue;
      const hv = haversineKm(from.lat, from.lng, coords.lat, coords.lng);
      if (inRouteMode) {
        if (routeBox && (coords.lat < routeBox.minLat || coords.lat > routeBox.maxLat || coords.lng < routeBox.minLng || coords.lng > routeBox.maxLng)) continue;
        const pos = nearestPointOnRoute(coords.lat, coords.lng, routeLine!);
        if (pos.distKm > ROUTE_CORRIDOR_KM) continue; // ligt niet op de gereden route
        candidates.push({ bedrijf: b, coords, haversine: hv, progress: pos.progressKm });
      } else {
        if (hv > radiusKm) continue;
        candidates.push({ bedrijf: b, coords, haversine: hv, progress: 0 });
      }
    }
    // Sorteervolgorde:
    //  • routemodus  → op rijvolgorde langs de route (progress oplopend), zodat je ze precies
    //    tegenkomt in de volgorde waarin je rijdt. Omdraaien (Van↔Naar) keert de route zelf om,
    //    dus dan telt de progress vanaf de andere kant — precies het "heen vs terug"-gedrag.
    //  • A-Z          → alfabetisch.
    //  • anders       → dichtstbij eerst.
    if (sortMode === 'az') {
      candidates.sort((a, b) => (a.bedrijf.naam || '').localeCompare(b.bedrijf.naam || '', 'nl'));
    } else if (inRouteMode) {
      candidates.sort((a, b) => a.progress - b.progress);
    } else {
      candidates.sort((a, b) => a.haversine - b.haversine);
    }

    const totalPages = Math.max(1, Math.ceil(candidates.length / suggestCount));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = candidates.slice((clampedPage - 1) * suggestCount, clampedPage * suggestCount);

    setSuggestTotal(candidates.length);
    setSuggestPage(clampedPage);

    // Stap 1 — meteen tonen op hemelsbrede afstand, geen wachttijd.
    setSuggestions(pageItems.map(c => ({ bedrijf: c.bedrijf, coords: c.coords, km: c.haversine, driving: false })));

    // Stap 2 — op de achtergrond verfijnen met echte rijafstand, alleen voor deze pagina. Bij
    // A-Z blijft de alfabetische volgorde staan (alleen de getoonde km's worden nauwkeuriger);
    // bij "op afstand" wordt de pagina daarna nog even op de nu bekende rijafstand herordend.
    setLoadingSuggestions(true);
    let driving: (number | null)[] = [];
    try {
      driving = await getDrivingDistancesKm(from, pageItems.map(c => c.coords));
    } catch {
      driving = pageItems.map(() => null);
    }
    if (myRequestId !== requestIdRef.current) return; // een nieuwere aanvraag heeft dit al ingehaald

    const withDistance: Suggestion[] = pageItems.map((c, i) => ({
      bedrijf: c.bedrijf,
      coords: c.coords,
      km: driving[i] ?? c.haversine,
      driving: driving[i] != null,
    }));
    // In routemodus houden we de rijvolgorde (progress) aan; alleen bij "op afstand" zónder
    // route herordenen we de zichtbare pagina op de nu bekende echte rijafstand.
    if (sortMode === 'afstand' && !inRouteMode) withDistance.sort((a, b) => a.km - b.km);
    setSuggestions(withDistance);
    setLoadingSuggestions(false);
  };

  useEffect(() => {
    const pos = currentPosition();
    if (pos) computeSuggestions(pos, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, filterTypes, filterSources, sortMode, onlyUnvisited, suggestCount, radiusKm, startCoords, routeLine]);

  // Haalt de echte rijroute (weggeometrie) op zodra er zowel een startpunt als een bestemming
  // is — dát maakt de richtingmodus actief. Zonder bestemming (of bij een netwerkfout) blijft
  // routeLine leeg en werkt de gewone straal-modus. De route wordt vanaf het STARTPUNT (S)
  // getekend, niet vanaf de huidige positie: zo zie je de hele route en de bedrijven erlangs,
  // en pik je ze in volgorde weg terwijl je 'm opbouwt.
  useEffect(() => {
    let cancelled = false;
    if (!startCoords || !destCoords) { setRouteLine(null); return; }
    getRoutePolyline([startCoords, destCoords]).then(line => {
      if (cancelled) return;
      // Fallback op een rechte lijn tussen de twee punten als OSRM niet bereikbaar is — dan
      // klopt de corridor iets grover, maar de richtingmodus blijft werken.
      setRouteLine(line && line.length >= 2 ? line : [startCoords, destCoords]);
    });
    return () => { cancelled = true; };
  }, [startCoords, destCoords]);

  const goToSuggestPage = (page: number) => {
    const pos = currentPosition();
    if (pos) computeSuggestions(pos, page);
  };

  // Bestemming instellen via een getypt adres/plaats (zelfde gratis geocoder als het startpunt).
  const applyDestination = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setDestError(null);
    setDestLoading(true);
    const coords = await geocodeAddress(q);
    setDestLoading(false);
    if (!coords) { setDestError('Bestemming niet gevonden. Probeer een plaats of exact adres.'); return; }
    setDestCoords(coords);
    setDestLabel(q);
    setDestQuery('');
  };

  // "Naar huis" — 1 klik om het thuisadres uit instellingen als bestemming te zetten (de meest
  // voorkomende terugweg-bestemming).
  const setHomeAsDestination = async () => {
    if (!homeAddress) return;
    setDestError(null);
    setDestLoading(true);
    const coords = await geocodeAddress(homeAddress);
    setDestLoading(false);
    if (!coords) { setDestError('Thuisadres niet gevonden.'); return; }
    setDestCoords(coords);
    setDestLabel('Naar huis');
  };

  // Van ↔ Naar omdraaien = heenweg ↔ terugweg. Wisselt start- en bestemmingcoördinaat (+ labels)
  // om; de route wordt daardoor omgekeerd opgehaald en de bedrijven in omgekeerde rijvolgorde
  // getoond. Alleen mogelijk als er nog geen stops geaccepteerd zijn (anders zou de al
  // opgebouwde route van richting rommelig worden) — zolang je puur aan het plannen bent.
  const swapVanNaar = () => {
    if (!startCoords || !destCoords) return;
    const oldStart = startCoords, oldStartLabel = startLabel;
    setStartCoords(destCoords);
    setStartLabel(destLabel || 'Startpunt');
    setDestCoords(oldStart);
    setDestLabel(oldStartLabel || 'Bestemming');
  };

  const clearDestination = () => {
    setDestCoords(null);
    setDestLabel('');
    setDestQuery('');
    setDestError(null);
    setRouteLine(null);
  };

  // "Open in database" + "Live Zoeken" vanuit een kaart-popup — zelfde patroon als de Kaart-tab
  // (window._inncemMapNav daar), maar onder eigen namen zodat ze elkaar niet overschrijven
  // als beide ooit tegelijk in de DOM zitten.
  useEffect(() => {
    (window as any)._inncemRideNav = (naam: string) => onOpenInDatabase?.(naam);
    (window as any)._inncemRideLiveZoeken = (naam: string) => onOpenInLiveZoeken?.(naam);
    return () => { delete (window as any)._inncemRideNav; delete (window as any)._inncemRideLiveZoeken; };
  }, [onOpenInDatabase, onOpenInLiveZoeken]);

  // Bouwt de kaart (tegels + markerlaag) helemaal opnieuw op in de huidige mapDivRef-
  // container. Gebruikt bij het openklappen van dit paneel ÉN bij elke fullscreen-toggle:
  // Leaflet's eigen resize-hersync (invalidateSize + tileLayer.redraw) bleek onbetrouwbaar bij
  // de grote, plotselinge sprong in containergrootte van/naar fullscreen — de tegellaag bleef
  // dan leeg terwijl markers/popups gewoon zichtbaar bleven. Volledig opnieuw opbouwen tegen de
  // dán-actuele containergrootte is een fractie trager (korte herlaad-flits) maar betrouwbaar.
  const buildMap = () => {
    if (!mapDivRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    }
    // React 18 StrictMode (aan in dit project) mount elke effect twee keer (mount->cleanup->
    // mount) om bugs bloot te leggen. Leaflet zet een interne `_leaflet_id` op de container-DOM-
    // node; blijft die onverhoopt hangen, dan gooit de volgende L.map()-aanroep "Map container
    // is already initialized" — een fout die nergens zichtbaar wordt voor de gebruiker (geen
    // console open), waarna mapRef.current voorgoed null blijft en de kaart leeg oogt.
    delete (mapDivRef.current as any)._leaflet_id;
    try {
      const map = L.map(mapDivRef.current, { preferCanvas: true }).setView([52.1326, 5.2913], 7);
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
      const raf = requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 200);
      return raf;
    } catch (e) {
      console.error('[Onderweg] Kaart kon niet initialiseren:', e);
    }
  };

  useEffect(() => {
    const raf = buildMap();
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    if (mapDivRef.current) ro.observe(mapDivRef.current);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mapRef.current?.remove();
      if (mapDivRef.current) delete (mapDivRef.current as any)._leaflet_id;
      mapRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers + route-lijn herbouwen zodra startpunt, route of voorstellen wijzigen. Consistent
  // met de Route Kaart (Lijsten): startpunt = blauwe "S"-pin, route-stops = genummerde oranje
  // pins, verbonden door een oranje route-lijn in volgorde. Voorstellen = kleine grijze
  // bolletjes (duidelijk anders dan de route zelf, maar één consistente stijl).
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    const chainLine: L.LatLngExpression[] = [];

    const map = mapRef.current;
    // Popup blijft binnen de (relatief smalle/korte) kaart, met genoeg marge tot de rand — zonder
    // dit kon een popup dicht bij de rand deels buiten de kaart-container vallen (afgekapte
    // tekst), vooral op telefoon waar de kaart maar een fractie van het scherm beslaat.
    const popupOpts: L.PopupOptions = { maxWidth: 240, autoPanPadding: [16, 16] };

    // Blauwe lijn = de gereden route naar de bestemming (Van→Naar-richtingmodus), waarlangs de
    // voorstellen liggen. Onder de oranje route-lijn/markers getekend zodat die er bovenop komen.
    if (routeLine && routeLine.length >= 2) {
      L.polyline(routeLine.map(c => [c.lat, c.lng]) as L.LatLngExpression[], { color: '#009FE3', weight: 4, opacity: 0.45 }).addTo(markersLayerRef.current!);
      routeLine.forEach(c => bounds.push([c.lat, c.lng]));
    }

    if (startCoords) {
      bounds.push([startCoords.lat, startCoords.lng]);
      chainLine.push([startCoords.lat, startCoords.lng]);
      const startMarker = L.marker([startCoords.lat, startCoords.lng], { icon: makePin('#1e293b', 'S') })
        .bindPopup(`<div style="font-family:system-ui;font-size:13px"><b>${startLabel || 'Startpunt'}</b></div>`, popupOpts)
        .addTo(markersLayerRef.current);
      attachHoverZoom(startMarker, map);
    }

    chain.forEach((s, i) => {
      chainLine.push([s.coords.lat, s.coords.lng]);
      const stopMarker = L.marker([s.coords.lat, s.coords.lng], { icon: makePin('#E85E26', i + 1) })
        .bindPopup(popupHtml(s.bedrijf, `Stop ${i + 1} van de route`), popupOpts)
        .addTo(markersLayerRef.current!);
      attachHoverZoom(stopMarker, map);
      bounds.push([s.coords.lat, s.coords.lng]);
    });

    // Bestemmingsmarker ("Naar", groene B-pin) zodat je ziet waar de route naartoe loopt.
    if (destCoords) {
      bounds.push([destCoords.lat, destCoords.lng]);
      const destMarker = L.marker([destCoords.lat, destCoords.lng], { icon: makePin('#16A34A', 'B') })
        .bindPopup(`<div style="font-family:system-ui;font-size:13px"><b>${destLabel || 'Bestemming'}</b></div>`, popupOpts)
        .addTo(markersLayerRef.current!);
      attachHoverZoom(destMarker, map);
    }

    // Route-lijn (zelfde idee als de Route Kaart bij Lijsten) zodat je de volgorde als een echte
    // route ziet i.p.v. losse punten.
    if (chainLine.length >= 2) {
      L.polyline(chainLine, { color: '#E85E26', weight: 3, opacity: 0.7 }).addTo(markersLayerRef.current!);
    }

    // Zelfde tikstraal-verruiming voor aanraakschermen als de Kaart-tab (ClusterMapView) —
    // een bolletje van een paar pixels is op een telefoon vrijwel onmogelijk precies te raken.
    const suggestionRadius = isTouchDevice ? 11 : 6;

    suggestions.forEach(s => {
      const bolletje = L.circleMarker([s.coords.lat, s.coords.lng], {
        radius: suggestionRadius, color: '#fff', weight: 1.5, fillColor: '#94a3b8', fillOpacity: 0.9, interactive: true,
      })
        .bindPopup(popupHtml(s.bedrijf, `${s.km.toFixed(1)} km ${s.driving ? 'rijden' : '(hemelsbreed)'}`), popupOpts)
        .addTo(markersLayerRef.current!);
      // Zelfde hover-gedrag als de bolletjes op de Kaart-tab: even iets groter en geleidelijk
      // inzoomen zolang de muis erop blijft staan.
      attachHoverZoom(bolletje, map,
        () => bolletje.setRadius(suggestionRadius + 3),
        () => bolletje.setRadius(suggestionRadius),
      );
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
  }, [startCoords, startLabel, chain, suggestions, destCoords, destLabel, routeLine, mapGeneration]);

  // Fullscreen togglet de containergrootte (klein <-> volledig scherm) in één keer, een veel
  // grotere sprong dan de geleidelijke resizes die de ResizeObserver hierboven normaal opvangt
  // — invalidateSize()/redraw() bleken dat niet betrouwbaar bij te benen (tegels bleven leeg
  // terwijl markers gewoon werkten). Bouwt de kaart daarom volledig opnieuw op (buildMap
  // hierboven) tegen de nieuwe containergrootte, en telt mapGeneration op zodat de marker-
  // herbouw-effect de route/voorstellen opnieuw op de NIEUWE kaartinstantie tekent. Skipt de
  // allereerste render (die kaart is net al gebouwd door de mount-effect hierboven).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    buildMap();
    setMapGeneration(g => g + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  // Zelfde geolocation-opties als "Gebruik mijn locatie" bij Live Zoeken (useMyLocation in
  // App.tsx), die daar wél altijd werkt. enableHighAccuracy:true vraagt om GPS-precisie, en op
  // apparaten zonder GPS-chip (de meeste desktops/laptops) laat dat de opzoek regelmatig
  // mislukken of hangen i.p.v. netjes terugvallen op WiFi/IP-positionering — enableHighAccuracy:
  // false gebruikt diezelfde snellere, breder beschikbare methode die bij Live Zoeken al werkt.
  // Kan ook aangeroepen worden als er al (een eerdere, evt. onnauwkeurige via-IP) startCoords
  // staan — bv. via de "opnieuw via GPS"-knop hieronder, zodra het startpunt al gezet is. Reset
  // daarom altijd expliciet, en herberekent de km's van een eventuele al opgebouwde route zodra
  // de nieuwe locatie binnenkomt (anders blijven de afstanden op de OUDE locatie gebaseerd).
  const useMyLocation = () => {
    setStartError(null);
    setStartLoading(true);
    if (!navigator.geolocation) { setStartError('Locatiebepaling niet ondersteund door je browser.'); setStartLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartCoords(coords);
        setStartLabel('Mijn locatie');
        setChain(prev => recomputeKm(prev, coords));
        setStartLoading(false);
      },
      async (err) => {
        // Browser-locatie faalde (geweigerd, geen WiFi-scan mogelijk, timeout) — val terug op
        // een gratis IP-gebaseerde locatiedienst (stad-niveau, geen browserpermissie nodig)
        // i.p.v. de gebruiker met een doodlopende foutmelding achter te laten. Duidelijk
        // gelabeld "via IP" zodat je ziet dat dit minder precies is dan echte GPS, en met de
        // knop hiernaast kun je op elk moment opnieuw een precieze GPS-poging doen.
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const r = await fetch('https://ipwho.is/', { signal: controller.signal });
          clearTimeout(timeout);
          const d = await r.json();
          if (d?.success !== false && typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
            const coords = { lat: d.latitude, lng: d.longitude };
            setStartCoords(coords);
            setStartLabel(`Mijn locatie${d.city ? ` (${d.city}, via IP)` : ' (via IP)'}`);
            setChain(prev => recomputeKm(prev, coords));
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
      // enableHighAccuracy: false — bewust ZO gelaten (niet terug naar true): eerder deze sessie
      // bleek true juist de oorzaak van "Kon je locatie niet bepalen"-fouten op apparaten zonder
      // GPS-chip (de meeste desktops/laptops), opgelost door dezelfde methode als Live Zoeken te
      // gebruiken. maximumAge: 0 (i.p.v. 60s) forceert wél een verse meting i.p.v. een gecachete
      // positie terug te geven — belangrijk specifiek voor de "opnieuw via GPS"-knop hieronder,
      // die je juist gebruikt omdat de vorige (via-IP) locatie niet klopte.
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
    const coords = await geocodeAddress(q);
    if (coords) {
      setStartCoords(coords);
      setStartLabel(q);
    } else {
      setStartError(`"${q}" niet gevonden.`);
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
    setDestCoords(null);
    setDestLabel('');
    setDestQuery('');
    setRouteLine(null);
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
    const coords = await geocodeAddress(query);
    if (coords) {
      const from = currentPosition();
      const km = from ? haversineKm(from.lat, from.lng, coords.lat, coords.lng) : 0;
      const waypointBedrijf = { naam: query, stad: '', straat: '', postcode: '', isWaypoint: true };
      setChain(prev => [...prev, { id: `${query}_${Date.now()}`, bedrijf: waypointBedrijf, coords, km }]);
      setManualQuery('');
    } else {
      setManualError(`"${query}" niet gevonden als bedrijf of plaats.`);
    }
    setManualLoading(false);
  };

  // Route-volgorde slepen: km per stop is berekend t.o.v. de vorige stop op het moment van
  // toevoegen, dus na het verwisselen van volgorde herberekenen we die (hemelsbreed) opnieuw
  // vanaf het startpunt door de hele keten, anders kloppen de getoonde afstanden niet meer.
  // Herberekent de km-per-stop (hemelsbreed) vanaf het startpunt door de hele keten. Gedeeld
  // door herordenen/optimaliseren/vervangen zodat de getoonde afstanden altijd blijven kloppen.
  // `fromOverride` is nodig zodra het startpunt zelf net in dezelfde actie is gewijzigd (bv.
  // updateStartAddress): setStartCoords is dan nog niet verwerkt in een nieuwe render, dus
  // `startCoords` hier zou anders nog de OUDE waarde uit de sluiting zijn.
  const recomputeKm = (stops: RideStop[], fromOverride?: Coords | null): RideStop[] => {
    let from: Coords | null = fromOverride !== undefined ? fromOverride : startCoords;
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
    const coords = await geocodeAddress(query);
    if (coords) {
      setStartCoords(coords);
      setStartLabel(query);
      setChain(prev => recomputeKm(prev, coords));
      setEditStart(false);
      setEditStartQuery('');
    } else {
      setStartError(`"${query}" niet gevonden.`);
    }
    setStartLoading(false);
  };

  const removeStop = (id: string) => {
    setChain(prev => recomputeKm(prev.filter(s => s.id !== id)));
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
  // Google Maps laat maar ~10 punten toe in één route (origin + max 9 stops). Bij een langere
  // route splitsen we 'm daarom in opeenvolgende blokken van elk max 10 punten: blok 2 begint
  // bij de laatste stop van blok 1, enzovoort — zo blijft de hele rit dekkend, alleen in
  // meerdere te-openen Google Maps-links i.p.v. één die stops laat vallen.
  const MAPS_CHUNK = 9; // + startpunt = 10 punten per link
  const mapsUrls: string[] = (() => {
    if (chain.length === 0 || !startCoords) return [];
    const encBedrijf = (b: any) => encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
    const urls: string[] = [];
    for (let i = 0; i < chain.length; i += MAPS_CHUNK) {
      const group = chain.slice(i, i + MAPS_CHUNK);
      const origin = i === 0
        ? (startLabel ? encodeURIComponent(startLabel) : `${startCoords.lat},${startCoords.lng}`)
        : encBedrijf(chain[i - 1].bedrijf);
      const destination = encBedrijf(group[group.length - 1].bedrijf);
      const waypoints = group.slice(0, -1).map(s => encBedrijf(s.bedrijf)).join('|');
      let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
      if (waypoints) url += `&waypoints=${waypoints}`;
      urls.push(url);
    }
    return urls;
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
          <div ref={mapDivRef} className={isFullscreen ? 'flex-1 w-full bg-slate-200' : 'w-full h-72 sm:h-80 bg-slate-200'} />
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

              <div className="space-y-1.5">
                {/* Startpunt (S) — aanpasbaar naar een exact adres. */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">S</span>
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
                      {/* Opnieuw via GPS: nodig zodra het startpunt al gezet is (bv. een minder
                          precieze via-IP locatie) — zonder deze knop was er geen manier meer om
                          een verse GPS-poging te doen, alleen handmatig een adres typen. */}
                      <button onClick={useMyLocation} disabled={startLoading} title="Opnieuw via GPS" className="text-slate-400 hover:text-[#E85E26] disabled:opacity-50 flex-shrink-0">
                        {startLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { setEditStart(true); setEditStartQuery(''); }} title="Startlocatie aanpassen (exact adres)" className="text-slate-400 hover:text-[#009FE3] flex-shrink-0"><MapPin className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>

                {/* Naar (bestemming) — zet de Van→Naar-richtingmodus aan: dan tonen we alleen
                    bedrijven die op de gereden route liggen, in rijvolgorde. Geen straal, geen
                    sliders — gewoon "waar rij ik naartoe". */}
                {destCoords ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-5 h-5 rounded-full bg-[#16A34A] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">B</span>
                    <span className="text-slate-700 font-medium truncate flex-1">
                      <span className="text-[10px] text-slate-400 mr-1">naar</span>{destLabel || 'Bestemming'}
                    </span>
                    <button onClick={swapVanNaar} disabled={chain.length > 0} title={chain.length > 0 ? 'Omdraaien kan alleen vóór je stops toevoegt' : 'Van ↔ Naar omdraaien (heen ↔ terug)'} className="text-slate-400 hover:text-[#009FE3] disabled:opacity-30 flex-shrink-0"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
                    <button onClick={clearDestination} title="Bestemming wissen" className="text-slate-400 hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
                    <input
                      type="text"
                      value={destQuery}
                      onChange={e => { setDestQuery(e.target.value); setDestError(null); }}
                      onKeyDown={e => e.key === 'Enter' && applyDestination(destQuery)}
                      placeholder="Naar… (plaats of adres, bv. Amsterdam)"
                      className="flex-1 min-w-0 border border-slate-200 rounded-sm px-2 py-1 text-xs focus:outline-none focus:border-[#009FE3]"
                    />
                    {destQuery.trim() && (
                      <button onClick={() => applyDestination(destQuery)} disabled={destLoading} className="px-2 py-1 bg-[#009FE3] disabled:opacity-50 text-white rounded-sm flex-shrink-0">
                        {destLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {homeAddress && !destQuery.trim() && (
                      <button onClick={setHomeAsDestination} disabled={destLoading} title="Naar huis (thuisadres uit instellingen)" className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border border-slate-200 rounded-sm hover:border-[#009FE3] disabled:opacity-50 flex-shrink-0">
                        {destLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Home className="w-3 h-3" />} Huis
                      </button>
                    )}
                  </div>
                )}
                {destError && <p className="text-[10px] text-red-500 pl-7">{destError}</p>}
                {destCoords && (
                  <p className="text-[10px] text-[#009FE3] pl-7">
                    {routeLine ? 'Toont bedrijven op je route, in rijvolgorde.' : 'Route ophalen…'}
                  </p>
                )}

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
              {mapsUrls.length === 1 && (
                <a href={mapsUrls[0]} target="_blank" rel="noreferrer" className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 bg-white border border-[#009FE3] text-[#009FE3] text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-[#009FE3]/5">
                  <MapPin className="w-3.5 h-3.5" /> Open route in Google Maps
                </a>
              )}
              {mapsUrls.length > 1 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] text-slate-400">Google Maps kan max. 10 punten per route aan — deze rit is daarom gesplitst in {mapsUrls.length} delen, elk aansluitend op het vorige:</p>
                  {mapsUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 py-2 bg-white border border-[#009FE3] text-[#009FE3] text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-[#009FE3]/5">
                      <MapPin className="w-3.5 h-3.5" /> Deel {i + 1} van {mapsUrls.length} in Google Maps
                    </a>
                  ))}
                </div>
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
              {/* Zoekstraal — zelfde sleepbare "Straal"-slider als Live Zoeken, van 1 tot 150 km.
                  Bepaalt hoeveel bedrijven er in de resultaten/paginering hieronder komen. In de
                  Van→Naar-richtingmodus is straal niet relevant (dan geldt de route zelf), dus
                  verbergen we 'm dan volledig. */}
              {!destCoords && (
                <div className="flex items-center gap-3 flex-wrap bg-slate-50 border border-slate-200 rounded-sm px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-shrink-0">Straal</span>
                  <input
                    type="range"
                    min={5}
                    max={150}
                    step={5}
                    value={radiusKm}
                    onChange={e => setRadiusKm(Number(e.target.value))}
                    className="flex-1 min-w-[100px] accent-[#009FE3] h-1.5"
                  />
                  <span className="text-xs font-bold text-[#009FE3] w-14 flex-shrink-0">{radiusKm} km</span>
                </div>
              )}
              {/* Bronfilter (Bouwgarant, Architectenweb, BNA, ...) — alleen als er meer dan 1
                  bron in de data zit, anders heeft filteren geen zin. */}
              {availableSources.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableSources.map(src => {
                    const active = filterSources.has(src);
                    return (
                      <button
                        key={src}
                        onClick={() => setFilterSources(prev => { const next = new Set(prev); next.has(src) ? next.delete(src) : next.add(src); return next; })}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                      >
                        {src}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={onlyUnvisited} onChange={e => setOnlyUnvisited(e.target.checked)} className="accent-[#E85E26]" />
                  Alleen nog niet bezocht
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Sorteer:</span>
                    {([['afstand', 'Dichtstbij'], ['az', 'A-Z']] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${sortMode === mode ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Per pagina:</span>
                    {[10, 20].map(n => (
                      <button
                        key={n}
                        onClick={() => setSuggestCount(n)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${suggestCount === n ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Voorstellen: gepagineerd door ALLE bedrijven binnen bereik (net als Live Zoeken),
                op afstand gesorteerd — niet meer afgekapt tot alleen de eerste N. */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Dichtstbijzijnde vanaf {chain.length > 0 ? chain[chain.length - 1].bedrijf.naam : (startLabel || 'startpunt')}
                  {suggestTotal > 0 && <span className="normal-case font-normal text-slate-400"> — {suggestTotal} binnen bereik</span>}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {loadingSuggestions && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
                  {suggestions.length > 0 && (
                    <button
                      onClick={advanceAll}
                      title="Alle voorstellen op deze pagina toevoegen aan de route"
                      className="text-[10px] font-bold uppercase tracking-wider text-green-600 hover:text-green-700 hover:underline flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Accepteer pagina ({suggestions.length})
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
                    {/* Klik op naam = open dit bedrijf in Live Zoeken (niet meteen toevoegen aan
                        de route) — accepteren/overslaan gebeurt expliciet via de knoppen ernaast. */}
                    <button onClick={() => onOpenInLiveZoeken?.(s.bedrijf.naam)} title="Open in Live Zoeken" className="flex-1 min-w-0 text-left flex items-center gap-1.5">
                      <Search className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.bedrijf.naam}</p>
                        <p className="text-[10px] text-slate-400">{s.bedrijf.stad} · {s.km.toFixed(1)} km{s.driving ? ' rijden' : ' (hemelsbreed)'}</p>
                      </span>
                    </button>
                    <button onClick={() => advanceTo(s)} title="Accepteer als volgende stop" className="p-1.5 rounded-full text-green-600 hover:bg-green-50 flex-shrink-0"><Check className="w-4 h-4" /></button>
                    <button onClick={() => dismissSuggestion(s.bedrijf)} title="Overslaan" className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              {suggestTotal > suggestCount && (() => {
                const totalSuggestPages = Math.max(1, Math.ceil(suggestTotal / suggestCount));
                return (
                  <div className="flex items-center justify-center gap-3 mt-2 pt-2 border-t border-slate-100">
                    <button onClick={() => goToSuggestPage(suggestPage - 1)} disabled={suggestPage <= 1} className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] disabled:opacity-30 disabled:text-slate-400 hover:underline">← Vorige</button>
                    <span className="text-[10px] text-slate-400">Pagina {suggestPage} van {totalSuggestPages}</span>
                    <button onClick={() => goToSuggestPage(suggestPage + 1)} disabled={suggestPage >= totalSuggestPages} className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] disabled:opacity-30 disabled:text-slate-400 hover:underline">Volgende →</button>
                    {/* Direct naar een paginanummer springen (bv. "12"), zelfde patroon als de
                        Bedrijvendatabase-paginering. */}
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        const v = parseInt((e.currentTarget.elements.namedItem('spg') as HTMLInputElement).value, 10);
                        if (v >= 1 && v <= totalSuggestPages) goToSuggestPage(v);
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        name="spg"
                        type="number"
                        min={1}
                        max={totalSuggestPages}
                        defaultValue={suggestPage}
                        key={suggestPage}
                        placeholder="pag."
                        className="w-12 text-center border border-slate-300 text-[10px] py-1 rounded-sm focus:outline-none focus:border-[#009FE3]"
                      />
                    </form>
                  </div>
                );
              })()}

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
