// One-time enrichment: geocode the exact (lat, lng) for every entry that only has a
// city-level fallback today, using the free Nominatim (OpenStreetMap) service. Once this
// has run, App.tsx's getBedrijfCoords() picks these up automatically (it already prefers
// b.lat/b.lng over the crude city-center fallback) — no app code changes needed.
//
// Run with: node scripts/geocode-exact-coords.mjs
//
// Respects Nominatim's usage policy (max 1 request/sec, custom User-Agent). Saves progress
// to disk every 25 addresses, so an interruption never loses more than ~30s of work — safe
// to Ctrl+C and rerun; already-geocoded entries are skipped.
import fs from 'fs';

const DATA_PATH = new URL('../bouwgarant_data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const addrKey = (b) =>
  `${(b.straat || '').toLowerCase().trim()}|${(b.postcode || '').toLowerCase().replace(/\s/g, '')}|${(b.stad || '').toLowerCase().trim()}`;

// Nominatim's publieke server geeft af en toe (zonder duidelijke reden vooraf) 429 "Too
// many requests" terug, ook als we ons keurig aan 1 verzoek/sec houden — een zwaarder
// belaste periode op hun kant, geen fout van ons. Dat mag NOOIT als "adres niet gevonden"
// geboekt worden (dat gaf eerder een vervalste 60-80% faalpercentage in het midden van een
// run) — bij 429 wachten we langer en proberen het gewoon opnieuw, tot een paar keer.
async function geocodeOnce(q, attempt = 1) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=nl&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Inncempro/1.0 (one-time address geocoding)', 'Accept-Language': 'nl' } });
  if (res.status === 429) {
    if (attempt >= 6) throw new Error('Nominatim blijft 429 geven na 6 pogingen');
    const backoffMs = 5000 * attempt; // 5s, 10s, 15s, ... oplopend
    console.log(`  (429 ontvangen, ${backoffMs / 1000}s wachten en opnieuw proberen — poging ${attempt}/6)`);
    await sleep(backoffMs);
    return geocodeOnce(q, attempt + 1);
  }
  if (!res.ok) return null;
  const json = await res.json();
  const hit = json?.[0];
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
}

// Meest precieze query eerst; alleen als straat+postcode niets opleveren vallen we terug
// op postcode+stad. Een resultaat op alleen "stad" nemen we NIET aan — dat is niet
// preciezer dan wat er al is, en zou een verkeerd "isExact" beeld geven.
async function geocode(b) {
  const straat = (b.straat || '').trim();
  const postcode = (b.postcode || '').trim();
  const stad = (b.stad || '').trim();

  if (straat && postcode && stad) {
    const hit = await geocodeOnce(`${straat}, ${postcode} ${stad}, Nederland`);
    if (hit) return hit;
    await sleep(1500);
  }
  if (postcode && stad) {
    const hit = await geocodeOnce(`${postcode} ${stad}, Nederland`);
    if (hit) return hit;
  }
  return null;
}

const todo = data.filter((b) => typeof b.lat !== 'number' && (b.straat || '').trim() && (b.postcode || '').trim());
const skipped = data.length - todo.length;
console.log(`Totaal: ${data.length}, al precies: ${data.filter(b => typeof b.lat === 'number').length}, zonder straat/postcode (overgeslagen): ${skipped - data.filter(b => typeof b.lat === 'number').length}, te geocoden: ${todo.length}`);

// Dedupe: meerdere bronnen (Bouwgarant/Architectenweb/BNA) kunnen exact hetzelfde adres
// hebben — dan geocoden we het maar 1x en kopiëren we het resultaat naar alle duplicaten.
const groups = new Map();
for (const b of todo) {
  const key = addrKey(b);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(b);
}
const uniqueAddrs = Array.from(groups.entries());
console.log(`Unieke adressen: ${uniqueAddrs.length} (${todo.length - uniqueAddrs.length} duplicaten worden hergebruikt)`);

let fixed = 0, failed = 0;
const failedList = [];

function save() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
}

for (let i = 0; i < uniqueAddrs.length; i++) {
  const [key, group] = uniqueAddrs[i];
  const sample = group[0];
  try {
    const result = await geocode(sample);
    if (result) {
      group.forEach((b) => { b.lat = result.lat; b.lng = result.lng; });
      fixed += group.length;
      console.log(`[${i + 1}/${uniqueAddrs.length}] ${sample.naam} (${sample.straat}, ${sample.stad}) -> ${result.lat.toFixed(5)},${result.lng.toFixed(5)} (${group.length}x)`);
    } else {
      failed += group.length;
      failedList.push(`${sample.naam} — ${sample.straat}, ${sample.postcode} ${sample.stad}`);
      console.log(`[${i + 1}/${uniqueAddrs.length}] ${sample.naam} (${sample.straat}, ${sample.stad}) -> GEEN RESULTAAT`);
    }
  } catch (e) {
    failed += group.length;
    failedList.push(`${sample.naam} — ${sample.straat}, ${sample.postcode} ${sample.stad} (fout: ${e.message})`);
    console.log(`[${i + 1}/${uniqueAddrs.length}] ${sample.naam} -> FOUT: ${e.message}`);
  }

  if ((i + 1) % 25 === 0) save();
  await sleep(1500); // Nominatim usage policy: max 1 request/sec
}

save();
fs.writeFileSync(new URL('../scripts/geocode-failures.log', import.meta.url), failedList.join('\n') + '\n');
console.log(`\nKlaar. Opgelost: ${fixed} records (${uniqueAddrs.length - failedList.length} unieke adressen), mislukt: ${failed} records (${failedList.length} unieke adressen).`);
console.log(`Mislukte adressen staan in scripts/geocode-failures.log — die vallen terug op het stad-centrum, net als voorheen.`);
