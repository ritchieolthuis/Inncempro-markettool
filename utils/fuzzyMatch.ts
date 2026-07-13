// Kleine, gedeelde tikfout-tolerante tekstmatching — vooral bedoeld voor spraakinvoer: iemand
// spreekt "Noord-Holland" in, maar door spraakherkenning of een tikfout staat er "noord holand"
// of "nord holland" in het zoekveld. Gewone .includes()-matching mist dat dan volledig.

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

export function normalizeFuzzy(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Matcht "needle" (de getypte/ingesproken zoekterm) tegen "haystack" (bv. een plaatsnaam),
// tolerant voor hoofdletters, accenten en kleine spelfouten (max 1-2 letters verschil,
// afhankelijk van woordlengte — hoe langer het woord, hoe meer ruimte voor een tikfout).
export function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = normalizeFuzzy(haystack);
  const n = normalizeFuzzy(needle);
  if (!n) return true;
  if (h.includes(n)) return true;

  const needleWords = n.split(' ').filter(Boolean);
  const haystackWords = h.split(/[\s-]+/).filter(Boolean);
  return needleWords.every(nw =>
    haystackWords.some(hw => {
      if (hw === nw || hw.startsWith(nw) || nw.startsWith(hw)) return true;
      if (nw.length >= 4 && hw.length >= 4) {
        const maxDist = nw.length >= 7 ? 2 : 1;
        return levenshteinDistance(nw, hw) <= maxDist;
      }
      return false;
    })
  );
}
