// One-time enrichment: for every place (stad) that has NO provincie anywhere in the
// dataset, look up its province via Nominatim (OpenStreetMap) and backfill it for
// every row with that stad. Run with:
//   node scripts/fill-missing-provinces.mjs
import fs from 'fs';

const DATA_PATH = new URL('../bouwgarant_data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bekende Nederlandse provincies (OSM "state" gebruikt soms net andere schrijfwijzen)
const PROVINCE_FIX = {
  'noord holland': 'Noord-Holland', 'zuid holland': 'Zuid-Holland', 'noord brabant': 'Noord-Brabant',
};
function normalizeProvince(state) {
  if (!state) return '';
  const fixed = PROVINCE_FIX[state.toLowerCase()];
  return fixed || state;
}

async function geocodePlace(stad) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=nl&limit=1&q=${encodeURIComponent(stad + ', Nederland')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Inncempro/1.0 (one-time data cleanup)' } });
  const json = await res.json();
  const hit = json?.[0];
  if (!hit?.address) return null;
  return normalizeProvince(hit.address.state || '');
}

const byStad = new Map(); // stad -> { total, withProv }
data.forEach((b) => {
  const stad = (b.stad || '').trim();
  if (!stad) return;
  if (!byStad.has(stad)) byStad.set(stad, { total: 0, withProv: 0 });
  const o = byStad.get(stad);
  o.total++;
  if ((b.provincie || '').trim()) o.withProv++;
});

const todo = [...byStad.entries()].filter(([, o]) => o.withProv === 0).map(([stad]) => stad);
console.log(`Plaatsen zonder provincie waar dan ook: ${todo.length}`);

let fixed = 0, failed = 0;
for (let i = 0; i < todo.length; i++) {
  const stad = todo[i];
  try {
    const prov = await geocodePlace(stad);
    if (prov) {
      let count = 0;
      data.forEach((b) => { if ((b.stad || '').trim() === stad) { b.provincie = prov; count++; } });
      fixed++;
      console.log(`[${i + 1}/${todo.length}] ${stad} -> ${prov} (${count}x)`);
    } else {
      failed++;
      console.log(`[${i + 1}/${todo.length}] ${stad} -> geen resultaat`);
    }
  } catch (e) {
    failed++;
    console.log(`[${i + 1}/${todo.length}] ${stad} -> fout: ${e.message}`);
  }
  await sleep(1100); // Nominatim usage policy: max 1 request/sec
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`Klaar. Plaatsen opgelost: ${fixed}, mislukt: ${failed}.`);
