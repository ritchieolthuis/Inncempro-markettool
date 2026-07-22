import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigation, MapPin, X, Loader2, Search, Check, RotateCcw, Save, Plus, GripVertical, ChevronUp, ChevronDown, Maximize2, Minimize2, Wand2, Repeat, ArrowRight, ArrowLeftRight, Home, Filter } from 'lucide-react';
import { haversineKm, detectType, optimizeRoute, scoreInsertionCandidates, nearestPointOnRoute } from '../utils/dagbezoek';
import { getDrivingDistancesKm, getRoutePolyline } from '../services/routingService';
import { getClusterData, makeId } from '../services/geoclusterService';
import { sourceColor, sourceLabel } from '../utils/sourceColors';
import VoiceInputButton from './VoiceInputButton';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Coords = { lat: number; lng: number };

// Zelfde popup-opzet (naam, adres, telefoon, email) als op de Kaart-tab
// (components/ClusterMapView.tsx popupHtml), met drie link/knoppen: Live Zoeken (voor de
// rij-afstand in meters), Google Maps en Website.
function popupHtml(b: any, extra?: string, isSelected?: boolean): string {
  const website = b.website ? (/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`) : '';
  const naamEsc = (b.naam || '').replace(/'/g, "\\'");
  const mapsQuery = encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
  return `<div style="font-family:system-ui;font-size:13px;min-width:220px">
    ${extra ? `<div style="font-size:10px;font-weight:700;color:#E85E26;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${extra}</div>` : ''}
    <b style="color:#1e293b">${b.naam || ''}</b><br/>
    <span style="color:#64748b;font-size:12px">${b.straat || ''}</span><br/>
    <span style="color:#64748b;font-size:12px">${[b.postcode, b.stad].filter(Boolean).join(' ')}</span>
    ${b.telefoon ? `<div style="margin-top:4px;color:#374151;font-size:12px">📞 ${b.telefoon}</div>` : ''}
    ${b.email ? `<div style="color:#374151;font-size:12px">✉️ ${b.email}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <button onclick="window._inncemRideAdd('${naamEsc}')" style="font-size:11px;color:#009FE3;background:#f0f9ff;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;cursor:pointer">+ 1-Klik toevoegen</button>
      <button onclick="window._inncemRideToggleSelect('${naamEsc}')" style="font-size:11px;color:${isSelected ? '#E85E26' : '#475569'};background:${isSelected ? '#fff7ed' : '#f8fafc'};border:1px solid ${isSelected ? '#E85E26' : '#cbd5e1'};padding:3px 8px;border-radius:4px;cursor:pointer;font-weight:${isSelected ? '700' : '500'}">${isSelected ? '✓ Geselecteerd' : '☐ Selecteren'}</button>
      <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Google Maps →</a>
      ${website ? `<a href="${website}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
    </div>
    ${b.source ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">${sourceLabel(b.source)}</div>` : ''}
  </div>`;
}

function makePin(color: string, label: number | string) {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background-color:${color};border:1.5px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;font-family:system-ui;box-shadow:0 1.5px 4px rgba(0,0,0,0.3);">${label}</div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11],
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
        const nextZoom = Math.min(HOVER_ZOOM_MAX, z + 0.8);
        map.setZoomAround(latlng, nextZoom, { animate: true, duration: 0.3 });
      }, 350);
    }, 350);
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
  onSaveRoute?: (route: { name: string; stops: string[]; savedAt: string }) => void;
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
  // Al-gecodeerde coördinaten van hetzelfde adres (Instellingen > Mijn adres) — gebruikt als
  // DEFAULT startpunt (zie init-effect hieronder), zodat we niet nog een keer hoeven te
  // geocoden. null/undefined zolang Instellingen dat adres zelf nog aan het opzoeken is.
  homeCoords?: Coords | null;
  // Instellingen > Voorkeuren > "Resultaten per pagina (bezoeken)" — default voor suggestCount/
  // showAllSuggestions bij het openen. Blijven daarna gewoon lokaal aanpasbaar via de knoppen
  // hieronder, net zoals de databank-paginering.
  defaultSuggestCount?: number;
  defaultShowAllSuggestions?: boolean;
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
// Herkent eerst "straat huisnummer, plaats" (bijv. "Handelsweg 14, Wierden") en zoekt dan
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
  allData, cityCoords, isVisitedCompany, onSaveAsList, onLogVisits, onSaveRoute, onOpenInDatabase, onOpenInLiveZoeken,
  startCoords, setStartCoords, startLabel, setStartLabel, chain, setChain,
  destCoords, setDestCoords, destLabel, setDestLabel, homeAddress, homeCoords,
  defaultSuggestCount, defaultShowAllSuggestions, liveLocationCoords, embedded,
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
  // hemelsbreed loodrecht op de lijn). Bewust een vaste waarde i.p.v. een slider: de gebruiker
  // wil geen knoppen, gewoon "de architecten die op mijn route liggen". Strak gehouden (6 km ≈
  // even van de snelwegafslag af en weer terug): een bedrijf dat verder van de lijn ligt is een
  // echte omweg de verkeerde kant op (bijv. Oirschot ten westen van Eindhoven terwijl je noord
  // rijdt), en dat wil je juist NIET meepakken — beter eentje iets verderop dat wél op de route
  // ligt dan eentje "vlakbij" waarvoor je van de weg af moet.
  const ROUTE_CORRIDOR_KM = 6;
  // Aantal per pagina (10 of 20) — beperkt hoeveel er tegelijk op de kaart/lijst komt, maar
  // niet meer het totaal: alle bedrijven binnen bereik zijn bereikbaar via de paginering
  // hieronder, net als bij Live Zoeken.
  const [suggestCount, setSuggestCount] = useState(defaultSuggestCount || 10);
  const [suggestPage, setSuggestPage] = useState(1);
  const [suggestTotal, setSuggestTotal] = useState(0);
  // "Toon alles": laat de paginering achterwege en toont in één keer alle bedrijven binnen
  // bereik/route, i.p.v. 10/20 per keer moeten doorklikken. Slaat daarom ook de rijafstand-
  // verfijning (stap 2, OSRM) over — die is bedoeld voor een kleine zichtbare pagina, niet voor
  // mogelijk honderden bedrijven tegelijk (zou de gratis routing-server overbelasten). Je ziet
  // dan de hemelsbrede/route-afstand, wat voor "alles in één keer overzien" ruim genoeg is.
  const [showAllSuggestions, setShowAllSuggestions] = useState(!!defaultShowAllSuggestions);
  const [filterTypes, setFilterTypes] = useState<Set<'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen'>>(new Set());
  const [filterSources, setFilterSources] = useState<Set<string>>(new Set());
  // Discipline- en bronfilters staan standaard ingeklapt (net als "Regio & Locatie" elders) —
  // ze namen als vaste rijen pillen altijd ruimte in, ook als je ze nooit gebruikt. Alleen de
  // straal-slider (dagelijks gebruikt) blijft wel altijd zichtbaar.
  const [showTypeSourceFilters, setShowTypeSourceFilters] = useState(false);
  const [sortMode, setSortMode] = useState<'afstand' | 'az'>('afstand');
  const [onlyUnvisited, setOnlyUnvisited] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | 'start' | null>(null);
  const [insertQuery, setInsertQuery] = useState('');
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
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
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [selectedSuggestionNames, setSelectedSuggestionNames] = useState<Set<string>>(new Set());
  const [mapSelectionMode, setMapSelectionMode] = useState(false);

  const mapSelectionModeRef = useRef(mapSelectionMode);
  const toggleSelectSuggestionRef = useRef<(naam: string) => void>(() => {});

  useEffect(() => { mapSelectionModeRef.current = mapSelectionMode; }, [mapSelectionMode]);

  const toggleSelectSuggestion = (naam: string) => {
    setSelectedSuggestionNames(prev => {
      const next = new Set(prev);
      if (next.has(naam)) next.delete(naam);
      else next.add(naam);
      return next;
    });
  };

  useEffect(() => { toggleSelectSuggestionRef.current = toggleSelectSuggestion; }, [toggleSelectSuggestion]);

  const selectAllPageSuggestions = () => {
    setSelectedSuggestionNames(prev => {
      const next = new Set(prev);
      suggestions.forEach(s => next.add(s.bedrijf.naam));
      return next;
    });
  };

  const deselectAllPageSuggestions = () => {
    setSelectedSuggestionNames(prev => {
      const next = new Set(prev);
      suggestions.forEach(s => next.delete(s.bedrijf.naam));
      return next;
    });
  };

  const advanceSelected = () => {
    const selectedList = suggestions.filter(s => selectedSuggestionNames.has(s.bedrijf.naam));
    if (selectedList.length === 0) return;
    setChain(prev => [
      ...prev,
      ...selectedList.map((s, i) => ({ id: `${(s.bedrijf.naam || '')}_${Date.now()}_${i}`, bedrijf: s.bedrijf, coords: s.coords, km: s.km })),
    ]);
    setAlertMessage(`${selectedList.length} geselecteerde bedrijven toegevoegd`);
    deselectAllPageSuggestions();
  };

  const requestIdRef = useRef(0);

  const openStartEditor = () => {
    setEditStart(true);
    setEditStartQuery(startLabel || homeAddress || '');
    setStartError(null);
  };

  // Normaliseer rauwe bronwaarden: 'Onbekend' en 'Bedrijvenoverzicht' zijn allebei 'Web'.
  const normalizeSource = (s?: string): string => {
    const raw = s || 'Onbekend';
    return (raw === 'Onbekend' || raw === 'Bedrijvenoverzicht') ? 'Web' : raw;
  };

  // Beschikbare bronnen (bijv. Bouwgarant, Architectenweb, BNA, ...) voor het bronfilter —
  // afgeleid uit de echte data i.p.v. hardgecodeerd, zodat 'm altijd klopt met wat er is.
  // 'Onbekend' en 'Bedrijvenoverzicht' worden samengevoegd als 'Web'.
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const b of allData) set.add(normalizeSource(b.source));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [allData]);
  const activeSourceFilterCount = availableSources.length > 0 && availableSources.every(src => filterSources.has(src))
    ? 0
    : Math.max(0, availableSources.length - filterSources.size);
  const previousAvailableSourcesRef = useRef<string[]>([]);
  useEffect(() => {
    const previousSources = previousAvailableSourcesRef.current;
    previousAvailableSourcesRef.current = availableSources;
    setFilterSources(prev => {
      if (availableSources.length === 0) return new Set();
      const previousHadAll = previousSources.length === 0 || previousSources.every(src => prev.has(src));
      if (previousHadAll) return new Set(availableSources);
      const nextAllowed = new Set(availableSources);
      return new Set(Array.from(prev).filter(src => nextAllowed.has(src)));
    });
  }, [availableSources]);

  const currentPosition = (): Coords | null => {
    if (chain.length > 0) {
      const last = chain[chain.length - 1];
      const c = last?.coords || (last?.bedrijf ? coordsFor(last.bedrijf, cityCoords) : null);
      if (c && typeof c.lat === 'number' && typeof c.lng === 'number') return c;
    }
    if (startCoords && typeof startCoords.lat === 'number' && typeof startCoords.lng === 'number') return startCoords;
    if (liveLocationCoords && typeof liveLocationCoords.lat === 'number' && typeof liveLocationCoords.lng === 'number') return liveLocationCoords;
    if (homeCoords && typeof homeCoords.lat === 'number' && typeof homeCoords.lng === 'number') return homeCoords;
    return { lat: 52.1326, lng: 5.2913 };
  };

  const currentRouteProgressKm = (): number => {
    if (!routeLine || routeLine.length < 2 || chain.length === 0) return 0;
    const posCoords = currentPosition();
    if (!posCoords) return 0;
    const pos = nearestPointOnRoute(posCoords.lat, posCoords.lng, routeLine);
    return pos.progressKm;
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
    const minRouteProgress = inRouteMode ? currentRouteProgressKm() : 0;
    const directToDestinationKm = inRouteMode && destCoords
      ? haversineKm(from.lat, from.lng, destCoords.lat, destCoords.lng)
      : 0;

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

    const candidates: Array<{ bedrijf: any; coords: Coords; haversine: number; progress: number; detour: number; insertionDetour: number }> = [];
    for (const b of allData) {
      const naam = (b.naam || '').toLowerCase().trim();
      if (!naam || inChain.has(naam)) continue;
      if (filterTypes.size > 0 && !filterTypes.has(detectType(b) as any)) continue;
      if (!filterSources.has(normalizeSource(b.source))) continue;
      if (onlyUnvisited && isVisitedCompany(b)) continue;
      const coords = coordsFor(b, cityCoords);
      if (!coords) continue;
      const hv = haversineKm(from.lat, from.lng, coords.lat, coords.lng);
      if (inRouteMode) {
        if (routeBox && (coords.lat < routeBox.minLat || coords.lat > routeBox.maxLat || coords.lng < routeBox.minLng || coords.lng > routeBox.maxLng)) continue;
        const pos = nearestPointOnRoute(coords.lat, coords.lng, routeLine!);
        if (pos.distKm > ROUTE_CORRIDOR_KM) continue; // ligt niet op de gereden route
        if (pos.progressKm <= minRouteProgress + 0.2) continue; // niet terug langs al gereden/geplande stuk
        const insertionDetour = destCoords
          ? Math.max(0, hv + haversineKm(coords.lat, coords.lng, destCoords.lat, destCoords.lng) - directToDestinationKm)
          : pos.distKm;
        candidates.push({ bedrijf: b, coords, haversine: hv, progress: pos.progressKm, detour: pos.distKm, insertionDetour });
      } else {
        if (hv > radiusKm) continue;
        candidates.push({ bedrijf: b, coords, haversine: hv, progress: 0, detour: 0, insertionDetour: 0 });
      }
    }
    // Sorteervolgorde:
    //  • routemodus  → in rijrichting, maar niet blind "eerste puntje op de lijn": binnen korte
    //    stukken vooruit pakken we de kandidaat met de minste extra omweg richting eindadres.
    //    Dat houdt de lijst logisch voor onderweg rijden: vooruit op de route, dicht bij de
    //    rijlijn, en geen rare zijwaartse uitstap als er een betere snelweg-optie vlakbij ligt.
    //  • A-Z          → alfabetisch.
    //  • anders       → dichtstbij eerst.
    if (sortMode === 'az') {
      candidates.sort((a, b) => (a.bedrijf.naam || '').localeCompare(b.bedrijf.naam || '', 'nl'));
    } else if (inRouteMode) {
      const ROUTE_PICK_WINDOW_KM = 12;
      candidates.sort((a, b) => {
        const aWindow = Math.floor((a.progress - minRouteProgress) / ROUTE_PICK_WINDOW_KM);
        const bWindow = Math.floor((b.progress - minRouteProgress) / ROUTE_PICK_WINDOW_KM);
        return (bWindow - aWindow)
          || (a.insertionDetour - b.insertionDetour)
          || (a.detour - b.detour)
          || (b.progress - a.progress);
      });
    } else {
      candidates.sort((a, b) => a.haversine - b.haversine);
    }

    setSuggestTotal(candidates.length);

    // Alleen bij expliciete "Toon alles" alles in één keer tonen — ook in routemodus blijft de
    // normale paginering (10/20 per pagina) gewoon werken, dat is de bekende/gewenste bediening.
    // "Toon alles" is de manier om écht alles te zien (incl. verderop op de route, bijv. Utrecht/
    // Amersfoort/Apeldoorn) zonder te hoeven doorklikken — niet iets wat automatisch aan moet
    // staan zodra er een bestemming is gekozen.
    if (showAllSuggestions) {
      // Alles in één keer, geen paginering en geen OSRM-verfijning (zie toelichting bij de
      // state hierboven) — hemelsbrede/route-afstand is voor "alles overzien" ruim genoeg, en
      // honderden losse rijafstand-aanvragen zou de gratis routing-server overbelasten.
      setSuggestPage(1);
      setSuggestions(candidates.map(c => ({ bedrijf: c.bedrijf, coords: c.coords, km: c.haversine, driving: false })));
      setLoadingSuggestions(false);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(candidates.length / suggestCount));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = candidates.slice((clampedPage - 1) * suggestCount, clampedPage * suggestCount);

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
    // Sorteren op afstand alleen als geen route actief is.
    if (sortMode === 'afstand' && !inRouteMode) withDistance.sort((a, b) => a.km - b.km);
    setSuggestions(withDistance);
    setLoadingSuggestions(false);
  };

  // Startpunt initialiseren op "Mijn adres" uit Instellingen (niet IP-locatie).
  // Dit gebeurt slechts eenmaal bij eerste keer openen; GPS/handmatig zoeken blijven beschikbaar.
  // homeCoords niet in dependency-array zodat latere adreswijzigingen geen bewuste keuze overschrijven.
  const homeInitRef = useRef(false);
  useEffect(() => {
    if (homeInitRef.current || startCoords) return;
    if (!homeCoords) return;
    homeInitRef.current = true;
    setStartCoords(homeCoords);
    setStartLabel(homeAddress || 'Mijn adres');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeCoords]);

  useEffect(() => {
    const pos = currentPosition();
    if (pos) computeSuggestions(pos, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, filterTypes, filterSources, sortMode, onlyUnvisited, suggestCount, radiusKm, startCoords, routeLine, showAllSuggestions]);

  // Haalt de echte rijroute (weggeometrie) op zodra er zowel een startpunt als een bestemming
  // is — dát maakt de richtingmodus actief. Zonder bestemming (of bij een netwerkfout) blijft
  // routeLine leeg en werkt de gewone straal-modus. De route wordt vanaf het STARTPUNT (S)
  // getekend, niet vanaf de huidige positie: zo zie je de hele route en de bedrijven erlangs,
  // en pik je ze in volgorde weg terwijl je 'm opbouwt.
  useEffect(() => {
    let cancelled = false;
    if (!startCoords || !destCoords) { setRouteLine(null); return; }
    const routePoints = [startCoords, ...chain.map(s => s.coords), destCoords];
    getRoutePolyline(routePoints).then(line => {
      if (cancelled) return;
      // Fallback op een rechte lijn tussen de twee punten als OSRM niet bereikbaar is — dan
      // klopt de corridor iets grover, maar de richtingmodus blijft werken.
      setRouteLine(line && line.length >= 2 ? line : routePoints);
    });
    return () => { cancelled = true; };
  }, [startCoords, destCoords, chain]);

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

  useEffect(() => {
    if (!alertMessage) return;
    const t = setTimeout(() => setAlertMessage(null), 2600);
    return () => clearTimeout(t);
  }, [alertMessage]);

  const addStopByName = (naam: string) => {
    const b = allData.find(x => (x.naam || '').toLowerCase() === (naam || '').toLowerCase());
    if (!b) return;
    const coords = coordsFor(b, cityCoords);
    if (!coords) return;
    const last = currentPosition();
    const km = last ? haversineKm(last.lat, last.lng, coords.lat, coords.lng) : 0;
    
    setChain(prev => {
      const exists = prev.some(x => (x.bedrijf.naam || '').toLowerCase() === (b.naam || '').toLowerCase());
      if (exists) {
        setAlertMessage("Staat al in Onderweg");
        return prev;
      } else {
        setAlertMessage(`${b.naam} toegevoegd aan Onderweg`);
        return [...prev, { id: `${b.naam}_${Date.now()}`, bedrijf: b, coords, km }];
      }
    });
  };

  useEffect(() => {
    (window as any)._inncemRideAdd = (naam: string) => addStopByName(naam);
    (window as any)._inncemRideToggleSelect = (naam: string) => toggleSelectSuggestion(naam);
    return () => { delete (window as any)._inncemRideAdd; delete (window as any)._inncemRideToggleSelect; };
  }, [allData, cityCoords, chain]);

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
      const b = s?.bedrijf || s;
      if (!b) return;
      const coords = s?.coords || coordsFor(b, cityCoords) || startCoords || liveLocationCoords || homeCoords;
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
      chainLine.push([coords.lat, coords.lng]);
      const stopColor = sourceColor(b.source || 'Onbekend');
      const stopMarker = L.marker([coords.lat, coords.lng], { icon: makePin(stopColor, i + 1) })
        .bindPopup(popupHtml(b, `Stop ${i + 1} van de route`), popupOpts)
        .addTo(markersLayerRef.current!);
      attachHoverZoom(stopMarker, map);
      bounds.push([coords.lat, coords.lng]);
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
    const suggestionRadius = 6;

    // "Toon alles" toont alle bedrijven. Hover-zoom alleen voor eerste N bedrijven (performance).
    const MAX_HOVER_ZOOM_MARKERS = 300;
    suggestions.forEach((s, si) => {
      if (!s?.coords || typeof s.coords.lat !== 'number' || typeof s.coords.lng !== 'number') return;
      const isSelected = selectedSuggestionNames.has(s.bedrijf.naam);
      const bolletje = L.circleMarker([s.coords.lat, s.coords.lng], {
        radius: isSelected ? suggestionRadius + 3 : suggestionRadius,
        color: isSelected ? '#E85E26' : '#fff',
        weight: isSelected ? 3 : 1.5,
        fillColor: sourceColor(s.bedrijf.source),
        fillOpacity: 0.95,
        interactive: true,
      })
        .bindPopup(popupHtml(s.bedrijf, `${(typeof s.km === 'number' ? s.km : 0).toFixed(1)} km ${s.driving ? 'rijden' : '(hemelsbreed)'}`, isSelected), popupOpts);

      bolletje.on('click', function () {
        if (mapSelectionModeRef.current) {
          toggleSelectSuggestionRef.current?.(s.bedrijf.naam);
        }
      });

      bolletje.addTo(markersLayerRef.current!);
      if (si >= MAX_HOVER_ZOOM_MARKERS) { bounds.push([s.coords.lat, s.coords.lng]); return; }
      // Zelfde hover-gedrag als de bolletjes op de Kaart-tab: even iets groter en geleidelijk
      // inzoomen zolang de muis erop blijft staan.
      attachHoverZoom(bolletje, map,
        () => bolletje.setRadius(isSelected ? suggestionRadius + 5 : suggestionRadius + 3),
        () => bolletje.setRadius(isSelected ? suggestionRadius + 3 : suggestionRadius),
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
  }, [startCoords, startLabel, chain, suggestions, destCoords, destLabel, routeLine, mapGeneration, selectedSuggestionNames]);

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
  // staan — bijv. via de "opnieuw via GPS"-knop hieronder, zodra het startpunt al gezet is. Reset
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

  // Bekende plaatsnamen — een woord dat zelf een plaats is (bijv. "Rotterdam", "Eindhoven") mag
  // NOOIT als bedrijfsnaam-treffer tellen. Zonder dit "won" een kale plaatsnaam-zoekopdracht
  // altijd van het echte stadscentrum zodra een willekeurig bedrijf toevallig op die plaats
  // eindigt (heel gangbaar in deze data, bijv. "BA Architecten Eindhoven"), en werd bijv. "Eindhoven"
  // intypen ineens "BA Architecten Eindhoven" als startpunt i.p.v. het centrum van Eindhoven
  // zoals Google Maps dat ook zou pakken.
  const knownCityWords = React.useMemo(() => {
    const set = new Set<string>();
    Object.keys(cityCoords).forEach(k => set.add(k.toLowerCase()));
    return set;
  }, [cityCoords]);

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
      const naamWords = naam.split(/[\s\-\/&,.()+]+/).filter(Boolean);
      const stad = (b.stad || '').toLowerCase();
      let score = 0;
      let naamHits = 0;
      for (const w of qWords) {
        // Een plaatsnaam-woord telt nooit als naam-treffer (zie toelichting hierboven) — alleen
        // via het stad-veld. En i.p.v. een kale substring (die "oma" ook in "Glomad" of
        // "Nomadic" liet matchen) vereisen we een woordgrens-match: het hele woord, of het begin
        // ervan; alleen langere termen (5+) mogen ook los als substring matchen.
        const isCityWord = knownCityWords.has(w);
        const naamWordMatch = !isCityWord && (
          naamWords.some(nw => nw === w || nw.startsWith(w)) || (w.length >= 5 && naam.includes(w))
        );
        if (naamWordMatch) { score += 2; naamHits++; }
        else if (stad.includes(w)) score += 1;
      }
      // Een kale plaatsnaam (bijv. "Eindhoven") mag nooit een bedrijf triggeren puur omdat het
      // daar toevallig gevestigd is — dat pakte willekeurig het eerst gevonden bedrijf in die
      // stad i.p.v. het centrum van de stad zelf. Vereist daarom minstens één woord dat ook
      // echt in de BEDRIJFSNAAM matcht (zoals bij "OMA Rotterdam" — "OMA" raakt de naam,
      // "Rotterdam" de plaats). Zonder naam-hit valt dit terug op geocoderen van de plaatsnaam.
      if (naamHits === 0) continue;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return bestScore >= qWords.length ? best : null;
  };

  const searchStart = async () => {
    const q = startQuery.trim();
    if (!q) return;
    setStartError(null);
    setStartLoading(true);
    // Eerst proberen als bedrijfsnaam (evt. met plaats erachter, bijv. "OMA Rotterdam") in de
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

  // Tussenstop op plaatsnaam (bijv. "Apeldoorn" tussen Nijmegen en Deventer) i.p.v. alleen een
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

  const insertCandidates = insertQuery.trim().length >= 2
    ? allData
        .filter((b: any) => {
          const naam = (b.naam || '').toLowerCase();
          if (!naam || chain.some(s => s.bedrijf.naam === b.naam)) return false;
          return `${naam} ${(b.stad || '').toLowerCase()}`.includes(insertQuery.toLowerCase());
        })
        .slice(0, 8)
    : [];

  const insertPosition = (after: number | 'start') => after === 'start' ? 0 : after + 1;

  const closeInsertPanel = () => {
    setInsertAfterIndex(null);
    setInsertQuery('');
    setInsertError(null);
  };

  const insertStopAt = (after: number | 'start', bedrijf: any, coords: Coords) => {
    const pos = insertPosition(after);
    const id = `${bedrijf.naam || 'tussenstop'}_${Date.now()}_${Math.random()}`;
    setChain(prev => {
      const next = [...prev.slice(0, pos), { id, bedrijf, coords, km: 0 }, ...prev.slice(pos)];
      return recomputeKm(next);
    });
    closeInsertPanel();
  };

  const insertManualAt = (after: number | 'start', b: any) => {
    const coords = coordsFor(b, cityCoords);
    if (!coords) return;
    insertStopAt(after, b, coords);
  };

  const insertPlaceWaypointAt = async (after: number | 'start', q: string) => {
    const query = q.trim();
    if (!query) return;
    setInsertError(null);
    setInsertLoading(true);
    const coords = await geocodeAddress(query);
    setInsertLoading(false);
    if (!coords) {
      setInsertError(`"${query}" niet gevonden als bedrijf of plaats.`);
      return;
    }
    insertStopAt(after, { naam: query, stad: '', straat: '', postcode: '', isWaypoint: true }, coords);
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

  // Google Maps-route in de juiste, betrouwbare volgorde: startpunt -> tussenstops -> eindadres.
  // met naam + adres per stop (niet alleen coördinaten), in het officiële ?api=1-formaat.
  // Google Maps laat maar ~10 punten toe in één route (origin + max 9 stops). Bij een langere
  // route splitsen we 'm daarom in opeenvolgende blokken van elk max 10 punten: blok 2 begint
  // bij de laatste stop van blok 1, enzovoort — zo blijft de hele rit dekkend, alleen in
  // meerdere te-openen Google Maps-links i.p.v. één die stops laat vallen.
  const MAPS_CHUNK = 9; // + startpunt = 10 punten per link
  const mapsUrls: string[] = (() => {
    if (!startCoords || (chain.length === 0 && !destCoords)) return [];
    const encBedrijf = (b: any, coords?: Coords) => {
      const label = [b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', ').trim();
      if (label) return encodeURIComponent(label);
      return coords ? `${coords.lat},${coords.lng}` : '';
    };
    const finalStop = destCoords
      ? { id: 'bestemming', bedrijf: { naam: destLabel || 'Bestemming', isWaypoint: true }, coords: destCoords, km: 0 }
      : null;
    const routeStops = finalStop ? [...chain, finalStop] : chain;
    const urls: string[] = [];
    for (let i = 0; i < routeStops.length; i += MAPS_CHUNK) {
      const group = routeStops.slice(i, i + MAPS_CHUNK);
      const origin = i === 0
        ? (startLabel ? encodeURIComponent(startLabel) : `${startCoords.lat},${startCoords.lng}`)
        : encBedrijf(routeStops[i - 1].bedrijf, routeStops[i - 1].coords);
      const destinationStop = group[group.length - 1];
      const destination = encBedrijf(destinationStop.bedrijf, destinationStop.coords);
      const waypoints = group.slice(0, -1).map(s => encBedrijf(s.bedrijf, s.coords)).join('|');
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

  const renderInsertPanel = (after: number | 'start', label: string) => {
    if (insertAfterIndex !== after) return null;
    return (
      <div className="ml-7 my-1.5 border border-[#E85E26]/40 bg-orange-50/40 rounded-sm p-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tussenstop invoegen {label}</span>
          <button onClick={closeInsertPanel} className="text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="relative">
          <input
            type="text"
            value={insertQuery}
            onChange={e => { setInsertQuery(e.target.value); setInsertError(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && insertQuery.trim().length >= 2) {
                insertCandidates.length > 0 ? insertManualAt(after, insertCandidates[0]) : insertPlaceWaypointAt(after, insertQuery);
              }
            }}
            autoFocus
            placeholder="Bedrijf of plaatsnaam..."
            className="w-full border border-slate-200 rounded-sm pl-2.5 pr-8 py-1.5 text-xs focus:outline-none focus:border-[#E85E26] bg-white"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <VoiceInputButton onResult={(text) => { setInsertQuery(text); setInsertError(null); }} />
          </div>
        </div>
        {insertError && <p className="mt-1 text-[10px] text-red-500">{insertError}</p>}
        {insertQuery.trim().length >= 2 && (
          <div className="mt-1 border border-slate-200 rounded-sm divide-y divide-slate-100 max-h-44 overflow-y-auto bg-white">
            <button
              onClick={() => insertPlaceWaypointAt(after, insertQuery)}
              disabled={insertLoading}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-[#E85E26] hover:bg-[#E85E26]/5 flex items-center gap-2 disabled:opacity-50"
            >
              {insertLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : <MapPin className="w-3.5 h-3.5 flex-shrink-0" />}
              "{insertQuery.trim()}" als tussenstop (plaats)
            </button>
            {insertCandidates.map((b: any, i: number) => (
              <button key={i} onClick={() => insertManualAt(after, b)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-[#009FE3]/5 flex items-center gap-2">
                <Plus className="w-3 h-3 text-slate-400 flex-shrink-0" />
                {b.naam}{b.stad ? `, ${b.stad}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const destinationRow = destCoords ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-5 h-5 rounded-full bg-[#16A34A] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">B</span>
      <span className="text-slate-700 font-medium truncate flex-1">
        <span className="text-[10px] text-slate-400 mr-1">eindadres</span>{destLabel || 'Bestemming'}
      </span>
      <button onClick={swapVanNaar} disabled={chain.length > 0} title={chain.length > 0 ? 'Omdraaien kan alleen vóór je stops toevoegt' : 'Van ↔ Naar omdraaien (heen ↔ terug)'} className="text-slate-400 hover:text-[#009FE3] disabled:opacity-30 flex-shrink-0"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
      <button onClick={clearDestination} title="Bestemming wissen" className="text-slate-400 hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : null;

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
            <p className="text-xs text-slate-400">Stel een efficiënte bezoekroute samen</p>
          </div>
        </div>
        )}

        {/* Kaart: ALTIJD renderen, niet in een ternary-branch — anders wordt de div pas
            gerenderd zodra startCoords ingesteld is, en faalt de mapInit useEffect stil
            omdat mapDivRef.current undefined is. In fullscreen wordt de wrapper een vaste
            overlay over het hele scherm (zelfde idee als de Route Kaart bij Lijsten).
            `isolate` is ESSENTIEEL hier: Leaflet's eigen panes zetten intern z-index-waarden
            tot 700 (ver boven onze modals' z-50), en zonder een eigen stacking-context op deze
            wrapper "lekten" die door naar de rest van de pagina — de kaart tekende zich dan
            bovenop/dwars door de Instellingen-modal heen zodra die open stond terwijl Onderweg
            nog in de achtergrond gerenderd was. */}
        <div className={isFullscreen ? 'fixed inset-0 z-[9999] bg-white flex flex-col' : 'relative isolate border-b border-slate-100'}>
          <div ref={mapDivRef} className={isFullscreen ? 'flex-1 w-full bg-slate-200' : 'w-full h-72 sm:h-80 bg-slate-200'} />
          
          {/* Selecteren-knop op de kaart in Mijn Bezoeken (top-2 left-2) */}
          <div className="absolute top-2 left-2 z-[1000] flex items-center gap-2 max-w-[calc(100%-4rem)]">
            <button
              onClick={() => { setMapSelectionMode(v => !v); if (mapSelectionMode) deselectAllPageSuggestions(); }}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-wider shadow-sm border transition-colors ${mapSelectionMode ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]'}`}
            >
              <Check className="w-3.5 h-3.5" /> {mapSelectionMode ? 'Selecteren aan' : 'Selecteren'}
            </button>
            {mapSelectionMode && (
              <span className="text-[10px] text-slate-500 bg-white/95 px-2 py-1 rounded-sm shadow-sm truncate hidden sm:inline">
                Tik bolletjes op de kaart aan om te selecteren
              </span>
            )}
          </div>

          {/* Drijvende actiebalk voor geselecteerde items op de kaart */}
          {selectedSuggestionNames.size > 0 && (
            <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-[#E85E26] p-2 sm:px-3 sm:py-2 rounded-lg shadow-lg max-w-[calc(100%-2rem)]">
              <span className="text-xs font-bold text-slate-800 flex-shrink-0">{selectedSuggestionNames.size} geselecteerd</span>
              <button
                onClick={advanceSelected}
                className="px-3 py-1.5 bg-[#E85E26] hover:bg-[#d14d1b] text-white text-xs font-bold uppercase tracking-wider rounded-md flex items-center gap-1 shadow-sm transition-colors flex-shrink-0"
              >
                <Check className="w-3.5 h-3.5" /> Toevoegen aan bezoeken
              </button>
              <button
                onClick={deselectAllPageSuggestions}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 p-1 flex-shrink-0"
                title="Selectie wis"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {alertMessage && (
            <div className="absolute top-12 left-2 z-[1000] bg-white/95 border border-emerald-200 shadow-lg rounded-sm px-3 py-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-sm bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-xs font-bold text-slate-800">{alertMessage}</span>
            </div>
          )}
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
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={startQuery}
                    onChange={e => { setStartQuery(e.target.value); setStartError(null); }}
                    onKeyDown={e => e.key === 'Enter' && searchStart()}
                    placeholder="Bijv. Rotterdam, of OMA Rotterdam"
                    autoFocus
                    className="w-full border border-slate-200 rounded-sm pl-3 pr-9 py-2.5 text-sm focus:outline-none focus:border-[#009FE3]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => { setStartQuery(text); setStartError(null); }} />
                  </div>
                </div>
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
            <p className="text-sm font-bold text-slate-800">Rit afgerond. {chain.length} bezoek{chain.length !== 1 ? 'en' : ''} geregistreerd{saveListName.trim() ? ` en opgeslagen als lijst "${saveListName.trim()}"` : ''}.</p>
            <button onClick={resetRide} className="text-xs font-bold uppercase tracking-wider text-[#009FE3] hover:underline">Nieuwe route starten</button>
          </div>
        ) : (
          <>
            {/* Huidige route */}
            <div className="px-6 pt-5 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route tot nu toe</span>
                <div className="flex items-center gap-2">
                  {chain.length >= 3 && (
                    <button onClick={optimizeChain} title="Optimaliseer de route op kortste afstand" className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] hover:underline flex items-center gap-1">
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
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={editStartQuery}
                          onChange={e => { setEditStartQuery(e.target.value); setStartError(null); }}
                          onKeyDown={e => e.key === 'Enter' && updateStartAddress(editStartQuery)}
                          placeholder="Exact adres, bijv. Lansinkesweg 4 Hengelo"
                          autoFocus
                          className="w-full border border-slate-200 rounded-sm pl-2 pr-8 py-1 text-xs focus:outline-none focus:border-[#009FE3]"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <VoiceInputButton onResult={(text) => { setEditStartQuery(text); setStartError(null); }} />
                        </div>
                      </div>
                      <button onClick={() => updateStartAddress(editStartQuery)} disabled={startLoading || !editStartQuery.trim()} className="px-2 bg-[#009FE3] disabled:opacity-50 text-white rounded-sm flex-shrink-0">
                        {startLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { setEditStart(false); setEditStartQuery(''); }} className="px-1.5 text-slate-400 hover:text-slate-700 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={openStartEditor}
                        title="Startlocatie aanpassen"
                        className="text-left text-slate-700 font-medium truncate flex-1 hover:text-[#009FE3]"
                      >
                        {startLabel || 'Startpunt'}
                      </button>
                      {/* Opnieuw via GPS: nodig zodra het startpunt al gezet is (bijv. een minder
                          precieze via-IP locatie) — zonder deze knop was er geen manier meer om
                          een verse GPS-poging te doen, alleen handmatig een adres typen. */}
                      <button onClick={useMyLocation} disabled={startLoading} title="Opnieuw via GPS" className="text-slate-400 hover:text-[#E85E26] disabled:opacity-50 flex-shrink-0">
                        {startLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={openStartEditor} title="Startlocatie aanpassen (exact adres)" className="text-slate-400 hover:text-[#009FE3] flex-shrink-0"><MapPin className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
                <div className="ml-7 flex items-center">
                  <button
                    onClick={() => { setInsertAfterIndex(insertAfterIndex === 'start' ? null : 'start'); setInsertQuery(''); setInsertError(null); }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#E85E26] border border-[#E85E26]/30 rounded-sm hover:bg-[#E85E26]/5"
                  >
                    <Plus className="w-3 h-3" /> {destCoords ? `Tussenstop richting ${destLabel || 'eindadres'}` : 'Tussenstop na start'}
                  </button>
                </div>
                {renderInsertPanel('start', destCoords ? `richting ${destLabel || 'eindadres'}` : 'na start')}

                {/* Naar (bestemming) — zet de Van→Naar-richtingmodus aan: dan tonen we alleen
                    bedrijven die op de gereden route liggen, in rijvolgorde. Geen straal, geen
                    sliders — gewoon "waar rij ik naartoe". */}
                {!destCoords && (
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        value={destQuery}
                        onChange={e => { setDestQuery(e.target.value); setDestError(null); }}
                        onKeyDown={e => e.key === 'Enter' && applyDestination(destQuery)}
                        placeholder="Naar... (plaats of adres, bijv. Amsterdam)"
                        className="w-full border border-slate-200 rounded-sm pl-2 pr-8 py-1 text-xs focus:outline-none focus:border-[#009FE3]"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2">
                        <VoiceInputButton onResult={(text) => { setDestQuery(text); setDestError(null); }} />
                      </div>
                    </div>
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
                    <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full bg-[#E85E26] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span className="text-slate-800 font-medium truncate flex-1">{s.bedrijf.naam}</span>
                    {typeof (s as any).km === 'number' && !isNaN((s as any).km) && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0 hidden sm:inline">{(s as any).km.toFixed(1)} km</span>
                    )}
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
                  <div className="ml-7 flex items-center">
                    <button
                      onClick={() => { setInsertAfterIndex(insertAfterIndex === i ? null : i); setInsertQuery(''); setInsertError(null); }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#E85E26] border border-[#E85E26]/30 rounded-sm hover:bg-[#E85E26]/5"
                    >
                      <Plus className="w-3 h-3" /> Tussenstop na deze stop
                    </button>
                  </div>
                  {renderInsertPanel(i, `na "${s.bedrijf.naam}"`)}
                  </React.Fragment>
                ))}
                {destinationRow}
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
                  <p className="text-[10px] text-slate-400">Google Maps kan max. 10 punten per route aan - deze rit is daarom gesplitst in {mapsUrls.length} delen, elk aansluitend op het vorige:</p>
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
              {/* Discipline- en bronpillen staan standaard ingeklapt achter deze knop — als vaste
                  rijen namen ze altijd ruimte in, ook ongebruikt, en dat is precies de ruis die op
                  telefoon het meest stoort. Badge toont hoeveel er actief staan. */}
              <button
                onClick={() => setShowTypeSourceFilters(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 border border-slate-200 rounded-sm hover:border-[#009FE3] hover:text-[#009FE3] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5" /> Filters
                  {(filterTypes.size + activeSourceFilterCount) > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#E85E26] text-white rounded-full text-[10px]">{filterTypes.size + activeSourceFilterCount}</span>
                  )}
                </span>
                <ChevronDown className="w-3.5 h-3.5" style={{ transform: showTypeSourceFilters ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {showTypeSourceFilters && (
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
              )}
              {/* Zoekstraal - zelfde sleepbare "Straal"-slider als Live Zoeken, van 5 tot 400 km
                  (Nederland is hemelsbreed maximaal ~330 km van hoek tot hoek — bijv. Zeeuws-
                  Vlaanderen tot Groningen — dus 400 km dekt echt "heel Nederland", vanaf ELK
                  startpunt, niet alleen vanuit het midden van het land).
                  Bepaalt hoeveel bedrijven er in de resultaten/paginering hieronder komen. In de
                  Van→Naar-richtingmodus is straal niet relevant (dan geldt de route zelf), dus
                  verbergen we 'm dan volledig. */}
              {!destCoords && (
                <div className="flex items-center gap-3 flex-wrap bg-slate-50 border border-slate-200 rounded-sm px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-shrink-0">Straal</span>
                  <input
                    type="range"
                    min={5}
                    max={400}
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
              {showTypeSourceFilters && availableSources.length > 1 && (() => {
                // Tel per bron hoeveel bedrijven er in allData zitten
                // Gebruik normalizeSource zodat Onbekend + Bedrijvenoverzicht bij Web worden opgeteld.
                const sourceCounts: Record<string, number> = {};
                for (const b of allData) {
                  const key = normalizeSource(b.source);
                  sourceCounts[key] = (sourceCounts[key] || 0) + 1;
                }
                // Sorteer op count descending
                const sortedSources = [...availableSources].sort(
                  (a, b) => (sourceCounts[b] || 0) - (sourceCounts[a] || 0)
                );
                // Checkbox-semantiek: aangevinkt = zichtbaar. Geen enkele bron aangevinkt
                // betekent dus ook echt nul bedrijven; alle bronnen aangevinkt toont alles.
                const allSelected = availableSources.length > 0 && availableSources.every(src => filterSources.has(src));
                return (
                  <div className="space-y-0 border border-slate-100 rounded-sm overflow-hidden">
                    {/* Header rij: BRON + SELECTEER/DESELECTEER ALLES */}
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bron</span>
                      <button
                        onClick={() => {
                          if (allSelected) {
                            setFilterSources(new Set());
                          } else {
                            setFilterSources(new Set(availableSources));
                          }
                        }}
                        className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] hover:underline"
                      >
                        {allSelected ? 'Deselecteer alles' : 'Selecteer alles'}
                      </button>
                    </div>
                    {/* Rijen per bron */}
                    {sortedSources.map(src => {
                      const checked = filterSources.has(src);
                      const color = sourceColor(src);
                      const count = sourceCounts[src] || 0;
                      return (
                        <button
                          key={src}
                          onClick={() => setFilterSources(prev => {
                            const next = new Set(prev);
                            if (next.has(src)) next.delete(src); else next.add(src);
                            return next;
                          })}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors text-left"
                        >
                          {/* Checkbox */}
                          <span
                            className="w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center"
                            style={{
                              borderColor: checked ? color : '#cbd5e1',
                              backgroundColor: checked ? color : '#fff',
                            }}
                          >
                            {checked && (
                              <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          {/* Gekleurde dot */}
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          {/* Naam */}
                          <span className="flex-1 text-xs font-medium text-slate-700 truncate">
                            {sourceLabel(src)}
                          </span>
                          {/* Count */}
                          <span className="text-[11px] text-slate-400 font-normal flex-shrink-0">
                            {count.toLocaleString('nl')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {/* Ook "Alleen nog niet bezocht", Sorteer, Per pagina en Toon alles zijn filter-/
                  weergave-instellingen — vallen daarom onder dezelfde inklapbare Filters-knop
                  i.p.v. altijd zichtbaar te zijn, voor minder ruis op telefoon. */}
              {showTypeSourceFilters && (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={onlyUnvisited} onChange={e => setOnlyUnvisited(e.target.checked)} className="accent-[#E85E26]" />
                  Alleen nog niet bezocht
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Sorteer:</span>
                    {/* In routemodus betekent "Dichtstbij" → op de route (minimale omweg, in
                        rijrichting); daarom tonen we dan het duidelijkere label "Op route". */}
                    {([['afstand', destCoords ? 'Op route' : 'Dichtstbij'], ['az', 'A-Z']] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${sortMode === mode ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* "Toon alles": overslaat de paginering (10/20-per-keer doorklikken) en toont
                      in één keer alle bedrijven binnen bereik/route. Verbergt daarom de "Per
                      pagina"-keuze, want die is dan niet relevant. */}
                  {!showAllSuggestions && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-400">Per pagina:</span>
                      {[10, 20, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => setSuggestCount(n)}
                          className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${suggestCount === n ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowAllSuggestions(v => !v)}
                    title={showAllSuggestions ? 'Terug naar per pagina bekijken' : `Alle ${suggestTotal || ''} bedrijven in één keer tonen (geen doorklikken)`}
                    className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${showAllSuggestions ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#E85E26]'}`}
                  >
                    {showAllSuggestions ? `Toon alles aan (${suggestTotal})` : 'Toon alles'}
                  </button>
                </div>
              </div>
              )}
            </div>

            {/* Voorstellen: gepagineerd door ALLE bedrijven binnen bereik (net als Live Zoeken),
                op afstand gesorteerd — niet meer afgekapt tot alleen de eerste N. */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {destCoords
                    ? `Beste op route vanaf ${chain.length > 0 ? chain[chain.length - 1].bedrijf.naam : (startLabel || 'startpunt')} richting ${destLabel || 'eindadres'}`
                    : `Dichtstbijzijnde vanaf ${chain.length > 0 ? chain[chain.length - 1].bedrijf.naam : (startLabel || 'startpunt')}`}
                  {suggestTotal > 0 && <span className="normal-case font-normal text-slate-400"> ({suggestTotal} binnen bereik)</span>}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {loadingSuggestions && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
                  
                  {/* Meervoudige selectie knoppen */}
                  {selectedSuggestionNames.size > 0 && (
                    <button
                      onClick={advanceSelected}
                      className="px-2.5 py-1 bg-[#E85E26] hover:bg-[#d14d1b] text-white text-[11px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Geselecteerde toevoegen ({selectedSuggestionNames.size})
                    </button>
                  )}

                  {suggestions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectedSuggestionNames.size === suggestions.length ? deselectAllPageSuggestions : selectAllPageSuggestions}
                        className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-[#009FE3] hover:underline"
                      >
                        {selectedSuggestionNames.size === suggestions.length ? 'Alles deselecteren' : 'Pagina selecteren'}
                      </button>
                      <button
                        onClick={advanceAll}
                        title={showAllSuggestions ? 'Alle getoonde bedrijven toevoegen aan de route' : 'Alle voorstellen op deze pagina toevoegen aan de route'}
                        className="text-[10px] font-bold uppercase tracking-wider text-green-600 hover:text-green-700 hover:underline flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> {showAllSuggestions ? 'Alles toevoegen' : 'Pagina toevoegen'} ({suggestions.length})
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {suggestions.length === 0 && !loadingSuggestions && (
                <p className="text-xs text-slate-400 py-4 text-center">Geen bedrijven gevonden binnen bereik met deze filters.</p>
              )}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {suggestions.map((s, i) => {
                  const isSelected = selectedSuggestionNames.has(s.bedrijf.naam);
                  return (
                    <div key={i} className={`flex items-center gap-2 p-2.5 border rounded-sm transition-colors ${isSelected ? 'bg-[#009FE3]/5 border-[#009FE3]' : 'border-slate-100 hover:border-[#009FE3]/40'}`}>
                      {/* Vinkje voor meervoudige selectie */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectSuggestion(s.bedrijf.naam)}
                        className="w-4 h-4 accent-[#009FE3] cursor-pointer flex-shrink-0"
                        title="Selecteer voor meervoudige toevoeging"
                      />
                      {/* Klik op naam = open dit bedrijf in Live Zoeken */}
                      <button onClick={() => onOpenInLiveZoeken?.(s.bedrijf.naam)} title="Open in Live Zoeken" className="flex-1 min-w-0 text-left flex items-center gap-1.5">
                        <Search className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        <span className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{s.bedrijf.naam}</p>
                          <p className="text-[10px] text-slate-400">{s.bedrijf.stad}{typeof s.km === 'number' && !isNaN(s.km) ? ` · ${s.km.toFixed(1)} km${s.driving ? ' rijden' : ' (hemelsbreed)'}` : ''}</p>
                        </span>
                      </button>
                      <button onClick={() => advanceTo(s)} title="1-Klik toevoegen als volgende stop" className="p-1.5 rounded-full text-green-600 hover:bg-green-50 flex-shrink-0"><Check className="w-4 h-4" /></button>
                      <button onClick={() => dismissSuggestion(s.bedrijf)} title="Overslaan" className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
              {!showAllSuggestions && suggestTotal > suggestCount && (() => {
                const totalSuggestPages = Math.max(1, Math.ceil(suggestTotal / suggestCount));
                return (
                  <div className="flex items-center justify-center gap-3 mt-2 pt-2 border-t border-slate-100">
                    <button onClick={() => goToSuggestPage(suggestPage - 1)} disabled={suggestPage <= 1} className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] disabled:opacity-30 disabled:text-slate-400 hover:underline">Vorige</button>
                    <span className="text-[10px] text-slate-400">Pagina {suggestPage} van {totalSuggestPages}</span>
                    <button onClick={() => goToSuggestPage(suggestPage + 1)} disabled={suggestPage >= totalSuggestPages} className="text-[10px] font-bold uppercase tracking-wider text-[#009FE3] disabled:opacity-30 disabled:text-slate-400 hover:underline">Volgende</button>
                    {/* Direct naar een paginanummer springen (bijv. "12"), zelfde patroon als de
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
                  plaatsnaam (bijv. "Apeldoorn" tussen Nijmegen en Deventer). De plaats-optie
                  staat ALTIJD bovenaan zodra je iets typt — ook als er bedrijven in die plaats
                  bestaan — anders kon je een plaats waar toevallig bedrijven zitten nooit als
                  losse tussenstop kiezen. */}
              <div className="mt-3">
                <div className="relative">
                  <input
                    type="text"
                    value={manualQuery}
                    onChange={e => { setManualQuery(e.target.value); setManualError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter' && manualCandidates.length === 0 && manualQuery.trim().length >= 2) addPlaceWaypoint(manualQuery); }}
                    placeholder="Zoek bedrijf, of typ een plaatsnaam als tussenstop..."
                    className="w-full border border-slate-200 rounded-sm pl-3 pr-9 py-2 text-xs focus:outline-none focus:border-[#009FE3]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => { setManualQuery(text); setManualError(null); }} />
                  </div>
                </div>
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
                <div className="relative">
                  <input
                    type="text"
                    value={saveListName}
                    onChange={e => setSaveListName(e.target.value)}
                    placeholder="Lijstnaam voor deze route (optioneel)"
                    className="w-full border border-slate-200 rounded-sm pl-3 pr-9 py-2 text-xs focus:outline-none focus:border-[#009FE3]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={setSaveListName} />
                  </div>
                </div>
                {onSaveRoute && (
                  <button
                    onClick={() => {
                      const name = saveListName.trim() || `Route ${new Date().toLocaleDateString('nl-NL')}`;
                      onSaveRoute({
                        name,
                        stops: chain.map(s => `${s.bedrijf.naam}|${s.bedrijf.stad || ''}|${s.coords.lat}|${s.coords.lng}`),
                        savedAt: new Date().toISOString(),
                      });
                    }}
                    className="w-full py-3 bg-[#009FE3] hover:bg-[#008ac5] text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" /> Route opslaan
                  </button>
                )}
                <button
                  onClick={finishRide}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Bezoeken registreren ({chain.length})
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
