// Eén gedeelde bronkleur-tabel voor de HELE app (kaart-pins, kaart-legenda, de "Bron"-filter in
// de sidebar, en de bron-pillen in Onderweg/Bezoeken). Voorheen had elke plek een eigen, deels
// onvolledige kopie, waardoor sommige bronnen (Web, bouwnu, Archined, Bedrijvenoverzicht, Nijhuis)
// nergens een kleur hadden en dus grijs bleven — precies de mismatch tussen kaart en filters die de
// gebruiker zag. Alle bronnen krijgen hier een eigen, onderscheidbare kleur; deze module is de
// enige bron van waarheid.
export const SOURCE_COLOR: Record<string, string> = {
  Bouwgarant:            '#009FE3', // Inncempro-blauw
  Architectenweb:        '#E85E26', // oranje
  Archined:              '#0891B2', // cyaan
  BNA:                   '#1B4F72', // donkerblauw
  Stiho:                 '#EA580C', // fel-oranje
  Jongeneel:             '#16A34A', // groen
  BouwPartner:           '#CA8A04', // goud
  PontMeyer:             '#DC2626', // rood
  Bouwcenter:            '#7C3AED', // paars
  Sweco:                 '#059669', // smaragd
  'Van Wijnen':          '#0D9488', // teal
  'Plegt-Vos':           '#DB2777', // roze
  'Ter Steege Groep':    '#B45309', // amber-donker
  Nijhuis:               '#4F46E5', // indigo
  VolkerWessels:         '#334155', // donkergrijs-blauw
  bouwnu:                '#F59E0B', // amber
  Bedrijvenoverzicht:    '#65A30D', // limoen
  Web:                   '#94A3B8', // neutraal grijs (generieke webbron)
  Onbekend:              '#64748B',
  Handmatig:             '#9333EA',
  Favorieten:            '#E11D48',
  'Mijn Adressen':       '#7C3AED',
  'Geselecteerde items': '#E85E26',
};

// Kleur voor een bron; valt terug op de generieke "Web"-grijstint voor onbekende bronnen.
export const sourceColor = (source?: string): string =>
  (source && SOURCE_COLOR[source]) || SOURCE_COLOR.Web;
