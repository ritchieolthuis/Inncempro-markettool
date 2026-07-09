// Second-opinion pass: for addresses Nominatim couldn't find (scripts/geocode-failures.log),
// try PDOK Locatieserver — the official Dutch government address database (BAG), also free,
// no API key. Useful specifically because some source cities carry a disambiguator suffix
// ("Ede Gld", "Beek Gem Montferland") that isn't PDOK/BAG's actual place name — we query by
// postcode + huisnummer first (unambiguous, ignores the suffix issue entirely) before falling
// back to the full string.
import fs from 'fs';

const DATA_PATH = new URL('../bouwgarant_data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pdokSearch(q) {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&rows=1&fq=type:adres`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const doc = json?.response?.docs?.[0];
  if (!doc?.centroide_ll) return null;
  const m = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(doc.centroide_ll);
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

async function geocode(b) {
  const straat = (b.straat || '').trim();
  const postcode = (b.postcode || '').trim().replace(/\s/g, '');
  const stad = (b.stad || '').trim();

  // Postcode + huisnummer is de meest betrouwbare BAG-lookup, ongevoelig voor rare
  // plaatsnaam-toevoegingen in de brondata.
  const huisnr = (straat.match(/\d+[a-zA-Z]?/) || [])[0];
  if (postcode && huisnr) {
    const hit = await pdokSearch(`${postcode} ${huisnr}`);
    if (hit) return hit;
    await sleep(300);
  }
  if (straat && stad) {
    const hit = await pdokSearch(`${straat}, ${stad}`);
    if (hit) return hit;
  }
  return null;
}

const failLines = fs.readFileSync(new URL('../scripts/geocode-failures.log', import.meta.url), 'utf8')
  .split('\n').filter(Boolean);

// Match failure-log entries back to actual records via naam (log format: "naam — adres").
const failedNames = new Set(failLines.map(l => l.split(' — ')[0].trim()));
const todo = data.filter(b => typeof b.lat !== 'number' && failedNames.has((b.naam || '').trim()));
console.log(`Te proberen via PDOK: ${todo.length}`);

let fixed = 0, stillFailed = 0;
for (let i = 0; i < todo.length; i++) {
  const b = todo[i];
  try {
    const hit = await geocode(b);
    if (hit) {
      b.lat = hit.lat;
      b.lng = hit.lng;
      fixed++;
      console.log(`[${i + 1}/${todo.length}] ${b.naam} (${b.straat}, ${b.stad}) -> ${hit.lat.toFixed(5)},${hit.lng.toFixed(5)} (PDOK)`);
    } else {
      stillFailed++;
      console.log(`[${i + 1}/${todo.length}] ${b.naam} (${b.straat}, ${b.stad}) -> nog steeds niet gevonden`);
    }
  } catch (e) {
    stillFailed++;
    console.log(`[${i + 1}/${todo.length}] ${b.naam} -> FOUT: ${e.message}`);
  }
  await sleep(300); // PDOK heeft geen strikte rate limit zoals Nominatim, maar toch rustig aan
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`\nKlaar. PDOK vond er nog ${fixed} van de ${todo.length}. Nog steeds onbekend: ${stillFailed}.`);
