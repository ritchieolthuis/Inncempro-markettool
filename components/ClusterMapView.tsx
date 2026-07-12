import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getClusterData, GeoEntry } from '../services/geoclusterService';
import { queuedNominatim } from '../services/nominatimQueue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, Check, ChevronDown, ChevronRight, Search, X, Navigation } from 'lucide-react';

const SRC_COLOR: Record<string, string> = {
  Bouwgarant: '#009FE3',
  Architectenweb: '#E85E26',
  Stiho: '#EA580C',
  Jongeneel: '#16A34A',
  BouwPartner: '#CA8A04',
  PontMeyer: '#DC2626',
  Bouwcenter: '#7C3AED',
  Sweco: '#059669',
  'Van Wijnen': '#0D9488',
  'Plegt-Vos': '#475569',
  'Ter Steege Groep': '#71717A',
  VolkerWessels: '#334155',
  BNA: '#52525B',
  Onbekend: '#64748B',
  Handmatig: '#9333EA',
};

interface ProvGroup {
  provincie: string;
  count: number;
  steden: { naam: string; count: number }[];
}

// A city name can collide with a province name (e.g. the village "Zeeland" inside
// Noord-Brabant vs. the province "Zeeland"), and the same city name can even appear
// under more than one province in the source data. Plain name strings are therefore
// not a safe selection key — every selectable region gets a compound key scoped to
// its province so "stad Zeeland in Noord-Brabant" can never match "provincie Zeeland".
const provKey = (provincie: string) => `P:${provincie}`;
const cityKey = (provincie: string, stad: string) => `C:${provincie}|${stad}`;

function buildLocationGroups(entries: GeoEntry[]): ProvGroup[] {
  const provMap: Record<string, Record<string, number>> = {};
  entries.forEach((e) => {
    const prov = (e.provincie || 'Onbekend').trim();
    const stad = (e.stad || 'Onbekend').trim();
    if (!provMap[prov]) provMap[prov] = {};
    provMap[prov][stad] = (provMap[prov][stad] || 0) + 1;
  });
  return Object.entries(provMap)
    .map(([provincie, steden]) => ({
      provincie,
      count: Object.values(steden).reduce((a, c) => a + c, 0),
      steden: Object.entries(steden)
        .map(([naam, count]) => ({ naam, count }))
        .sort((a, b) => b.count - a.count || a.naam.localeCompare(b.naam, 'nl')),
    }))
    .sort((a, b) => b.count - a.count || a.provincie.localeCompare(b.provincie, 'nl'));
}

function popupHtml(entry: GeoEntry): string {
  const website = entry.website ? (/^https?:\/\//i.test(entry.website) ? entry.website : `https://${entry.website}`) : '';
  const naamEsc = (entry.naam || '').replace(/'/g, "\\'");
  const mapsQuery = encodeURIComponent([entry.naam, entry.straat, entry.postcode, entry.stad].filter(Boolean).join(', '));
  return `<div style="font-family:system-ui;font-size:13px;min-width:210px">
    <b style="color:#1e293b">${entry.naam}</b><br/>
    <span style="color:#64748b;font-size:12px">${entry.straat}</span><br/>
    <span style="color:#64748b;font-size:12px">${entry.postcode} ${entry.stad}</span>
    ${entry.telefoon ? `<div style="margin-top:4px;color:#374151;font-size:12px">📞 ${entry.telefoon}</div>` : ''}
    ${entry.email ? `<div style="color:#374151;font-size:12px">✉️ ${entry.email}</div>` : ''}
    ${entry.openingstijden ? `<div style="color:#374151;font-size:11px;margin-top:2px">🕒 ${entry.openingstijden}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${website ? `<a href="${website}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Google Maps →</a>
      <button onclick="window._inncemMapNav('${naamEsc}')" style="font-size:11px;color:#1e293b;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px;border-radius:4px;cursor:pointer">Open in database →</button>
    </div>
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">${entry.source}</div>
  </div>`;
}

interface ClusterMapViewProps {
  onOpenInDatabase?: (naam: string) => void;
  focusTarget?: { naam: string; straat: string; stad: string; provincie: string } | null;
  onFocusHandled?: () => void;
}

const ClusterMapView: React.FC<ClusterMapViewProps> = ({ onOpenInDatabase, focusTarget, onFocusHandled }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersBuiltRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [allEntries, setAllEntries] = useState<GeoEntry[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [expandedProvincies, setExpandedProvincies] = useState<Set<string>>(new Set());
  const [citySearch, setCitySearch] = useState('');
  // Op mobiel staat kaart+lijst onder elkaar i.p.v. naast elkaar (anders wordt de kaart
  // onbruikbaar smal) — de lijst is inklapbaar zodat de kaart na een keuze meer ruimte krijgt.
  const [locFilterCollapsed, setLocFilterCollapsed] = useState(true);

  // Mijn Locatie state (zoeken in steden)
  const [myLocAddr, setMyLocAddr] = useState('');

  // Expose the "open in database" callback to the plain-HTML Leaflet popups
  useEffect(() => {
    (window as any)._inncemMapNav = (naam: string) => onOpenInDatabase?.(naam);
    return () => { delete (window as any)._inncemMapNav; };
  }, [onOpenInDatabase]);

  // Poll the (already background-preloading) geo cache continuously to pick up
  // precise geocoding updates from background refinement. Poll for a longer window
  // since Nominatim rate-limiting means background geocoding can take many minutes.
  useEffect(() => {
    let cancelled = false;
    let previousCoordChecksum = '';
    let stableTicks = 0;
    let totalTicks = 0;

    const tick = () => {
      if (cancelled) return;
      const data = getClusterData();
      const entries = data ? Array.from(data.values()).filter(e => !!e.coords) : [];

      if (entries.length > 0) {
        // Checksum coords to detect actual changes, not just size changes
        const coordSum = entries.map(e => `${e.id}:${e.coords?.[0]},${e.coords?.[1]}`).join('|');
        if (coordSum !== previousCoordChecksum) {
          setAllEntries(entries);
          setLoading(false);
          previousCoordChecksum = coordSum;
          stableTicks = 0;
        } else {
          stableTicks++;
        }
      }

      totalTicks++;
      // Precise geocoding of ~4000 bedrijven at Nominatim's ~1 req/sec rate limit can take
      // well over an hour — poll for up to 3 hours so the map keeps picking up corrections
      // for the whole run. Stop early only once coords have been stable for 15 minutes
      // straight (300 ticks × 3s), which reliably means the background job is done (or stalled).
      if (stableTicks < 300 && totalTicks < 3600) {
        timeoutId = setTimeout(tick, 3000);
      }
    };

    let timeoutId = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, []);

  const locationGroups = useMemo(() => buildLocationGroups(allEntries), [allEntries]);

  const sourceGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    allEntries.forEach((e) => {
      const src = e.source || 'Onbekend';
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source, 'nl'));
  }, [allEntries]);

  // Hoe verder ingezoomd, hoe groter de bolletjes (makkelijker te raken op mobiel) — maar
  // begrensd tussen 3.5 en 8px radius zodat bedrijven die dicht bij elkaar zitten (bv.
  // binnenstad Amsterdam) nooit onder elkaar gaan overlappen. Zoom 13 blijft de baseline
  // radius 5, dezelfde grootte die hiervoor altijd vast stond.
  const CIRCLE_BASE_ZOOM = 13;
  const circleRadiusForZoom = (zoom: number): number => {
    const scale = 1 + (zoom - CIRCLE_BASE_ZOOM) * 0.09;
    return Math.max(3.5, Math.min(8, 5 * Math.max(0.65, Math.min(1.45, scale))));
  };

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    mapRef.current = L.map(mapContainerRef.current, { preferCanvas: true }).setView([52.1326, 5.2913], 7);
    const googleMapsApiKey = 'AIzaSyDtsaBhb-Uq3xWvqE6mnmv3sXYM3dM3TUY';
    // scale=2 vraagt Google's tile-server om dubbele pixeldichtheid op (256px logisch, 512px
    // beeldmateriaal) — zonder dit worden de standaard 256px tiles opgerekt op elk retina/
    // high-DPI scherm en oogt de kaart wazig t.o.v. Google Maps zelf.
    L.tileLayer(`https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}&scale=2&key=${googleMapsApiKey}`, {
      attribution: '© Google Maps',
      maxZoom: 20,
      minZoom: 1,
      tileSize: 256,
    }).addTo(mapRef.current);
    markersLayerRef.current = L.layerGroup().addTo(mapRef.current);
    const rescaleCircles = () => {
      if (!mapRef.current || !markersLayerRef.current) return;
      const r = circleRadiusForZoom(mapRef.current.getZoom());
      markersLayerRef.current.eachLayer((layer: any) => { layer.setRadius?.(r); });
    };
    mapRef.current.on('zoomend', rescaleCircles);
    return () => { mapRef.current?.off('zoomend', rescaleCircles); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Rebuild markers whenever entries change (including when background geocoding updates coords).
  // Clears old markers and rebuilds with latest coordinates.
  useEffect(() => {
    if (!markersLayerRef.current || allEntries.length === 0) return;

    markersLayerRef.current.clearLayers();
    const startRadius = circleRadiusForZoom(mapRef.current?.getZoom() ?? CIRCLE_BASE_ZOOM);

    allEntries.forEach((entry) => {
      const color = SRC_COLOR[entry.source] || '#64748B';
      const marker = L.circleMarker(entry.coords as [number, number], {
        radius: startRadius,
        color: '#fff',
        weight: 1,
        fillColor: color,
        fillOpacity: 0,
        opacity: 0,
        // Interactive moet hier al `true` staan: Leaflet bindt click/hover-handlers alleen
        // bij het aanmaken van de laag (in onAdd), niet wanneer `options.interactive` later
        // wordt gewijzigd. Hierdoor opende geen enkele marker ooit een popup — zichtbare
        // markers waren dus wel te zien maar nooit klikbaar, dus je zag nergens een titel.
        interactive: true,
      }).bindPopup(popupHtml(entry));
      const prov = entry.provincie || 'Onbekend';
      const stad = entry.stad || 'Onbekend';
      (marker as any)._provKey = provKey(prov);
      (marker as any)._cityKey = cityKey(prov, stad);
      (marker as any)._entry = entry;
      marker.addTo(markersLayerRef.current!);
    });
  }, [allEntries]);

  // Toggle visibility + zoom-to-fit whenever the region or bron selection changes.
  // Both filters work independently: select REGION alone, BRON alone, or both.
  // - No selection: nothing visible (prompt to select)
  // - Region only: show those regions from all sources
  // - Bron only: show those sources from all regions
  // - Both: show intersection
  useEffect(() => {
    if (!markersLayerRef.current) return;
    const bounds: L.LatLngExpression[] = [];

    // Geen regio's EN geen bronnen geselecteerd = niets tonen (zie de "Selecteer een
    // regio..." prompt hieronder). Zonder deze guard betekent selectedRegions.size===0
    // hieronder per ongeluk "alle regio's matchen" — dus deselecteren van de laatste regio
    // liet alsnog alle ~4000 bedrijven zien in plaats van weer niets.
    const noSelection = selectedRegions.size === 0 && selectedSources.size === 0;

    markersLayerRef.current.eachLayer((layer: any) => {
      const matchRegion = selectedRegions.size === 0 || selectedRegions.has(layer._provKey) || selectedRegions.has(layer._cityKey);
      const matchSource = selectedSources.size === 0 || selectedSources.has(layer._entry?.source || 'Onbekend');
      const visible = !noSelection && matchRegion && matchSource;
      layer.setStyle({ opacity: visible ? 1 : 0, fillOpacity: visible ? 0.9 : 0 });
      if (visible) bounds.push(layer.getLatLng());
    });

    if (mapRef.current) {
      if (bounds.length > 0) {
        mapRef.current.fitBounds(L.latLngBounds(bounds as any), { padding: [40, 40], maxZoom: 13 });
      } else {
        mapRef.current.setView([52.1326, 5.2913], 7);
      }
    }
    // allEntries hoort hier expliciet bij: de achtergrond-geocoding (poll elke ~3s) herbouwt
    // periodiek ALLE markers zodra er preciezere coördinaten binnenkomen (zie de vorige
    // useEffect), en die nieuwe markers starten standaard onzichtbaar. Zonder allEntries hier
    // als dependency werd de zichtbaarheid dan niet opnieuw toegepast — de bolletjes vervielen
    // na een herbouw, en pas een filter aan/uit klikken (wat selectedRegions wijzigt) herstelde
    // het toevallig weer.
  }, [selectedRegions, selectedSources, allEntries]);

  // Vanuit een bedrijfsprofiel elders in de app ("Bekijk op de KAART-tab"): selecteer
  // automatisch de bijbehorende stad (zelfde gedrag als handmatig aanvinken) en zoom
  // daarna in op dat ene bedrijf zodat het echt gepinpoint wordt — anders heeft de link
  // geen zin. Wacht (met een paar pogingen) tot de markers klaar staan.
  useEffect(() => {
    if (!focusTarget) return;
    const norm = (s: string) => (s || '').toLowerCase().trim();
    const targetNaam = norm(focusTarget.naam);
    const targetStraat = norm(focusTarget.straat);
    const targetStad = norm(focusTarget.stad);

    const prov = focusTarget.provincie || 'Onbekend';
    const stad = focusTarget.stad || 'Onbekend';
    setSelectedRegions(new Set([cityKey(prov, stad)]));

    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout>;
    const tryFocus = () => {
      attempts++;
      const match = allEntries.find(e =>
        norm(e.naam) === targetNaam &&
        (targetStraat ? norm(e.straat) === targetStraat : true) &&
        norm(e.stad) === targetStad
      );
      let targetMarker: any = null;
      if (match && markersLayerRef.current) {
        markersLayerRef.current.eachLayer((layer: any) => {
          if (layer._entry === match) targetMarker = layer;
        });
      }
      if (targetMarker) {
        // Even wachten tot de fitBounds-animatie van de stad-selectie klaar is,
        // dan pas verder inzoomen op dit specifieke bedrijf.
        timeoutId = setTimeout(() => {
          mapRef.current?.flyTo(targetMarker.getLatLng(), 15, { duration: 0.8 });
          targetMarker.openPopup();
          onFocusHandled?.();
        }, 500);
        return;
      }
      if (attempts < 10) timeoutId = setTimeout(tryFocus, 300);
    };
    tryFocus();

    return () => clearTimeout(timeoutId);
  }, [focusTarget, allEntries]);

  const toggleRegion = (name: string) => {
    setSelectedRegions(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleExpanded = (prov: string) => {
    setExpandedProvincies(prev => {
      const next = new Set(prev);
      if (next.has(prov)) next.delete(prov); else next.add(prov);
      return next;
    });
  };

  const toggleSource = (source: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source); else next.add(source);
      return next;
    });
  };

  const visibleCount = useMemo(() => {
    if (selectedRegions.size === 0 && selectedSources.size === 0) return 0;
    return allEntries.filter(e => {
      const prov = e.provincie || 'Onbekend';
      const stad = e.stad || 'Onbekend';
      const matchRegion = selectedRegions.size === 0 || selectedRegions.has(provKey(prov)) || selectedRegions.has(cityKey(prov, stad));
      const matchSource = selectedSources.size === 0 || selectedSources.has(e.source || 'Onbekend');
      return matchRegion && matchSource;
    }).length;
  }, [allEntries, selectedRegions, selectedSources]);

  const filterPanelBody = (
    <>
      <p className="text-[11px] text-slate-400 mb-3">
        {allEntries.length.toLocaleString('nl-NL')} bedrijven geladen
        {selectedRegions.size > 0 && ` · ${visibleCount.toLocaleString('nl-NL')} zichtbaar`}
      </p>

      {/* Mijn Locatie sectie - zoeken en toevoegen aan selectedRegions */}
      <div className="mb-4 pb-3 border-b border-slate-200">
        <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-2">Mijn Locatie</label>

        <div className="relative mb-2">
          <input
            type="text"
            value={myLocAddr}
            onChange={e => setMyLocAddr(e.target.value)}
            placeholder="Zoek stad of dorp..."
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-sm"
          />
        </div>

        {/* Steden checkboxes - voegen toe aan selectedRegions */}
        {(() => {
          const query = myLocAddr.toLowerCase().trim();
          const filteredCities = query.length >= 2
            ? Array.from(new Set(
                allEntries
                  .filter(e => (e.stad || '').toLowerCase().includes(query))
                  .map(e => {
                    const prov = e.provincie || 'Onbekend';
                    const stad = e.stad || 'Onbekend';
                    return cityKey(prov, stad);
                  })
              ))
            : [];

          return filteredCities.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {filteredCities.slice(0, 10).map(key => {
                const [prov, stad] = key.split('|').slice(1);
                const isSelected = selectedRegions.has(key);
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-slate-50 px-1 rounded-sm">
                    <div className={`w-3.5 h-3.5 border flex items-center justify-center rounded-sm flex-shrink-0 ${isSelected ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-200'}`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className={`text-xs flex-1 ${isSelected ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{stad}</span>
                    <span className="text-[10px] text-slate-400">{prov}</span>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={isSelected}
                      onChange={() => toggleRegion(key)}
                    />
                  </label>
                );
              })}
            </div>
          ) : query.length >= 2 ? (
            <p className="text-[10px] text-slate-400 py-2">Geen steden gevonden</p>
          ) : (
            <p className="text-[10px] text-slate-400 py-2">Type minstens 2 letters</p>
          );
        })()}
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
        <input
          type="text"
          placeholder="Zoek stad..."
          value={citySearch}
          onChange={e => setCitySearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 text-xs focus:border-[#009FE3] focus:outline-none rounded-sm"
        />
      </div>
      <button
        onClick={() => setSelectedRegions(prev => new Set([...prev, ...locationGroups.map(g => provKey(g.provincie))]))}
        className="text-[10px] font-bold text-[#009FE3] hover:underline uppercase tracking-wider mb-3"
      >
        Selecteer alle provincies
      </button>

      <div className="space-y-0.5 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
        {locationGroups.map(({ provincie, count, steden }) => {
          const filteredSteden = citySearch
            ? steden.filter(s => s.naam.toLowerCase().includes(citySearch.toLowerCase()))
            : steden;
          if (citySearch && filteredSteden.length === 0) return null;

          const isOpen = expandedProvincies.has(provincie) || !!citySearch;
          const provSelected = selectedRegions.has(provKey(provincie));

          return (
            <div key={provincie}>
              <div className="flex items-center gap-1 group">
                <div
                  onClick={() => toggleRegion(provKey(provincie))}
                  className={`w-4 h-4 border flex items-center justify-center rounded-sm flex-shrink-0 cursor-pointer ${provSelected ? 'bg-[#009FE3] border-[#009FE3]' : 'bg-white border-slate-300'}`}
                >
                  {provSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <button onClick={() => toggleExpanded(provincie)} className="flex-1 flex items-center justify-between py-1.5 px-1 text-left hover:bg-[#009FE3]/5 rounded-sm">
                  <span className={`text-xs font-bold uppercase tracking-wide ${provSelected ? 'text-[#009FE3]' : 'text-slate-700'}`}>{provincie}</span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="font-medium">{count}</span>
                    {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="ml-5 mb-1 space-y-0.5">
                  {filteredSteden.map(({ naam, count: c }) => {
                    const key = cityKey(provincie, naam);
                    const citySelected = selectedRegions.has(key);
                    return (
                      <label key={naam} onClick={() => toggleRegion(key)} className="flex items-center gap-2 cursor-pointer py-0.5 px-1 hover:bg-[#009FE3]/5 rounded-sm">
                        <div className={`w-3.5 h-3.5 border flex items-center justify-center rounded-sm flex-shrink-0 ${citySelected ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-200'}`}>
                          {citySelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={`text-xs flex-1 ${citySelected ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{naam}</span>
                        <span className="text-[10px] text-slate-300 font-medium">{c}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bron sectie — extra verfijning bovenop de regio-selectie, geen vervanging.
          Leeg (niets aangevinkt) = alle bronnen zichtbaar, net als bij Regio & Locatie. */}
      <div className="mt-4 pt-3 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Bron</label>
          <button
            onClick={() => setSelectedSources(new Set(sourceGroups.map(g => g.source)))}
            className="text-[10px] font-bold text-[#009FE3] hover:underline uppercase tracking-wider"
          >
            Selecteer alles
          </button>
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
          {sourceGroups.map(({ source, count }) => {
            const isSelected = selectedSources.has(source);
            const color = SRC_COLOR[source] || '#64748B';
            return (
              <label key={source} onClick={() => toggleSource(source)} className="flex items-center gap-2 cursor-pointer py-1 px-1 hover:bg-[#009FE3]/5 rounded-sm">
                <div
                  className={`w-3.5 h-3.5 border flex items-center justify-center rounded-sm flex-shrink-0 ${isSelected ? '' : 'bg-white border-slate-200'}`}
                  style={isSelected ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className={`text-xs flex-1 ${isSelected ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{source}</span>
                <span className="text-[10px] text-slate-300 font-medium">{count}</span>
              </label>
            );
          })}
        </div>
      </div>

      {(selectedRegions.size > 0 || selectedSources.size > 0) && (
        <button
          onClick={() => { setSelectedRegions(new Set()); setSelectedSources(new Set()); }}
          className="mt-3 w-full text-[10px] text-slate-400 hover:text-[#E85E26] font-bold uppercase tracking-wider text-center py-1 border-t border-slate-100 flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> Wis filters
        </button>
      )}
    </>
  );

  return (
    <div className="w-full h-full flex flex-col md:flex-row gap-4 bg-white">
      {/* Mobiel: knop die de Regio & Locatie-lijst als bottom-sheet opent (net als de Filters-knop elders) */}
      <button
        onClick={() => setLocFilterCollapsed(false)}
        className="md:hidden flex-shrink-0 flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600"
      >
        <MapPin className="w-3.5 h-3.5 text-[#009FE3]" /> Regio & Locatie
        {selectedRegions.size > 0 && <span className="px-1.5 py-0.5 bg-[#E85E26] text-white rounded-full text-[10px] leading-none">{visibleCount.toLocaleString('nl-NL')}</span>}
      </button>

      <div className="flex-1 flex flex-col bg-slate-50 rounded-sm border border-slate-200 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-[#009FE3] animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-600">Bedrijven laden...</p>
            </div>
          </div>
        )}
        {!loading && selectedRegions.size === 0 && selectedSources.size === 0 && (
          <div className="absolute inset-x-0 top-4 z-10 flex justify-center pointer-events-none">
            <div className="bg-white/95 border border-slate-200 rounded-sm px-4 py-2 text-xs text-slate-500 shadow-sm text-center mx-4">
              Selecteer een regio, bron, of beide om bedrijven op de kaart te zien
            </div>
          </div>
        )}
        <div ref={mapContainerRef} className="flex-1 w-full min-h-[45vh] md:min-h-0" />
      </div>

      {/* Desktop: vaste zijbalk, zoals altijd */}
      <div className="hidden md:block w-72 bg-white border border-slate-200 rounded-sm p-4 overflow-y-auto flex-shrink-0">
        <h3 className="font-bold text-sm text-slate-900 mb-1 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#009FE3]" />
          Regio & Locatie
        </h3>
        {filterPanelBody}
      </div>

      {/* Mobiel: bottom-sheet drawer, zelfde stijl als de mobiele Filters-drawer elders in de app.
          Via een portal naar document.body zodat de kaart 'm nooit kan overlappen, ongeacht
          eventuele stacking-contexts van bovenliggende elementen. */}
      {!locFilterCollapsed && createPortal(
        <div className="md:hidden fixed inset-0 z-[9999] flex items-end bg-slate-900/50 backdrop-blur-sm" onClick={() => setLocFilterCollapsed(true)}>
          <div className="bg-white w-full max-h-[85vh] rounded-t-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 flex-shrink-0" />
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest font-condensed flex items-center gap-2"><MapPin className="w-4 h-4 text-[#009FE3]" /> Regio & Locatie</h2>
              <button onClick={() => setLocFilterCollapsed(true)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-col overflow-y-auto min-h-0 p-4">
              {filterPanelBody}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ClusterMapView;
