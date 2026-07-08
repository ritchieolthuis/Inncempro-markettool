// Script om Inncempro geocoding cache leeg te maken
// Run in browser console of via Node.js

// Sleutels die verwijderd moeten worden
const KEYS_TO_CLEAR = [
  'inncempro_geo_cluster_cache',
  'inncempro_geo_cluster_timestamp',
  'inncempro_geo_precise_attempted',
  'inncempro_geo_cache'
];

console.log('🗑️ Inncempro geocoding cache aan het leegmaken...');

let cleared = 0;
KEYS_TO_CLEAR.forEach(key => {
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
    cleared++;
    console.log(`✓ ${key} verwijderd`);
  }
});

console.log(`\n✅ Cache geleegd! ${cleared} item(s) verwijderd.`);
console.log('\n📍 Het systeem zal nu opnieuw beginnen met nauwkeurige geocoding.');
console.log('⏳ Dit kan enkele minuten duren terwijl het achtergrond alle bedrijven geocodeerd op volledige adres.');
console.log('\n🔄 Ververs de pagina om opnieuw te laden...');

// Ververs de pagina
setTimeout(() => {
  window.location.reload();
}, 2000);
