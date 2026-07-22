import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, X, MapPin } from 'lucide-react';
import { SOURCE_COLOR, sourceLabel } from '../utils/sourceColors';

interface ProfileMiniMapProps {
  lat: number;
  lng: number;
  naam: string;
  straat?: string;
  postcode?: string;
  stad?: string;
  telefoon?: string;
  email?: string;
  website?: string;
  source?: string;
  onOpenInDatabase?: (naam: string) => void;
  onOpenInKaartTab?: () => void;
}

const ProfileMiniMap: React.FC<ProfileMiniMapProps> = ({
  lat, lng, naam, straat, postcode, stad, telefoon, email, website, source, onOpenInDatabase, onOpenInKaartTab,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fullMapRef = useRef<L.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const websiteUrl = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : '';
  const mapsQuery = encodeURIComponent([naam, straat, postcode, stad].filter(Boolean).join(', '));
  const color = SOURCE_COLOR[source || 'Web'] || '#E85E26';

  const naamEsc = (naam || '').replace(/'/g, "\\'");

  const popupContent = `<div style="font-family:system-ui;font-size:13px;min-width:210px">
    <b style="color:#1e293b">${naam}</b><br/>
    ${straat ? `<span style="color:#64748b;font-size:12px">${straat}</span><br/>` : ''}
    <span style="color:#64748b;font-size:12px">${[postcode, stad].filter(Boolean).join(' ')}</span>
    ${telefoon ? `<div style="margin-top:4px;color:#374151;font-size:12px">📞 ${telefoon}</div>` : ''}
    ${email ? `<div style="color:#374151;font-size:12px">✉️ ${email}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${websiteUrl ? `<a href="${websiteUrl}" target="_blank" rel="noopener" style="font-size:11px;color:#009FE3;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;text-decoration:none">Website →</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener" style="font-size:11px;color:#16a34a;border:1px solid #16a34a;padding:3px 8px;border-radius:4px;text-decoration:none">Google Maps →</a>
      <button onclick="window._inncemAddToOnderweg('${naamEsc}')" style="font-size:11px;color:#009FE3;background:#f0f9ff;border:1px solid #009FE3;padding:3px 8px;border-radius:4px;cursor:pointer">Toevoegen aan bezoeken →</button>
    </div>
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">${sourceLabel(source || 'Web')}</div>
  </div>`;

  // Init mini map
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    // Offset center slightly north so the popup (which renders above the marker) sits right in the vertical center of the container
    const offsetLat = lat + 0.0012;

    const map = L.map(containerRef.current, {
      center: [offsetLat, lng],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: true,
      touchZoom: true,
    });

    const googleMapsApiKey = 'AIzaSyDtsaBhb-Uq3xWvqE6mnmv3sXYM3dM3TUY';
    L.tileLayer(`https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}&scale=2&key=${googleMapsApiKey}`, {
      maxZoom: 20,
      minZoom: 1,
      tileSize: 256,
    }).addTo(map);

    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95,
      opacity: 1,
    }).addTo(map);

    marker.bindPopup(popupContent, {
      maxWidth: 300,
      minWidth: 220,
      autoPan: true,
      autoPanPaddingTopLeft: L.point(10, 40),
      autoPanPaddingBottomRight: L.point(10, 10),
    }).openPopup();

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 150);
    setTimeout(() => map.invalidateSize(), 400);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, naam, straat, postcode, stad, telefoon, email, website, source]);

  // Init full map modal when toggled
  useEffect(() => {
    if (!isFullscreen || !fullContainerRef.current) return;
    if (fullMapRef.current) { fullMapRef.current.remove(); fullMapRef.current = null; }

    const map = L.map(fullContainerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    const googleMapsApiKey = 'AIzaSyDtsaBhb-Uq3xWvqE6mnmv3sXYM3dM3TUY';
    L.tileLayer(`https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}&scale=2&key=${googleMapsApiKey}`, {
      maxZoom: 20,
      minZoom: 1,
      tileSize: 256,
    }).addTo(map);

    const marker = L.circleMarker([lat, lng], {
      radius: 9,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95,
      opacity: 1,
    }).addTo(map);

    marker.bindPopup(popupContent, { maxWidth: 320, minWidth: 240 }).openPopup();

    fullMapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      fullMapRef.current = null;
    };
  }, [isFullscreen, lat, lng, naam, straat, postcode, stad, telefoon, email, website, source]);

  return (
    <div className="relative group w-full">
      {/* Mini Map Container */}
      <div
        ref={containerRef}
        className="w-full rounded-t-md overflow-hidden bg-slate-100"
        style={{ height: 250, minHeight: 220 }}
      />

      {/* Top Right Controls Overlay: Fullscreen Toggle */}
      <div className="absolute top-2.5 right-2.5 z-[500] flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          title="Kaart in volledig scherm bekijken"
          className="bg-white/95 hover:bg-white text-slate-700 hover:text-[#009FE3] p-1.5 rounded shadow border border-slate-200 transition-all flex items-center gap-1 text-xs font-semibold px-2"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Volledig scherm</span>
        </button>
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex flex-col p-3 sm:p-6 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-2xl flex-1 flex flex-col overflow-hidden relative">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#009FE3]" />
                <h3 className="text-sm font-bold text-slate-800">{naam}</h3>
                <span className="text-xs text-slate-400">({[straat, stad].filter(Boolean).join(', ')})</span>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
                title="Sluiten"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Map Canvas */}
            <div ref={fullContainerRef} className="flex-1 w-full h-full min-h-[400px]" />

            {/* Footer actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-medium">📍 {naam} — {[straat, postcode, stad].filter(Boolean).join(', ')}</span>
              <div className="flex items-center gap-2">
                {onOpenInKaartTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsFullscreen(false);
                      onOpenInKaartTab();
                    }}
                    className="px-3 py-1.5 bg-[#009FE3] hover:bg-[#0088c8] text-white text-xs font-bold rounded shadow-sm transition-all"
                  >
                    Open op grote KAART-tab →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded"
                >
                  Sluiten
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMiniMap;
