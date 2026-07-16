// Gedeelde deduplicatie- en NL-filterlogica, gebruikt door zowel App.tsx (Live Zoeken,
// Bedrijvendatabase, Marktoverzicht) als geoclusterService.ts (Kaart) — zodat alle
// schermen exact hetzelfde aantal bedrijven tonen. Hiervoor los getrokken uit App.tsx,
// waar 'ie oorspronkelijk stond; puur functioneel, geen component-state nodig.

// Bedrijven buiten Nederland (Caribisch deel, België, etc.) horen niet in deze tool
// — filter ze hier één keer weg, zodat álle downstream views (filters, kaarten,
// dashboard, marktoverzicht) automatisch NL-only zijn zonder aparte checks.
export function isNederlandBedrijf(b: any): boolean {
  const stad = (b.stad || '').toLowerCase().trim();
  const prov = (b.provincie || '').toLowerCase().trim();
  if (prov === 'belgië' || prov === 'belgie' || prov === 'belgium') return false;
  if (['willemstad', 'kralendijk', 'oranjestad', 'philipsburg', 'the bottom', 'sint-eustatius', 'saba'].includes(stad)) return false;
  return true;
}

// Bedrijven die UITSLUITEND interieur doen (interieurarchitecten, interior-only studio's) horen
// niet in deze tool — de doelgroep is architecten/bouwbedrijven/aannemers voor nieuwbouw,
// verbouw, renovatie etc., niet losse interieurspecialisten (bv. "OdV interieurarchitecten").
// Een bedrijf dat interieur COMBINEERT met een andere discipline (bv. "Artemis Interieur &
// Architectuur", of een aannemer die ook interieurbouw doet) blijft gewoon staan — alleen de
// bedrijven waarvan interieur de ENIGE vermelde discipline is, worden verwijderd. De naam
// "interieurarchitect(en/uur)" bevat zelf altijd de substring "architect", dus die wordt eerst
// weggeknipt voordat op een combi-woord wordt gecontroleerd — anders zou zo'n bedrijf zichzelf
// per ongeluk als "combi" laten doorgaan.
const INTERIEUR_KW = /interieur|interior/i;
const COMBI_DISCIPLINE_KW = /architect|bouwkunst|bouwkunde|stedenbouw|aannem|vastgoed|ingenieur|landschap|nieuwbouw|verbouw|renovatie|restauratie/i;
export function isPureInterieurBedrijf(b: any): boolean {
  const combined = [b.naam, b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ');
  if (!INTERIEUR_KW.test(combined)) return false;
  const rest = combined.replace(/interieur\w*|interior\w*/gi, '');
  return !COMBI_DISCIPLINE_KW.test(rest);
}

export function mergeEntries(entries: any[]): any[] {
  // Leestekens vervangen door een SPATIE, niet weglaten — anders hangt het resultaat af
  // van of de bron toevallig spaties om het leesteken had staan. "Bekhuis & KleinJan®" en
  // "Bekhuis&KleinJan" zijn overduidelijk hetzelfde bedrijf, maar werden vroeger tot
  // "bekhuis kleinjan" resp. "bekhuiskleinjan" genormaliseerd — twee verschillende keys,
  // dus nooit samengevoegd. Met een spatie i.p.v. niets normaliseren beide naar "bekhuis
  // kleinjan" en matchen ze wél.
  const normNaam = (s: string) => (s || '').toLowerCase()
    .replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Same company is often scraped a second time with a marketing tagline bolted on
  // ("&WA architecten" vs "&WA architecten - ontwerpen is luisteren") — strip anything
  // after a dash/pipe separator before comparing base names.
  const normNaamBase = (s: string) => normNaam((s || '').split(/\s[-–|]\s/)[0]);
  const normStreet = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normPc = (s: string) => (s || '').replace(/\s/g, '').toUpperCase().slice(0, 6);
  // A generic descriptor bolted onto the actual (distinctive) trade name — one source may
  // list "cepezed", another "architectenbureau cepezed" for the exact same company.
  const stripGenericPrefix = (s: string) => s.replace(/^(architectenbureau|architectenburo|architektenburo|architectuurbureau|bureau|aannemersbedrijf|aannemingsbedrijf|bouwbedrijf|bouwonderneming|bouwgroep|bouwprojekten|timmerbedrijf|klussenbedrijf|installatiebedrijf)\s+/, '');
  const coreNaam = (s: string) => stripGenericPrefix(normNaamBase(s));
  // Some scrapers bolt the vestiging's own city onto the brand name ("INBO Rotterdam"),
  // others don't ("INBO"). Stripping the entry's own city from its core name lets both
  // forms normalize to the same key so they can be recognised as the same vestiging.
  const coreNaamCityFree = (naam: string, stad: string) => {
    let n = coreNaam(naam);
    const city = (stad || '').toLowerCase().trim();
    if (!city) return n;
    if (n === city) return '';
    if (n.endsWith(' ' + city)) return n.slice(0, -(city.length + 1)).trim();
    return n;
  };

  // Union-Find: two entries belong to the same company if they share a postcode-based
  // key, a street+city-based key, or (for specific-enough names) just a name+city key —
  // an "Onbekend" scrape often has a stale/relocated address while a real bron (Bouwgarant,
  // BNA, Architectenweb) has the current one, so requiring the street to match too would
  // keep missing them.
  const parent = entries.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const byPrimaryKey = new Map<string, number[]>();
  const bySecondaryKey = new Map<string, number[]>();
  const byNameCityKey = new Map<string, number[]>();
  const byCoreCityKey = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const nn = normNaam(e.naam);
    const pc = normPc(e.postcode);
    const pkey = pc ? `${nn}||${pc}` : `${nn}||${(e.stad || '').toLowerCase().trim()}`;
    (byPrimaryKey.get(pkey) || byPrimaryKey.set(pkey, []).get(pkey)!).push(i);

    const base = normNaamBase(e.naam);
    const street = normStreet(e.straat);
    const city = (e.stad || '').toLowerCase().trim();
    if (base && street && city) {
      const skey = `${base}||${street}||${city}`;
      (bySecondaryKey.get(skey) || bySecondaryKey.set(skey, []).get(skey)!).push(i);
    }
    // Name+city only (no street) — restricted to reasonably specific names so generic
    // ones ("de vries bouw") can't accidentally merge two different companies.
    if (base.length >= 8 && city) {
      const nckey = `${base}||${city}`;
      (byNameCityKey.get(nckey) || byNameCityKey.set(nckey, []).get(nckey)!).push(i);
    }
    // Same as above but with the entry's own city stripped from the core name first, so a
    // bare brand name ("INBO") and a city-suffixed one ("INBO Eindhoven") key the same way
    // even when one source has a stale/different street for that vestiging.
    const cnc = coreNaamCityFree(e.naam, e.stad);
    if (cnc.length >= 4 && city) {
      const cckey = `${cnc}||${city}`;
      (byCoreCityKey.get(cckey) || byCoreCityKey.set(cckey, []).get(cckey)!).push(i);
    }
  });
  for (const idxs of byPrimaryKey.values()) for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  for (const idxs of bySecondaryKey.values()) for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  for (const idxs of byNameCityKey.values()) for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  for (const idxs of byCoreCityKey.values()) for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);

  // Same exact address (postcode+street), name only loosely related — this catches an
  // "Onbekend" entry whose name differs more than a suffix/tagline (e.g. "cepezed" vs.
  // "architectenbureau cepezed"). Address at this precision is a strong enough signal on
  // its own, but shared office buildings mean several *different* companies can sit at the
  // same address — so only merge a 1-to-1 pairing (an exact core-name match wins ties;
  // anything still ambiguous after that is left alone rather than risk a wrong merge).
  const byAddrKey = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const pc = normPc(e.postcode);
    const street = normStreet(e.straat);
    if (!pc || !street) return;
    const akey = `${pc}||${street}`;
    (byAddrKey.get(akey) || byAddrKey.set(akey, []).get(akey)!).push(i);
  });
  for (const idxs of byAddrKey.values()) {
    if (idxs.length < 2) continue;
    const onbekendIdxs = idxs.filter(i => (entries[i].source || 'Web') === 'Web');
    const realIdxs = idxs.filter(i => entries[i].source && entries[i].source !== 'Web');
    if (!onbekendIdxs.length || !realIdxs.length) continue;
    for (const oi of onbekendIdxs) {
      const oCore = coreNaam(entries[oi].naam);
      if (oCore.length < 4) continue;
      const hits = realIdxs.filter(ri => {
        const rCore = coreNaam(entries[ri].naam);
        return rCore.length >= 4 && (rCore.includes(oCore) || oCore.includes(rCore));
      });
      const exact = hits.filter(ri => coreNaam(entries[ri].naam) === oCore);
      const pick = exact.length === 1 ? exact[0] : (exact.length === 0 && hits.length === 1 ? hits[0] : null);
      if (pick != null) union(oi, pick);
    }
  }

  // Same exact address, same core name once each entry's own city is stripped from it —
  // this catches two *different* real sources (e.g. BNA "INBO" vs. Architectenweb "INBO
  // Rotterdam") scraping the exact same vestiging under differently-formatted names.
  // Pairwise within a small address bucket, so a shared office building housing several
  // distinct companies only merges the ones whose (city-free) core name actually matches
  // — or, one is a word-for-word prefix of the other (e.g. Architectenweb "diederendirrix"
  // vs. BNA "diederendirrix architectuur & stedenbouw": same firm, one source just kept
  // scraping the descriptive tagline as part of the name).
  for (const idxs of byAddrKey.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const ia = idxs[a], ib = idxs[b];
        if (find(ia) === find(ib)) continue;
        const coreA = coreNaamCityFree(entries[ia].naam, entries[ia].stad);
        const coreB = coreNaamCityFree(entries[ib].naam, entries[ib].stad);
        if (coreA.length < 3 || coreB.length < 3) continue;
        if (coreA === coreB || coreA.startsWith(coreB + ' ') || coreB.startsWith(coreA + ' ')) {
          union(ia, ib);
        }
      }
    }
  }

  const groups = new Map<number, any[]>();
  entries.forEach((e, i) => {
    const root = find(i);
    (groups.get(root) || groups.set(root, []).get(root)!).push(e);
  });

  const best = (a: any, b: any, field: string) => a[field] || b[field];
  const merged: any[] = [];
  for (const group of groups.values()) {
    // Prefer a properly-sourced entry's fields (naam, etc.) over an "Onbekend" duplicate
    group.sort((a, b) => (a.source && a.source !== 'Web' ? 0 : 1) - (b.source && b.source !== 'Web' ? 0 : 1));
    if (group.length === 1) { merged.push(group[0]); continue; }
    const base = group.reduce((acc, cur) => ({
      ...acc,
      naam:       acc.naam || cur.naam,
      straat:     best(acc, cur, 'straat'),
      postcode:   best(acc, cur, 'postcode'),
      stad:       best(acc, cur, 'stad'),
      provincie:  best(acc, cur, 'provincie'),
      telefoon:   best(acc, cur, 'telefoon'),
      email:      best(acc, cur, 'email'),
      website:    best(acc, cur, 'website'),
      kvk:        best(acc, cur, 'kvk'),
      spec1:      best(acc, cur, 'spec1'),
      spec2:      best(acc, cur, 'spec2'),
      spec3:      best(acc, cur, 'spec3'),
      url:        best(acc, cur, 'url'),
      rechtsvorm: best(acc, cur, 'rechtsvorm'),
      bna_projecten: best(acc, cur, 'bna_projecten'),
      _custom:    acc._custom || cur._custom,
    }));
    // Prefer the most descriptive name in the group — one that already includes the city
    // (e.g. "INBO Rotterdam") reads better than a bare brand name ("INBO") once several
    // same-vestiging duplicates from different sources are merged into one record.
    const stadLower = (base.stad || '').toLowerCase().trim();
    const namesWithCity = group.map(e => e.naam).filter(n => n && stadLower && n.toLowerCase().includes(stadLower));
    if (namesWithCity.length > 0) {
      base.naam = namesWithCity.reduce((shortest, n) => n.length < shortest.length ? n : shortest);
    }
    // Collect all unique sources. A duplicate scraped without attribution (raw source
    // literally "Onbekend") shouldn't count as a separate bron once a real bron is known
    // for the same company — drop it whenever at least one real source is present.
    // Among the real sources, the most complete underlying record (most filled fields)
    // leads — that's the one shown as the primary badge on the main list.
    const completeness = (e: any) => ['telefoon', 'email', 'website', 'spec1', 'spec2', 'spec3', 'kvk', 'rechtsvorm'].filter(f => e[f]).length;
    const completenessBySource = new Map<string, number>();
    for (const e of group) {
      const src = e.source || 'Web';
      const score = completeness(e);
      if (!completenessBySource.has(src) || score > completenessBySource.get(src)!) completenessBySource.set(src, score);
    }
    const rawSources = group.map(e => e.source).filter(Boolean);
    const realSources = Array.from(new Set(rawSources.filter(s => s !== 'Web')))
      .sort((a, b) => (completenessBySource.get(b) || 0) - (completenessBySource.get(a) || 0));
    const sources = realSources.length > 0 ? realSources : (rawSources.length > 0 ? ['Web'] : []);
    base.source = sources[0] || 'Web';
    base._sources = sources; // all sources as array
    // The "Onbekend" bron's address wins ties — it's leading for location, even when a
    // known bron (Bouwgarant, ...) is also present in the group.
    const onbekendEntry = group.find(e => (e.source || 'Web') === 'Web' && (e.straat || e.postcode || e.stad));
    if (onbekendEntry) {
      base.straat    = onbekendEntry.straat    || base.straat;
      base.postcode  = onbekendEntry.postcode  || base.postcode;
      base.stad      = onbekendEntry.stad      || base.stad;
      base.provincie = onbekendEntry.provincie || base.provincie;
    }
    // Flag address conflict
    const addrs = Array.from(new Set(group.map(e => (e.straat || '').trim()).filter(Boolean)));
    if (addrs.length > 1) base._adresConflict = addrs;
    merged.push(base);
  }
  return merged;
}
