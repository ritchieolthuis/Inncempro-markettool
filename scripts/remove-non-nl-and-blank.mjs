// One-time cleanup: remove records that don't belong in a NL-only bedrijvendatabase.
// Two categories, both identified while investigating the 104 "no straat/postcode" entries:
//   1. Completely blank scraper artifacts (no naam, no address at all) — not real companies.
//   2. Foreign (non-NL) firms that slipped through isNederlandBedrijf() because their
//      provincie field is empty rather than literally "belgië" (e.g. Belgian/German/Finnish
//      architecture firms referenced by the Architectenweb source).
// Run with: node scripts/remove-non-nl-and-blank.mjs
import fs from 'fs';

const DATA_PATH = new URL('../bouwgarant_data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// Explicit list of foreign-firm names identified by manual review (see
// scripts/onvolledige-adressen-104.csv) — deliberately by exact name, not a heuristic,
// so this never accidentally removes a real Dutch company.
const FOREIGN_NAMES = new Set([
  'META architectuurbureau',
  'Arkkitehtitoimisto Bas Gremmen',
  'Rapp+Rapp',
  'Supermodern',
  'Modulo Architects en KhôZé Architecture',
  'ir. Tycho Saariste',
  'Bolles+Wilson',
  'B2Ai',
  'kplus konzept GmbH',
  'H-Architects',
  'stam architecten',
  'Abscis Architecten',
  'B-architecten, B-bis & B-city',
  'Kadawittfeldarchitektur gbr',
  'Van Damme - Vandeputte architecten',
  'ARCHITENKO',
  'LH_architecten',
  'Hub cvba',
  'Riserva architecten',
  'Stone Crusher N.V.', // Caribisch adres (Kaya Industria), ten onrechte op Noord-Holland gezet
]);

const before = data.length;
const kept = data.filter((b) => {
  const naam = (b.naam || '').trim();
  if (!naam && !(b.straat || '').trim()) return false; // volledig lege rommelregel
  if (FOREIGN_NAMES.has(naam)) return false; // buitenlands bureau
  return true;
});

const removedCount = before - kept.length;
fs.writeFileSync(DATA_PATH, JSON.stringify(kept, null, 2) + '\n');
console.log(`Verwijderd: ${removedCount} (van ${before} naar ${kept.length}).`);
