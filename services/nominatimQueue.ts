// Eén gedeelde, sequentiële wachtrij voor ALLE Nominatim-aanroepen in de app (Routekaart-
// stops, achtergrond-verfijning van de hoofdkaart, adresverificatie, etc.). Nominatim staat
// maar ~1 verzoek/seconde toe; zonder deze gedeelde wachtrij verstuurden losse features
// (bv. de Routekaart en de achtergrond-geocoder) tegelijk verzoeken, wat elkaar liet
// mislukken — precies het "0 op kaart"-symptoom bij een net door de AI gemaakte route.
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function throttledFetch(q: string): Promise<[number, number] | null> {
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0) await delay(wait);
  lastRequestAt = Date.now();
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=nl&limit=1`,
      { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
    );
    const d = await r.json();
    return d?.[0] ? [parseFloat(d[0].lat), parseFloat(d[0].lon)] : null;
  } catch {
    return null;
  }
}

// Elke aanroep wacht op de vorige in de rij, ongeacht welke feature hem aanvroeg —
// zo kan er nooit meer dan één Nominatim-verzoek tegelijk onderweg zijn.
export function queuedNominatim(q: string): Promise<[number, number] | null> {
  const result = queue.then(() => throttledFetch(q));
  queue = result.catch(() => null);
  return result;
}
