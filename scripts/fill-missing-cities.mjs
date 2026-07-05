// One-time enrichment: fill in missing stad/postcode/provincie for entries that only
// have a street address, by geocoding via Nominatim (OpenStreetMap). Run with:
//   node scripts/fill-missing-cities.mjs
import fs from 'fs';

const DATA_PATH = new URL('../bouwgarant_data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(straat) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=nl&limit=1&q=${encodeURIComponent(straat)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Inncempro/1.0 (one-time data cleanup)' } });
  const json = await res.json();
  const hit = json?.[0];
  if (!hit?.address) return null;
  const a = hit.address;
  const stad = a.city || a.town || a.village || a.municipality || a.hamlet || '';
  return { stad, postcode: a.postcode || '', provincie: a.state || '' };
}

let fixed = 0, failed = 0;

// Speciaal geval: postcode + plaats zaten al (verkeerd) in het straat-veld zelf.
for (const b of data) {
  if (!(b.stad || '').trim() && (b.postcode || '').trim() && b.straat) {
    const m = b.straat.match(/\b\d{4}\s?[A-Z]{2}\b\s+([A-Za-zÀ-ÿ' -]+)$/);
    if (m) { b.stad = m[1].trim(); fixed++; }
  }
}

const todo = data.filter((b) => !(b.stad || '').trim() && !(b.postcode || '').trim() && (b.straat || '').trim());
console.log(`Te geocoden: ${todo.length}`);

for (let i = 0; i < todo.length; i++) {
  const b = todo[i];
  try {
    const result = await geocode(b.straat);
    if (result?.stad) {
      b.stad = result.stad;
      if (result.postcode) b.postcode = result.postcode;
      if (result.provincie) b.provincie = result.provincie;
      fixed++;
      console.log(`[${i + 1}/${todo.length}] ${b.naam} -> ${result.stad}`);
    } else {
      failed++;
      console.log(`[${i + 1}/${todo.length}] ${b.naam} -> geen resultaat (${b.straat})`);
    }
  } catch (e) {
    failed++;
    console.log(`[${i + 1}/${todo.length}] ${b.naam} -> fout: ${e.message}`);
  }
  await sleep(1100); // Nominatim usage policy: max 1 request/sec
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`Klaar. Opgelost: ${fixed}, mislukt: ${failed}.`);
