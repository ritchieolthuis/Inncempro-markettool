
import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, X, BarChart3, Building, Filter, Check, ChevronRight, ChevronDown, ChevronUp, ChevronLeft, AlertTriangle, User as UserIcon, Heart, LayoutGrid, LogIn, Mail, Lock, Plus, Save, Download, MapPin, Database, Globe, Phone, Pencil, Trash2, TrendingUp, Bookmark, BookmarkCheck, Columns, Star, Repeat, Upload, Bot, Send } from 'lucide-react';
import Papa from 'papaparse';
import bouwgarantData from './bouwgarant_data.json';
import cityCoords from './city_coords.json';
import Header from './components/Header';
import MapView from './components/MapView';
import RouteMapPanel from './components/RouteMapPanel';
import { authService } from './services/authService';
import { SearchState, DiscoveredCompany, User } from './types';
import { scoreInsertionCandidates } from './utils/dagbezoek';

// ── Plaatsnaam-normalisatie ──────────────────────────────────────────────────
// Sommige bronnen leveren dezelfde plaats onder net iets andere spelling aan
// (bv. "AMSTERDAM (NL)", "'s-Hertogenbosch" vs "Den Bosch", "ROTTERDAM" vs
// "Rotterdam"). Zonder correctie duiken die als aparte plaatsen op in
// filters, kaartmarkers en het marktoverzicht. Dit wordt één keer bij het
// laden van de data gecorrigeerd, zodat alles verder consistent is.
function normStadKey(s: string): string {
  return s.toLowerCase().trim().replace(/^\\+/, '').replace(/^'+/, '').replace(/\s+/g, ' ');
}
const STAD_FIXES: Record<string, string> = {
  'amsterdam (nl)': 'Amsterdam', 'amsterdam (nederland)': 'Amsterdam',
  'eindhoven (nederland)': 'Eindhoven', 'eindhoven eindhoven': 'Eindhoven',
  's-hertogenbosch': 'Den Bosch', 'hertogenbosch': 'Den Bosch',
  's-gravenhage': 'Den Haag', 'gravenhage': 'Den Haag',
  'alphen aan de rijn': 'Alphen aan den Rijn',
  'capelle aan de ijssel': 'Capelle aan den IJssel',
  'koog aan de zaan': 'Zaandam',
  'rotterdam-oost': 'Rotterdam',
  'almere stad': 'Almere',
  'hengelo ov': 'Hengelo', 'hengelo gld': 'Hengelo',
};
// Bij loutere schrijfwijze-verschillen (hoofdletters e.d.) kiezen we de vaakst
// voorkomende schrijfwijze in de data zelf als canonieke vorm.
const stadCasingMap = new Map<string, string>();
(() => {
  const counts = new Map<string, Map<string, number>>();
  (bouwgarantData as any[]).forEach((b: any) => {
    const raw = (b.stad || '').toString().trim();
    if (!raw) return;
    const key = normStadKey(raw);
    if (!counts.has(key)) counts.set(key, new Map());
    const m = counts.get(key)!;
    m.set(raw, (m.get(raw) || 0) + 1);
  });
  counts.forEach((variants, key) => {
    let best = ''; let bestCount = -1;
    variants.forEach((cnt, variant) => {
      if (cnt > bestCount || (cnt === bestCount && variant.length > best.length)) { best = variant; bestCount = cnt; }
    });
    stadCasingMap.set(key, best);
  });
})();
function canonicalStad(raw: string): string {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return trimmed;
  const key = normStadKey(trimmed);
  return STAD_FIXES[key] || stadCasingMap.get(key) || trimmed;
}
(bouwgarantData as any[]).forEach((b: any) => { if (b.stad) b.stad = canonicalStad(b.stad); });

// Provincie ontbreekt bij een deel van de bedrijven, terwijl bekende plaatsen (Amsterdam,
// Rotterdam, Utrecht, ...) al bij tientallen andere bedrijven wél een provincie hebben.
// Vul de ontbrekende provincie in op basis van de meest voorkomende provincie voor die plaats,
// zodat ze niet langer nutteloos onder "Onbekend" belanden.
const stadProvincieMap = new Map<string, string>();
(() => {
  const counts = new Map<string, Map<string, number>>();
  (bouwgarantData as any[]).forEach((b: any) => {
    const stad = (b.stad || '').trim();
    const prov = (b.provincie || '').trim();
    if (!stad || !prov) return;
    const key = stad.toLowerCase();
    if (!counts.has(key)) counts.set(key, new Map());
    const m = counts.get(key)!;
    m.set(prov, (m.get(prov) || 0) + 1);
  });
  counts.forEach((provCounts, key) => {
    let best = ''; let bestCount = -1;
    provCounts.forEach((cnt, prov) => { if (cnt > bestCount) { best = prov; bestCount = cnt; } });
    if (best) stadProvincieMap.set(key, best);
  });
})();
(bouwgarantData as any[]).forEach((b: any) => {
  if (!b.provincie && b.stad) {
    const fallback = stadProvincieMap.get(b.stad.trim().toLowerCase());
    if (fallback) b.provincie = fallback;
  }
});

const DUTCH_LOCATIONS = [
    "Heel Nederland",
    "Drenthe", "Flevoland", "Friesland", "Gelderland", "Groningen", "Limburg", "Noord-Brabant", "Noord-Holland", "Overijssel", "Utrecht", "Zeeland", "Zuid-Holland",
    "'S-Graveland",
    "'S-Gravendeel",
    "'S-Gravenpolder",
    "'S-Gravenzande",
    "'S-Heer Abtskerke",
    "'S-Heer Arendskerke",
    "'T Harde",
    "'T Zandt",
    "Aagtekerke",
    "Aalsmeer",
    "Aalten",
    "Aarlanderveen",
    "Aarle-Rixtel",
    "Abcoude",
    "Achterveld",
    "Aerdenhout",
    "Agelo",
    "Albergen",
    "Alblasserdam",
    "Aldtsjerk",
    "Alkmaar",
    "Almelo",
    "Almen",
    "Almere",
    "Alphen",
    "Alphen Aan Den Rijn",
    "Alphen Nb",
    "Alteveer Gn",
    "Altforst",
    "Ameide",
    "Amerongen",
    "Amersfoort",
    "Amstelhoek",
    "Amstelveen",
    "Amstenrade",
    "Amsterdam",
    "Andel",
    "Andijk",
    "Ane",
    "Angerlo",
    "Ankeveen",
    "Anna Paulowna",
    "Apeldoorn",
    "Appelscha",
    "Arnemuiden",
    "Arnhem",
    "Arum",
    "Asperen",
    "Assen",
    "Assendelft",
    "Asten",
    "Avenhorn",
    "Axel",
    "Baambrugge",
    "Baarlo",
    "Baarn",
    "Badhoevedorp",
    "Bakel",
    "Balk",
    "Balkbrug",
    "Ballum",
    "Barendrecht",
    "Barneveld",
    "Basse",
    "Bathmen",
    "Beek",
    "Beek En Donk",
    "Beek Gem Montferland",
    "Beek LB",
    "Beek-Ubbergen",
    "Beekbergen",
    "Beers Nb",
    "Beesd",
    "Beesel",
    "Beilen",
    "Belfeld",
    "Beltrum",
    "Bemmel",
    "Beneden-Leeuwen",
    "Bennekom",
    "Benschop",
    "Benthuizen",
    "Bergambacht",
    "Bergeijk",
    "Bergen",
    "Bergen Op Zoom",
    "Berghem",
    "Bergschenhoek",
    "Beringe",
    "Berkel En Rodenrijs",
    "Berkel-Enschot",
    "Berkenwoude",
    "Berlicum",
    "Berlicum Nb",
    "Berlikum",
    "Best",
    "Beugen",
    "Beuningen",
    "Beusichem",
    "Beverwijk",
    "Biddinghuizen",
    "Bilthoven",
    "Bladel",
    "Blaricum",
    "Bleiswijk",
    "Bleskensgraaf",
    "Bloemendaal",
    "Boazum",
    "Bodegraven",
    "Boekel",
    "Boerakker",
    "Bolsward",
    "Borculo",
    "Born",
    "Borne",
    "Bornerbroek",
    "Borssele",
    "Boskoop",
    "Boxmeer",
    "Boxtel",
    "Braamt",
    "Breda",
    "Breedenbroek",
    "Breezand",
    "Breukelen",
    "Broek Op Langedijk",
    "Broekhuizenvorst",
    "Broekland",
    "Bruinisse",
    "Brummen",
    "Brunssum",
    "Budel",
    "Bunde",
    "Bunnik",
    "Bunschoten",
    "Bunschoten Spakenburg",
    "Bunschoten-Spakenburg",
    "Burdaard",
    "Burgerveen",
    "Burgum",
    "Bussum",
    "Capelle Aan Den Ijssel",
    "Castricum",
    "Chaam",
    "Coevorden",
    "Cothen",
    "Cromvoirt",
    "Cruquius",
    "Cuijk",
    "Culemborg",
    "Daarle",
    "Dalerveen",
    "Dalfsen",
    "De Bilt",
    "De Cocksdorp",
    "De Goorn",
    "De Koog",
    "De Lier",
    "De Lutte",
    "De Meern",
    "De Moer",
    "De Rijp",
    "Dedemsvaart",
    "Deil",
    "Delden",
    "Delft",
    "Delfzijl",
    "Den Bosch",
    "Den Burg",
    "Den Dungen",
    "Den Haag",
    "Den Ham",
    "Den Helder",
    "Den Oever",
    "Deurne",
    "Deurningen",
    "Deventer",
    "Didam",
    "Diemen",
    "Diepenveen",
    "Dieren",
    "Diessen",
    "Dinteloord",
    "Dinxperlo",
    "Doesburg",
    "Doetinchem",
    "Dokkum",
    "Dongen",
    "Doorn",
    "Doornspijk",
    "Dordrecht",
    "Drachten",
    "Driebergen Rijsenb",
    "Driebergen-Rijsenburg",
    "Driehuis",
    "Drunen",
    "Druten",
    "Duiven",
    "Duivendrecht",
    "Dwingeloo",
    "Echt",
    "Echteld",
    "Echten",
    "Edam",
    "Ede",
    "Ederveen",
    "Eelde",
    "Eemnes",
    "Eerbeek",
    "Eerde",
    "Eersel",
    "Eexterveen",
    "Eibergen",
    "Eindhoven",
    "Ekehaar",
    "Elsendorp",
    "Elsloo",
    "Elspeet",
    "Elst",
    "Elst Ut",
    "Emmeloord",
    "Emmen",
    "Emst",
    "Enkhuizen",
    "Enschede",
    "Enter",
    "Epe",
    "Eperheide",
    "Erica",
    "Erm",
    "Ermelo",
    "Erp",
    "Esch",
    "Etten",
    "Etten-Leur",
    "Ferwert",
    "Fijnaart",
    "Fleringen",
    "Franeker",
    "Gaanderen",
    "Galder",
    "Garderen",
    "Garmerwolde",
    "Garnwerd",
    "Garyp",
    "Geertruidenberg",
    "Geesteren",
    "Geesteren Ov",
    "Geffen",
    "Geldermalsen",
    "Geldrop",
    "Geleen",
    "Gemert",
    "Gemonde",
    "Gendringen",
    "Gendt",
    "Genemuiden",
    "Geulle",
    "Giesbeek",
    "Giessen",
    "Giessenburg",
    "Gieten",
    "Giethoorn",
    "Gilze",
    "Goedereede",
    "Goes",
    "Goirle",
    "Goor",
    "Gorinchem",
    "Gorredijk",
    "Gouda",
    "Goudriaan",
    "Goutum",
    "Graauw",
    "Grave",
    "Groenlo",
    "Groesbeek",
    "Groningen",
    "Groot Ammers",
    "Groot-Ammers",
    "Grootegast",
    "Grou",
    "Haaksbergen",
    "Haaren",
    "Haarle",
    "Haarlem",
    "Haastrecht",
    "Haelen",
    "Hagestein",
    "Halfweg",
    "Halle",
    "Halsteren",
    "Hantum",
    "Hardenberg",
    "Harderwijk",
    "Hardinxveen-Giessendam",
    "Hardinxveld Giessendam",
    "Hardinxveld-Giessendam",
    "Haren Gn",
    "Harfsen",
    "Harkema",
    "Harkstede",
    "Harlingen",
    "Harmelen",
    "Harskamp",
    "Haulerwijk",
    "Havelte",
    "Hazerswoude Dorp",
    "Hazerswoude-Dorp",
    "Hedel",
    "Heeg",
    "Heelweg",
    "Heemskerk",
    "Heemstede",
    "Heerde",
    "Heerenveen",
    "Heerhugowaard",
    "Heerlen",
    "Heesch",
    "Heeswijk Dinther",
    "Heeswijk-Dinther",
    "Heijen",
    "Heilig Landstichting",
    "Heiligerlee",
    "Heiloo",
    "Heinkenszand",
    "Heino",
    "Hellendoorn",
    "Hellevoetsluis",
    "Hellouw",
    "Helmond",
    "Hem",
    "Hemmen",
    "Hendrik Ido Ambacht",
    "Hendrik-Ido-Ambacht",
    "Hengelo",
    "Hengevelde",
    "Hengstdijk",
    "Hensbroek",
    "Herwijnen",
    "Heteren",
    "Heukelum",
    "Heusden",
    "Heythuysen",
    "Hierden",
    "Hillegom",
    "Hilversum",
    "Hippolytushoef",
    "Hoensbroek",
    "Hoevelaken",
    "Hollandscheveld",
    "Holtum",
    "Holwerd",
    "Hommerts",
    "Honselersdijk",
    "Hoofddorp",
    "Hoogeloon",
    "Hoogerheide",
    "Hoogeveen",
    "Hoogkarspel",
    "Hoogmade",
    "Hoogwoud",
    "Hoorn",
    "Hoornaar",
    "Horssen",
    "Horst",
    "Houten",
    "Houtigehage",
    "Huijbergen",
    "Huissen",
    "Huizen",
    "Hulst",
    "Hummelo",
    "Hurdegarijp",
    "Ijmuiden",
    "Ijsselmuiden",
    "Ijsselstein",
    "Ijsselstein Ut",
    "Ingen",
    "Jelsum",
    "Joppe",
    "Joure",
    "Julianadorp",
    "Kaatsheuvel",
    "Kamerik",
    "Kampen",
    "Kamperland",
    "Kapelle",
    "Katlijk",
    "Katwijk",
    "Katwijk Zh",
    "Keijenborg",
    "Kerkdriel",
    "Kerkrade",
    "Kessel Lb",
    "Kesteren",
    "Klarenbeek",
    "Klazienaveen",
    "Klimmen",
    "Kloosterburen",
    "Kloosterzande",
    "Kockengen",
    "Kollum",
    "Kollumerzwaag",
    "Koog Aan De Zaan",
    "Kootwijkerbroek",
    "Kortgene",
    "Koudekerk Aan Den Rijn",
    "Koudekerke",
    "Kralendijk",
    "Krimpen Aan De Lek",
    "Krimpen Aan Den Ijssel",
    "Krommenie",
    "Kronenberg",
    "Kruiningen",
    "Kwadendamme",
    "Kwintsheul",
    "Lage Mierde",
    "Landgraaf",
    "Langenboom",
    "Langeveen",
    "Laren",
    "Laren Nh",
    "Lattrop",
    "Lattrop-Breklenkamp",
    "Leek",
    "Leende",
    "Leerdam",
    "Leeuwarden",
    "Leiden",
    "Leidschendam",
    "Leimuiden",
    "Lekkerkerk",
    "Lelystad",
    "Lemele",
    "Lemelerveld",
    "Lemmer",
    "Leusden",
    "Leuth",
    "Leuvenheim",
    "Lexmond",
    "Lichtenvoorde",
    "Limmen",
    "Linschoten",
    "Lisse",
    "Lisserbroek",
    "Lochem",
    "Loenen",
    "Loenen Aan De Vecht",
    "Loenersloot",
    "Loerbeek",
    "Lomm",
    "Loon op Zand",
    "Loosdrecht",
    "Lopik",
    "Lunteren",
    "Luttenberg",
    "Luyksgestel",
    "Maarheeze",
    "Maarn",
    "Maarsbergen",
    "Maarssen",
    "Maasbree",
    "Maasdijk",
    "Maasland",
    "Maassluis",
    "Maastricht",
    "Maastricht airport",
    "Made",
    "Mantgum",
    "Margraten",
    "Mariahout",
    "Marienheem",
    "Markelo",
    "Marum",
    "Maurik",
    "Medemblik",
    "Meijel",
    "Meliskerke",
    "Menaam",
    "Meppel",
    "Meterik",
    "Mheer",
    "Middelburg",
    "Middelharnis",
    "Mierlo",
    "Mijdrecht",
    "Milheeze",
    "Mill",
    "Millingen Aan De Rijn",
    "Moergestel",
    "Moerkapelle",
    "Molenhoek",
    "Molenhoek Lb",
    "Monster",
    "Montfoort",
    "Moordrecht",
    "Muiden",
    "Musselkanaal",
    "Naaldwijk",
    "Naarden",
    "Nederhemert",
    "Nederhorst Den Berg",
    "Neede",
    "Neerkant",
    "Nibbixwoud",
    "Niekerk Grootegast",
    "Nieuw Balinge",
    "Nieuw Buinen",
    "Nieuw Lekkerland",
    "Nieuw Schoonebeek",
    "Nieuw Vennep",
    "Nieuw-Schoonebeek",
    "Nieuw-Vennep",
    "Nieuwe Niedorp",
    "Nieuwe-Tonge",
    "Nieuwegein",
    "Nieuwerkerk",
    "Nieuwerkerk Aan Den Ijssel",
    "Nieuwerkerk Ad Ijssel",
    "Nieuwkoop",
    "Nieuwleusen",
    "Nieuwolda",
    "Nieuwpoort",
    "Nieuwveen",
    "Nijensleek",
    "Nijkerk",
    "Nijmegen",
    "Nijverdal",
    "Noardburgum",
    "Noord-Scharwoude",
    "Noordhoek",
    "Noordhorn",
    "Noordwijk",
    "Noordwijkerhout",
    "Nootdorp",
    "Nuenen",
    "Nuis",
    "Nuland",
    "Nunspeet",
    "Nuth",
    "Obdam",
    "Ochten",
    "Oegstgeest",
    "Oirschot",
    "Oisterwijk",
    "Oldebroek",
    "Oldemarkt",
    "Oldenzaal",
    "Ommel",
    "Ommen",
    "Onstwedde",
    "Ooltgensplaat",
    "Oostburg",
    "Oostelbeers",
    "Oosterbeek",
    "Oosterblokker",
    "Oosterhout",
    "Oostermeer",
    "Oosternijkerk",
    "Oosterwierum",
    "Oosterwolde Fr",
    "Oosterwolde Gld",
    "Oosthuizen",
    "Oostvoorne",
    "Oostzaan",
    "Ootmarsum",
    "Ophemert",
    "Oploo",
    "Opmeer",
    "Oss",
    "Oud Alblas",
    "Oud-Ade",
    "Oud-Alblas",
    "Oud-Beijerland",
    "Ouddorp",
    "Ouddorp Zh",
    "Oudehorne",
    "Ouderkerk Aan Den Ijssel",
    "Oudeschild",
    "Oudewater",
    "Oudorp",
    "Overdinkel",
    "Overveen",
    "Panheel",
    "Papekop",
    "Papendrecht",
    "Paterswolde",
    "Peize",
    "Pesse",
    "Pijnacker",
    "Pingjum",
    "Poeldijk",
    "Poortvliet",
    "Purmerend",
    "Putten",
    "Raalte",
    "Raamsdonk",
    "Raamsdonksveer",
    "Reeuwijk",
    "Renkum",
    "Renswoude",
    "Reutum",
    "Rheden",
    "Rhenen",
    "Ridderkerk",
    "Riel",
    "Rietmolen",
    "Rijen",
    "Rijsbergen",
    "Rijsenhout",
    "Rijssen",
    "Rijswijk",
    "Rijswijk Zh",
    "Rilland",
    "Roden",
    "Roelofarendsveen",
    "Roermond",
    "Roodeschool",
    "Roosendaal",
    "Rosmalen",
    "Rossum Ov",
    "Rotterdam",
    "Rottum",
    "Rouveen",
    "Rozenburg Zh",
    "Rozendaal",
    "Rucphen",
    "Rumpt",
    "Rutten",
    "Ruurlo",
    "Saasveld",
    "Santpoort-Zuid",
    "Sassenheim",
    "Schagen",
    "Schagerbrug",
    "Schaijk",
    "Schellinkhout",
    "Schermerhorn",
    "Scherpenisse",
    "Scherpenzeel",
    "Scherpenzeel Gld",
    "Schiedam",
    "Schiermonnikoog",
    "Schijndel",
    "Schimmert",
    "Schinnen",
    "Schiphol",
    "Schoonhoven",
    "Schoorl",
    "Schuinesloot",
    "Serooskerke Walcheren",
    "Sevenum",
    "Sibculo",
    "Siddeburen",
    "Simpelveld",
    "Sint Agatha",
    "Sint Annaparochie",
    "Sint Anthonis",
    "Sint Hubert",
    "Sint Jansklooster",
    "Sint Jansteen",
    "Sint Maartensdijk",
    "Sint Odiliënberg",
    "Sint Pancras",
    "Sint Philipsland",
    "Sint-Annaland",
    "Sint-Michielsgestel",
    "Sint-Oedenrode",
    "Sittard",
    "Sliedrecht",
    "Sneek",
    "Soerendonk",
    "Soest",
    "Soesterberg",
    "Someren",
    "Sommelsdijk",
    "Son",
    "Spaarndam",
    "Spankeren",
    "Spierdijk",
    "Sprang Capelle",
    "Sprang-Capelle",
    "Sprundel",
    "St jacobiparochie",
    "Stadskanaal",
    "Staphorst",
    "Starnmeer",
    "Stavenisse",
    "Steenbergen Nb",
    "Steenwijk",
    "Stellendam",
    "Stolwijk",
    "Stoutenburg",
    "Stroe",
    "Stuifzand",
    "Suit",
    "Sumar",
    "Surhuisterveen",
    "Swalmen",
    "Tegelen",
    "Ter Aar",
    "Ter Apel",
    "Ter Idzard",
    "Terborg",
    "Terneuzen",
    "Terschuur",
    "Teteringen",
    "Tholen",
    "Thorn",
    "Tiel",
    "Tilburg",
    "Tilligte",
    "Tirns",
    "Tubbergen",
    "Twello",
    "Twijzelerheide",
    "Tynaarlo",
    "Tzummarum",
    "Uden",
    "Uffelte",
    "Uitgeest",
    "Uithuizen",
    "Uithuizermeeden",
    "Ulft",
    "Ureterp",
    "Urk",
    "Ursem",
    "Utrecht",
    "Vaassen",
    "Valkenburg",
    "Valkenswaard",
    "Valthermond",
    "Varsseveld",
    "Veendam",
    "Veenendaal",
    "Veeningen",
    "Veenoord",
    "Veghel",
    "Veldhoven",
    "Velp",
    "Velsen-Noord",
    "Venhorst",
    "Venlo",
    "Venray",
    "Vianen",
    "Vianen Ut",
    "Vierpolders",
    "Vilsteren",
    "Vinkeveen",
    "Vlaardingen",
    "Vledder",
    "Vleuten",
    "Vlissingen",
    "Volendam",
    "Vollenhove",
    "Voorburg",
    "Voorhelmstraat 25 103",
    "Voorhout",
    "Voorschoten",
    "Voorthuizen",
    "Vorchten",
    "Vorden",
    "Vorstenbosch",
    "Vriezenveen",
    "Vroomshoop",
    "Vrouwenpolder",
    "Vught",
    "Waalre",
    "Waalwijk",
    "Waardenburg",
    "Waarder",
    "Waarland",
    "Waddinxveen",
    "Wadenoijen",
    "Wageningen",
    "Wanroij",
    "Wanssum",
    "Wapenveld",
    "Wapse",
    "Warder",
    "Warmenhuizen",
    "Warnsveld",
    "Waspik",
    "Wassenaar",
    "Watergang",
    "Wateringen",
    "Waverveen",
    "Weert",
    "Weesp",
    "Wehl",
    "Wekerom",
    "Wellerlooi",
    "Wergea",
    "Werkendam",
    "Werkhoven",
    "Wernhout",
    "Wervershoof",
    "Westbeemster",
    "Westergeest",
    "Westervoort",
    "Wezep",
    "Wierden",
    "Wieringerwerf",
    "Wijchen",
    "Wijhe",
    "Wijk Bij Duurstede",
    "Wijk En Aalburg",
    "Willemstad",
    "Wilnis",
    "Wilsum",
    "Winkel",
    "Winschoten",
    "Winsum",
    "Winsum Fr",
    "Winsum Gn",
    "Winterswijk",
    "Winterswijk Brinkheurne",
    "Winterswijk Meddo",
    "Winterswijk Miste",
    "Witmarsum",
    "Woerden",
    "Wolvega",
    "Wons",
    "Wormer",
    "Wormerveer",
    "Woudenberg",
    "Woudrichem",
    "Woudsend",
    "Wouwse Plantage",
    "Yde",
    "Ysselsteyn Lb",
    "Zaandam",
    "Zaltbommel",
    "Zandhuizen",
    "Zeeland",
    "Zeewolde",
    "Zegveld",
    "Zeijen",
    "Zeist",
    "Zelhem",
    "Zenderen",
    "Zevenaar",
    "Zevenbergen",
    "Zevenhuizen Zh",
    "Zierikzee",
    "Zieuwent",
    "Zoelen",
    "Zoelmond",
    "Zoetermeer",
    "Zoeterwoude",
    "Zuid-Beijerland",
    "Zuidland",
    "Zuidlaren",
    "Zuidwolde",
    "Zuilichem",
    "Zundert",
    "Zutphen",
    "Zwaag",
    "Zwaagdijk",
    "Zwaagdijk - Oost",
    "Zwaagdijk-Oost",
    "Zwanenburg",
    "Zwartemeer",
    "Zwartewaal",
    "Zwijndrecht",
    "Zwolle",
    "’S-Hertogenbosch"
];

const DEFAULT_ORIGIN = "Lansinkesweg 4, 7553 AE Hengelo";

// Coördinaten van veelgebruikte Nederlandse steden
const DUTCH_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'hengelo': { lat: 52.2549, lng: 6.7782 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'rotterdam': { lat: 51.9225, lng: 4.4792 },
  'den haag': { lat: 52.0705, lng: 4.3007 },
  's-gravenhage': { lat: 52.0705, lng: 4.3007 },
  'utrecht': { lat: 52.0907, lng: 5.1214 },
  'eindhoven': { lat: 51.4416, lng: 5.4697 },
  'groningen': { lat: 53.2194, lng: 6.5665 },
  'tilburg': { lat: 51.5555, lng: 5.0913 },
  'almere': { lat: 52.3508, lng: 5.2647 },
  'breda': { lat: 51.5719, lng: 4.7683 },
  'nijmegen': { lat: 51.8426, lng: 5.8546 },
  'enschede': { lat: 52.2215, lng: 6.8937 },
  'apeldoorn': { lat: 52.2112, lng: 5.9699 },
  'arnhem': { lat: 51.9851, lng: 5.8987 },
  'zwolle': { lat: 52.5168, lng: 6.0830 },
  'deventer': { lat: 52.2565, lng: 6.1562 },
  'amersfoort': { lat: 52.1561, lng: 5.3878 },
  'leiden': { lat: 52.1601, lng: 4.4970 },
  'dordrecht': { lat: 51.8133, lng: 4.6901 },
  'maastricht': { lat: 50.8514, lng: 5.6910 },
  'delft': { lat: 52.0116, lng: 4.3571 },
  'alkmaar': { lat: 52.6324, lng: 4.7534 },
  'haarlem': { lat: 52.3874, lng: 4.6462 },
  'zaandam': { lat: 52.4392, lng: 4.8249 },
  'haarlemmermeer': { lat: 52.3001, lng: 4.7155 },
  'zoetermeer': { lat: 52.0574, lng: 4.4938 },
  'emmen': { lat: 52.7792, lng: 6.8993 },
  'leeuwarden': { lat: 53.2012, lng: 5.7999 },
  'assen': { lat: 53.0016, lng: 6.5586 },
  'middelburg': { lat: 51.4988, lng: 3.6136 },
  'lelystad': { lat: 52.5185, lng: 5.4714 },
  'purmerend': { lat: 52.5027, lng: 4.9599 },
  'venlo': { lat: 51.3704, lng: 6.1724 },
  'roermond': { lat: 51.1940, lng: 5.9868 },
  'den bosch': { lat: 51.6978, lng: 5.3037 },
  's-hertogenbosch': { lat: 51.6978, lng: 5.3037 },
  'helmond': { lat: 51.4782, lng: 5.6611 },
  'oss': { lat: 51.7649, lng: 5.5189 },
  'bergen op zoom': { lat: 51.4974, lng: 4.2878 },
  'heerlen': { lat: 50.8882, lng: 5.9794 },
  'sittard': { lat: 51.0025, lng: 5.8699 },
  'alblasserdam': { lat: 51.8700, lng: 4.6671 },
  'harderwijk': { lat: 52.3455, lng: 5.6208 },
  'zutphen': { lat: 52.1388, lng: 6.1977 },
  'doetinchem': { lat: 51.9664, lng: 6.2946 },
  'winterswijk': { lat: 51.9739, lng: 6.7205 },
  'oldenzaal': { lat: 52.3133, lng: 6.9282 },
  'almelo': { lat: 52.3568, lng: 6.6652 },
};
const toUrl = (u: string) => u && /^https?:\/\//i.test(u) ? u : `https://${u}`;

// Radius search utilities
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const CITY_COORDS_MAP: Record<string, { lat: number; lng: number }> = {};
Object.entries(cityCoords as Record<string, { lat: number; lng: number }>).forEach(([k, v]) => {
  CITY_COORDS_MAP[k.toLowerCase().trim()] = v;
});

const getCityCoords = (city: string): { lat: number; lng: number } | null => {
  const key = city.toLowerCase().trim();
  if (!key) return null;
  // Exacte match
  if (CITY_COORDS_MAP[key]) return CITY_COORDS_MAP[key];
  // Genormaliseerde match (aliassen)
  const ALIASES: Record<string, string> = {
    "den haag": "den haag", "'s-gravenhage": "den haag", "s-gravenhage": "den haag",
    "den bosch": "den bosch", "'s-hertogenbosch": "den bosch", "s-hertogenbosch": "den bosch",
    "windesheim": "zwolle",
  };
  const aliased = ALIASES[key];
  if (aliased && CITY_COORDS_MAP[aliased]) return CITY_COORDS_MAP[aliased];
  // Partiële match: zoek stad die begint met de zoekopdracht (min 3 tekens)
  if (key.length >= 3) {
    const partial = Object.keys(CITY_COORDS_MAP).find(k => k.startsWith(key));
    if (partial) return CITY_COORDS_MAP[partial];
  }
  return null;
};

// Module-level stad normalization (used by ProvinceFilter + App)
const STAD_ALIASES_GLOBAL: Record<string, string> = {
  "s-hertogenbosch": "den bosch", "'s-hertogenbosch": "den bosch", "hertogenbosch": "den bosch",
  "s-gravenhage": "den haag", "'s-gravenhage": "den haag", "gravenhage": "den haag",
  "amsterdam (nl)": "amsterdam", "amsterdam (nederland)": "amsterdam",
  "eindhoven (nederland)": "eindhoven", "eindhoven eindhoven": "eindhoven",
  "alphen aan de rijn": "alphen aan den rijn",
  "capelle aan de ijssel": "capelle aan den ijssel",
  "koog aan de zaan": "zaandam",
  "rotterdam-oost": "rotterdam", "almere stad": "almere",
  "hengelo ov": "hengelo", "hengelo gld": "hengelo",
};

function normalizeStadGlobal(stad: string): string {
  if (!stad) return '';
  const s = stad.toLowerCase().trim().replace(/^'+/, '');
  return STAD_ALIASES_GLOBAL[s] || s;
}

// OpenStreetMap embed - gebruikmaakt van OSM Nominatim voor geocoding
function getMapIFrameUrl(bedrijf: any): string {
  if (!bedrijf.straat || !bedrijf.stad) return '';
  // Standaard coördinaten (Nederland midden)
  let lat = 52.1, lon = 5.2;

  // Als we postcode hebben, probeer wat betere coördinaten (vereenvoudigd)
  const postcode = bedrijf.postcode || '';
  const stad = bedrijf.stad || '';

  // Simpele geocoding: gebruik OSM export met standaard NL bbox
  // en plaats marker bij het adres (OSM zal dit geocoderen)
  const address = `${bedrijf.straat} ${postcode} ${stad}`;
  const encAddr = encodeURIComponent(address);

  // OpenStreetMap export embed - toont kaart met marker op zoeken naar adres
  return `https://www.openstreetmap.org/export/embed.html?bbox=3,50.5,7.5,53.5&layer=mapnik&marker=${lat},${lon}`;
}

function buildProvinceGroups(dataset: any[]) {
  const provMap: Record<string, Record<string, number>> = {};
  for (const b of dataset) {
    const prov = (b.provincie || '').trim();
    if (!prov) continue;
    const rawStad = (b.stad || '').trim();
    const stad = rawStad
      ? (normalizeStadGlobal(rawStad).replace(/\b\w/g, c => c.toUpperCase()) || rawStad)
      : '';
    if (!provMap[prov]) provMap[prov] = {};
    if (stad) provMap[prov][stad] = (provMap[prov][stad] || 0) + 1;
  }
  return Object.entries(provMap)
    .map(([provincie, steden]) => ({
      provincie,
      count: Object.values(steden).reduce((a, c) => a + c, 0),
      steden: Object.entries(steden)
        .map(([naam, count]) => ({ naam, count }))
        .sort((a, b) => b.count - a.count || a.naam.localeCompare(b.naam, 'nl')),
    }))
    .sort((a, b) => b.count - a.count || a.provincie.localeCompare(b.provincie, 'nl'));
}

const PROVINCIE_STEDEN: { provincie: string; count: number; steden: { naam: string; count: number }[] }[] = [
  { provincie: "Noord-Holland", count: 830, steden: [{naam: "Amsterdam", count: 396}, {naam: "Alkmaar", count: 46}, {naam: "Almere", count: 30}, {naam: "Hilversum", count: 30}, {naam: "Haarlem", count: 26}, {naam: "Heerhugowaard", count: 17}, {naam: "Zaandam", count: 16}, {naam: "Rijswijk", count: 8}, {naam: "Huizen", count: 7}, {naam: "Naarden", count: 7}, {naam: "Noordwijk", count: 7}, {naam: "Purmerend", count: 7}, {naam: "Amstelveen", count: 6}, {naam: "Ijmuiden", count: 6}, {naam: "Warmenhuizen", count: 6}, {naam: "Wormerveer", count: 6}, {naam: "Zwaagdijk", count: 6}, {naam: "Beverwijk", count: 5}, {naam: "Den Helder", count: 5}, {naam: "Diemen", count: 5}, {naam: "Enkhuizen", count: 5}, {naam: "Heemskerk", count: 5}, {naam: "Hoorn", count: 5}, {naam: "Volendam", count: 5}, {naam: "Wateringen", count: 5}, {naam: "Assendelft", count: 4}, {naam: "Castricum", count: 4}, {naam: "Cruquius", count: 4}, {naam: "Heemstede", count: 4}, {naam: "Heiloo", count: 4}, {naam: "Hoofddorp", count: 4}, {naam: "Zwaag", count: 4}, {naam: "Aalsmeer", count: 3}, {naam: "Edam", count: 3}, {naam: "Hem", count: 3}, {naam: "Laren", count: 3}, {naam: "Leidschendam", count: 3}, {naam: "Limmen", count: 3}, {naam: "Medemblik", count: 3}, {naam: "Nieuwe Niedorp", count: 3}, {naam: "Noord-Scharwoude", count: 3}, {naam: "Oosthuizen", count: 3}, {naam: "Uitgeest", count: 3}, {naam: "Wervershoof", count: 3}, {naam: "'S-Graveland", count: 2}, {naam: "Anna Paulowna", count: 2}, {naam: "De Goorn", count: 2}, {naam: "Den Burg", count: 2}, {naam: "Hippolytushoef", count: 2}, {naam: "Hoogkarspel", count: 2}, {naam: "Hoogwoud", count: 2}, {naam: "Koog Aan De Zaan", count: 2}, {naam: "Koog aan de Zaan", count: 2}, {naam: "Krommenie", count: 2}, {naam: "Loosdrecht", count: 2}, {naam: "Nieuw Vennep", count: 2}, {naam: "Oostzaan", count: 2}, {naam: "Oudeschild", count: 2}, {naam: "Overveen", count: 2}, {naam: "Schagen", count: 2}, {naam: "Schiphol", count: 2}, {naam: "Waarland", count: 2}, {naam: "AMSTERDAM", count: 1}, {naam: "Abcoude", count: 1}, {naam: "Aerdenhout", count: 1}, {naam: "Amstelhoek", count: 1}, {naam: "Andijk", count: 1}, {naam: "Ankeveen", count: 1}, {naam: "Avenhorn", count: 1}, {naam: "Baambrugge", count: 1}, {naam: "Badhoevedorp", count: 1}, {naam: "Bergen", count: 1}, {naam: "Blaricum", count: 1}, {naam: "Bloemendaal", count: 1}, {naam: "Breezand", count: 1}, {naam: "Broek Op Langedijk", count: 1}, {naam: "Broek op Langedijk", count: 1}, {naam: "Burgerveen", count: 1}, {naam: "Bussum", count: 1}, {naam: "De Cocksdorp", count: 1}, {naam: "De Koog", count: 1}, {naam: "De Rijp", count: 1}, {naam: "Den Oever", count: 1}, {naam: "Driehuis", count: 1}, {naam: "Duivendrecht", count: 1}, {naam: "Halfweg", count: 1}, {naam: "Hensbroek", count: 1}, {naam: "IJmuiden", count: 1}, {naam: "Julianadorp", count: 1}, {naam: "Katwijk", count: 1}, {naam: "Kwintsheul", count: 1}, {naam: "Laren Nh", count: 1}, {naam: "Lisse", count: 1}, {naam: "Lisserbroek", count: 1}, {naam: "Nederhorst Den Berg", count: 1}, {naam: "Nibbixwoud", count: 1}, {naam: "Nieuw-Vennep", count: 1}, {naam: "Obdam", count: 1}, {naam: "Oosterblokker", count: 1}, {naam: "Opmeer", count: 1}, {naam: "Oudorp", count: 1}, {naam: "Rijsenhout", count: 1}, {naam: "Santpoort-Zuid", count: 1}, {naam: "Sassenheim", count: 1}, {naam: "Schagerbrug", count: 1}, {naam: "Schellinkhout", count: 1}, {naam: "Schermerhorn", count: 1}, {naam: "Schoorl", count: 1}, {naam: "Sint Pancras", count: 1}, {naam: "Spierdijk", count: 1}, {naam: "Starnmeer", count: 1}, {naam: "Ursem", count: 1}, {naam: "Velsen-Noord", count: 1}, {naam: "Voorburg", count: 1}, {naam: "Voorhelmstraat 25 103", count: 1}, {naam: "Warder", count: 1}, {naam: "Wassenaar", count: 1}, {naam: "Watergang", count: 1}, {naam: "Westbeemster", count: 1}, {naam: "Wieringerwerf", count: 1}, {naam: "Winkel", count: 1}, {naam: "Wormer", count: 1}, {naam: "Zwaagdijk - Oost", count: 1}, {naam: "Zwaagdijk-Oost", count: 1}, {naam: "Zwanenburg", count: 1}] },
  { provincie: "Zuid-Holland", count: 676, steden: [{naam: "Rotterdam", count: 261}, {naam: "Den Haag", count: 121}, {naam: "Delft", count: 35}, {naam: "Leiden", count: 24}, {naam: "Gouda", count: 13}, {naam: "Naaldwijk", count: 12}, {naam: "Alphen aan den Rijn", count: 11}, {naam: "Zoetermeer", count: 9}, {naam: "Schiedam", count: 8}, {naam: "Alphen Aan Den Rijn", count: 7}, {naam: "De Lier", count: 7}, {naam: "Dordrecht", count: 6}, {naam: "'s-Gravenzande", count: 5}, {naam: "Barendrecht", count: 5}, {naam: "Berkel En Rodenrijs", count: 5}, {naam: "Bodegraven", count: 5}, {naam: "Poeldijk", count: 5}, {naam: "Waddinxveen", count: 5}, {naam: "Bergambacht", count: 4}, {naam: "Capelle Aan Den Ijssel", count: 4}, {naam: "Monster", count: 4}, {naam: "Nieuw Lekkerland", count: 4}, {naam: "Ouderkerk Aan Den Ijssel", count: 4}, {naam: "Schoonhoven", count: 4}, {naam: "Wassenaar", count: 4}, {naam: "Wateringen", count: 4}, {naam: "Kwintsheul", count: 3}, {naam: "Lisse", count: 3}, {naam: "Oegstgeest", count: 3}, {naam: "Pijnacker", count: 3}, {naam: "Reeuwijk", count: 3}, {naam: "Ter Aar", count: 3}, {naam: "Vlaardingen", count: 3}, {naam: "Alblasserdam", count: 2}, {naam: "Bleiswijk", count: 2}, {naam: "Capelle aan den IJssel", count: 2}, {naam: "Groot Ammers", count: 2}, {naam: "Haastrecht", count: 2}, {naam: "Leimuiden", count: 2}, {naam: "Nieuwkoop", count: 2}, {naam: "Nieuwpoort", count: 2}, {naam: "Noordwijk", count: 2}, {naam: "Noordwijkerhout", count: 2}, {naam: "ROTTERDAM", count: 2}, {naam: "Roelofarendsveen", count: 2}, {naam: "Stolwijk", count: 2}, {naam: "Voorschoten", count: 2}, {naam: "Zevenhuizen Zh", count: 2}, {naam: "Zoeterwoude", count: 2}, {naam: "'S-Gravenzande", count: 1}, {naam: "Aarlanderveen", count: 1}, {naam: "Benthuizen", count: 1}, {naam: "Bergschenhoek", count: 1}, {naam: "Berkel en Rodenrijs", count: 1}, {naam: "Berkenwoude", count: 1}, {naam: "Bleskensgraaf", count: 1}, {naam: "Boskoop", count: 1}, {naam: "Giessenburg", count: 1}, {naam: "Goudriaan", count: 1}, {naam: "Groot-Ammers", count: 1}, {naam: "Hazerswoude Dorp", count: 1}, {naam: "Hazerswoude-Dorp", count: 1}, {naam: "Hellevoetsluis", count: 1}, {naam: "Hillegom", count: 1}, {naam: "Honselersdijk", count: 1}, {naam: "Hoogmade", count: 1}, {naam: "Katwijk", count: 1}, {naam: "Katwijk Zh", count: 1}, {naam: "Koudekerk Aan Den Rijn", count: 1}, {naam: "Krimpen Aan De Lek", count: 1}, {naam: "Krimpen Aan Den Ijssel", count: 1}, {naam: "Leidschendam", count: 1}, {naam: "Lekkerkerk", count: 1}, {naam: "Maasdijk", count: 1}, {naam: "Maassluis", count: 1}, {naam: "Middelharnis", count: 1}, {naam: "Moerkapelle", count: 1}, {naam: "Moordrecht", count: 1}, {naam: "Nieuwerkerk Aan Den Ijssel", count: 1}, {naam: "Nieuwerkerk Ad Ijssel", count: 1}, {naam: "Nieuwveen", count: 1}, {naam: "Nootdorp", count: 1}, {naam: "Oud Alblas", count: 1}, {naam: "Oud-Ade", count: 1}, {naam: "Oud-Alblas", count: 1}, {naam: "Oud-Beijerland", count: 1}, {naam: "Ouddorp", count: 1}, {naam: "ROELOFARENDSVEEN", count: 1}, {naam: "Ridderkerk", count: 1}, {naam: "Rijswijk Zh", count: 1}, {naam: "Sassenheim", count: 1}, {naam: "Sliedrecht", count: 1}, {naam: "Vierpolders", count: 1}, {naam: "Voorhout", count: 1}, {naam: "Zwartewaal", count: 1}, {naam: "Zwijndrecht", count: 1}] },
  { provincie: "Noord-Brabant", count: 492, steden: [{naam: "Eindhoven", count: 82}, {naam: "Tilburg", count: 44}, {naam: "Helmond", count: 41}, {naam: "Den Bosch", count: 34}, {naam: "Breda", count: 30}, {naam: "Roosendaal", count: 8}, {naam: "Schijndel", count: 8}, {naam: "Veghel", count: 8}, {naam: "Veldhoven", count: 8}, {naam: "Gilze", count: 7}, {naam: "Oirschot", count: 7}, {naam: "Uden", count: 7}, {naam: "Waalwijk", count: 7}, {naam: "Deurne", count: 6}, {naam: "Best", count: 5}, {naam: "Geldrop", count: 5}, {naam: "Asten", count: 4}, {naam: "Dongen", count: 4}, {naam: "Etten-Leur", count: 4}, {naam: "Fijnaart", count: 4}, {naam: "Gemert", count: 4}, {naam: "Nuenen", count: 4}, {naam: "Oisterwijk", count: 4}, {naam: "Oss", count: 4}, {naam: "Raamsdonksveer", count: 4}, {naam: "Rosmalen", count: 4}, {naam: "Vught", count: 4}, {naam: "Zeeland", count: 4}, {naam: "Erp", count: 3}, {naam: "Goirle", count: 3}, {naam: "Heeswijk-Dinther", count: 3}, {naam: "Someren", count: 3}, {naam: "Wanroij", count: 3}, {naam: "Wernhout", count: 3}, {naam: "Zaltbommel", count: 3}, {naam: "Aarle-Rixtel", count: 2}, {naam: "Alphen Nb", count: 2}, {naam: "Bakel", count: 2}, {naam: "Berkel-Enschot", count: 2}, {naam: "Boxtel", count: 2}, {naam: "Chaam", count: 2}, {naam: "Cuijk", count: 2}, {naam: "Drunen", count: 2}, {naam: "Esch", count: 2}, {naam: "Hoogerheide", count: 2}, {naam: "Huijbergen", count: 2}, {naam: "Kaatsheuvel", count: 2}, {naam: "Mierlo", count: 2}, {naam: "Mill", count: 2}, {naam: "Moergestel", count: 2}, {naam: "Sint-Michielsgestel", count: 2}, {naam: "Sint-Oedenrode", count: 2}, {naam: "Son", count: 2}, {naam: "Sprundel", count: 2}, {naam: "Venhorst", count: 2}, {naam: "Venray", count: 2}, {naam: "Waspik", count: 2}, {naam: "Alphen", count: 1}, {naam: "Beek En Donk", count: 1}, {naam: "Beek en donk", count: 1}, {naam: "Beers Nb", count: 1}, {naam: "Bergeijk", count: 1}, {naam: "Bergen", count: 1}, {naam: "Bergen Op Zoom", count: 1}, {naam: "Bergen op Zoom", count: 1}, {naam: "Berlicum", count: 1}, {naam: "Berlicum Nb", count: 1}, {naam: "Bladel", count: 1}, {naam: "Boekel", count: 1}, {naam: "Boxmeer", count: 1}, {naam: "Cromvoirt", count: 1}, {naam: "De Moer", count: 1}, {naam: "Den Dungen", count: 1}, {naam: "Diessen", count: 1}, {naam: "Dinteloord", count: 1}, {naam: "Eerde", count: 1}, {naam: "Eersel", count: 1}, {naam: "Elsendorp", count: 1}, {naam: "Galder", count: 1}, {naam: "Geertruidenberg", count: 1}, {naam: "Gemonde", count: 1}, {naam: "Haaren", count: 1}, {naam: "Halsteren", count: 1}, {naam: "Heesch", count: 1}, {naam: "Heeswijk Dinther", count: 1}, {naam: "Heusden", count: 1}, {naam: "Hoogeloon", count: 1}, {naam: "Lage Mierde", count: 1}, {naam: "Langenboom", count: 1}, {naam: "Leende", count: 1}, {naam: "Loon op Zand", count: 1}, {naam: "Luyksgestel", count: 1}, {naam: "Made", count: 1}, {naam: "Mariahout", count: 1}, {naam: "Meijel", count: 1}, {naam: "Milheeze", count: 1}, {naam: "Neerkant", count: 1}, {naam: "Noordhoek", count: 1}, {naam: "Nuland", count: 1}, {naam: "Ommel", count: 1}, {naam: "Oostelbeers", count: 1}, {naam: "Oosterhout", count: 1}, {naam: "Poortvliet", count: 1}, {naam: "Raamsdonk", count: 1}, {naam: "Riel", count: 1}, {naam: "Rijen", count: 1}, {naam: "Rijsbergen", count: 1}, {naam: "Rucphen", count: 1}, {naam: "Scherpenisse", count: 1}, {naam: "Sint Agatha", count: 1}, {naam: "Sint Hubert", count: 1}, {naam: "Sint Maartensdijk", count: 1}, {naam: "Sint Philipsland", count: 1}, {naam: "Sint-Annaland", count: 1}, {naam: "Sprang Capelle", count: 1}, {naam: "Sprang-Capelle", count: 1}, {naam: "Stavenisse", count: 1}, {naam: "Steenbergen Nb", count: 1}, {naam: "TILBURG", count: 1}, {naam: "Teteringen", count: 1}, {naam: "Tholen", count: 1}, {naam: "Valkenswaard", count: 1}, {naam: "Vorstenbosch", count: 1}, {naam: "Waalre", count: 1}, {naam: "Wanssum", count: 1}, {naam: "Wouwse Plantage", count: 1}, {naam: "Zevenbergen", count: 1}, {naam: "Zundert", count: 1}, {naam: "’S-Hertogenbosch", count: 1}] },
  { provincie: "Utrecht", count: 411, steden: [{naam: "Utrecht", count: 101}, {naam: "Amersfoort", count: 44}, {naam: "Veenendaal", count: 17}, {naam: "Barneveld", count: 14}, {naam: "Houten", count: 14}, {naam: "Soest", count: 9}, {naam: "Putten", count: 8}, {naam: "Rotterdam", count: 8}, {naam: "Leusden", count: 6}, {naam: "Woerden", count: 6}, {naam: "Amerongen", count: 5}, {naam: "Kootwijkerbroek", count: 5}, {naam: "Mijdrecht", count: 5}, {naam: "Rhenen", count: 5}, {naam: "Vinkeveen", count: 5}, {naam: "Zeist", count: 5}, {naam: "Eemnes", count: 4}, {naam: "Harmelen", count: 4}, {naam: "Montfoort", count: 4}, {naam: "Nijkerk", count: 4}, {naam: "Oudewater", count: 4}, {naam: "Vlaardingen", count: 4}, {naam: "Zegveld", count: 4}, {naam: "Baarn", count: 3}, {naam: "Breukelen", count: 3}, {naam: "Bunnik", count: 3}, {naam: "Dordrecht", count: 3}, {naam: "Ermelo", count: 3}, {naam: "Giessenburg", count: 3}, {naam: "Hendrik Ido Ambacht", count: 3}, {naam: "IJsselstein", count: 3}, {naam: "Kockengen", count: 3}, {naam: "Maarssen", count: 3}, {naam: "Nieuwegein", count: 3}, {naam: "Sliedrecht", count: 3}, {naam: "Woudenberg", count: 3}, {naam: "Zeewolde", count: 3}, {naam: "Zwijndrecht", count: 3}, {naam: "Benschop", count: 2}, {naam: "Bunschoten Spakenburg", count: 2}, {naam: "Cothen", count: 2}, {naam: "De Bilt", count: 2}, {naam: "De Meern", count: 2}, {naam: "Driebergen-Rijsenburg", count: 2}, {naam: "Elst Ut", count: 2}, {naam: "Garderen", count: 2}, {naam: "Harderwijk", count: 2}, {naam: "Hendrik-Ido-Ambacht", count: 2}, {naam: "Hierden", count: 2}, {naam: "Hoevelaken", count: 2}, {naam: "Maarn", count: 2}, {naam: "Papekop", count: 2}, {naam: "Papendrecht", count: 2}, {naam: "Schiedam", count: 2}, {naam: "Soesterberg", count: 2}, {naam: "Werkhoven", count: 2}, {naam: "'S-Gravendeel", count: 1}, {naam: "Achterveld", count: 1}, {naam: "Bilthoven", count: 1}, {naam: "Bunschoten", count: 1}, {naam: "Bunschoten-Spakenburg", count: 1}, {naam: "Doorn", count: 1}, {naam: "Driebergen Rijsenb", count: 1}, {naam: "Goedereede", count: 1}, {naam: "Hardinxveen-Giessendam", count: 1}, {naam: "Hardinxveld Giessendam", count: 1}, {naam: "Hardinxveld-Giessendam", count: 1}, {naam: "Hellevoetsluis", count: 1}, {naam: "Ijsselstein", count: 1}, {naam: "Ijsselstein Ut", count: 1}, {naam: "Kamerik", count: 1}, {naam: "Linschoten", count: 1}, {naam: "Loenen", count: 1}, {naam: "Loenen Aan De Vecht", count: 1}, {naam: "Loenersloot", count: 1}, {naam: "Lopik", count: 1}, {naam: "Maarsbergen", count: 1}, {naam: "Maasland", count: 1}, {naam: "Maassluis", count: 1}, {naam: "Middelharnis", count: 1}, {naam: "Nieuwe-Tonge", count: 1}, {naam: "Ooltgensplaat", count: 1}, {naam: "Oostvoorne", count: 1}, {naam: "Ouddorp Zh", count: 1}, {naam: "Renswoude", count: 1}, {naam: "Rozenburg Zh", count: 1}, {naam: "Scherpenzeel", count: 1}, {naam: "Scherpenzeel Gld", count: 1}, {naam: "Sommelsdijk", count: 1}, {naam: "Stellendam", count: 1}, {naam: "Stoutenburg", count: 1}, {naam: "Stroe", count: 1}, {naam: "Terschuur", count: 1}, {naam: "Vleuten", count: 1}, {naam: "Voorthuizen", count: 1}, {naam: "Waarder", count: 1}, {naam: "Waverveen", count: 1}, {naam: "Wijk Bij Duurstede", count: 1}, {naam: "Wilnis", count: 1}, {naam: "Zuid-Beijerland", count: 1}, {naam: "Zuidland", count: 1}] },
  { provincie: "Gelderland", count: 411, steden: [{naam: "Arnhem", count: 40}, {naam: "Apeldoorn", count: 25}, {naam: "Nijmegen", count: 20}, {naam: "Ede", count: 15}, {naam: "Lunteren", count: 10}, {naam: "Lichtenvoorde", count: 9}, {naam: "Rijssen", count: 7}, {naam: "Winterswijk", count: 7}, {naam: "Didam", count: 6}, {naam: "Enter", count: 6}, {naam: "Wageningen", count: 6}, {naam: "Wijchen", count: 6}, {naam: "Doetinchem", count: 5}, {naam: "Geldermalsen", count: 5}, {naam: "Goor", count: 5}, {naam: "Oosterbeek", count: 5}, {naam: "Zelhem", count: 5}, {naam: "Deventer", count: 4}, {naam: "Duiven", count: 4}, {naam: "Etten", count: 4}, {naam: "Gendt", count: 4}, {naam: "Heteren", count: 4}, {naam: "Kesteren", count: 4}, {naam: "Werkendam", count: 4}, {naam: "Zutphen", count: 4}, {naam: "Aalten", count: 3}, {naam: "Andel", count: 3}, {naam: "Bennekom", count: 3}, {naam: "Delden", count: 3}, {naam: "Dieren", count: 3}, {naam: "Elst", count: 3}, {naam: "Gorinchem", count: 3}, {naam: "Haaksbergen", count: 3}, {naam: "Horssen", count: 3}, {naam: "Neede", count: 3}, {naam: "Nijverdal", count: 3}, {naam: "Oss", count: 3}, {naam: "Ruurlo", count: 3}, {naam: "Schaijk", count: 3}, {naam: "Velp", count: 3}, {naam: "Westervoort", count: 3}, {naam: "Zaltbommel", count: 3}, {naam: "Zevenaar", count: 3}, {naam: "Beek Gem Montferland", count: 2}, {naam: "Beekbergen", count: 2}, {naam: "Beesd", count: 2}, {naam: "Beuningen", count: 2}, {naam: "Borculo", count: 2}, {naam: "Brummen", count: 2}, {naam: "Culemborg", count: 2}, {naam: "Dinxperlo", count: 2}, {naam: "Doesburg", count: 2}, {naam: "Eerbeek", count: 2}, {naam: "Eibergen", count: 2}, {naam: "Gaanderen", count: 2}, {naam: "Gendringen", count: 2}, {naam: "Groenlo", count: 2}, {naam: "Halle", count: 2}, {naam: "Hedel", count: 2}, {naam: "Hengelo", count: 2}, {naam: "Huissen", count: 2}, {naam: "Hummelo", count: 2}, {naam: "Ingen", count: 2}, {naam: "Joppe", count: 2}, {naam: "Kerkdriel", count: 2}, {naam: "Lochem", count: 2}, {naam: "Loenen", count: 2}, {naam: "Markelo", count: 2}, {naam: "Molenhoek", count: 2}, {naam: "Nederhemert", count: 2}, {naam: "Ophemert", count: 2}, {naam: "Spankeren", count: 2}, {naam: "Tiel", count: 2}, {naam: "Twello", count: 2}, {naam: "Ulft", count: 2}, {naam: "Vianen", count: 2}, {naam: "Vorden", count: 2}, {naam: "Waardenburg", count: 2}, {naam: "Warnsveld", count: 2}, {naam: "Wekerom", count: 2}, {naam: "Wijk En Aalburg", count: 2}, {naam: "Winterswijk Brinkheurne", count: 2}, {naam: "Almen", count: 1}, {naam: "Altforst", count: 1}, {naam: "Ameide", count: 1}, {naam: "Angerlo", count: 1}, {naam: "Asperen", count: 1}, {naam: "Barneveld", count: 1}, {naam: "Bathmen", count: 1}, {naam: "Beek-Ubbergen", count: 1}, {naam: "Beltrum", count: 1}, {naam: "Bemmel", count: 1}, {naam: "Beneden-Leeuwen", count: 1}, {naam: "Berghem", count: 1}, {naam: "Beusichem", count: 1}, {naam: "Braamt", count: 1}, {naam: "Breedenbroek", count: 1}, {naam: "Deil", count: 1}, {naam: "Diepenveen", count: 1}, {naam: "Druten", count: 1}, {naam: "Echteld", count: 1}, {naam: "Ederveen", count: 1}, {naam: "Ermelo", count: 1}, {naam: "Geffen", count: 1}, {naam: "Giesbeek", count: 1}, {naam: "Giessen", count: 1}, {naam: "Grave", count: 1}, {naam: "Haarle", count: 1}, {naam: "Hagestein", count: 1}, {naam: "Harfsen", count: 1}, {naam: "Harskamp", count: 1}, {naam: "Heelweg", count: 1}, {naam: "Heilig Landstichting", count: 1}, {naam: "Hellouw", count: 1}, {naam: "Hemmen", count: 1}, {naam: "Hengevelde", count: 1}, {naam: "Herwijnen", count: 1}, {naam: "Heukelum", count: 1}, {naam: "Hoornaar", count: 1}, {naam: "Keijenborg", count: 1}, {naam: "Klarenbeek", count: 1}, {naam: "Leerdam", count: 1}, {naam: "Leuvenheim", count: 1}, {naam: "Lexmond", count: 1}, {naam: "Loerbeek", count: 1}, {naam: "Maurik", count: 1}, {naam: "Nijkerk", count: 1}, {naam: "Ochten", count: 1}, {naam: "Renkum", count: 1}, {naam: "Rheden", count: 1}, {naam: "Rietmolen", count: 1}, {naam: "Rijswijk", count: 1}, {naam: "Rozendaal", count: 1}, {naam: "Rumpt", count: 1}, {naam: "Terborg", count: 1}, {naam: "Varsseveld", count: 1}, {naam: "Vianen Ut", count: 1}, {naam: "Wadenoijen", count: 1}, {naam: "Wehl", count: 1}, {naam: "Wijk en Aalburg", count: 1}, {naam: "Winterswijk Meddo", count: 1}, {naam: "Winterswijk Miste", count: 1}, {naam: "Woudrichem", count: 1}, {naam: "Zieuwent", count: 1}, {naam: "Zoelen", count: 1}, {naam: "Zoelmond", count: 1}, {naam: "Zuilichem", count: 1}] },
  { provincie: "Overijssel", count: 246, steden: [{naam: "Deventer", count: 30}, {naam: "Zwolle", count: 22}, {naam: "Hengelo", count: 14}, {naam: "Enschede", count: 13}, {naam: "Nieuwleusen", count: 6}, {naam: "Almelo", count: 5}, {naam: "Borne", count: 5}, {naam: "Nijverdal", count: 5}, {naam: "Oldenzaal", count: 5}, {naam: "Raalte", count: 5}, {naam: "Rijssen", count: 5}, {naam: "Vriezenveen", count: 5}, {naam: "Albergen", count: 4}, {naam: "Bornerbroek", count: 4}, {naam: "Dalfsen", count: 4}, {naam: "Deurningen", count: 4}, {naam: "Ommen", count: 4}, {naam: "Ootmarsum", count: 4}, {naam: "Vroomshoop", count: 4}, {naam: "Wierden", count: 4}, {naam: "Dedemsvaart", count: 3}, {naam: "Epe", count: 3}, {naam: "Hoogeveen", count: 3}, {naam: "Zuidwolde", count: 3}, {naam: "Broekland", count: 2}, {naam: "Daarle", count: 2}, {naam: "Doornspijk", count: 2}, {naam: "Elspeet", count: 2}, {naam: "Haaksbergen", count: 2}, {naam: "Hardenberg", count: 2}, {naam: "Marienheem", count: 2}, {naam: "Nieuw Schoonebeek", count: 2}, {naam: "Nunspeet", count: 2}, {naam: "Oldebroek", count: 2}, {naam: "Reutum", count: 2}, {naam: "Rossum Ov", count: 2}, {naam: "Saasveld", count: 2}, {naam: "Tubbergen", count: 2}, {naam: "Valthermond", count: 2}, {naam: "'T Harde", count: 1}, {naam: "Agelo", count: 1}, {naam: "Ane", count: 1}, {naam: "Balkbrug", count: 1}, {naam: "Bathmen", count: 1}, {naam: "Dalerveen", count: 1}, {naam: "De Lutte", count: 1}, {naam: "Delden", count: 1}, {naam: "Den Ham", count: 1}, {naam: "Dwingeloo", count: 1}, {naam: "Echten", count: 1}, {naam: "Emmen", count: 1}, {naam: "Emst", count: 1}, {naam: "Erica", count: 1}, {naam: "Erm", count: 1}, {naam: "Fleringen", count: 1}, {naam: "Geesteren", count: 1}, {naam: "Geesteren Ov", count: 1}, {naam: "Havelte", count: 1}, {naam: "Heerde", count: 1}, {naam: "Heino", count: 1}, {naam: "Hellendoorn", count: 1}, {naam: "Hollandscheveld", count: 1}, {naam: "Klazienaveen", count: 1}, {naam: "Langeveen", count: 1}, {naam: "Lattrop", count: 1}, {naam: "Lattrop-Breklenkamp", count: 1}, {naam: "Lemele", count: 1}, {naam: "Lemelerveld", count: 1}, {naam: "Luttenberg", count: 1}, {naam: "Meppel", count: 1}, {naam: "Nieuw Balinge", count: 1}, {naam: "Nieuw-Schoonebeek", count: 1}, {naam: "Oosterwolde Gld", count: 1}, {naam: "Overdinkel", count: 1}, {naam: "Pesse", count: 1}, {naam: "Rouveen", count: 1}, {naam: "Schuinesloot", count: 1}, {naam: "Sibculo", count: 1}, {naam: "Staphorst", count: 1}, {naam: "Stuifzand", count: 1}, {naam: "Tilligte", count: 1}, {naam: "Vaassen", count: 1}, {naam: "Veeningen", count: 1}, {naam: "Vilsteren", count: 1}, {naam: "Vorchten", count: 1}, {naam: "Wapenveld", count: 1}, {naam: "Wapse", count: 1}, {naam: "Wezep", count: 1}, {naam: "Wijhe", count: 1}, {naam: "Zenderen", count: 1}, {naam: "Zwartemeer", count: 1}] },
  { provincie: "Limburg", count: 154, steden: [{naam: "Maastricht", count: 24}, {naam: "Venlo", count: 15}, {naam: "Roermond", count: 9}, {naam: "Heerlen", count: 7}, {naam: "Nijmegen", count: 7}, {naam: "Sittard", count: 6}, {naam: "Horst", count: 4}, {naam: "Nuth", count: 4}, {naam: "Tegelen", count: 4}, {naam: "Weert", count: 4}, {naam: "Groesbeek", count: 3}, {naam: "Beek", count: 2}, {naam: "Belfeld", count: 2}, {naam: "Born", count: 2}, {naam: "Brunssum", count: 2}, {naam: "Budel", count: 2}, {naam: "Heythuysen", count: 2}, {naam: "Klimmen", count: 2}, {naam: "Kronenberg", count: 2}, {naam: "Margraten", count: 2}, {naam: "Schinnen", count: 2}, {naam: "Valkenburg", count: 2}, {naam: "Ysselsteyn Lb", count: 2}, {naam: "Amstenrade", count: 1}, {naam: "Baarlo", count: 1}, {naam: "Beek LB", count: 1}, {naam: "Beesel", count: 1}, {naam: "Bergen", count: 1}, {naam: "Beringe", count: 1}, {naam: "Beugen", count: 1}, {naam: "Boxmeer", count: 1}, {naam: "Broekhuizenvorst", count: 1}, {naam: "Bunde", count: 1}, {naam: "Echt", count: 1}, {naam: "Elsloo", count: 1}, {naam: "Eperheide", count: 1}, {naam: "Geleen", count: 1}, {naam: "Geulle", count: 1}, {naam: "Haelen", count: 1}, {naam: "Heijen", count: 1}, {naam: "Hoensbroek", count: 1}, {naam: "Holtum", count: 1}, {naam: "Kerkrade", count: 1}, {naam: "Kessel Lb", count: 1}, {naam: "Landgraaf", count: 1}, {naam: "Leuth", count: 1}, {naam: "Lomm", count: 1}, {naam: "Maarheeze", count: 1}, {naam: "Maasbree", count: 1}, {naam: "Maastricht airport", count: 1}, {naam: "Meterik", count: 1}, {naam: "Mheer", count: 1}, {naam: "Millingen Aan De Rijn", count: 1}, {naam: "Molenhoek Lb", count: 1}, {naam: "Oploo", count: 1}, {naam: "Panheel", count: 1}, {naam: "Schimmert", count: 1}, {naam: "Sevenum", count: 1}, {naam: "Simpelveld", count: 1}, {naam: "Sint Anthonis", count: 1}, {naam: "Sint Odiliënberg", count: 1}, {naam: "Soerendonk", count: 1}, {naam: "Swalmen", count: 1}, {naam: "Thorn", count: 1}, {naam: "Venray", count: 1}, {naam: "Wellerlooi", count: 1}] },
  { provincie: "Friesland", count: 120, steden: [{naam: "Leeuwarden", count: 30}, {naam: "Drachten", count: 8}, {naam: "Wolvega", count: 8}, {naam: "Sneek", count: 6}, {naam: "Heerenveen", count: 5}, {naam: "Dokkum", count: 4}, {naam: "Bolsward", count: 3}, {naam: "Garyp", count: 3}, {naam: "Joure", count: 3}, {naam: "Surhuisterveen", count: 3}, {naam: "Franeker", count: 2}, {naam: "Heeg", count: 2}, {naam: "Kollumerzwaag", count: 2}, {naam: "Lemmer", count: 2}, {naam: "Westergeest", count: 2}, {naam: "Appelscha", count: 1}, {naam: "Arum", count: 1}, {naam: "Balk", count: 1}, {naam: "Ballum", count: 1}, {naam: "Boazum", count: 1}, {naam: "Burdaard", count: 1}, {naam: "Burgum", count: 1}, {naam: "Ferwert", count: 1}, {naam: "Gorredijk", count: 1}, {naam: "Hantum", count: 1}, {naam: "Harkema", count: 1}, {naam: "Harlingen", count: 1}, {naam: "Haulerwijk", count: 1}, {naam: "Holwerd", count: 1}, {naam: "Hommerts", count: 1}, {naam: "Houtigehage", count: 1}, {naam: "Hurdegarijp", count: 1}, {naam: "Katlijk", count: 1}, {naam: "Kollum", count: 1}, {naam: "Noardburgum", count: 1}, {naam: "Oostermeer", count: 1}, {naam: "Oosternijkerk", count: 1}, {naam: "Oosterwolde Fr", count: 1}, {naam: "Oudehorne", count: 1}, {naam: "Pingjum", count: 1}, {naam: "Rottum", count: 1}, {naam: "Schiermonnikoog", count: 1}, {naam: "Sumar", count: 1}, {naam: "Ter Idzard", count: 1}, {naam: "Tirns", count: 1}, {naam: "Twijzelerheide", count: 1}, {naam: "Tzummarum", count: 1}, {naam: "Ureterp", count: 1}, {naam: "Winsum Fr", count: 1}, {naam: "Witmarsum", count: 1}, {naam: "Wons", count: 1}, {naam: "Woudsend", count: 1}] },
  { provincie: "Groningen", count: 116, steden: [{naam: "Groningen", count: 55}, {naam: "Veendam", count: 4}, {naam: "Grou", count: 3}, {naam: "Leek", count: 3}, {naam: "Berlikum", count: 2}, {naam: "Grootegast", count: 2}, {naam: "Jelsum", count: 2}, {naam: "Marum", count: 2}, {naam: "Noordhorn", count: 2}, {naam: "Peize", count: 2}, {naam: "Stadskanaal", count: 2}, {naam: "Winschoten", count: 2}, {naam: "'T Zandt", count: 1}, {naam: "Aldtsjerk", count: 1}, {naam: "Alteveer Gn", count: 1}, {naam: "Boerakker", count: 1}, {naam: "Delfzijl", count: 1}, {naam: "Eelde", count: 1}, {naam: "Eexterveen", count: 1}, {naam: "Garmerwolde", count: 1}, {naam: "Garnwerd", count: 1}, {naam: "Goutum", count: 1}, {naam: "Haren Gn", count: 1}, {naam: "Harkstede", count: 1}, {naam: "Heiligerlee", count: 1}, {naam: "Kloosterburen", count: 1}, {naam: "Mantgum", count: 1}, {naam: "Menaam", count: 1}, {naam: "Musselkanaal", count: 1}, {naam: "Niekerk Grootegast", count: 1}, {naam: "Nieuw Buinen", count: 1}, {naam: "Nieuwolda", count: 1}, {naam: "Nuis", count: 1}, {naam: "Onstwedde", count: 1}, {naam: "Oosterwierum", count: 1}, {naam: "Paterswolde", count: 1}, {naam: "Roden", count: 1}, {naam: "Roodeschool", count: 1}, {naam: "Siddeburen", count: 1}, {naam: "Sint Annaparochie", count: 1}, {naam: "St jacobiparochie", count: 1}, {naam: "Ter Apel", count: 1}, {naam: "Uithuizen", count: 1}, {naam: "Uithuizermeeden", count: 1}, {naam: "Wergea", count: 1}, {naam: "Winsum", count: 1}, {naam: "Winsum Gn", count: 1}] },
  { provincie: "Zeeland", count: 60, steden: [{naam: "Bergen op Zoom", count: 8}, {naam: "Middelburg", count: 8}, {naam: "Goes", count: 6}, {naam: "Zierikzee", count: 4}, {naam: "Kruiningen", count: 3}, {naam: "Borssele", count: 2}, {naam: "Oostburg", count: 2}, {naam: "Vlissingen", count: 2}, {naam: "Vrouwenpolder", count: 2}, {naam: "'S-Gravenpolder", count: 1}, {naam: "'S-Heer Abtskerke", count: 1}, {naam: "'S-Heer Arendskerke", count: 1}, {naam: "Aagtekerke", count: 1}, {naam: "Arnemuiden", count: 1}, {naam: "Axel", count: 1}, {naam: "Bruinisse", count: 1}, {naam: "Graauw", count: 1}, {naam: "Heinkenszand", count: 1}, {naam: "Hengstdijk", count: 1}, {naam: "Hulst", count: 1}, {naam: "Kamperland", count: 1}, {naam: "Kapelle", count: 1}, {naam: "Kloosterzande", count: 1}, {naam: "Kortgene", count: 1}, {naam: "Koudekerke", count: 1}, {naam: "Kwadendamme", count: 1}, {naam: "Meliskerke", count: 1}, {naam: "Nieuwerkerk", count: 1}, {naam: "Rilland", count: 1}, {naam: "Serooskerke Walcheren", count: 1}, {naam: "Sint Jansteen", count: 1}, {naam: "Terneuzen", count: 1}] },
  { provincie: "Drenthe", count: 48, steden: [{naam: "Emmen", count: 21}, {naam: "Meppel", count: 7}, {naam: "Assen", count: 5}, {naam: "Beilen", count: 3}, {naam: "Zeijen", count: 2}, {naam: "Coevorden", count: 1}, {naam: "Ekehaar", count: 1}, {naam: "Gieten", count: 1}, {naam: "Staphorst", count: 1}, {naam: "Tynaarlo", count: 1}, {naam: "Uffelte", count: 1}, {naam: "Valthermond", count: 1}, {naam: "Veenoord", count: 1}, {naam: "Yde", count: 1}, {naam: "Zuidlaren", count: 1}] },
  { provincie: "Flevoland", count: 44, steden: [{naam: "Emmeloord", count: 10}, {naam: "Kampen", count: 6}, {naam: "IJsselmuiden", count: 3}, {naam: "Almere", count: 2}, {naam: "Genemuiden", count: 2}, {naam: "Ijsselmuiden", count: 2}, {naam: "Steenwijk", count: 2}, {naam: "Vledder", count: 2}, {naam: "Weesp", count: 2}, {naam: "Basse", count: 1}, {naam: "Biddinghuizen", count: 1}, {naam: "Giethoorn", count: 1}, {naam: "Lelystad", count: 1}, {naam: "Muiden", count: 1}, {naam: "Nijensleek", count: 1}, {naam: "Oldemarkt", count: 1}, {naam: "Rutten", count: 1}, {naam: "Sint Jansklooster", count: 1}, {naam: "Urk", count: 1}, {naam: "Vollenhove", count: 1}, {naam: "Wilsum", count: 1}, {naam: "Zandhuizen", count: 1}] },
];

// ORDER: Efficiënte lus vanuit Hengelo (Oost) -> Midden -> Noord-West -> Zuid-West -> Zuid -> Zuid-Oost -> Terug
const GEO_PROVINCE_ORDER: Record<string, number> = {
    // 1. START OMGEVING (Oost)
    'hengelo': 0, 'enschede': 1, 'almelo': 2, 'oldenzaal': 2, 'overijssel': 2,
    
    // 2. RICHTING WESTEN (Via A1)
    'deventer': 10, 'apeldoorn': 11, 'ede': 12, 'barneveld': 12, 'amersfoort': 13, 'hilversum': 14, 'utrecht': 15, 'zeist': 15, 'nieuwegein': 15, 'gelderland': 11,
    
    // 3. NOORD-HOLLAND & FLEVOLAND
    'almere': 20, 'lelystad': 21, 'amsterdam': 22, 'zaanstad': 23, 'purmerend': 23, 'alkmaar': 24, 'haarlem': 25, 'haarlemmermeer': 26, 'amstelveen': 26, 'schiphol': 26, 'noord-holland': 22, 'flevoland': 20,
    
    // 4. ZUID-HOLLAND (Noord naar Zuid zakken)
    'leiden': 30, 'alphen aan den rijn': 31, 'den haag': 32, 'zoetermeer': 33, 'delft': 34, 'westland': 34, 'rotterdam': 35, 'schiedam': 35, 'vlaardingen': 35, 'spijkenisse': 36, 'dordrecht': 37, 'gorinchem': 38, 'gouda': 38, 'zuid-holland': 35,
    
    // 5. ZEELAND & WEST-BRABANT
    'middelburg': 40, 'vlissingen': 40, 'bergen op zoom': 41, 'roosendaal': 42, 'breda': 43, 'oosterhout': 43, 'zeeland': 40,
    
    // 6. MIDDEN-BRABANT & OOST-BRABANT
    'tilburg': 50, 'waalwijk': 50, "'s-hertogenbosch": 51, 'den bosch': 51, 'oss': 52, 'eindhoven': 53, 'helmond': 54, 'noord-brabant': 51,
    
    // 7. LIMBURG (Zuidelijkste punt, dan terug omhoog)
    'weert': 60, 'roermond': 61, 'sittard-geleen': 62, 'heerlen': 63, 'maastricht': 64, 'venlo': 65, 'limburg': 61,
    
    // 8. TERUGWEG (Via Arnhem/Nijmegen)
    'nijmegen': 70, 'arnhem': 71, 'doetinchem': 72,
    
    // 9. NOORDEN (Apart lusje indien nodig)
    'zwolle': 80, 'emmen': 81, 'assen': 82, 'groningen': 83, 'leeuwarden': 84, 'drenthe': 81, 'friesland': 84
};

// Bekende/grote namen in NL bouw & architectuur — op basis van Cobouw50, Archello top25, PropertyNL top25
// Match op substring van bedrijfsnaam (lowercase). Score = extra relevantiepoints.
const NAME_BOOST: [string, number][] = [
  // === ARCHITECTEN (internationaal / nationaal top) ===
  ['oma',            100], ['mvrdv',          100], ['unstudio',        100], ['un studio',       100],
  ['mecanoo',        100], ['kaan architect', 100], ['benthem crouwel', 100], ['neutelings',       90],
  ['powerhouse company', 90], ['nl architects', 85], ['egm architect',  85], ['next architect',   85],
  ['cepezed',         85], ['kraaijvanger',    85], ['zecc',            80], ['fokkema',           80],
  ['wiel arets',      80], ['studioninedots',  80], ['search architect', 80], ['paul de ruiter',   80],
  ['mvsa',            80], ['i29',             75], ['concrete architect', 75], ['group a',         75],
  ['office winhov',   75], ['atelier pro',     75], ['zja',             80], ['zwarts',            80],
  ['de architekten cie', 85], ['ector hoogstad', 80], ['mei architect', 80], ['vmx architect',    75],
  ['de zwarte hond',  75], ['broekbakema',     75], ['west 8',          80], ['rijnboutt',         70],
  ['dok architect',   70], ['geurst',          70], ['wiegerinck',      70], ['bureau sla',        70],
  ['claus en kaan',   85], ['diener',          70], ['seARCH',          75], ['ateliereen',        65],
  ['architecten cie', 80], ['van gameren',     70], ['office for metropolitan', 100],
  ['zwarts & jansma', 80], ['zwarts en jansma', 80], ['winhov',         75], ['arons en gelauff', 70],
  ['bedaux de brouwer', 65], ['buro sant en co', 65], ['karres en brands', 65],
  ['jan des bouvrie', 65], ['royal haskoning',  75], ['arcadis',         75], ['sweco',            80],

  // === BOUWBEDRIJVEN & AANNEMERS (Cobouw50 top) ===
  ['bam ',            100], ['koninklijke bam', 100], ['volkerwessels',  100], ['volker wessels',  100],
  ['boskalis',        100], ['tbi ',             95], ['heijmans',        95], ['van oord',         90],
  ['dura vermeer',     90], ['strukton',          90], ['van wijnen',      90], ['ballast nedam',    90],
  ['koop ',            80], ['j.p. van eesteren', 85], ['jp van eesteren', 85], ['kondor wessels',  80],
  ['hurks',            80], ['nijhuis bouw',      80], ['roosdom tijhuis', 75], ['trebbe',           75],
  ['aan de stegge',    75], ['klokbouw',           75], ['volker staal',   75], ['croonenborch',     70],
  ['heembouw',         80], ['am bouw',            70], ['bpd',             70], ['ymere',            65],
  ['bouwinvest',       70], ['synchroon',           70], ['era contour',    65], ['ten brinke',       70],
  ['wonen limburg',    60], ['janssen de jong',    80], ['dura',            75], ['visser & smit',    80],
  ['gmb',              70], ['mobilis',             75], ['volker infra',   80], ['cofely',           70],
  ['imtech',           70], ['royal volpak',        65], ['kooyman',        65], ['dusseldorp',       65],
  ['ooms',             65], ['bouwfonds',           65], ['van den herik',   75], ['hakkers',          65],
];

// Lookup: geeft extra score als bedrijfsnaam een bekende naam bevat
const getNameBoost = (naam: string): number => {
  const n = (naam || '').toLowerCase();
  for (const [key, pts] of NAME_BOOST) {
    if (n.includes(key.toLowerCase())) return pts;
  }
  return 0;
};

// Nieuw-badge: bronnen die recentelijk zijn toegevoegd aan de database
const SOURCE_ADDED_DATES: Record<string, string> = {
  'BNA': '2026-07-01',
  'Architectenweb': '2026-07-01',
};
const NEW_BADGE_DAYS = 7;
const isNew = (b: any): boolean => {
  const sources: string[] = b._sources?.length ? b._sources : [b.source || ''];
  return sources.some(src => {
    const dateStr = SOURCE_ADDED_DATES[src];
    if (!dateStr) return false;
    const diffDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= NEW_BADGE_DAYS;
  });
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; btn: string; btnHover: string }> = {
  'Bouwgarant':    { bg: 'bg-[#009FE3]/10', text: 'text-[#009FE3]', btn: 'bg-[#009FE3]', btnHover: 'hover:bg-[#008ac5]' },
  'Architectenweb':{ bg: 'bg-[#E85E26]/10', text: 'text-[#E85E26]', btn: 'bg-[#E85E26]', btnHover: 'hover:bg-[#d14d1b]' },
  'BNA':           { bg: 'bg-[#1B4F72]/10', text: 'text-[#1B4F72]', btn: 'bg-[#1B4F72]', btnHover: 'hover:bg-[#154060]' },
  'Stiho':         { bg: 'bg-orange-100',   text: 'text-orange-700', btn: 'bg-orange-600', btnHover: 'hover:bg-orange-700' },
  'Jongeneel':     { bg: 'bg-green-100',    text: 'text-green-700',  btn: 'bg-green-600',  btnHover: 'hover:bg-green-700' },
  'BouwPartner':   { bg: 'bg-yellow-100',   text: 'text-yellow-700', btn: 'bg-yellow-600', btnHover: 'hover:bg-yellow-700' },
  'PontMeyer':     { bg: 'bg-red-100',      text: 'text-red-700',    btn: 'bg-red-600',    btnHover: 'hover:bg-red-700' },
  'Van Wijnen':    { bg: 'bg-teal-100',     text: 'text-teal-700',   btn: 'bg-teal-600',   btnHover: 'hover:bg-teal-700' },
  'Plegt-Vos':     { bg: 'bg-indigo-100',   text: 'text-indigo-700', btn: 'bg-indigo-600', btnHover: 'hover:bg-indigo-700' },
  'VolkerWessels': { bg: 'bg-pink-100',     text: 'text-pink-700',   btn: 'bg-pink-600',   btnHover: 'hover:bg-pink-700' },
  'Onbekend':      { bg: 'bg-slate-100',    text: 'text-slate-500',  btn: 'bg-slate-500',  btnHover: 'hover:bg-slate-600' },
};
const srcColor = (source: string) => SOURCE_COLORS[source] || SOURCE_COLORS['Onbekend'];
// A "real" source (Bouwgarant, Architectenweb, ...) always outranks "Onbekend" —
// if a company also has a known source, the meaningless "Onbekend" badge/button is dropped.
const visibleSources = (b: any): string[] => {
  const all: string[] = b._sources?.length ? b._sources : b.source ? [b.source] : [];
  const real = all.filter((s: string) => s !== 'Onbekend');
  return real.length ? real : all;
};

// Bronnen die zelf één landelijke keten zijn (elke entry is een vestiging van dezelfde
// onderneming) — hier volstaat de brand-naam soms niet (bv. "Stiho Amsterdam Amstel",
// "PontMeyer Rotterdam Noord" hebben een extra locatie-detail na de stad), dus voor deze
// bronnen groeperen we simpelweg op bron in plaats van op naam.
const VESTIGING_CHAIN_SOURCES = new Set(['stiho', 'jongeneel', 'pontmeyer', 'van wijnen', 'plegt-vos']);

// Kernnaam voor het groeperen van vestigingen (zelfde logica als in MapView.tsx): strip
// rechtsvorm-suffixen en, als de naam eindigt op de eigen plaatsnaam ("INBO Rotterdam"),
// ook die plaats — zo groeperen "INBO Rotterdam" en "INBO Eindhoven" onder de kern "inbo".
// Regionale divisie-namen die bedrijven met meerdere vestigingen vaak achter hun naam
// zetten (bv. "Plegt-Vos Oost", "Plegt-Vos Midden") — strippen zodat ze onder dezelfde
// kernnaam groeperen, net als de stad-suffix hieronder.
const REGIO_SUFFIXES = /\b(noordoost|noordwest|zuidoost|zuidwest|noord|oost|zuid|west|midden)\b/g;
const vestigingCoreNaam = (naam: string, stad: string, source?: string): string => {
  const src = (source || '').toLowerCase().trim();
  if (VESTIGING_CHAIN_SOURCES.has(src)) return `keten:${src}`;
  let n = (naam || '').toLowerCase()
    .replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const s = (stad || '').toLowerCase().trim();
  if (s) {
    if (n === s) n = '';
    else if (n.endsWith(' ' + s)) n = n.slice(0, -(s.length + 1)).trim();
  }
  n = n.replace(REGIO_SUFFIXES, '').replace(/\s+/g, ' ').trim();
  return n;
};
const vestigingAddrKey = (b: any): string => `${(b.straat || '').toLowerCase().trim()}|${(b.postcode || '').toLowerCase().replace(/\s/g, '')}`;
// Andere adressen van hetzelfde bedrijf (andere vestigingen), voor het bedrijfsprofiel-paneel.
const getAndereVestigingen = (b: any, allData: any[]): any[] => {
  const core = vestigingCoreNaam(b.naam, b.stad, b.source);
  if (!core || core.length < 3) return [];
  const seen = new Set<string>([vestigingAddrKey(b)]);
  const out: any[] = [];
  for (const other of allData) {
    if (other === b) continue;
    if (vestigingCoreNaam(other.naam, other.stad, other.source) !== core) continue;
    const k = vestigingAddrKey(other);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(other);
  }
  return out.sort((a, b2) => (a.stad || '').localeCompare(b2.stad || '', 'nl'));
};

const SourceBadges = ({ b, size = 'sm' }: { b: any; size?: 'sm' | 'md' }) => {
  const sources: string[] = visibleSources(b);
  const cls = size === 'md' ? 'text-[10px] px-2 py-0.5' : 'text-[9px] px-1.5 py-0.5';
  return <>{sources.map((s: string, i: number) => (
    <span key={i} className={`${cls} font-bold rounded flex-shrink-0 ${srcColor(s).bg} ${srcColor(s).text}`}>{s}</span>
  ))}</>;
};

const getGeoScore = (city: string) => {
    const key = city.toLowerCase().trim();
    if (GEO_PROVINCE_ORDER[key] !== undefined) return GEO_PROVINCE_ORDER[key];
    // Fallback: match partial
    for (const k in GEO_PROVINCE_ORDER) {
        if (key.includes(k)) return GEO_PROVINCE_ORDER[k];
    }
    return 99; // Unknown locations last
};

const App: React.FC = () => {
  // AUTH STATE
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // LOGIN FORM
  const [loginIdent, setLoginIdent] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // REGISTER FORM
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // SETTINGS MODAL
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profiel' | 'voorkeuren' | 'audit'>('profiel');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // GEBRUIKERSVOORKEUREN (persistent via localStorage)
  const DEFAULT_HQ_ADDRESS = 'Lansinkesweg 4, 7553 AE Hengelo';
  // Volledig bedrijfsadres — bepaalt het standaard middelpunt voor straal-zoeken en
  // de "km van ..." afstandsweergave. Per gebruiker aan te passen bij Instellingen.
  const [prefAddress, setPrefAddressState] = useState<string>(() =>
    localStorage.getItem('inncempro_pref_address') || DEFAULT_HQ_ADDRESS);
  const [prefAddressCoords, setPrefAddressCoords] = useState<{ lat: number; lng: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem('inncempro_pref_address_coords') || 'null'); } catch { return null; }
  });
  const [prefAddressGeocoding, setPrefAddressGeocoding] = useState(false);
  const [prefSort, setPrefSort] = useState<'relevant' | 'az'>(() =>
    (localStorage.getItem('inncempro_pref_sort') as 'relevant' | 'az') || 'relevant');
  const [prefResultsPerPage, setPrefResultsPerPage] = useState<number>(() =>
    Number(localStorage.getItem('inncempro_pref_rpp')) || 10);
  const [prefCardFields, setPrefCardFields] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('inncempro_pref_card') || '{}'); } catch { return {}; }
  });

  const cardFieldDefault: Record<string, boolean> = {
    afstand: true, specs: true, telefoon: true, email: true, rechtsvorm: true,
  };
  const showField = (key: string) => prefCardFields[key] !== undefined ? prefCardFields[key] : cardFieldDefault[key];

  const savePrefSort = (v: 'relevant' | 'az') => { setPrefSort(v); setSortMode(v); localStorage.setItem('inncempro_pref_sort', v); };
  const savePrefRpp = (v: number) => { setPrefResultsPerPage(v); localStorage.setItem('inncempro_pref_rpp', String(v)); };
  const toggleCardField = (key: string) => {
    const next = { ...cardFieldDefault, ...prefCardFields, [key]: !showField(key) };
    setPrefCardFields(next);
    localStorage.setItem('inncempro_pref_card', JSON.stringify(next));
  };

  // Geocodeert het bedrijfsadres via Nominatim en cachet het resultaat, zodat straal-zoeken
  // en de afstandsweergave een precies punt hebben in plaats van alleen een plaatsnaam.
  const geocodeAddress = async (address: string) => {
    setPrefAddressGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Nederland')}&countrycodes=nl&limit=1`,
        { headers: { 'Accept-Language': 'nl', 'User-Agent': 'Inncempro/1.0' } },
      );
      const data = await res.json();
      const hit = data?.[0];
      if (hit) {
        const coords = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
        setPrefAddressCoords(coords);
        localStorage.setItem('inncempro_pref_address_coords', JSON.stringify(coords));
      }
    } catch { /* laat de vorige (of standaard) coördinaten staan bij een netwerkfout */ }
    setPrefAddressGeocoding(false);
  };

  const savePrefAddress = (v: string) => {
    setPrefAddressState(v);
    localStorage.setItem('inncempro_pref_address', v);
    if (v.trim()) geocodeAddress(v.trim());
  };

  // Eerste keer laden zonder gecachete coördinaten (bv. na een update van de app): geocode
  // het (eventueel standaard) adres één keer automatisch.
  useEffect(() => {
    if (!prefAddressCoords && prefAddress.trim()) geocodeAddress(prefAddress.trim());
  }, []);

  // Coördinaten van het bedrijfsadres — valt terug op Hengelo-centrum zolang het adres nog
  // niet (opnieuw) gegeocodeerd is.
  const hqCoords = prefAddressCoords || DUTCH_CITY_COORDS['hengelo'] || { lat: 52.2549, lng: 6.7782 };
  // Korte label voor badges/teksten (bv. "Hengelo" i.p.v. het volledige adres) — pakt het
  // laatste kommadeel en strip een eventuele postcode.
  const hqShortLabel = prefAddress.split(',').pop()?.replace(/\b\d{4}\s?[A-Z]{2}\b/i, '').trim() || prefAddress;

  // APP STATE
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'search' | 'favorites' | 'database' | 'map' | 'dashboard'>('search');

  // BATCH IMPORT
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importPreview, setImportPreview] = useState<Array<{ row: any; error?: string; isDuplicate?: boolean }>>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'confirm'>('upload');
  const [importStats, setImportStats] = useState({ total: 0, valid: 0, duplicates: 0, errors: 0 });

  // OPGESLAGEN FILTERS
  const [savedFilters, setSavedFilters] = useState<Array<{name: string; query: string; regions: string[]; types: string[]; werksoort: string[]; bron: string[]; rechtsvorm: string[]; contact: string[]}>>(() => {
    try { return JSON.parse(localStorage.getItem('inncempro_saved_filters') || '[]'); } catch { return []; }
  });
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');

  // AUDIT LOG
  const [auditLog, setAuditLog] = useState<Array<{ id: string; timestamp: string; userId: string; action: string; bedrijf: string; field?: string; oldValue?: string; newValue?: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('inncempro_audit_log') || '[]'); } catch { return []; }
  });
  const [auditFilter, setAuditFilter] = useState({ search: '', action: '', days: 30 });

  // VERGELIJKING
  const [showCompare, setShowCompare] = useState(false);
  const [dbSearch, setDbSearch] = useState('');
  const [dbPage, setDbPage] = useState(1);
  const DB_PAGE_SIZE = 50;
  const [favorites, setFavorites] = useState<DiscoveredCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [mapMarkerCount, setMapMarkerCount] = useState(0);
  const [editMode, setEditMode] = useState(false);

  // Recent bekeken kaarten
  const [recentViewed, setRecentViewed] = useState<Array<{ naam: string; timestamp: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('inncempro_recent_viewed') || '[]'); } catch { return []; }
  });

  const addToRecentViewed = (naam: string) => {
    const updated = recentViewed.filter(r => r.naam !== naam);
    updated.unshift({ naam, timestamp: Date.now() });
    const limited = updated.slice(0, 20); // max 20 recent
    setRecentViewed(limited);
    localStorage.setItem('inncempro_recent_viewed', JSON.stringify(limited));
  };

  // AI Route Helper - Wizard Mode
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [aiStep, setAiStep] = useState<'type' | 'city' | 'count' | 'results'>('type');
  const [aiSelected, setAiSelected] = useState({ type: '', city: '', count: 0 });

  const executeAIRoute = () => {
    const { type, city, count } = aiSelected;
    if (!city || count === 0) return;

    // Filter bedrijven
    let filtered = activeData.filter(b => {
      const bcity = (b.stad || '').toLowerCase().trim();
      const inCity = bcity.includes(city.toLowerCase());
      if (!inCity) return false;

      if (!type) return true;
      const naam = (b.naam || '').toLowerCase();
      const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
      const compStr = `${naam} ${specs}`;

      if (type === 'architecten' && compStr.includes('architect')) return true;
      if (type === 'bouwbedrijven' && (compStr.includes('bouwbedrijf') || compStr.includes(' bouw'))) return true;
      if (type === 'aannemers' && compStr.includes('aannemer')) return true;
      if (type === 'materialen' && (compStr.includes('hout') || compStr.includes('materiaal'))) return true;
      return false;
    });

    const available = Math.min(count, filtered.length);

    // Maak route en sla op
    const route = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Route: ${type || 'gemengd'} in ${city}`,
      bedrijven: filtered.slice(0, count).map(b => ({ naam: b.naam, stad: b.stad, straat: b.straat })),
      createdAt: new Date().toISOString(),
    };

    try {
      const saved = JSON.parse(localStorage.getItem('inncempro_saved_routes') || '[]');
      saved.push(route);
      localStorage.setItem('inncempro_saved_routes', JSON.stringify(saved));
      setAiStep('results');
    } catch (e) {
      console.error('Route save failed');
    }
  };

  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const MANUAL_EDITS_KEY = 'inncempro_manual_edits';
  const [manualEdits, setManualEdits] = useState<Record<string, Record<string, string>>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('inncempro_manual_edits') || '{}');
      // Migratie: eventuele bewerkte source="Handmatig" hernoemen naar "Onbekend"
      let migrated = false;
      Object.keys(raw).forEach(naam => {
        const e = raw[naam];
        if (e?.source === 'Handmatig') { e.source = 'Onbekend'; migrated = true; }
        if (e?.bron === 'Handmatig')   { e.bron   = 'Onbekend'; migrated = true; }
      });
      if (migrated) localStorage.setItem('inncempro_manual_edits', JSON.stringify(raw));
      return raw;
    } catch { return {}; }
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // key = b.naam (stabiel over alle tabs)
  const [selectedRaws, setSelectedRaws] = useState<Map<string, any>>(new Map()); // naam → raw bedrijfsdata
  const [sortMode, setSortMode] = useState<'relevant' | 'az'>(() =>
    (localStorage.getItem('inncempro_pref_sort') as 'relevant' | 'az') || 'relevant');
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [splitRatio,   setSplitRatio]   = useState(58); // left panel %
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Address corrections: stored in localStorage, applied to in-memory data
  const CORRECTIONS_KEY = 'inncempro_address_corrections';
  const [addressCorrections, setAddressCorrections] = useState<Record<string, { straat: string; postcode: string; stad: string }>>(() => {
    try { return JSON.parse(localStorage.getItem(CORRECTIONS_KEY) || '{}'); } catch { return {}; }
  });

  const CUSTOM_ENTRIES_KEY = 'inncempro_custom_entries';
  const [customEntries, setCustomEntries] = useState<any[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('inncempro_custom_entries') || '[]');
      // Migratie: oudere versies zetten default source="Handmatig". Handmatig is geen echte
      // bron — normaliseer stille naar "Onbekend" bij het laden, zodat filters/badges kloppen.
      let migrated = false;
      const cleaned = raw.map((e: any) => {
        if (e && (e.source === 'Handmatig' || e.bron === 'Handmatig')) {
          migrated = true;
          return { ...e, source: e.source === 'Handmatig' ? 'Onbekend' : e.source, bron: e.bron === 'Handmatig' ? 'Onbekend' : e.bron };
        }
        return e;
      });
      if (migrated) localStorage.setItem('inncempro_custom_entries', JSON.stringify(cleaned));
      return cleaned;
    } catch { return []; }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single');
  const [addForm, setAddForm] = useState({ naam: '', straat: '', postcode: '', stad: '', provincie: '', telefoon: '', email: '', website: '', spec1: '', spec2: '', spec3: '', rechtsvorm: '', kvk: '', linkedin_url: '', twitter_handle: '', instagram_handle: '', source: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkParsed, setBulkParsed] = useState<any[]>([]);
  const [bulkMsg, setBulkMsg] = useState('');
  const [addDuplicate, setAddDuplicate] = useState<any | null>(null);

  const findDuplicate = (naam: string, straat: string, stad: string): any | null => {
    const all = bouwgarantData as any[];
    const normName = naam.toLowerCase().trim();
    const normStraat = straat.toLowerCase().trim();
    const normStad = stad.toLowerCase().trim();
    return all.find(b => {
      const sameName = (b.naam || '').toLowerCase().trim() === normName;
      const sameAddr = normStraat && normStad &&
        (b.straat || '').toLowerCase().includes(normStraat.split(' ')[0]) &&
        (b.stad || '').toLowerCase().trim() === normStad;
      return sameName || sameAddr;
    }) || null;
  };

  const parseBulkText = (text: string): any[] => {
    const blocks = text.split(/\n{2,}|\r\n{2,}/).map(b => b.trim()).filter(Boolean);
    if (blocks.length === 0) {
      // Try line-by-line if no blank-line separation
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      return lines.map(line => ({ naam: line, straat: '', postcode: '', stad: '', provincie: '', telefoon: '', email: '', website: '', spec1: '', spec2: '', spec3: '', rechtsvorm: '', kvk: '', source: 'Onbekend' }));
    }
    return blocks.map(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const entry: any = { naam: '', straat: '', postcode: '', stad: '', provincie: '', telefoon: '', email: '', website: '', spec1: '', spec2: '', spec3: '', rechtsvorm: '', kvk: '', source: 'Onbekend' };
      const emailRe = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
      const urlRe   = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:\/\S*)?/i;
      const telRe   = /(?:\+31|0)[\s\-]?[\d\s\-]{7,}/;
      const pcRe    = /\b\d{4}\s?[A-Z]{2}\b/;
      for (const line of lines) {
        if (!entry.naam) { entry.naam = line; continue; }
        const em = line.match(emailRe); if (em && !entry.email) { entry.email = em[0]; continue; }
        const pc = line.match(pcRe);
        if (pc) {
          entry.postcode = pc[0].replace(/\s/, ' ');
          const rest = line.replace(pc[0], '').trim();
          if (!entry.straat && !entry.stad) entry.straat = rest;
          else if (!entry.stad) entry.stad = rest;
          continue;
        }
        const tel = line.match(telRe); if (tel && !entry.telefoon) { entry.telefoon = tel[0].trim(); continue; }
        const url = line.match(urlRe); if (url && !entry.website) { entry.website = url[0]; continue; }
        if (!entry.straat) entry.straat = line;
        else if (!entry.stad) entry.stad = line;
        else if (!entry.spec1) entry.spec1 = line;
        else if (!entry.spec2) entry.spec2 = line;
      }
      return entry;
    });
  };

  const addCustomEntries = (entries: any[], auditAction: string = 'Bedrijf toegevoegd') => {
    const withId = entries.map(e => ({ ...e, _custom: true }));
    const next = [...customEntries, ...withId];
    setCustomEntries(next);
    localStorage.setItem(CUSTOM_ENTRIES_KEY, JSON.stringify(next));
    withId.forEach(e => (bouwgarantData as any[]).push(e));
    withId.forEach(e => addAuditLog(auditAction, e.naam));
  };

  // On mount: inject saved custom entries into bouwgarantData
  React.useEffect(() => {
    customEntries.forEach(e => {
      if (!(bouwgarantData as any[]).find((b: any) => b.naam === e.naam && b._custom)) {
        (bouwgarantData as any[]).push(e);
      }
    });
    // Seed: House of Architects (manually restored)
    const hoaKey = 'House of Architects||Leen Jongewaardkade 109';
    const deletedRaw: string[] = JSON.parse(localStorage.getItem('inncempro_deleted_entries') || '[]');
    if (!deletedRaw.includes(hoaKey) && !(bouwgarantData as any[]).find((b: any) => b.naam === 'House of Architects' && b.straat === 'Leen Jongewaardkade 109')) {
      const hoa = { naam: 'House of Architects', straat: 'Leen Jongewaardkade 109', postcode: '1031 HS', stad: 'Amsterdam', provincie: 'Noord-Holland', telefoon: '020 235 7402', email: 'info@houseofarchitects.nl', website: 'houseofarchitects.nl', spec1: '', spec2: '', spec3: '', rechtsvorm: '', kvk: '', source: 'Onbekend', _custom: true };
      (bouwgarantData as any[]).push(hoa);
      const stored: any[] = JSON.parse(localStorage.getItem('inncempro_custom_entries') || '[]');
      if (!stored.find((e: any) => e.naam === 'House of Architects' && e.straat === 'Leen Jongewaardkade 109')) {
        stored.push(hoa);
        localStorage.setItem('inncempro_custom_entries', JSON.stringify(stored));
      }
    }
    // bouwgarantData was mutated in place above (push), which activeData's useMemo can't see
    // via its dependency array alone — customEntries keeps the same reference across reloads
    // since nothing here calls setCustomEntries. Force a new reference so activeData recomputes
    // and persisted/seeded custom entries actually show up after a page reload.
    setCustomEntries(prev => [...prev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const DELETED_KEY = 'inncempro_deleted_entries';
  const [deletedEntries, setDeletedEntries] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('inncempro_deleted_entries') || '[]')); } catch { return new Set(); }
  });

  const deleteKey = (naam: string, straat?: string) => `${naam}||${(straat || '').trim()}`;

  const handleDeleteEntry = (naam: string, straat?: string) => {
    const next = new Set(deletedEntries);
    next.add(deleteKey(naam, straat));
    setDeletedEntries(next);
    localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(next)));
    addAuditLog('Bedrijf verwijderd', naam);
  };

  const handleAddressCorrection = (naam: string, correction: { straat: string; postcode: string; stad: string }) => {
    const next = { ...addressCorrections, [naam]: correction };
    setAddressCorrections(next);
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(next));
    // Apply in-memory: naam komt vaak meerdere keren voor (duplicaten uit verschillende bronnen) —
    // update ze allemaal, anders lijkt de correctie niet op te slaan op de marker die je net bekeek.
    (bouwgarantData as any[]).filter(b => b.naam === naam).forEach(entry => {
      if (correction.straat)   entry.straat   = correction.straat;
      if (correction.postcode) entry.postcode = correction.postcode;
      if (correction.stad)     entry.stad     = correction.stad;
    });
  };

  const autoSaveEdit = (naam: string, edits: Record<string, string>) => {
    const next = { ...manualEdits, [naam]: edits };
    setManualEdits(next);
    localStorage.setItem(MANUAL_EDITS_KEY, JSON.stringify(next));
    (bouwgarantData as any[]).filter(b => b.naam === naam).forEach(entry => Object.assign(entry, edits));
    setSelectedCompany((prev: any) => prev ? { ...prev, ...edits } : prev);
    Object.entries(edits).forEach(([field, newValue]) => addAuditLog('Bedrijf bewerkt', naam, field, undefined, newValue));
  };

  const handleSaveEdit = (naam: string, edits: Record<string, string>) => {
    autoSaveEdit(naam, edits);
    setEditMode(false);
  };

  // Autosave: sla wijzigingen in het bewerkformulier automatisch op terwijl je typt,
  // zodat een correctie niet verloren gaat als je vergeet op "Opslaan" te klikken.
  React.useEffect(() => {
    if (!editMode || !selectedCompany?.naam) return;
    const t = setTimeout(() => autoSaveEdit(selectedCompany.naam, editDraft), 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDraft, editMode]);

  // On mount: apply any stored manual edits to in-memory data (alle records met die naam)
  React.useEffect(() => {
    Object.entries(manualEdits).forEach(([naam, edits]) => {
      (bouwgarantData as any[]).filter(b => b.naam === naam).forEach(entry => Object.assign(entry, edits));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: apply any stored corrections to in-memory data (alle records met die naam)
  React.useEffect(() => {
    Object.entries(addressCorrections).forEach(([naam, c]) => {
      const correction = c as { straat: string; postcode: string; stad: string };
      (bouwgarantData as any[]).filter(b => b.naam === naam).forEach(entry => {
        if (correction.straat)   entry.straat   = correction.straat;
        if (correction.postcode) entry.postcode = correction.postcode;
        if (correction.stad)     entry.stad     = correction.stad;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct  = Math.min(75, Math.max(30, (ev.clientX - rect.left) / rect.width * 100));
      setSplitRatio(pct);
    };
    const onUp = () => { isDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toggleSelect = (naam: string, raw: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(naam) ? next.delete(naam) : next.add(naam);
      return next;
    });
    setSelectedRaws(prev => {
      const next = new Map(prev);
      next.has(naam) ? next.delete(naam) : next.set(naam, raw);
      return next;
    });
  };

  const clearSelection = () => { setSelectedIds(new Set()); setSelectedRaws(new Map()); };

  const saveCurrentFilter = (name: string) => {
    const preset = { name, query: city, regions: selectedRegions, types: selectedTypes, werksoort: selectedWerksoort, bron: selectedBron, rechtsvorm: selectedRechtsvorm, contact: selectedContact };
    const next = [...savedFilters.filter(f => f.name !== name), preset];
    setSavedFilters(next);
    localStorage.setItem('inncempro_saved_filters', JSON.stringify(next));
  };

  const applySavedFilter = (preset: typeof savedFilters[0]) => {
    setCity(preset.query);
    setSelectedRegions(preset.regions);
    setSelectedTypes(preset.types);
    setSelectedWerksoort(preset.werksoort);
    setSelectedBron(preset.bron);
    setSelectedRechtsvorm(preset.rechtsvorm);
    setSelectedContact(preset.contact);
    setViewMode('search');
    setTimeout(() => executeSearch(undefined, undefined, preset.query, null, null, preset.regions), 50);
  };

  const deleteSavedFilter = (name: string) => {
    const next = savedFilters.filter(f => f.name !== name);
    setSavedFilters(next);
    localStorage.setItem('inncempro_saved_filters', JSON.stringify(next));
  };
  
  // SEARCH HISTORY
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  const addToHistory = (q: string) => {
    if (!q.trim() || !currentUser) return;
    const key = `inncempro_search_history_${currentUser.id}`;
    setSearchHistory(prev => {
      const updated = [q, ...prev.filter(h => h !== q)].slice(0, 10);
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  };

  // SEARCH STATES
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedWerksoort, setSelectedWerksoort] = useState<string[]>([]);
  const [selectedContact, setSelectedContact] = useState<string[]>([]);
  const [selectedLijsten, setSelectedLijsten] = useState<string[]>([]);
  const [selectedBron, setSelectedBron] = useState<string[]>([]);
  const [selectedRechtsvorm, setSelectedRechtsvorm] = useState<string[]>([]);

  const [foundCompanies, setFoundCompanies] = useState<DiscoveredCompany[]>([]);
  const [cardMenuOpen, setCardMenuOpen] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceQuery, setReplaceQuery] = useState('');
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchState, setSearchState] = useState<SearchState>({ isLoading: false, data: null, error: null });

  // INITIAL LOAD
  useEffect(() => {
      const user = authService.getCurrentUser();
      if (user) {
          setCurrentUser(user);
          setFavorites(authService.getFavorites(user.id));
          const histKey = `inncempro_search_history_${user.id}`;
          setSearchHistory(JSON.parse(localStorage.getItem(histKey) || '[]'));
          setEditName(user.username);
          setEditEmail(user.email);
          setEditAvatar(user.avatarUrl || '');
      }
  }, []);

  // AUTH HANDLERS
  const handleAuthSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);

      if (authMode === 'login') {
          try {
              const user = authService.login(loginIdent, loginPass);
              finishLogin(user);
          } catch (err: any) {
              setAuthError(err.message);
          }
      } else {
          try {
              const user = authService.register(regName, regEmail, regPass);
              finishLogin(user);
          } catch (err: any) {
              setAuthError(err.message);
          }
      }
  };

  const finishLogin = (user: User) => {
      setCurrentUser(user);
      setFavorites(authService.getFavorites(user.id));
      setEditName(user.username);
      setEditEmail(user.email);
      setEditAvatar(user.avatarUrl || '');
      
      setLoginIdent(''); setLoginPass('');
      setRegName(''); setRegEmail(''); setRegPass('');
  };

  const handleLogout = () => {
      authService.logout();
      setCurrentUser(null);
      setFoundCompanies([]);
      setAuthMode('login');
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentUser) return;
      try {
          const updated = authService.updateProfile(currentUser.id, {
              username: editName,
              email: editEmail,
              avatarUrl: editAvatar
          });
          setCurrentUser(updated);
          setShowSettings(false);
      } catch (err: any) {
          alert(err.message);
      }
  };

  // BATCH IMPORT HANDLERS
  const handleCSVUpload = (file: File) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (results: any) => {
        const rows = results.data as any[];
        const validated = rows.map((row, idx) => {
          const errors: string[] = [];
          const naam = (row.naam || row.name || '').trim();
          const straat = (row.straat || row.street || '').trim();
          const postcode = (row.postcode || row.postcode || '').trim();
          const stad = (row.stad || row.city || '').trim();

          if (!naam) errors.push('Naam ontbreekt');
          if (!straat) errors.push('Straat ontbreekt');
          if (!postcode) errors.push('Postcode ontbreekt');
          if (!stad) errors.push('Stad ontbreekt');

          const addrKey = `${postcode} ${straat}`.toLowerCase().trim();
          const isDuplicate = activeData.some(
            b => `${b.postcode || ''} ${b.straat || ''}`.toLowerCase().trim() === addrKey &&
                 (b.naam || '').toLowerCase().trim() === naam.toLowerCase()
          );

          return {
            row: {
              naam,
              straat,
              postcode,
              stad,
              telefoon: (row.telefoon || row.phone || '').trim() || '',
              email: (row.email || '').trim() || '',
              website: (row.website || '').trim() || '',
              source: row.source || row.bron || 'Onbekend',
              bron: row.source || row.bron || 'Onbekend',
              provincie: row.provincie || row.province || stad,
              rechtsvorm: row.rechtsvorm || row.legalform || '',
              spec1: row.spec1 || '',
              spec2: row.spec2 || '',
              spec3: row.spec3 || '',
            },
            error: errors.length > 0 ? errors.join('; ') : undefined,
            isDuplicate,
          };
        });

        const stats = {
          total: rows.length,
          valid: validated.filter(v => !v.error).length,
          duplicates: validated.filter(v => v.isDuplicate).length,
          errors: validated.filter(v => v.error).length,
        };

        setImportData(rows);
        setImportPreview(validated);
        setImportStats(stats);
        setImportStep('preview');
      },
      error: (error: any) => {
        alert('CSV parse fout: ' + error.message);
      },
    });
  };

  const handleImportConfirm = () => {
    const toImport = importPreview
      .filter(v => !v.error && !v.isDuplicate)
      .map(v => ({ ...v.row, id: Math.random().toString(36).substr(2, 9) }));

    if (toImport.length === 0) {
      alert('Niets om te importeren (alles heeft fouten of is duplicaat).');
      return;
    }

    addCustomEntries(toImport, 'Bedrijf geïmporteerd');
    alert(`${toImport.length} bedrijven geïmporteerd!`);
    setImportModalOpen(false);
    setImportStep('upload');
    setImportData([]);
    setImportPreview([]);
  };

  // AUDIT LOG HELPER
  const addAuditLog = (action: string, bedrijf: string, field?: string, oldValue?: string, newValue?: string) => {
    const entry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'Anoniem',
      action,
      bedrijf,
      field,
      oldValue,
      newValue,
    };
    const updated = [entry, ...auditLog].slice(0, 1000); // Keep last 1000 entries
    setAuditLog(updated);
    localStorage.setItem('inncempro_audit_log', JSON.stringify(updated));
  };

  // APP LOGIC
  const toggleFavorite = (company: DiscoveredCompany) => {
      if (!currentUser) return;
      const newFavs = authService.toggleFavorite(currentUser.id, company);
      setFavorites(newFavs);
  };

  const toggleFilter = (set: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    set(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  // Stad normalisatie: verwijder hoofdletters + aliassen
  const STAD_ALIASES: Record<string, string> = {
    "s-hertogenbosch": "den bosch", "'s-hertogenbosch": "den bosch", "hertogenbosch": "den bosch",
    "s-gravenhage": "den haag", "'s-gravenhage": "den haag", "gravenhage": "den haag",
    "amsterdam (nl)": "amsterdam", "amsterdam (nederland)": "amsterdam",
    "eindhoven (nederland)": "eindhoven", "eindhoven eindhoven": "eindhoven",
    "alphen aan den rijn": "alphen aan den rijn", "alphen aan de rijn": "alphen aan den rijn",
    "capelle aan den ijssel": "capelle aan den ijssel", "capelle aan de ijssel": "capelle aan den ijssel",
    "koog aan de zaan": "zaandam", "zaandam": "zaandam",
    "rotterdam-oost": "rotterdam", "almere stad": "almere",
    "hengelo ov": "hengelo", "hengelo gld": "hengelo",
    "nijkerk gld": "nijkerk", "ede gld": "ede",
    "bergen op zoom": "bergen op zoom",
    "bunschoten spakenburg": "bunschoten-spakenburg",
    "driebergen rijsenb": "driebergen-rijsenburg",
    "hardinxveld giessendam": "hardinxveld-giessendam",
    "hendrik ido ambacht": "hendrik-ido-ambacht",
    "nieuwerkerk aan den ijssel": "nieuwerkerk aan den ijssel",
    "nieuwerkerk ad ijssel": "nieuwerkerk aan den ijssel",
    "wijk bij duurstede": "wijk bij duurstede",
    "zwaagdijk - oost": "zwaagdijk-oost",
  };

  const normalizeStad = (stad: string): string => {
    if (!stad) return '';
    const s = stad.toLowerCase().trim().replace(/^'+/, '');
    return STAD_ALIASES[s] || s;
  };

  // Bekende afkortingen / aliassen voor bedrijfsnamen
  const NAAM_ALIASSEN: Record<string, string[]> = {
    'oma':      ['office for metropolitan architecture', 'oma'],
    'mvrdv':    ['mvrdv'],
    'uns':      ['unstudio', 'un studio'],
    'bam':      ['koninklijke bam', 'bam bouw', 'bam infra', 'bam'],
    'zja':      ['zwarts & jansma', 'zwarts en jansma', 'zja'],
    'nl':       ['nl architects'],
    'tbi':      ['tbi'],
    'vw':       ['volkerwessels', 'volker wessels'],
    'sweco':    ['sweco'],
    'rhdhv':    ['royal haskoning', 'haskoning'],
    'egm':      ['egm architecten'],
    'vvr':      ['de architekten cie'],
    'west8':    ['west 8'],
    'west 8':   ['west 8'],
  };

  // Kernspecialisaties voor kaartweergave — relevant voor Inncempro's markt
  // (gevelbekleding/isolatie verkopen aan architecten, aannemers, bouwbedrijven)
  const CORE_SPEC_MAP: Array<{ match: RegExp; label: string; prio: number }> = [
    { match: /nieuwbouw/i,                                        label: 'Nieuwbouw',       prio: 1 },
    { match: /renovati|verbouw|transformati/i,                    label: 'Renovatie',       prio: 2 },
    { match: /woningbouw|woningen|vrijstaande woning/i,           label: 'Woningbouw',      prio: 3 },
    { match: /utiliteit|bedrijfsgeb|kantoor|zakelijk/i,           label: 'Utiliteitsbouw',  prio: 4 },
    { match: /architectuur(?!.*interieur)/i,                      label: 'Architectuur',    prio: 5 },
    { match: /allround/i,                                         label: 'Allround',        prio: 6 },
    { match: /restaurati/i,                                       label: 'Restauratie',     prio: 7 },
    { match: /aanbouw/i,                                          label: 'Aanbouw',         prio: 8 },
    { match: /onderhoud|beheer/i,                                 label: 'Onderhoud',       prio: 9 },
    { match: /houtbouw/i,                                         label: 'Houtbouw',        prio: 10 },
    { match: /prefab/i,                                           label: 'Prefab',          prio: 11 },
    { match: /verduurzam|duurzaam|isoler|warmtepomp|zonnepanelen|nul-op-de-meter/i, label: 'Duurzaam', prio: 12 },
    { match: /circulair/i,                                        label: 'Circulair',       prio: 13 },
    { match: /interieurarchitect|interieur.*inrichting/i,         label: 'Interieur',       prio: 14 },
    { match: /stedenbouw/i,                                       label: 'Stedenbouw',      prio: 15 },
    { match: /levensbestendig/i,                                  label: 'Levensbestendig', prio: 16 },
  ];

  const coreSpecs = (b: any): string[] => {
    const raw = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(', ');
    if (!raw) return [];
    const found = new Map<string, number>();
    for (const { match, label, prio } of CORE_SPEC_MAP) {
      if (match.test(raw) && !found.has(label)) found.set(label, prio);
    }
    return Array.from(found.entries()).sort((a, b) => a[1] - b[1]).map(e => e[0]);
  };

  // Alle spec-tags opgesplitst als losse labels (voor detail modal)
  const allSpecTags = (b: any): string[] => {
    return [b.spec1, b.spec2, b.spec3]
      .filter(Boolean)
      .flatMap((s: string) => s.split(/[,;\/]/).map((t: string) => t.trim()).filter(Boolean));
  };

  // Normaliseer tekst: verwijder accenten, diacrieten, speciale tekens
  const normalizeText = (text: string): string => {
    return (text || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // verwijder diacrieten
      .replace(/[&]/g, ' en ')  // & -> en
      .replace(/[^\w\s]/g, ' ') // speciale tekens naar spatie
      .replace(/\s+/g, ' ');    // meerdere spaties -> één
  };

  // Expandeer zoekopdracht: geeft array van te matchen termen terug
  const expandQuery = (q: string): string[] => {
    const lower = q.toLowerCase().trim();
    if (NAAM_ALIASSEN[lower]) return NAAM_ALIASSEN[lower];
    return [lower];
  };

  // Type detectie: architect / bouwbedrijf / aannemer op basis van source + specs
  const detectType = (b: any): 'architect' | 'bouwbedrijf' | 'aannemer' | 'materialen' | 'overig' => {
      const src = (b.source || '').toLowerCase();
      const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
      const naam = (b.naam || '').toLowerCase();
      if (src === 'architectenweb' || specs.includes('architect') || naam.includes('architect')) return 'architect';
      if (specs.includes('houthandel') || specs.includes('bouwmaterial') || src === 'stiho' || src === 'jongeneel') return 'materialen';
      if (specs.includes('bouwbedrijf') || naam.includes('bouwbedrijf') || naam.includes(' bouw ') || naam.endsWith(' bouw')) return 'bouwbedrijf';
      if (specs.includes('aannemer') || naam.includes('aannemer') || src === 'bouwgarant') return 'aannemer';
      return 'overig';
  };

  // SEARCH EXECUTION — zoekt lokaal in bouwgarant_data.json
  const executeSearch = (overrideCity?: string, overrideSort?: 'relevant' | 'az', overrideQuery?: string, overrideRadiusCenter?: { lat: number; lng: number } | null, overrideRadiusKm?: number | null, overrideRegions?: string[]) => {
      // Geen actieve zoekopdracht = leeg laten (Live Zoeken begint blanco)
      const effectiveQuery = (overrideQuery ?? city).trim();
      const effectiveRegions = overrideRegions !== undefined ? overrideRegions : selectedRegions;
      const effectiveRadius = overrideRadiusKm !== undefined ? overrideRadiusKm : radiusKm;
      const hasInput = effectiveQuery || effectiveRegions.length > 0 || selectedTypes.length > 0 || selectedWerksoort.length > 0 || selectedContact.length > 0 || selectedLijsten.length > 0 || selectedBron.length > 0 || selectedRechtsvorm.length > 0 || effectiveRadius;
      if (!hasInput && overrideRadiusCenter === undefined) {
          setFoundCompanies([]);
          setTotalMatches(0);
          setSearchState({ isLoading: false, data: null, error: null });
          setViewMode('search');
          return;
      }

      setViewMode('search');
      setSearchState({ isLoading: true, data: null, error: null });
      setFoundCompanies([]);
      setTotalMatches(0);
      setCurrentPage(1);

      const regions = overrideRegions !== undefined
          ? overrideRegions
          : overrideCity
          ? [overrideCity]
          : selectedRegions.length > 0
          ? selectedRegions
          : [];

      // Tekstzoekopdracht: ook uit de zoekbalk bovenaan
      const q = (overrideQuery ?? city).toLowerCase().trim();

      // Radius: bereken vroeg zodat de tekstfilter er rekening mee kan houden
      const activeRadiusKm = overrideRadiusKm !== undefined ? overrideRadiusKm : radiusKm;
      let radiusCenter: { lat: number; lng: number } | null = overrideRadiusCenter !== undefined ? overrideRadiusCenter : null;
      if (activeRadiusKm && !radiusCenter) {
        const centerCity = (overrideCity ?? city).trim();
        // Geen plaats ingevuld? Straal zoekt dan standaard vanaf ons eigen (instelbare) adres.
        radiusCenter = centerCity ? getCityCoords(centerCity) : hqCoords;
        // Als de tekst geen bekende stad is, sla de radius over en doe alleen tekst-zoeken
        // (zodat je b.v. "inbo" kunt typen als bedrijfsnaam zonder een locatiefout te krijgen)
      }
      // Als de ingevoerde tekst is opgelost tot een straal-centrum, dient hij puur als locatie
      // en mag hij de resultaten niet óók nog eens dichttimmeren als naam/stad-tekstfilter.
      const queryIsRadiusOrigin = !!(activeRadiusKm && radiusCenter);

      // Geavanceerd zoeken: alleen actief als de toggle aan staat én de query echt
      // AND/OR/NOT-operatoren of aanhalingstekens bevat (anders gewoon normaal zoeken).
      const useAdvancedQuery = advancedSearch && !!q && !queryIsRadiusOrigin && /(\band\b|\bor\b|\bnot\b|")/i.test(q);
      const advancedMatchKeys = useAdvancedQuery
        ? new Set(parseAdvancedQuery(q, activeData).map(advancedQueryKey))
        : null;

      const PROVINCES = ['Drenthe','Flevoland','Friesland','Gelderland','Groningen','Limburg','Noord-Brabant','Noord-Holland','Overijssel','Utrecht','Zeeland','Zuid-Holland'];

      const TYPE_PRIORITY: Record<string, number> = { architect: 0, bouwbedrijf: 1, aannemer: 2, overig: 3 };

      const results = activeData.filter(b => {
          // Filter out entries without a name
          if (!(b.naam || '').trim()) return false;

          const dbStad = normalizeStad(b.stad || '');

          // Regio filter — sla over als "Heel Nederland" of alle 12 provincies geselecteerd
          const allProvincesSelected = PROVINCES.every(p => regions.includes(p));
          if (regions.length > 0 && !regions.includes('Heel Nederland') && !allProvincesSelected) {
              const matchRegion = regions.some(r => {
                  if (PROVINCES.includes(r)) return b.provincie === r;
                  return dbStad === normalizeStad(r);
              });
              if (!matchRegion) return false;
          }

          // Disciplines filter — sla over als alle 4 types geselecteerd (= geen filter)
          const ALL_DISCIPLINE_TYPES = ['Architecten', 'Bouwbedrijven', 'Aannemers', 'Bouwmaterialen'];
          const allTypesSelected = ALL_DISCIPLINE_TYPES.every(t => selectedTypes.includes(t));
          if (selectedTypes.length > 0 && !allTypesSelected) {
              const t = detectType(b);
              const match = selectedTypes.some(sel => {
                  if (sel === 'Architecten') return t === 'architect';
                  if (sel === 'Bouwbedrijven') return t === 'bouwbedrijf';
                  if (sel === 'Aannemers') return t === 'aannemer';
                  if (sel === 'Bouwmaterialen') return t === 'materialen';
                  return false;
              });
              if (!match) return false;
          }

          // Werksoort filter (based on spec1/2/3)
          if (selectedWerksoort.length > 0) {
              const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
              const match = selectedWerksoort.some(sel => {
                  if (sel === 'Nieuwbouw') return specs.includes('nieuwbouw');
                  if (sel === 'Renovatie') return specs.includes('renovatie') || specs.includes('verbouw') || specs.includes('aanbouw') || specs.includes('verdieping') || specs.includes('transformatie');
                  if (sel === 'Verduurzaming') return specs.includes('verduurzam') || specs.includes('isoler') || specs.includes('nul-op-de-meter') || specs.includes('duurzaam') || specs.includes('energie') || specs.includes('warmtepomp') || specs.includes('zonnepanelen');
                  if (sel === 'Restauratie') return specs.includes('restauratie') || specs.includes('monument');
                  if (sel === 'Onderhoud') return specs.includes('onderhoud') || specs.includes('beheer') || specs.includes('service');
                  if (sel === 'Interieur') return specs.includes('interieur') || specs.includes('afbouw') || specs.includes('binneninrichting');
                  if (sel === 'Utiliteitsbouw') return specs.includes('utiliteit') || specs.includes('kantoor') || specs.includes('bedrijfsgebouw') || specs.includes('zakelijk');
                  if (sel === 'Allround') return specs.includes('allround');
                  return false;
              });
              if (!match) return false;
          }

          // Bron filter
          if (selectedBron.length > 0) {
              const src = (b._sources?.length ? b._sources : [b.source || 'Onbekend']);
              const match = selectedBron.some(sel => src.includes(sel));
              if (!match) return false;
          }

          // Rechtsvorm filter
          if (selectedRechtsvorm.length > 0) {
              const rv = (b.rechtsvorm || '').toLowerCase();
              const naam = (b.naam || '').toLowerCase();
              const match = selectedRechtsvorm.some(sel => {
                  if (sel === 'B.V.') return rv.includes('b.v') || rv.includes('bv') || naam.includes(' bv') || naam.endsWith(' b.v.') || naam.endsWith(' bv');
                  if (sel === 'V.O.F.') return rv.includes('vof') || rv.includes('v.o.f') || naam.includes(' vof');
                  if (sel === 'Eenmanszaak') return rv.includes('eenmanszaak') || rv.includes('zzp') || rv.includes('zelfstandig');
                  if (sel === 'Stichting') return rv.includes('stichting') || naam.startsWith('stichting');
                  if (sel === 'N.V.') return rv.includes('n.v') || rv.includes('nv') || naam.includes(' nv');
                  return false;
              });
              if (!match) return false;
          }

          // Contact filter
          if (selectedContact.length > 0) {
              const hasTel = !!(b.telefoon || b.telefoon_sales || b.telefoon_admin);
              const hasEmail = !!(b.email || b.email_sales || b.email_overig);
              const hasWebsite = !!(b.website || b.url);
              const hasKvk = !!(b.kvk);
              const match = selectedContact.some(sel => {
                  if (sel === 'Heeft telefoon') return hasTel;
                  if (sel === 'Heeft e-mail') return hasEmail;
                  if (sel === 'Heeft website') return hasWebsite;
                  if (sel === 'Heeft KVK') return hasKvk;
                  return false;
              });
              if (!match) return false;
          }

          if (selectedLijsten.length > 0) {
              const naam = (b.naam || '').toLowerCase();
              const match = selectedLijsten.some(lijst => {
                  if (lijst === 'Van Wijnen') return naam.includes('van wijnen');
                  return false;
              });
              if (!match) return false;
          }

          // Geavanceerd zoeken (AND/OR/NOT) overschrijft de normale tekstfilter volledig.
          if (useAdvancedQuery) {
              if (!advancedMatchKeys!.has(advancedQueryKey(b))) return false;
          } else
          // Tekst filtert altijd op bedrijfsnaam/velden.
          // Radius is een extra afstandsfilter bovenop de tekstfilter.
          // Als de tekst een bekende stad is én radius actief, werkt het als locatiezoeken.
          if (q && !queryIsRadiusOrigin) {
              const naam = (b.naam || '').toLowerCase();
              const naamNorm = normalizeText(b.naam || '');
              const isKnownAlias = q in NAAM_ALIASSEN || q.length <= 4;

              // Splits query in afzonderlijke zoekwoorden (ook alias-geëxpandeerd)
              const expandedTerms = expandQuery(q);
              const allSearchWords = new Set<string>();
              for (const t of expandedTerms) {
                t.split(/[\s\-\/&,.()+]+/).filter(Boolean).forEach(w => allSearchWords.add(w));
              }
              const searchWordList = Array.from(allSearchWords);
              const qNorm = normalizeText(q);

              // Splits naam in losse woorden
              const naamWords = naam.split(/[\s\-\/&,.()+]+/).filter(Boolean);
              const naamWordsNorm = naamNorm.split(/\s+/).filter(Boolean);

              // Verbeterde matching: elk zoekwoord moet voorkomen in:
              // 1. Exakte hele woord match (incl. genormaliseerd)
              // 2. Begin van woord match (incl. genormaliseerd)
              // 3. Substring match (voor gedeeltelijke zoeken)
              const matchNaam = searchWordList.length > 0 && searchWordList.every(searchTerm => {
                const termNorm = normalizeText(searchTerm);
                return naam === searchTerm || // exact match (case-insensitive)
                       naamNorm === termNorm || // exact match genormaliseerd
                       naamNorm.includes(termNorm) || // substring match genormaliseerd
                       naamWords.some(w => w === searchTerm || w.startsWith(searchTerm)) || // hele woord/begin
                       naamWordsNorm.some(w => w === termNorm || w.startsWith(termNorm)); // genormaliseerd woord
              });

              // Ook zoeken in stad, postcode, straat
              const locationStr = [dbStad, b.straat, b.postcode].filter(Boolean).join(' ').toLowerCase();
              const locationStrNorm = normalizeText(locationStr);
              const locationWords = locationStr.split(/[\s\-\/&,.()+]+/).filter(Boolean);
              const matchLocation = searchWordList.length > 0 && searchWordList.every(searchTerm => {
                const termNorm = normalizeText(searchTerm);
                return locationStrNorm.includes(termNorm) ||
                       locationWords.some(w => w === searchTerm || w.startsWith(searchTerm));
              });

              const contactFields = isKnownAlias ? '' : [b.email, b.email_sales, b.email_overig, b.website].filter(Boolean).join(' ').toLowerCase();
              const matchFields = matchLocation || (!isKnownAlias && contactFields.includes(q));
              if (!matchNaam && !matchFields) return false;
          }

          return true;
      });

      // Hoe goed matcht de zoekopdracht op de bedrijfsnaam?
      const queryMatchScore = (b: any): number => {
        if (!q) return 0;
        const naam = (b.naam || '').toLowerCase();
        const naamNorm = normalizeText(b.naam || '');
        const terms = expandQuery(q);
        const words = naam.split(/[\s\-\/&,.()+]+/).filter(Boolean);
        const wordsNorm = naamNorm.split(/\s+/).filter(Boolean);
        let best = 0;
        for (const t of terms) {
          const tNorm = normalizeText(t);
          if (naam === t)                        best = Math.max(best, 2000); // exacte naam match
          else if (naamNorm === tNorm)           best = Math.max(best, 1950); // exacte match genormaliseerd
          else if (naam.startsWith(t + ' ') || naam.startsWith(t + '-'))
                                                 best = Math.max(best, 1800); // naam begint met term
          else if (naamNorm.startsWith(tNorm + ' '))
                                                 best = Math.max(best, 1750); // genormaliseerd begin
          else if (words[0] === t)               best = Math.max(best, 1600); // eerste woord is exact term
          else if (wordsNorm[0] === tNorm)       best = Math.max(best, 1550); // eerste woord genormaliseerd
          else if (words.some(w => w === t))     best = Math.max(best, 1200); // heel woord is exact term
          else if (wordsNorm.some(w => w === tNorm)) best = Math.max(best, 1150); // genormaliseerd woord
          else if (naamNorm.includes(tNorm))     best = Math.max(best, 800);  // substring match genormaliseerd
          else if (words[0]?.startsWith(t))      best = Math.max(best, 900);  // eerste woord begint met term
          else if (wordsNorm[0]?.startsWith(tNorm)) best = Math.max(best, 850); // genormaliseerd eerste woord
          else if (words.some(w => w.startsWith(t))) best = Math.max(best, 500); // een woord begint met term
          else if (wordsNorm.some(w => w.startsWith(tNorm))) best = Math.max(best, 450); // genormaliseerd woord begin
        }
        return best;
      };

      // Relevantiescore: naam-match > bekende naam > type-prioriteit > volledigheid data
      const relevanceScore = (b: any): number => {
        let score = 0;
        score += queryMatchScore(b);    // hoe goed matcht query op naam — domineert de volgorde
        score += getNameBoost(b.naam);  // bekende/grote namen krijgen forse bonus
        const typePrio = TYPE_PRIORITY[detectType(b)] ?? 3;
        score += (3 - typePrio) * 30; // architect=90, bouwbedrijf=60, aannemer=30, overig=0
        if (b.website) score += 20;
        if (b.email) score += 15;
        if (b.telefoon) score += 15;
        if (b.straat) score += 10;
        if (b.kvk) score += 10;
        if (b.spec1) score += 8;
        if (b.spec2) score += 5;
        if (b.spec3) score += 3;
        if (b.email_sales || b.telefoon_sales) score += 8;
        if (b.email_overig || b.telefoon_admin) score += 4;
        return score;
      };

      // Radius filter (radiusCenter is hierboven al berekend, vóór de tekstfilter)
      const distanceMap = new Map<any, number>();

      if (activeRadiusKm && radiusCenter) {
        const center = radiusCenter;
        for (let i = results.length - 1; i >= 0; i--) {
          const b = results[i];
          const coords = getCityCoords(b.stad || '');
          if (!coords) { results.splice(i, 1); continue; }
          const dist = haversineKm(center.lat, center.lng, coords.lat, coords.lng);
          if (dist > activeRadiusKm) { results.splice(i, 1); continue; }
          distanceMap.set(b, dist);
        }
      }

      const activeSort = overrideSort ?? sortMode;
      if (activeRadiusKm && radiusCenter) {
        // Sort by distance when radius is active
        results.sort((a: any, b2: any) => (distanceMap.get(a) ?? 999) - (distanceMap.get(b2) ?? 999));
      } else if (activeSort === 'az') {
        results.sort((a: any, b2: any) => (a.naam || '').localeCompare(b2.naam || '', 'nl', { sensitivity: 'base' }));
      } else {
        results.sort((a: any, b2: any) => relevanceScore(b2) - relevanceScore(a) || (a.naam || '').localeCompare(b2.naam || '', 'nl', { sensitivity: 'base' }));
      }

      const HQ_COORDS = hqCoords;
      const companies = results.map((b: any, i: number) => {
          const cityCoords = getCityCoords(b.stad || '');
          const hqDist = cityCoords ? haversineKm(HQ_COORDS.lat, HQ_COORDS.lng, cityCoords.lat, cityCoords.lng) : undefined;
          return {
            id: `local-${i}`,
            name: b.naam,
            city: b.stad || '',
            discoveredAt: new Date().toISOString(),
            _raw: b,
            _distanceKm: distanceMap.has(b) ? distanceMap.get(b) : hqDist,
            _hqDistanceKm: hqDist,
          };
      });

      setFoundCompanies(companies as any);
      setTotalMatches(companies.length);
      setSearchState({ isLoading: false, data: { text: 'Done' }, error: null });
      if (q) addToHistory(q);
  };

  const removeFoundCompany = (id: string) => {
    setFoundCompanies(prev => prev.filter(c => c.id !== id));
    setTotalMatches(prev => Math.max(0, prev - 1));
  };

  const replaceFoundCompany = (id: string, raw: any) => {
    const cityCoords = getCityCoords(raw.stad || '');
    const hqDist = cityCoords ? haversineKm(hqCoords.lat, hqCoords.lng, cityCoords.lat, cityCoords.lng) : undefined;
    setFoundCompanies(prev => prev.map(c => c.id !== id ? c : ({
      id: c.id,
      name: raw.naam,
      city: raw.stad || '',
      discoveredAt: new Date().toISOString(),
      _raw: raw,
      _distanceKm: hqDist,
      _hqDistanceKm: hqDist,
    } as any)));
    setReplacingId(null);
    setReplaceQuery('');
  };

  // Live zoeken: debounce 350ms op city-, straal-, geavanceerd-zoeken- én
  // data-mutatie-wijziging. Wanneer een gebruiker in Live Zoeken zit en een bedrijf
  // bewerkt/verwijdert/toevoegt vanuit een detailpaneel, moet de zoekresultatenlijst
  // meteen mee-updaten — anders blijft hij hangen op de oude snapshot.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { executeSearch(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [city, radiusKm, advancedSearch, manualEdits, customEntries, deletedEntries]);

  const handleManualSearch = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      executeSearch();
  };

  const resetToHome = () => {
    setFoundCompanies([]);
    setSearchState({ isLoading: false, data: null, error: null });
    setCity('');
    setSelectedRegions([]);
    setViewMode('search');
  };

  // --- SMART ROUTE GENERATION (Efficient TSP Heuristic) ---
  const handleCreateSmartRoute = () => {
    // Gebruik geselecteerde items (stabiel over alle tabs via selectedRaws)
    const pool: any[] = selectedRaws.size > 0
      ? (Array.from(selectedRaws.values()) as any[]).map(r => ({ id: r.naam, name: r.naam, city: r.stad || '', _raw: r }))
      : (viewMode === 'favorites' ? favorites : foundCompanies);
    if (!pool.length) return;

    const sortedList = [...pool].sort((a: any, b: any) => getGeoScore(a.city) - getGeoScore(b.city));
    const selection = sortedList.slice(0, 9);

    const waypoints = selection.map((c: any) => {
      const raw = (c as any)._raw;
      if (raw?.straat && raw?.stad) return encodeURIComponent(`${raw.straat}, ${raw.stad}`);
      return encodeURIComponent(`${c.name} ${c.city}`);
    }).join('|');

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(DEFAULT_ORIGIN)}&destination=${encodeURIComponent(DEFAULT_ORIGIN)}&waypoints=${waypoints}&travelmode=driving`;
    window.open(mapsUrl, '_blank');
  };

  // --- EXPORT FUNCTIONALITY ---
  const downloadExport = () => {
      const companiesToExport = viewMode === 'favorites' ? favorites : foundCompanies;
      if (!companiesToExport.length) return;

      const headers = ["Bedrijfsnaam", "Stad", "Adres", "Telefoon", "Email", "Website", "KVK", "Gevonden Op (Datum)"];
      const csvRows = [headers.join(";")];

      companiesToExport.forEach(c => {
          const raw = (c as any)._raw || {};
          const discoveredDate = c.discoveredAt ? new Date(c.discoveredAt).toLocaleString('nl-NL') : 'Onbekend';

          const row = [
              `"${c.name || ''}"`,
              `"${c.city || ''}"`,
              `"${raw.straat || ''}"`,
              `"${raw.telefoon || ''}"`,
              `"${raw.email || ''}"`,
              `"${raw.website || ''}"`,
              `"${raw.kvk || ''}"`,
              `"${discoveredDate}"`
          ];
          csvRows.push(row.join(";"));
      });

      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `inncempro_export_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const sidebarRegionsActive = selectedRegions.filter(r => r !== 'Heel Nederland');

  // Active data — bouwgarantData minus manually deleted entries
  // Merge duplicate entries across sources into one enriched record
  const mergeEntries = (entries: any[]): any[] => {
    const normNaam = (s: string) => (s || '').toLowerCase()
      .replace(/\b(b\.?v\.?|nv|vof|cv|stichting|bna)\b/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    // Same company is often scraped a second time with a marketing tagline bolted on
    // ("&WA architecten" vs "&WA architecten - ontwerpen is luisteren") — strip anything
    // after a dash/pipe separator before comparing base names.
    const normNaamBase = (s: string) => normNaam((s || '').split(/\s[-–|]\s/)[0]);
    const normStreet = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
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
      const onbekendIdxs = idxs.filter(i => (entries[i].source || 'Onbekend') === 'Onbekend');
      const realIdxs = idxs.filter(i => entries[i].source && entries[i].source !== 'Onbekend');
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
    // distinct companies only merges the ones whose (city-free) core name actually matches.
    for (const idxs of byAddrKey.values()) {
      if (idxs.length < 2) continue;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const ia = idxs[a], ib = idxs[b];
          if (find(ia) === find(ib)) continue;
          const coreA = coreNaamCityFree(entries[ia].naam, entries[ia].stad);
          const coreB = coreNaamCityFree(entries[ib].naam, entries[ib].stad);
          if (coreA.length >= 3 && coreA === coreB) union(ia, ib);
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
      group.sort((a, b) => (a.source && a.source !== 'Onbekend' ? 0 : 1) - (b.source && b.source !== 'Onbekend' ? 0 : 1));
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
        const src = e.source || 'Onbekend';
        const score = completeness(e);
        if (!completenessBySource.has(src) || score > completenessBySource.get(src)!) completenessBySource.set(src, score);
      }
      const rawSources = group.map(e => e.source).filter(Boolean);
      const realSources = Array.from(new Set(rawSources.filter(s => s !== 'Onbekend')))
        .sort((a, b) => (completenessBySource.get(b) || 0) - (completenessBySource.get(a) || 0));
      const sources = realSources.length > 0 ? realSources : (rawSources.length > 0 ? ['Onbekend'] : []);
      base.source = sources[0] || 'Onbekend';
      base._sources = sources; // all sources as array
      // The "Onbekend" bron's address wins ties — it's leading for location, even when a
      // known bron (Bouwgarant, ...) is also present in the group.
      const onbekendEntry = group.find(e => (e.source || 'Onbekend') === 'Onbekend' && (e.straat || e.postcode || e.stad));
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
  };

  // Bedrijven buiten Nederland (Caribisch deel, België, etc.) horen niet in deze tool
  // — filter ze hier één keer weg, zodat álle downstream views (filters, kaarten,
  // dashboard, marktoverzicht) automatisch NL-only zijn zonder aparte checks.
  const isNederlandBedrijf = (b: any) => {
    const stad = (b.stad || '').toLowerCase().trim();
    const prov = (b.provincie || '').toLowerCase().trim();
    if (prov === 'belgië' || prov === 'belgie' || prov === 'belgium') return false;
    if (['willemstad','kralendijk','oranjestad','philipsburg','the bottom','sint-eustatius','saba'].includes(stad)) return false;
    return true;
  };

  const activeData = React.useMemo(
    () => {
      const filtered = (bouwgarantData as any[]).filter(b =>
        isNederlandBedrijf(b) &&
        !deletedEntries.has(deleteKey(b.naam, b.straat)) &&
        !deletedEntries.has(b.naam)
      );
      return mergeEntries(filtered);
    },
    // Every action that mutates the underlying bouwgarantData array in place (add, address
    // correction, manual edit) must also appear here, or the change won't propagate to any
    // derived count/filter/list — same as deletedEntries already does.
    [deletedEntries, customEntries, addressCorrections, manualEdits],
  );

  // Dataset fed into ProvinceFilter — changes with active tab so counts reflect current view
  const sidebarDataset = React.useMemo(() => {
    if (viewMode === 'favorites') return favorites.map(f => (f as any)._raw || { stad: f.city, provincie: '' });
    if (viewMode === 'search') return foundCompanies.map(c => (c as any)._raw || c);
    return activeData;
  }, [viewMode, favorites, foundCompanies, activeData]);

  const filteredFavorites = sidebarRegionsActive.length === 0 ? favorites : favorites.filter(fav => {
    const raw = (fav as any)._raw;
    const prov = raw?.provincie || '';
    const stad = normalizeStad(raw?.stad || fav.city || '');
    return sidebarRegionsActive.some(r => prov === r || stad === normalizeStad(r));
  });
  const itemsToShow = viewMode === 'favorites' ? filteredFavorites : foundCompanies;
  const totalPages = Math.ceil(itemsToShow.length / prefResultsPerPage);
  const currentItems = itemsToShow.slice((currentPage - 1) * prefResultsPerPage, currentPage * prefResultsPerPage);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    if (totalPages <= maxVisiblePages) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);
        if (currentPage <= 3) { start = 2; end = 4; }
        if (currentPage >= totalPages - 2) { start = totalPages - 3; end = totalPages - 1; }
        if (start > 2) pages.push('...');
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
    }
    return pages;
  };

  // ----- RENDER: LOGIN SCREEN -----
  if (!currentUser) {
      return (
          <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 font-sans">
              <div className="bg-white p-10 shadow-xl border border-slate-200 max-w-md w-full rounded-sm text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-[#009FE3]"></div>
                  <div className="flex justify-center mb-6">
                      <img src="https://www.inncempro.nl/wp-content/uploads/2018/06/Logo-Inncempro-facebook.png" alt="Inncempro Logo" className="w-24 h-24 object-contain"/>
                  </div>
                  <h1 className="text-3xl font-normal text-slate-900 font-condensed uppercase tracking-tight mb-2">Market Intelligence</h1>
                  <p className="text-slate-500 mb-8 text-sm">
                      Log in om toegang te krijgen tot het dashboard.
                  </p>
                  
                  {authError && <div className="bg-red-50 text-red-600 text-xs p-3 mb-4 rounded-sm">{authError}</div>}

                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                      {/* REGISTRATIE NAAM */}
                      {authMode === 'register' && (
                          <div className="text-left animate-fade-in">
                              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-condensed mb-1 block">Naam</label>
                              <div className="relative">
                                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium" required={authMode === 'register'} placeholder="Uw Naam"/>
                              </div>
                          </div>
                      )}

                      {/* EMAIL */}
                      <div className="text-left">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-condensed mb-1 block">
                              {authMode === 'login' ? 'Gebruikersnaam of Email' : 'Emailadres'}
                          </label>
                          <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                  type="text" 
                                  value={authMode === 'login' ? loginIdent : regEmail}
                                  onChange={(e) => authMode === 'login' ? setLoginIdent(e.target.value) : setRegEmail(e.target.value)}
                                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium"
                                  required
                                  placeholder={authMode === 'login' ? 'naam@bedrijf.nl' : 'naam@bedrijf.nl'}
                              />
                          </div>
                      </div>

                      {/* PASSWORD */}
                      <div className="text-left">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-condensed mb-1 block">Wachtwoord</label>
                          <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                  type="password" 
                                  value={authMode === 'login' ? loginPass : regPass}
                                  onChange={(e) => authMode === 'login' ? setLoginPass(e.target.value) : setRegPass(e.target.value)}
                                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium"
                                  required
                                  placeholder="••••••••"
                              />
                          </div>
                      </div>

                      <button type="submit" className="w-full py-3.5 bg-[#E85E26] hover:bg-[#d14d1b] text-white font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 transition-colors">
                          {authMode === 'login' ? <><LogIn className="w-4 h-4" /> Inloggen</> : <><Plus className="w-4 h-4" /> Account Maken</>}
                      </button>
                  </form>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                      <button onClick={() => {setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(null);}} className="text-xs font-bold text-[#009FE3] hover:underline uppercase tracking-wide">
                          {authMode === 'login' ? 'Nog geen account? Registreren' : 'Al een account? Inloggen'}
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // ----- RENDER: DASHBOARD -----
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-slate-800">
      <Header user={currentUser} onHomeClick={resetToHome} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} />

      {/* SETTINGS MODAL */}
      {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
              <div className="bg-white w-full max-w-lg rounded-sm shadow-xl animate-fade-in relative overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-slate-100">
                      <h2 className="text-base font-black text-slate-900 uppercase font-condensed tracking-wider">Instellingen</h2>
                      <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-800 pb-4"><X className="w-5 h-5"/></button>
                  </div>
                  {/* Tabs */}
                  <div className="flex border-b border-slate-100">
                      {(['profiel', 'voorkeuren', 'audit'] as const).map(tab => (
                          <button key={tab} onClick={() => setSettingsTab(tab)}
                              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${settingsTab === tab ? 'border-b-2 border-[#E85E26] text-[#E85E26]' : 'text-slate-400 hover:text-slate-700'}`}>
                              {tab === 'profiel' ? 'Profiel' : tab === 'voorkeuren' ? 'Voorkeuren' : 'Audit Log'}
                          </button>
                      ))}
                  </div>

                  <div className="p-6 max-h-[70vh] overflow-y-auto">
                      {settingsTab === 'profiel' && (
                          <form onSubmit={handleUpdateProfile} className="space-y-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Weergavenaam</label>
                                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none" />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">E-mail</label>
                                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none" />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Avatar URL</label>
                                  <input type="text" value={editAvatar} onChange={e => setEditAvatar(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none" placeholder="https://..." />
                                  <p className="text-[10px] text-slate-400 mt-1">Plak een afbeeldingslink.</p>
                              </div>
                              <button type="submit" className="w-full py-3 bg-[#009FE3] text-white font-bold uppercase rounded-sm flex items-center justify-center gap-2 hover:bg-[#008ac5] text-xs tracking-wider">
                                  <Save className="w-4 h-4" /> Opslaan
                              </button>
                          </form>
                      )}

                      {settingsTab === 'voorkeuren' && (
                          <div className="space-y-6">
                              {/* Bedrijfsadres */}
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Mijn adres</label>
                                  <p className="text-[10px] text-slate-400 mb-2">Uitgangspunt voor straal-zoeken (als er geen plaats is ingevuld) en voor afstandsberekening op alle kaarten. Per account aan te passen.</p>
                                  <input
                                      type="text"
                                      defaultValue={prefAddress}
                                      onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== prefAddress) savePrefAddress(e.target.value.trim()); }}
                                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                      placeholder="Straat, huisnummer, postcode, plaats"
                                      className="w-full p-2.5 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none"
                                  />
                                  <p className="text-[10px] mt-1 h-3.5">
                                      {prefAddressGeocoding
                                          ? <span className="text-slate-400">Adres opzoeken…</span>
                                          : prefAddressCoords
                                          ? <span className="text-green-600">✓ Adres gevonden</span>
                                          : <span className="text-amber-600">Adres niet gevonden — standaard Hengelo-locatie wordt gebruikt</span>}
                                  </p>
                              </div>

                              {/* Standaard sortering */}
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Standaard sortering</label>
                                  <p className="text-[10px] text-slate-400 mb-2">Hoe zoekresultaten standaard gesorteerd worden.</p>
                                  <div className="flex border border-slate-200 rounded-sm overflow-hidden">
                                      <button onClick={() => savePrefSort('relevant')}
                                          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${prefSort === 'relevant' ? 'bg-[#009FE3] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                                          Meest relevant
                                      </button>
                                      <button onClick={() => savePrefSort('az')}
                                          className={`flex-1 py-2.5 text-xs font-bold border-l border-slate-200 transition-colors ${prefSort === 'az' ? 'bg-[#009FE3] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                                          A – Z
                                      </button>
                                  </div>
                              </div>

                              {/* Resultaten per pagina */}
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Resultaten per pagina <span className="text-slate-400 normal-case font-normal">(live zoeken)</span></label>
                                  <div className="flex gap-2">
                                      {[10, 25, 50].map(n => (
                                          <button key={n} onClick={() => savePrefRpp(n)}
                                              className={`flex-1 py-2.5 text-xs font-bold border rounded-sm transition-colors ${prefResultsPerPage === n ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3]'}`}>
                                              {n}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              {/* Kaartinformatie */}
                              <div>
                                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">Informatie per kaart</label>
                                  <p className="text-[10px] text-slate-400 mb-3">Kies welke velden zichtbaar zijn op de compacte kaart.</p>
                                  <div className="space-y-2">
                                      {([
                                          { key: 'afstand', label: 'Afstand', desc: `km van ${hqShortLabel}` },
                                          { key: 'specs', label: 'Specialisaties', desc: 'Nieuwbouw, Renovatie, etc.' },
                                          { key: 'telefoon', label: 'Telefoonnummer', desc: 'Algemeen telefoonnummer' },
                                          { key: 'email', label: 'E-mailadres', desc: 'Algemeen e-mailadres' },
                                          { key: 'rechtsvorm', label: 'Rechtsvorm', desc: 'B.V., V.O.F., etc.' },
                                      ] as const).map(({ key, label, desc }) => (
                                          <label key={key} onClick={() => toggleCardField(key)} className="flex items-center gap-3 cursor-pointer group p-2.5 rounded-sm hover:bg-slate-50 border border-slate-100">
                                              <div className={`w-5 h-5 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-colors ${showField(key) ? 'bg-[#009FE3] border-[#009FE3]' : 'bg-white border-slate-300'}`}>
                                                  {showField(key) && <Check className="w-3 h-3 text-white" />}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                                                  <p className="text-[10px] text-slate-400">{desc}</p>
                                              </div>
                                          </label>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      )}

                      {settingsTab === 'audit' && (
                          <div className="space-y-3">
                              <div className="flex gap-2 mb-4">
                                  <input type="text" placeholder="Zoek op bedrijf..." value={auditFilter.search} onChange={e => setAuditFilter({...auditFilter, search: e.target.value})} className="flex-1 px-3 py-2 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none" />
                                  <select value={auditFilter.action} onChange={e => setAuditFilter({...auditFilter, action: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none bg-white">
                                      <option value="">Alle acties</option>
                                      <option value="Bedrijf geïmporteerd">Geïmporteerd</option>
                                      <option value="Bedrijf toegevoegd">Toegevoegd</option>
                                      <option value="Bedrijf bewerkt">Bewerkt</option>
                                      <option value="Bedrijf verwijderd">Verwijderd</option>
                                  </select>
                                  <select value={auditFilter.days} onChange={e => setAuditFilter({...auditFilter, days: Number(e.target.value)})} className="px-3 py-2 border border-slate-200 rounded-sm text-sm focus:border-[#009FE3] focus:outline-none bg-white">
                                      <option value={7}>7 dagen</option>
                                      <option value={30}>30 dagen</option>
                                      <option value={90}>90 dagen</option>
                                      <option value={999}>Alle</option>
                                  </select>
                              </div>
                              <div className="border border-slate-200 rounded-sm overflow-hidden max-h-96 overflow-y-auto">
                                  <table className="w-full text-xs">
                                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                          <tr>
                                              <th className="px-3 py-2 text-left font-bold text-slate-700">Timestamp</th>
                                              <th className="px-3 py-2 text-left font-bold text-slate-700">Gebruiker</th>
                                              <th className="px-3 py-2 text-left font-bold text-slate-700">Actie</th>
                                              <th className="px-3 py-2 text-left font-bold text-slate-700">Bedrijf</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          {auditLog
                                              .filter(e => {
                                                  const daysAgo = new Date(Date.now() - auditFilter.days * 24 * 60 * 60 * 1000).toISOString();
                                                  return e.timestamp >= daysAgo &&
                                                      (auditFilter.search === '' || e.bedrijf.toLowerCase().includes(auditFilter.search.toLowerCase())) &&
                                                      (auditFilter.action === '' || e.action === auditFilter.action);
                                              })
                                              .map((e, idx) => (
                                                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-[10px]">{new Date(e.timestamp).toLocaleString('nl-NL')}</td>
                                                      <td className="px-3 py-2 truncate text-slate-700">{e.userId}</td>
                                                      <td className="px-3 py-2 font-semibold text-slate-700">{e.action}</td>
                                                      <td className="px-3 py-2 truncate text-slate-700">{e.bedrijf}</td>
                                                  </tr>
                                              ))}
                                      </tbody>
                                  </table>
                              </div>
                              <p className="text-[10px] text-slate-400">Totaal: {auditLog.length} entries (max 1000 behouden)</p>
                          </div>
                      )}

                  </div>
              </div>
          </div>
      )}

      {/* MAIN LAYOUT */}
      {(() => {
        const activeFilterCount = [
          city, ...selectedRegions.filter(r => r !== 'Heel Nederland'), ...selectedTypes, ...selectedWerksoort,
          ...selectedBron, ...selectedRechtsvorm, ...selectedContact, ...selectedLijsten,
        ].filter(Boolean).length;

        const filterGroupsContent = (
          <>
            <div className="flex-grow overflow-y-auto p-6 space-y-2 scrollbar-thin">
                 {/* Opgeslagen filters */}
                 {savedFilters.length > 0 && (
                   <div className="border border-[#009FE3]/20 bg-[#009FE3]/5 rounded-sm p-3 mb-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-[#009FE3] mb-2 flex items-center gap-1.5"><Bookmark className="w-3 h-3"/>Opgeslagen filters</p>
                     <div className="space-y-1">
                       {savedFilters.map(f => (
                         <div key={f.name} className="flex items-center gap-1">
                           <button onClick={() => applySavedFilter(f)} className="flex-1 text-left text-xs font-semibold text-slate-700 hover:text-[#009FE3] truncate">{f.name}</button>
                           <button onClick={() => deleteSavedFilter(f.name)} className="text-slate-300 hover:text-red-400 flex-shrink-0"><X className="w-3 h-3" /></button>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
                 <ProvinceFilter selectedRegions={selectedRegions} onToggle={(item: string) => toggleFilter(setSelectedRegions, item)} dataset={sidebarDataset} />
                 <CollapsibleFilterGroup title="Discipline" items={['Architecten', 'Bouwbedrijven', 'Aannemers', 'Bouwmaterialen']} selectedItems={selectedTypes} onToggleItem={(item) => toggleFilter(setSelectedTypes, item)} dataset={activeData} countFn={(item: string, b: any) => { const t = detectType(b); if (item === 'Architecten') return t === 'architect'; if (item === 'Bouwbedrijven') return t === 'bouwbedrijf'; if (item === 'Aannemers') return t === 'aannemer'; if (item === 'Bouwmaterialen') return t === 'materialen'; return false; }} />
                 <CollapsibleFilterGroup title="Werksoort" items={['Nieuwbouw', 'Renovatie', 'Verduurzaming', 'Restauratie', 'Onderhoud', 'Interieur', 'Utiliteitsbouw', 'Allround']} selectedItems={selectedWerksoort} onToggleItem={(item) => toggleFilter(setSelectedWerksoort, item)} dataset={activeData} countFn={(item: string, b: any) => { const specs = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase(); if (item === 'Nieuwbouw') return specs.includes('nieuwbouw'); if (item === 'Renovatie') return specs.includes('renovatie') || specs.includes('verbouw') || specs.includes('aanbouw') || specs.includes('transformatie'); if (item === 'Verduurzaming') return specs.includes('verduurzam') || specs.includes('isoler') || specs.includes('duurzaam') || specs.includes('energie') || specs.includes('warmtepomp') || specs.includes('zonnepanelen'); if (item === 'Restauratie') return specs.includes('restauratie') || specs.includes('monument'); if (item === 'Onderhoud') return specs.includes('onderhoud') || specs.includes('beheer') || specs.includes('service'); if (item === 'Interieur') return specs.includes('interieur') || specs.includes('afbouw') || specs.includes('binneninrichting'); if (item === 'Utiliteitsbouw') return specs.includes('utiliteit') || specs.includes('kantoor') || specs.includes('bedrijfsgebouw') || specs.includes('zakelijk'); if (item === 'Allround') return specs.includes('allround'); return false; }} />
                 <CollapsibleFilterGroup title="Bron" items={['Bouwgarant', 'BNA', 'Architectenweb', 'Stiho', 'Jongeneel', 'BouwPartner', 'PontMeyer', 'Van Wijnen', 'Plegt-Vos', 'VolkerWessels', 'Onbekend']} selectedItems={selectedBron} onToggleItem={(item) => toggleFilter(setSelectedBron, item)} dataset={activeData} countFn={(item: string, b: any) => { const srcs = b._sources?.length ? b._sources : [b.source || 'Onbekend']; return srcs.includes(item); }} />
                 <CollapsibleFilterGroup title="Rechtsvorm" items={['B.V.', 'V.O.F.', 'Eenmanszaak', 'Stichting', 'N.V.']} selectedItems={selectedRechtsvorm} onToggleItem={(item) => toggleFilter(setSelectedRechtsvorm, item)} dataset={activeData} countFn={(item: string, b: any) => { const rv = (b.rechtsvorm || '').toLowerCase(); const naam = (b.naam || '').toLowerCase(); if (item === 'B.V.') return rv.includes('b.v') || rv.includes('bv') || naam.includes(' bv') || naam.endsWith(' b.v.') || naam.endsWith(' bv'); if (item === 'V.O.F.') return rv.includes('vof') || rv.includes('v.o.f') || naam.includes(' vof'); if (item === 'Eenmanszaak') return rv.includes('eenmanszaak') || rv.includes('zzp'); if (item === 'Stichting') return rv.includes('stichting') || naam.startsWith('stichting'); if (item === 'N.V.') return rv.includes('n.v') || rv.includes('nv') || naam.includes(' nv'); return false; }} />
                 <CollapsibleFilterGroup title="Contactgegevens" items={['Heeft telefoon', 'Heeft e-mail', 'Heeft website', 'Heeft KVK']} selectedItems={selectedContact} onToggleItem={(item) => toggleFilter(setSelectedContact, item)} dataset={activeData} countFn={(item: string, b: any) => { if (item === 'Heeft telefoon') return !!(b.telefoon || b.telefoon_sales || b.telefoon_admin); if (item === 'Heeft e-mail') return !!(b.email || b.email_sales || b.email_overig); if (item === 'Heeft website') return !!(b.website || b.url); if (item === 'Heeft KVK') return !!(b.kvk); return false; }} />
            </div>
            <div className="p-6 border-t border-slate-200 bg-white space-y-2">
                {(city || selectedRegions.length > 0 || selectedTypes.length > 0 || selectedWerksoort.length > 0 || selectedBron.length > 0 || selectedRechtsvorm.length > 0 || selectedContact.length > 0) && (
                  <button
                    onClick={() => { setSaveFilterName(''); setShowSaveFilterModal(true); }}
                    className="w-full py-2.5 bg-white border border-[#009FE3] text-[#009FE3] text-xs font-bold uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-2 rounded-sm hover:bg-[#009FE3]/5">
                    <Bookmark className="w-3.5 h-3.5" /> Sla filter op
                  </button>
                )}
                <button
                    onClick={() => {
                      if (viewMode === 'favorites') setCurrentPage(1);
                      else if (viewMode === 'database') setDbPage(1);
                      else handleManualSearch();
                      setShowMobileFilters(false);
                    }}
                    disabled={searchState.isLoading}
                    className="w-full py-3.5 bg-[#009FE3] hover:bg-[#008ac5] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-[0.1em] transition-colors shadow-sm flex items-center justify-center gap-2">
                    Filters Toepassen
                </button>
                {(selectedRegions.length > 0 || selectedTypes.length > 0 || selectedWerksoort.length > 0 || selectedContact.length > 0 || selectedLijsten.length > 0 || selectedBron.length > 0 || selectedRechtsvorm.length > 0) && (
                    <button
                        onClick={() => {
                            setSelectedRegions([]);
                            setSelectedTypes([]);
                            setSelectedWerksoort([]);
                            setSelectedContact([]);
                            setSelectedLijsten([]);
                            setSelectedBron([]);
                            setSelectedRechtsvorm([]);
                            setCity('');
                            setRadiusKm(null);
                            setFoundCompanies([]);
                            setTotalMatches(0);
                            setSearchState({ isLoading: false, data: null, error: null });
                        }}
                        className="w-full py-2.5 bg-white border border-slate-200 hover:border-red-300 hover:text-red-500 text-slate-500 text-xs font-bold uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-2">
                        <X className="w-3.5 h-3.5" /> Filters Wissen
                    </button>
                )}
            </div>
          </>
        );

        return (
      <div className={`flex flex-col md:flex-row max-w-[1400px] mx-auto w-full flex-grow ${selectedIds.size > 0 ? 'pb-20' : ''}`}>
          {viewMode !== 'map' && (
          <aside className={`bg-white border-r border-slate-200 flex-shrink-0 hidden md:flex flex-col h-[calc(100vh-112px)] sticky top-28 transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-80'}`}>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  {!sidebarCollapsed && <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest font-condensed flex items-center gap-2"><Filter className="w-4 h-4 text-[#009FE3]" /> Filters</h2>}
                  <button onClick={() => setSidebarCollapsed(v => !v)} className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title={sidebarCollapsed ? 'Filters tonen' : 'Filters verbergen'}>
                      {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </button>
              </div>
              {!sidebarCollapsed && filterGroupsContent}
          </aside>
          )}

          <main className="flex-grow p-3 sm:p-6 lg:p-10 min-w-0 flex flex-col">
             <div className="max-w-4xl mx-auto w-full mb-4 sm:mb-6 flex gap-1 border-b border-slate-200 overflow-x-auto">
                 <button onClick={() => setViewMode('search')} className={`flex-1 min-w-0 py-2.5 sm:py-3 border-b-2 font-bold uppercase tracking-wider text-[10px] sm:text-xs transition-colors flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 ${viewMode === 'search' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                     <LayoutGrid className="hidden sm:block w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                     <span className="hidden sm:inline">Live Zoeken</span>
                     <span className="sm:hidden">Zoeken</span>
                 </button>
                 <button onClick={() => { setViewMode('favorites'); setCurrentPage(1); setShowRouteMap(false); }} className={`flex-1 min-w-0 py-2.5 sm:py-3 border-b-2 font-bold uppercase tracking-wider text-[10px] sm:text-xs transition-colors flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 ${viewMode === 'favorites' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                     <Heart className={`hidden sm:block w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${viewMode === 'favorites' ? 'fill-current' : ''}`} />
                     <span className="hidden sm:inline">Mijn Favorieten ({favorites.length})</span>
                     <span className="sm:hidden">Favorieten ({favorites.length})</span>
                 </button>
                 <button onClick={() => { setViewMode('database'); setDbPage(1); }} className={`flex-1 min-w-0 py-2.5 sm:py-3 border-b-2 font-bold uppercase tracking-wider text-[10px] sm:text-xs transition-colors flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 ${viewMode === 'database' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                     <Database className="hidden sm:block w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                     <span className="hidden sm:inline">Bedrijvendatabase ({activeData.length})</span>
                     <span className="sm:hidden">Database</span>
                 </button>
                 <button onClick={() => setViewMode('map')} className={`flex-1 min-w-0 py-2.5 sm:py-3 border-b-2 font-bold uppercase tracking-wider text-[10px] sm:text-xs transition-colors flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 ${viewMode === 'map' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                     <MapPin className="hidden sm:block w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" /> Kaart
                     {mapMarkerCount > 0 && (
                       <span className="ml-0.5 px-1.5 py-0.5 bg-[#E85E26] text-white rounded-full text-[9px] font-bold leading-none">{mapMarkerCount}</span>
                     )}
                 </button>
                 <button onClick={() => setViewMode('dashboard')} className={`flex-1 min-w-0 py-2.5 sm:py-3 border-b-2 font-bold uppercase tracking-wider text-[10px] sm:text-xs transition-colors flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 ${viewMode === 'dashboard' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                     <TrendingUp className="hidden sm:block w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                     <span className="hidden sm:inline">Marktoverzicht</span>
                     <span className="sm:hidden">Markt</span>
                 </button>
             </div>

             {/* Mobiel: filters-knop + slide-up drawer (de aside hierboven is hidden md:flex, dus onzichtbaar op mobiel) */}
             {viewMode !== 'map' && (
               <button
                 onClick={() => setShowMobileFilters(true)}
                 className="md:hidden flex items-center justify-center gap-2 w-full mb-4 py-2.5 bg-white border border-slate-200 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600"
               >
                 <Filter className="w-3.5 h-3.5 text-[#009FE3]" /> Filters
                 {activeFilterCount > 0 && <span className="px-1.5 py-0.5 bg-[#E85E26] text-white rounded-full text-[10px] leading-none">{activeFilterCount}</span>}
               </button>
             )}

             {viewMode !== 'map' && showMobileFilters && (
               <div className="md:hidden fixed inset-0 z-50 flex items-end bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowMobileFilters(false)}>
                 <div className="bg-white w-full max-h-[85vh] rounded-t-xl flex flex-col" onClick={e => e.stopPropagation()}>
                   <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 flex-shrink-0" />
                   <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                     <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest font-condensed flex items-center gap-2"><Filter className="w-4 h-4 text-[#009FE3]" /> Filters</h2>
                     <button onClick={() => setShowMobileFilters(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
                   </div>
                   <div className="flex flex-col overflow-y-auto min-h-0">
                     {filterGroupsContent}
                   </div>
                 </div>
               </div>
             )}

             {viewMode === 'database' && (() => {
               const sidebarRegions = selectedRegions.filter(r => r !== 'Heel Nederland');
               const filtered = activeData.filter(b => {
                 if (!(b.naam || '').trim()) return false;
                 const q = dbSearch.toLowerCase().trim();
                 const qNorm = normalizeText(dbSearch);
                 const dbStadN = normalizeStad(b.stad || '');
                 const allFields = [b.naam, dbStadN, b.straat, b.postcode, b.email, b.telefoon, b.spec1, b.spec2, b.spec3, b.website].join(' ').toLowerCase();
                 const allFieldsNorm = normalizeText(allFields);
                 const matchSearch = !q || allFields.includes(q) || allFieldsNorm.includes(qNorm) || dbStadN.includes(normalizeStad(q));
                 const matchSidebar = sidebarRegions.length === 0 || sidebarRegions.some(r => b.provincie === r || normalizeStad(b.stad) === normalizeStad(r));
                 const naam = (b.naam || '').toLowerCase();
                 const matchLijsten = selectedLijsten.length === 0 || selectedLijsten.some(lijst => {
                   if (lijst === 'Van Wijnen') return naam.includes('van wijnen');
                   return false;
                 });
                 const dbSrc = b._sources?.length ? b._sources : [b.source || 'Onbekend'];
                 const matchBronSidebar = selectedBron.length === 0 || selectedBron.some(sel => dbSrc.includes(sel));
                 const rv = (b.rechtsvorm || '').toLowerCase();
                 const matchRvSidebar = selectedRechtsvorm.length === 0 || selectedRechtsvorm.some(sel => {
                   if (sel === 'B.V.') return rv.includes('b.v') || rv.includes('bv') || naam.includes(' bv') || naam.endsWith(' b.v.') || naam.endsWith(' bv');
                   if (sel === 'V.O.F.') return rv.includes('vof') || rv.includes('v.o.f') || naam.includes(' vof');
                   if (sel === 'Eenmanszaak') return rv.includes('eenmanszaak') || rv.includes('zzp');
                   if (sel === 'Stichting') return rv.includes('stichting') || naam.startsWith('stichting');
                   if (sel === 'N.V.') return rv.includes('n.v') || rv.includes('nv') || naam.includes(' nv');
                   return false;
                 });
                 const matchTypeSidebar = selectedTypes.length === 0 || (() => {
                   const t = detectType(b);
                   return selectedTypes.some(sel => {
                     if (sel === 'Architecten') return t === 'architect';
                     if (sel === 'Bouwbedrijven') return t === 'bouwbedrijf';
                     if (sel === 'Aannemers') return t === 'aannemer';
                     if (sel === 'Bouwmaterialen') return t === 'materialen';
                     return false;
                   });
                 })();
                 const specs2 = [b.spec1, b.spec2, b.spec3].filter(Boolean).join(' ').toLowerCase();
                 const matchWerksoortSidebar = selectedWerksoort.length === 0 || selectedWerksoort.some(sel => {
                   if (sel === 'Nieuwbouw') return specs2.includes('nieuwbouw');
                   if (sel === 'Renovatie') return specs2.includes('renovatie') || specs2.includes('verbouw') || specs2.includes('aanbouw') || specs2.includes('transformatie');
                   if (sel === 'Verduurzaming') return specs2.includes('verduurzam') || specs2.includes('isoler') || specs2.includes('duurzaam') || specs2.includes('energie') || specs2.includes('warmtepomp') || specs2.includes('zonnepanelen');
                   if (sel === 'Restauratie') return specs2.includes('restauratie') || specs2.includes('monument');
                   if (sel === 'Onderhoud') return specs2.includes('onderhoud') || specs2.includes('beheer') || specs2.includes('service');
                   if (sel === 'Interieur') return specs2.includes('interieur') || specs2.includes('afbouw') || specs2.includes('binneninrichting');
                   if (sel === 'Utiliteitsbouw') return specs2.includes('utiliteit') || specs2.includes('kantoor') || specs2.includes('bedrijfsgebouw') || specs2.includes('zakelijk');
                   if (sel === 'Allround') return specs2.includes('allround');
                   return false;
                 });
                 const matchContactSidebar = selectedContact.length === 0 || selectedContact.some(sel => {
                   if (sel === 'Heeft telefoon') return !!(b.telefoon || b.telefoon_sales || b.telefoon_admin);
                   if (sel === 'Heeft e-mail') return !!(b.email || b.email_sales || b.email_overig);
                   if (sel === 'Heeft website') return !!(b.website || b.url);
                   if (sel === 'Heeft KVK') return !!(b.kvk);
                   return false;
                 });
                 return matchSearch && matchSidebar && matchLijsten && matchBronSidebar && matchRvSidebar && matchTypeSidebar && matchWerksoortSidebar && matchContactSidebar;
               });
               const totalPages = Math.ceil(filtered.length / DB_PAGE_SIZE);
               const paged = filtered.slice((dbPage - 1) * DB_PAGE_SIZE, dbPage * DB_PAGE_SIZE);
               const btnBase = "flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border transition-all flex-1 whitespace-nowrap rounded-sm";
               return (
                 <div className="max-w-4xl mx-auto w-full">
                   <div className="flex gap-2 sm:gap-3 mb-3 flex-wrap">
                     <div className="relative w-full">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                       <input type="text" value={dbSearch} onChange={e => { setDbSearch(e.target.value); setDbPage(1); }} placeholder="Zoek op naam, stad, email..." className="w-full pl-9 pr-4 py-2.5 border border-slate-200 text-sm focus:outline-none focus:border-[#009FE3]" />
                     </div>
                   </div>
                   <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                     <div className="flex items-center gap-2">
                       <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">~{filtered.length} gevonden</span>
                       <button onClick={() => setImportModalOpen(true)} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-600 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all"><Upload className="w-3 h-3"/>Importeren</button>
                       <button onClick={() => { setAddForm({ naam: '', straat: '', postcode: '', stad: '', provincie: '', telefoon: '', email: '', website: '', spec1: '', spec2: '', spec3: '', rechtsvorm: '', kvk: '', linkedin_url: '', twitter_handle: '', instagram_handle: '', source: '' }); setBulkText(''); setBulkParsed([]); setBulkMsg(''); setAddDuplicate(null); setShowAddModal(true); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-600 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all"><Plus className="w-3 h-3"/>Toevoegen</button>
                     </div>
                     {(() => {
                       const pageNamen = paged.map((b: any) => b.naam as string);
                       const allPageSel = pageNamen.length > 0 && pageNamen.every(n => selectedIds.has(n));
                       return (
                         <button
                           onClick={() => {
                             if (allPageSel) {
                               setSelectedIds(prev => { const n = new Set(prev); pageNamen.forEach(nm => n.delete(nm)); return n; });
                               setSelectedRaws(prev => { const n = new Map(prev); pageNamen.forEach(nm => n.delete(nm)); return n; });
                             } else {
                               setSelectedIds(prev => { const n = new Set(prev); pageNamen.forEach(nm => n.add(nm)); return n; });
                               setSelectedRaws(prev => { const n = new Map(prev); paged.forEach((b: any) => n.set(b.naam, b)); return n; });
                             }
                           }}
                           className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 border transition-colors ${allPageSel ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'bg-white text-slate-600 border-slate-300 hover:border-[#E85E26] hover:text-[#E85E26]'}`}
                         >
                           <Check className="w-3 h-3" /> {allPageSel ? 'Deselecteer pagina' : 'Selecteer pagina'}
                         </button>
                       );
                     })()}
                     {selectedIds.size > 0 && (
                       <button
                         onClick={clearSelection}
                         className="px-3 py-1.5 bg-white text-red-500 border border-red-200 hover:bg-red-50 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors"
                       >
                         <X className="w-3.5 h-3.5" /> Alles deselecteren ({selectedIds.size})
                       </button>
                     )}
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {paged.map((b: any, i: number) => (
                       <div key={i} className={`bg-white border p-5 flex flex-col gap-3 transition-colors cursor-pointer ${selectedIds.has(b.naam) ? 'border-[#E85E26] ring-1 ring-[#E85E26]/30' : 'border-slate-200 hover:border-[#009FE3]'}`} onClick={() => { setSelectedCompany(b); addToRecentViewed(b.naam); }}>
                         <div className="flex items-start justify-between gap-2">
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 flex-wrap">
                               <div onClick={e => toggleSelect(b.naam, b, e)} className={`flex-shrink-0 w-4 h-4 border-2 rounded-sm flex items-center justify-center transition-colors ${selectedIds.has(b.naam) ? 'bg-[#E85E26] border-[#E85E26]' : 'border-slate-300 hover:border-[#E85E26]'}`}>
                                 {selectedIds.has(b.naam) && <Check className="w-2.5 h-2.5 text-white" />}
                               </div>
                               <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide leading-tight">{b.naam}</h3>
                             </div>
                             <div className="flex items-center gap-1.5 flex-wrap mt-1">
                               <SourceBadges b={b} />
                               {isNew(b) && <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 font-bold rounded-sm flex-shrink-0">Nieuw</span>}
                               {coreSpecs(b).map((s: string, si: number) => (
                                 <span key={si} className="text-[10px] bg-[#E8F4FB] text-[#009FE3] px-2 py-0.5 font-semibold rounded-sm">{s}</span>
                               ))}
                             </div>
                             {(b.straat || b.postcode || b.stad) && (
                               <p className="text-slate-500 text-xs mt-1 flex items-start gap-1 flex-wrap">
                                 <MapPin className="w-3 h-3 flex-shrink-0" />
                                 {[b.straat, [b.postcode, b.stad].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                                 {b.provincie && <span className="text-slate-400 ml-1 whitespace-nowrap">·&nbsp;{b.provincie}</span>}
                               </p>
                             )}
                           </div>
                           {showField('rechtsvorm') && b.rechtsvorm && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium whitespace-nowrap flex-shrink-0">{b.rechtsvorm}</span>}
                         </div>
                         {(b.telefoon || b.email) && (showField('telefoon') || showField('email')) && (
                           <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                             {showField('telefoon') && b.telefoon && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" />{b.telefoon}</span>}
                             {showField('email') && b.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email}</span>}
                           </div>
                         )}
                         <div className="mt-auto pt-2 border-t border-slate-100 space-y-2" onClick={e => e.stopPropagation()}>
                           <div className="flex gap-2">
                             {b.website && <a href={toUrl(b.website)} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3]`}><Globe className="w-3 h-3"/>Site</a>}
                             {(b.straat || b.stad) && <a href={`https://maps.google.com/?q=${encodeURIComponent(((b.straat||'')+' '+(b.stad||'')).trim())}`} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]`}><MapPin className="w-3 h-3"/>Route</a>}
                             {b.url && (visibleSources(b).length > 1
                               ? visibleSources(b).map((s: string, si: number) => (
                                   <a key={si} href={toUrl(b.url)} target="_blank" rel="noreferrer" className={`${btnBase} text-white border-transparent ${srcColor(s).btn} ${srcColor(s).btnHover}`}><ArrowRight className="w-3 h-3"/>{s}</a>
                                 ))
                               : <a href={toUrl(b.url)} target="_blank" rel="noreferrer" className={`${btnBase} text-white border-transparent ${srcColor(visibleSources(b)[0]).btn} ${srcColor(visibleSources(b)[0]).btnHover}`}><ArrowRight className="w-3 h-3"/>{visibleSources(b)[0] || 'Bronpagina'}</a>
                             )}
                           </div>
                           <div className="flex gap-2">
                             <button onClick={() => { setSelectedRegions([]); setSelectedTypes([]); setSelectedWerksoort([]); setSelectedContact([]); setRadiusKm(null); setCity(b.naam); setViewMode('search'); executeSearch(undefined, undefined, b.naam, null, null); }} className={`${btnBase} bg-[#E85E26]/5 text-[#E85E26] border-[#E85E26]/30 hover:border-[#E85E26] hover:bg-[#E85E26]/10`}><Search className="w-3 h-3"/>Zoeken in Live</button>
                             <FavButton company={{id:`db-${i}`, name: b.naam, city: b.stad, _raw: b}} favorites={favorites} onToggle={toggleFavorite} />
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                   {totalPages > 1 && (
                   <div className="flex items-center gap-2 flex-wrap justify-center py-8 border-t border-slate-200 mt-4">
                     <button onClick={() => setDbPage(1)} disabled={dbPage === 1} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">«</button>
                     <button onClick={() => setDbPage(p => Math.max(1, p-1))} disabled={dbPage === 1} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">← Vorige</button>
                     <div className="flex items-center gap-1">
                       {(() => {
                         const pages: (number|string)[] = [];
                         const maxV = 5;
                         if (totalPages <= maxV) { for (let i=1;i<=totalPages;i++) pages.push(i); }
                         else {
                           pages.push(1);
                           let s=Math.max(2,dbPage-1), e=Math.min(totalPages-1,dbPage+1);
                           if (dbPage<=3){s=2;e=4;} if (dbPage>=totalPages-2){s=totalPages-3;e=totalPages-1;}
                           if (s>2) pages.push('...');
                           for (let i=s;i<=e;i++) pages.push(i);
                           if (e<totalPages-1) pages.push('...');
                           pages.push(totalPages);
                         }
                         return pages.map((p,idx) => p==='...' ? <span key={`d${idx}`} className="px-2 text-slate-400">...</span> :
                           <button key={`p${p}`} onClick={() => setDbPage(Number(p))} className={`w-8 h-8 flex items-center justify-center rounded-sm text-xs font-bold font-condensed transition-all ${dbPage===p ? 'bg-[#E85E26] text-white' : 'bg-white border border-slate-200 hover:border-[#E85E26] text-slate-700'}`}>{p}</button>
                         );
                       })()}
                     </div>
                     <button onClick={() => setDbPage(p => Math.min(totalPages, p+1))} disabled={dbPage === totalPages} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">Volgende →</button>
                     <button onClick={() => setDbPage(totalPages)} disabled={dbPage === totalPages} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">»</button>
                     <span className="text-slate-300 mx-1">|</span>
                     <form onSubmit={e => { e.preventDefault(); const v = parseInt((e.currentTarget.elements.namedItem('pg') as HTMLInputElement).value); if (v >= 1 && v <= totalPages) setDbPage(v); }} className="flex items-center gap-1">
                       <input name="pg" type="number" min={1} max={totalPages} defaultValue={dbPage} key={dbPage} placeholder="pag." className="w-14 text-center border border-slate-300 text-xs py-2 rounded-sm focus:outline-none focus:border-[#009FE3]" />
                       <button type="submit" className="px-3 py-2 bg-[#009FE3] text-white text-[10px] font-bold rounded-sm hover:bg-[#008ac5]">→</button>
                     </form>
                   </div>
                   )}
                 </div>
               );
             })()}

             {viewMode === 'search' && (
               <div className="max-w-4xl mx-auto w-full mb-8">
                 <div className="bg-white shadow-sm border border-slate-200 p-2 flex flex-col sm:flex-row gap-0 items-center w-full">
                    <div className="relative flex-grow w-full border-r border-slate-100">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          onFocus={() => setShowHistory(true)}
                          onBlur={() => setTimeout(() => setShowHistory(false), 150)}
                          onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                          placeholder="Naam (OMA, BAM...), stad, straat of postcode"
                          className="w-full pl-14 pr-4 py-4 bg-transparent text-slate-900 font-medium placeholder-slate-400 focus:outline-none text-base"
                        />
                    </div>
                    <button onClick={() => handleManualSearch()} disabled={searchState.isLoading} className="w-full sm:w-auto bg-[#E85E26] hover:bg-[#d14d1b] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 px-8 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-wider min-w-[160px]">
                        {searchState.isLoading ? <Loader2 className="animate-spin w-4 h-4"/> : <ArrowRight className="w-4 h-4" />}
                        <span>Zoeken</span>
                    </button>
                 </div>
                 {/* Straal filter — sleepbare slider */}
                 <div className="flex items-center gap-3 mt-2 flex-wrap">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">Straal:</span>
                   <label className="flex items-center gap-1.5 flex-shrink-0">
                     <input
                       type="checkbox"
                       checked={radiusKm !== null}
                       onChange={e => setRadiusKm(e.target.checked ? (radiusKm ?? 20) : null)}
                       className="w-3.5 h-3.5 accent-[#009FE3]"
                     />
                     <span className="text-[10px] text-slate-500">Aan</span>
                   </label>
                   {radiusKm !== null && (
                     <>
                       <input
                         type="range"
                         min={1}
                         max={200}
                         step={1}
                         value={radiusKm}
                         onChange={e => setRadiusKm(Number(e.target.value))}
                         className="flex-1 min-w-[120px] max-w-[240px] accent-[#009FE3] h-1.5"
                       />
                       <span className="text-[10px] font-bold text-[#009FE3] w-14 flex-shrink-0">{radiusKm} km</span>
                       <span className="text-[10px] text-slate-500">
                         Zoek bedrijven binnen <strong>{radiusKm} km</strong> van de ingevoerde locatie
                       </span>
                     </>
                   )}
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0 ml-2">Geavanceerd:</span>
                   <label className="flex items-center gap-1.5 flex-shrink-0">
                     <input
                       type="checkbox"
                       checked={advancedSearch}
                       onChange={e => setAdvancedSearch(e.target.checked)}
                       className="w-3.5 h-3.5 accent-[#009FE3]"
                     />
                     <span className="text-[10px] text-slate-500">Aan</span>
                   </label>
                   {advancedSearch && (
                     <span className="text-[10px] text-slate-400 basis-full sm:basis-auto">
                       Bijv: <code className="bg-slate-100 px-1 rounded">architect OR bouwbedrijf</code>, <code className="bg-slate-100 px-1 rounded">rotterdam NOT bv</code>, <code className="bg-slate-100 px-1 rounded">"van der"</code>. AND vereist beide termen, OR één van beide, NOT sluit uit.
                     </span>
                   )}
                 </div>
                 {/* Zoekgeschiedenis */}
                 {showHistory && searchHistory.length > 0 && (
                   <div className="bg-white border border-t-0 border-slate-200 shadow-lg w-full">
                     <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recente zoekopdrachten</span>
                       <button onClick={() => { setSearchHistory([]); if (currentUser) localStorage.removeItem(`inncempro_search_history_${currentUser.id}`); }} className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-wider">Wis</button>
                     </div>
                     {searchHistory.map((h, i) => (
                       <button key={i} onMouseDown={() => { setCity(h); setShowHistory(false); setTimeout(() => executeSearch(), 0); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-[#009FE3]/5 flex items-center gap-3 border-b border-slate-100 last:border-0">
                         <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                         {h}
                       </button>
                     ))}
                   </div>
                 )}
               </div>
             )}

            {searchState.error && viewMode === 'search' && (
                <div className="max-w-4xl mx-auto w-full mb-8 bg-red-50 border border-red-200 p-4 text-red-800 rounded-sm">
                    <p className="font-bold text-sm uppercase flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Melding</p>
                    <p className="text-sm mt-1">{searchState.error}</p>
                </div>
            )}

            {viewMode === 'search' && !foundCompanies.length && !searchState.isLoading && !searchState.error && (
                <div className="py-16 text-center max-w-2xl mx-auto">
                    <Search className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm font-medium">Typ een bedrijfsnaam, stad of postcode — of stel een filter in.</p>
                    <p className="text-slate-400 text-xs mt-1">Alle {activeData.length.toLocaleString('nl-NL')} bedrijven staan in de <button onClick={() => { setViewMode('database'); setDbPage(1); }} className="underline hover:text-[#009FE3]">Bedrijvendatabase</button>.</p>
                    <button onClick={() => setShowAIHelper(true)} className="mt-4 px-4 py-2 bg-[#009FE3] hover:bg-[#0088c8] text-white text-sm font-bold rounded-sm flex items-center gap-2 transition-colors"><Bot className="w-4 h-4" /> AI Route Helper</button>
                </div>
            )}

            {viewMode === 'dashboard' && (() => {
              const total = activeData.length;
              const bySource: Record<string, number> = {};
              activeData.forEach(b => { const srcs: string[] = b._sources?.length ? b._sources : [b.source || 'Onbekend']; srcs.forEach(s => { bySource[s] = (bySource[s] || 0) + 1; }); });
              const byType: Record<string, number> = { Architecten: 0, Bouwbedrijven: 0, Aannemers: 0, Materialen: 0, Overig: 0 };
              activeData.forEach(b => { const t = detectType(b); if (t === 'architect') byType.Architecten++; else if (t === 'bouwbedrijf') byType.Bouwbedrijven++; else if (t === 'aannemer') byType.Aannemers++; else if (t === 'materialen') byType.Materialen++; else byType.Overig++; });
              const byProv: Record<string, number> = {};
              activeData.forEach(b => { if (b.provincie) byProv[b.provincie] = (byProv[b.provincie] || 0) + 1; });
              const provSorted = Object.entries(byProv).sort((a, b) => b[1] - a[1]);
              const maxProv = provSorted[0]?.[1] || 1;
              // Plaatsen (steden + dorpen) per provincie, voor het "Bedrijven per plaats" overzicht
              const byProvPlace: Record<string, Record<string, number>> = {};
              activeData.forEach(b => {
                const stad = (b.stad || '').trim();
                if (!stad) return;
                const prov = b.provincie || 'Onbekend';
                if (!byProvPlace[prov]) byProvPlace[prov] = {};
                byProvPlace[prov][stad] = (byProvPlace[prov][stad] || 0) + 1;
              });
              const provPlaceSorted = Object.entries(byProvPlace)
                .map(([prov, places]) => ({
                  prov,
                  places: Object.entries(places).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl')),
                  total: Object.values(places).reduce((s, c) => s + c, 0),
                }))
                .sort((a, b) => b.total - a.total);
              const srcSorted = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
              const maxSrc = srcSorted[0]?.[1] || 1;
              const typeColors: Record<string, string> = { Architecten: '#E85E26', Bouwbedrijven: '#009FE3', Aannemers: '#1B4F72', Materialen: '#16a34a', Overig: '#94a3b8' };
              // Schematische tegelkaart van NL — kleurintensiteit = aantal bedrijven t.o.v. de drukste provincie
              const NL_GRID: { naam: string; col: number; row: number; colSpan?: number; rowSpan?: number }[] = [
                { naam: 'Friesland',     col: 2, row: 1 },
                { naam: 'Groningen',     col: 3, row: 1 },
                { naam: 'Noord-Holland', col: 1, row: 2 },
                { naam: 'Drenthe',       col: 3, row: 2 },
                { naam: 'Overijssel',    col: 4, row: 2 },
                { naam: 'Flevoland',     col: 2, row: 3 },
                { naam: 'Gelderland',    col: 3, row: 3, colSpan: 2, rowSpan: 2 },
                { naam: 'Zuid-Holland',  col: 1, row: 4 },
                { naam: 'Utrecht',       col: 2, row: 4 },
                { naam: 'Zeeland',       col: 1, row: 5 },
                { naam: 'Noord-Brabant', col: 2, row: 5, colSpan: 2 },
                { naam: 'Limburg',       col: 4, row: 5 },
              ];
              const overigProv = provSorted.filter(([prov]) => !NL_GRID.some(g => g.naam === prov));
              const goToProv = (prov: string) => { setSelectedRegions([prov]); setViewMode('database'); setDbPage(1); };
              return (
                <div className="max-w-5xl mx-auto w-full space-y-8 pb-10">
                  <div>
                    <h2 className="text-2xl font-bold uppercase font-condensed tracking-tight text-slate-900 mb-1">Marktoverzicht</h2>
                    <p className="text-xs text-slate-400">Live statistieken over alle {total.toLocaleString('nl-NL')} bedrijven in de database</p>
                  </div>
                  {/* NL tegelkaart — dekking per provincie in één oogopslag */}
                  <div className="bg-white border border-slate-200 rounded-sm p-5">
                    <div className="flex items-baseline justify-between mb-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">Dekking op de kaart</h3>
                      <p className="text-[10px] text-slate-400">Klik een provincie voor de bedrijven daarin</p>
                    </div>
                    <div className="grid gap-1.5 mx-auto max-w-md" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'repeat(6, 56px)' }}>
                      {NL_GRID.map(({ naam, col, row, colSpan, rowSpan }) => {
                        const cnt = byProv[naam] || 0;
                        const intensity = cnt / maxProv; // 0..1
                        const bg = `rgba(0, 159, 227, ${0.12 + intensity * 0.88})`;
                        const light = intensity < 0.45;
                        return (
                          <button
                            key={naam}
                            onClick={() => goToProv(naam)}
                            title={`${naam}: ${cnt.toLocaleString('nl-NL')} bedrijven`}
                            style={{ gridColumn: `${col} / span ${colSpan || 1}`, gridRow: `${row} / span ${rowSpan || 1}`, backgroundColor: bg }}
                            className="rounded-sm flex flex-col items-center justify-center gap-0.5 p-1 transition-transform hover:scale-[1.03] hover:z-10 hover:shadow-md"
                          >
                            <span className={`text-[9px] font-bold uppercase tracking-tight text-center leading-tight ${light ? 'text-slate-600' : 'text-white'}`}>{naam}</span>
                            <span className={`text-sm font-black font-condensed ${light ? 'text-slate-900' : 'text-white'}`}>{cnt.toLocaleString('nl-NL')}</span>
                          </button>
                        );
                      })}
                    </div>
                    {overigProv.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                        {overigProv.map(([prov, cnt]) => (
                          <button key={prov} onClick={() => goToProv(prov)} className="text-[10px] text-slate-400 hover:text-[#009FE3] transition-colors">
                            {prov}: <span className="font-bold">{cnt.toLocaleString('nl-NL')}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Bron + Discipline naast elkaar */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Per bron */}
                    <div className="bg-white border border-slate-200 rounded-sm p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-4">Bedrijven per bron</h3>
                      <div className="space-y-2.5">
                        {srcSorted.map(([src, cnt]) => (
                          <div key={src}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-semibold text-slate-700">{src}</span>
                              <span className="text-slate-400 font-medium">{cnt.toLocaleString('nl-NL')}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{width: `${cnt/maxSrc*100}%`, backgroundColor: srcColor(src).text.replace('text-[','').replace(']','') || '#009FE3', background: src === 'Bouwgarant' ? '#009FE3' : src === 'Architectenweb' ? '#E85E26' : src === 'BNA' ? '#1B4F72' : src === 'Stiho' ? '#ea580c' : src === 'Jongeneel' ? '#16a34a' : '#94a3b8'}}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Per discipline */}
                    <div className="bg-white border border-slate-200 rounded-sm p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-4">Discipline verdeling</h3>
                      <div className="space-y-2.5">
                        {Object.entries(byType).map(([type, cnt]) => (
                          <div key={type}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-semibold text-slate-700">{type}</span>
                              <span className="text-slate-400 font-medium">{cnt.toLocaleString('nl-NL')} ({Math.round(cnt/total*100)}%)</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{width: `${cnt/total*100}%`, backgroundColor: typeColors[type]}}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Provincie overzicht */}
                  <div className="bg-white border border-slate-200 rounded-sm p-5">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-4">Bedrijven per provincie</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
                      {provSorted.map(([prov, cnt]) => (
                        <div key={prov}>
                          <div className="flex justify-between text-xs mb-1">
                            <button onClick={() => { setSelectedRegions([prov]); setViewMode('database'); setDbPage(1); }} className="font-semibold text-slate-700 hover:text-[#009FE3] transition-colors text-left">{prov}</button>
                            <span className="text-slate-400 font-medium">{cnt.toLocaleString('nl-NL')}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#009FE3] rounded-full transition-all" style={{width: `${cnt/maxProv*100}%`}}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Plaatsen (steden + dorpen) overzicht, per provincie */}
                  <div className="bg-white border border-slate-200 rounded-sm p-5">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-1">Bedrijven per plaats</h3>
                    <p className="text-[10px] text-slate-400 mb-4">Klik op een provincie voor alle steden en dorpen daarin. Klik op een plaats om er direct op te filteren in de database.</p>
                    <div className="space-y-2">
                      {provPlaceSorted.map(({ prov, places, total: provTotal }) => (
                        <details key={prov} className="border border-slate-100 rounded-sm">
                          <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none hover:bg-slate-50 list-none">
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedRegions([prov]); setViewMode('database'); setDbPage(1); }}
                              className="text-xs font-bold text-slate-700 hover:text-[#009FE3] transition-colors"
                            >{prov}</button>
                            <span className="text-[10px] text-slate-400 font-medium">{places.length.toLocaleString('nl-NL')} plaatsen · {provTotal.toLocaleString('nl-NL')} bedrijven</span>
                          </summary>
                          <div className="px-3 pb-3 pt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 max-h-72 overflow-y-auto border-t border-slate-100">
                            {places.map(([place, cnt]) => (
                              <button
                                key={place}
                                onClick={() => { setSelectedRegions([place]); setViewMode('database'); setDbPage(1); }}
                                className="flex items-center justify-between gap-2 text-left text-xs py-1 text-slate-600 hover:text-[#009FE3] transition-colors"
                              >
                                <span className="truncate">{place}</span>
                                <span className="text-slate-300 flex-shrink-0">{cnt.toLocaleString('nl-NL')}</span>
                              </button>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                  {/* Opgeslagen filters overzicht */}
                  {savedFilters.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-sm p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-4">Opgeslagen zoekfilters</h3>
                      <div className="flex flex-wrap gap-2">
                        {savedFilters.map(f => (
                          <div key={f.name} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2">
                            <Bookmark className="w-3 h-3 text-[#009FE3]" />
                            <button onClick={() => applySavedFilter(f)} className="text-xs font-bold text-slate-700 hover:text-[#009FE3]">{f.name}</button>
                            <button onClick={() => deleteSavedFilter(f.name)} className="ml-1 text-slate-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {viewMode === 'map' && (
                <MapView
                  allData={activeData}
                  favorites={favorites}
                  selectedItems={Array.from(selectedRaws.values())}
                  selectedIds={selectedIds}
                  selectedCompany={selectedCompany}
                  onToggleSelect={(naam, raw) => { setSelectedIds(prev => { const next = new Set(prev); next.has(naam) ? next.delete(naam) : next.add(naam); return next; }); setSelectedRaws(prev => { const next = new Map(prev); next.has(naam) ? next.delete(naam) : next.set(naam, raw); return next; }); }}
                  onClearSelection={clearSelection}
                  onNavigate={(target, naam) => {
                    if (target === 'database') {
                      setDbSearch(naam);
                      setDbPage(1);
                      setViewMode('database');
                    } else {
                      setCity(naam);
                      executeSearch(undefined, undefined, naam);
                    }
                  }}
                  onAddressCorrection={handleAddressCorrection}
                  onDeleteEntry={handleDeleteEntry}
                  onMarkerCountChange={setMapMarkerCount}
                />
            )}

            {viewMode === 'favorites' && favorites.length === 0 && (
                <div className="py-20 text-center max-w-2xl mx-auto">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-sm border border-slate-200 mb-8">
                        <Heart className="w-8 h-8 text-red-300" />
                    </div>
                    <h1 className="text-3xl font-normal text-slate-900 font-condensed uppercase tracking-tight mb-4">
                        Geen <span className="text-[#009FE3] font-bold">Favorieten</span>
                    </h1>
                    <p className="text-slate-500 text-base leading-relaxed mb-8">Klik op het hartje op een bedrijfskaart om het als favoriet op te slaan.</p>
                </div>
            )}

            {itemsToShow.length > 0 && (viewMode === 'search' || viewMode === 'favorites') && (
                <div
                  ref={showRouteMap && viewMode === 'search' ? splitContainerRef : undefined}
                  className={`animate-fade-in w-full ${showRouteMap && viewMode === 'search' ? 'flex flex-col md:flex-row md:h-[calc(100vh-160px)] md:min-h-[500px]' : 'space-y-6 max-w-6xl mx-auto'}`}>
                {/* Left: results list */}
                <div
                  className={showRouteMap && viewMode === 'search' ? 'overflow-y-auto space-y-6 md:flex-shrink-0' : 'space-y-6'}
                  style={showRouteMap && viewMode === 'search' ? { width: window.innerWidth >= 768 ? `${splitRatio}%` : '100%' } : undefined}>
                    <div className="flex flex-col gap-3 border-b-2 border-slate-200 pb-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                             <div className="flex items-center gap-3 flex-wrap">
                               <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-condensed uppercase tracking-tight">{viewMode === 'favorites' ? 'Mijn Favorieten' : 'Zoekresultaten'}</h2>
                               {viewMode === 'search' && <div className="flex border border-slate-200 rounded-sm overflow-hidden text-[10px] font-bold uppercase tracking-wider">
                                 <button onClick={() => { setSortMode('relevant'); executeSearch(undefined, 'relevant'); }} className={`px-3 py-1.5 transition-colors ${sortMode === 'relevant' ? 'bg-[#009FE3] text-white' : 'bg-white text-slate-500 hover:bg-[#009FE3]/5'}`}>Relevant</button>
                                 <button onClick={() => { setSortMode('az'); executeSearch(undefined, 'az'); }} className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${sortMode === 'az' ? 'bg-[#009FE3] text-white' : 'bg-white text-slate-500 hover:bg-[#009FE3]/5'}`}>A–Z</button>
                               </div>}
                               <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{viewMode === 'favorites' ? `${favorites.length} opgeslagen` : `~${totalMatches} gevonden`}</p>
                             </div>
                             <div className="flex items-center gap-2 flex-wrap">
                                 {viewMode === 'search' && <button
                                     onClick={() => setShowRouteMap(v => !v)}
                                     className={`px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 sm:gap-2 transition-colors border ${showRouteMap ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-[#009FE3] border-[#009FE3] hover:bg-[#f0f9ff]'}`}
                                 >
                                     <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {showRouteMap ? 'Kaart sluiten' : 'Route Kaart'}
                                 </button>}
                                 <button
                                     onClick={() => { setAddForm({ naam: '', straat: '', postcode: '', stad: '', provincie: '', telefoon: '', email: '', website: '', spec1: '', spec2: '', spec3: '', rechtsvorm: '', kvk: '', linkedin_url: '', twitter_handle: '', instagram_handle: '', source: '' }); setBulkText(''); setBulkParsed([]); setBulkMsg(''); setAddDuplicate(null); setAddTab('bulk'); setShowAddModal(true); }}
                                     className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-slate-300 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-600 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 sm:gap-2 transition-colors"
                                 >
                                     <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Toevoegen
                                 </button>
                             </div>
                        </div>
                        {(viewMode === 'search' || viewMode === 'favorites') && (() => {
                          const pageNamen = currentItems.map((c: any) => (c._raw?.naam || c.name) as string);
                          const allPageSelected = pageNamen.length > 0 && pageNamen.every(n => selectedIds.has(n));
                          const firstSelected = Array.from(selectedRaws.values())[0] as any;
                          const refStad = firstSelected?.stad || '';
                          const refCoords = refStad ? getCityCoords(refStad) : null;
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => {
                                  if (allPageSelected) {
                                    setSelectedIds(prev => { const n = new Set(prev); pageNamen.forEach(nm => n.delete(nm)); return n; });
                                    setSelectedRaws(prev => { const n = new Map(prev); pageNamen.forEach(nm => n.delete(nm)); return n; });
                                  } else {
                                    setSelectedIds(prev => { const n = new Set(prev); pageNamen.forEach(nm => n.add(nm)); return n; });
                                    setSelectedRaws(prev => { const n = new Map(prev); currentItems.forEach((c: any) => { const b = c._raw || c; const nm = b.naam || c.name; n.set(nm, b); }); return n; });
                                  }
                                }}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 border transition-colors ${allPageSelected ? 'bg-[#E85E26] text-white border-[#E85E26]' : 'bg-white text-slate-600 border-slate-300 hover:border-[#E85E26] hover:text-[#E85E26]'}`}
                              >
                                <Check className="w-3 h-3" /> {allPageSelected ? 'Deselecteer pagina' : 'Selecteer pagina'}
                              </button>
                              {selectedIds.size > 0 && (
                                <button
                                  onClick={clearSelection}
                                  className="px-3 py-1.5 bg-white text-red-500 border border-red-200 hover:bg-red-50 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" /> Alles deselecteren ({selectedIds.size})
                                </button>
                              )}
                              {selectedIds.size > 0 && refCoords && (
                                <button
                                  onClick={() => { const km = radiusKm ?? 20; setRadiusKm(km); setCity(refStad); setSelectedRegions([]); executeSearch(undefined, undefined, '', refCoords, km, []); }}
                                  className="px-3 py-1.5 bg-[#009FE3] hover:bg-[#008ac5] text-white text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors"
                                >
                                  <Search className="w-3.5 h-3.5" /> Zoek in de buurt
                                </button>
                              )}
                              {selectedIds.size >= 2 && selectedIds.size <= 4 && (
                                <button
                                  onClick={() => setShowCompare(true)}
                                  className="px-3 py-1.5 bg-[#E85E26] hover:bg-[#d14d1b] text-white text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors"
                                >
                                  <Columns className="w-3.5 h-3.5" /> Vergelijk ({selectedIds.size})
                                </button>
                              )}
                            </div>
                          );
                        })()}
                    </div>

                    <div className={`grid gap-4 ${showRouteMap ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
                        {currentItems.map((company: any) => {
                            const b = (company as any)._raw || company;
                            const distKm: number | undefined = company._hqDistanceKm ?? company._distanceKm;
                            const btnBase = "flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border transition-all flex-1 whitespace-nowrap rounded-sm";
                            if (viewMode === 'search' && replacingId === company.id) {
                              const q = replaceQuery.toLowerCase().trim();
                              const existingNames = new Set<string>(foundCompanies.map(c => (c._raw?.naam || c.name || '').toLowerCase()));
                              const refCoords = getCityCoords(b.stad || '');
                              const candidates = q.length < 2 ? [] : refCoords
                                ? scoreInsertionCandidates(activeData, null, refCoords, cityCoords as any, existingNames, 6, q).map(c => c.bedrijf)
                                : activeData
                                    .filter((cand: any) => !existingNames.has((cand.naam || '').toLowerCase()) && [cand.naam, cand.stad].join(' ').toLowerCase().includes(q))
                                    .slice(0, 6);
                              return (
                                <div key={company.id} className="bg-white border border-[#009FE3] p-5 flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vervang "{b.naam || company.name}"</span>
                                    <button onClick={() => { setReplacingId(null); setReplaceQuery(''); }} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                                  </div>
                                  <input
                                    autoFocus
                                    type="text"
                                    value={replaceQuery}
                                    onChange={e => setReplaceQuery(e.target.value)}
                                    placeholder="Zoek bedrijfsnaam of stad..."
                                    className="w-full border border-slate-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#009FE3]"
                                  />
                                  <div className="max-h-56 overflow-y-auto space-y-1">
                                    {candidates.map((cand: any, ci: number) => (
                                      <button
                                        key={ci}
                                        onClick={() => replaceFoundCompany(company.id, cand)}
                                        className="w-full text-left px-3 py-2 text-xs rounded-sm hover:bg-slate-50 border border-slate-100 flex flex-col">
                                        <span className="font-semibold text-slate-700">{cand.naam}</span>
                                        <span className="text-slate-400">{[cand.straat, cand.stad].filter(Boolean).join(', ')}</span>
                                      </button>
                                    ))}
                                    {q.length >= 2 && candidates.length === 0 && (
                                      <p className="text-xs text-slate-400 py-1">Geen bedrijven gevonden.</p>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={company.id}
                                draggable={showRouteMap}
                                onDragStart={showRouteMap ? e => { e.dataTransfer.setData('application/company', JSON.stringify(b)); e.dataTransfer.effectAllowed = 'copy'; } : undefined}
                                className={`relative bg-white border p-5 flex flex-col gap-3 transition-colors cursor-pointer ${showRouteMap ? 'cursor-grab active:cursor-grabbing' : ''} ${selectedIds.has(b.naam || company.name) ? 'border-[#E85E26] ring-1 ring-[#E85E26]/30' : 'border-slate-200 hover:border-[#009FE3]'}`}
                                onClick={() => setSelectedCompany(b)}>
                                {viewMode === 'search' && (
                                  <div className="absolute top-2 right-2 z-10" onClick={e => e.stopPropagation()}>
                                    <button
                                      title="Opties"
                                      onClick={() => setCardMenuOpen(cardMenuOpen === company.id ? null : company.id)}
                                      className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-sm transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                    {cardMenuOpen === company.id && (
                                      <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-sm shadow-lg overflow-hidden">
                                        <button onClick={() => { removeFoundCompany(company.id); setCardMenuOpen(null); }} className="w-full text-left px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-1.5"><Trash2 className="w-3 h-3" />Verwijderen</button>
                                        <button onClick={() => { setReplacingId(company.id); setReplaceQuery(''); setCardMenuOpen(null); }} className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 border-t border-slate-100"><Repeat className="w-3 h-3" />Vervangen</button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {/* Selectie checkbox */}
                                      <div onClick={e => toggleSelect(b.naam || company.name, b, e)} className={`flex-shrink-0 w-4 h-4 border-2 rounded-sm flex items-center justify-center transition-colors ${selectedIds.has(b.naam || company.name) ? 'bg-[#E85E26] border-[#E85E26]' : 'border-slate-300 hover:border-[#E85E26]'}`}>
                                        {selectedIds.has(b.naam || company.name) && <Check className="w-2.5 h-2.5 text-white" />}
                                      </div>
                                      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide leading-tight">{b.naam || company.name}</h3>
                                      <SourceBadges b={b} />
                                      {isNew(b) && <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 font-bold rounded-sm flex-shrink-0">Nieuw</span>}
                                      {distKm !== undefined && showField('afstand') && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#009FE3]/10 text-[#009FE3] flex-shrink-0">{distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} van {hqShortLabel}</span>}
                                    </div>
                                    {(b.straat || b.postcode || b.stad || company.city) && (
                                      <p className="text-slate-500 text-xs mt-1 flex items-start gap-1 flex-wrap">
                                        <MapPin className="w-3 h-3 flex-shrink-0" />
                                        {[b.straat, [b.postcode, b.stad || company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                                        {b.provincie && <span className="text-slate-400 ml-1 whitespace-nowrap">·&nbsp;{b.provincie}</span>}
                                      </p>
                                    )}
                                  </div>
                                  {showField('rechtsvorm') && b.rechtsvorm && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium whitespace-nowrap flex-shrink-0">{b.rechtsvorm}</span>}
                                </div>
                                {showField('specs') && coreSpecs(b).length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {coreSpecs(b).map((s: string, si: number) => (
                                      <span key={si} className="text-[10px] bg-[#E8F4FB] text-[#009FE3] px-2 py-0.5 font-semibold rounded-sm">{s}</span>
                                    ))}
                                  </div>
                                )}
                                {(b.telefoon || b.email) && (showField('telefoon') || showField('email')) && (
                                  <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                                    {showField('telefoon') && b.telefoon && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" />{b.telefoon}</span>}
                                    {showField('email') && b.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email}</span>}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                                  {b.website && <a href={toUrl(b.website)} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3]`}><Globe className="w-3 h-3"/>Site</a>}
                                  {(b.straat || b.stad) && <a href={`https://maps.google.com/?q=${encodeURIComponent(((b.straat||'')+' '+(b.stad||'')).trim())}`} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]`}><MapPin className="w-3 h-3"/>Route</a>}
                                  {b.url && (visibleSources(b).length > 1
                                    ? visibleSources(b).map((s: string, si: number) => (
                                        <a key={si} href={toUrl(b.url)} target="_blank" rel="noreferrer" className={`${btnBase} text-white border-transparent ${srcColor(s).btn} ${srcColor(s).btnHover}`}><ArrowRight className="w-3 h-3"/>{s}</a>
                                      ))
                                    : <a href={toUrl(b.url)} target="_blank" rel="noreferrer" className={`${btnBase} text-white border-transparent ${srcColor(visibleSources(b)[0]).btn} ${srcColor(visibleSources(b)[0]).btnHover}`}><ArrowRight className="w-3 h-3"/>{visibleSources(b)[0] || 'Info'}</a>
                                  )}
                                  <FavButton company={company} favorites={favorites} onToggle={toggleFavorite} />
                                </div>
                              </div>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center gap-2 flex-wrap justify-center py-8 border-t border-slate-200">
                                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">«</button>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">← Vorige</button>
                                <div className="flex items-center gap-1">
                                    {getPageNumbers().map((pageNum, idx) => (
                                        pageNum === '...' ? (
                                            <span key={`dots-${idx}`} className="px-2 text-slate-400">...</span>
                                        ) : (
                                            <button key={`page-${pageNum}`} onClick={() => setCurrentPage(Number(pageNum))} className={`w-8 h-8 flex items-center justify-center rounded-sm text-xs font-bold font-condensed transition-all ${currentPage === pageNum ? 'bg-[#E85E26] text-white' : 'bg-white border border-slate-200 hover:border-[#E85E26] text-slate-700'}`}>{pageNum}</button>
                                        )
                                    ))}
                                </div>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">Volgende →</button>
                                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-300 rounded-sm">»</button>
                                <span className="text-slate-300 mx-1">|</span>
                                <form onSubmit={e => { e.preventDefault(); const v = parseInt((e.currentTarget.elements.namedItem('pg') as HTMLInputElement).value); if (v >= 1 && v <= totalPages) setCurrentPage(v); }} className="flex items-center gap-1">
                                  <input name="pg" type="number" min={1} max={totalPages} defaultValue={currentPage} key={currentPage} placeholder="pag." className="w-14 text-center border border-slate-300 text-xs py-2 rounded-sm focus:outline-none focus:border-[#009FE3]" />
                                  <button type="submit" className="px-3 py-2 bg-[#009FE3] text-white text-[10px] font-bold rounded-sm hover:bg-[#008ac5]">→</button>
                                </form>
                        </div>
                    )}
                </div>{/* end left panel */}
                {/* Drag handle — desktop only */}
                {showRouteMap && viewMode === 'search' && (
                  <div
                    onMouseDown={startDrag}
                    className="hidden md:flex w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200 hover:bg-[#009FE3] transition-colors relative group items-center justify-center"
                    title="Sleep om te resizen">
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-400 group-hover:bg-[#009FE3] transition-colors" />
                  </div>
                )}
                {/* Right: RouteMapPanel */}
                {showRouteMap && viewMode === 'search' && (
                  <div className="md:flex-1 min-w-0 h-[55vh] min-h-[360px] md:h-full md:min-h-0 overflow-hidden border-l-0">
                    <RouteMapPanel
                      companies={(Array.from(selectedRaws.values()) as any[]).map(r => ({ id: r.naam, name: r.naam, city: r.stad || '', _raw: r }))}
                      allData={activeData}
                      onClose={() => setShowRouteMap(false)}
                      onAddressCorrection={handleAddressCorrection}
                      onDeleteEntry={handleDeleteEntry}
                      onNavigate={(target, naam) => {
                        if (target === 'database') {
                          setDbSearch(naam); setDbPage(1); setViewMode('database');
                        } else {
                          setCity(naam); executeSearch(undefined, undefined, naam);
                        }
                      }}
                    />
                  </div>
                )}
                </div>
            )}
          </main>
      </div>
        );
      })()}

      {/* ── Opgeslagen filter opslaan modal ────────────────────────────────── */}
      {showSaveFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowSaveFilterModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-sm shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2"><Bookmark className="w-4 h-4 text-[#009FE3]" /> Filter opslaan</h3>
            <p className="text-xs text-slate-400">Sla de huidige filters op als preset zodat je ze snel kunt terugvinden.</p>
            <input
              type="text"
              value={saveFilterName}
              onChange={e => setSaveFilterName(e.target.value)}
              placeholder="Naam voor dit filter (bijv. 'Architecten Utrecht')"
              className="w-full border border-slate-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-[#009FE3]"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && saveFilterName.trim()) { saveCurrentFilter(saveFilterName.trim()); setShowSaveFilterModal(false); }}}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveFilterModal(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-slate-50">Annuleren</button>
              <button
                disabled={!saveFilterName.trim()}
                onClick={() => { saveCurrentFilter(saveFilterName.trim()); setShowSaveFilterModal(false); }}
                className="flex-1 py-2.5 bg-[#009FE3] hover:bg-[#008ac5] disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5" /> Opslaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vergelijking modal ──────────────────────────────────────────────── */}
      {showCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCompare(false)}>
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-sm shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2"><Columns className="w-4 h-4 text-[#E85E26]" /> Bedrijven vergelijken</h2>
              <button onClick={() => setShowCompare(false)} className="text-slate-400 hover:text-slate-800"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-auto flex-grow p-6">
              {(() => {
                const companies = Array.from(selectedRaws.values()).slice(0, 4) as any[];
                const rows: Array<{label: string; fn: (b: any) => string | null}> = [
                  { label: 'Stad', fn: b => b.stad || null },
                  { label: 'Provincie', fn: b => b.provincie || null },
                  { label: 'Adres', fn: b => [b.straat, b.postcode].filter(Boolean).join(', ') || null },
                  { label: 'Discipline', fn: b => ({ architect: 'Architect', bouwbedrijf: 'Bouwbedrijf', aannemer: 'Aannemer', materialen: 'Bouwmaterialen', overig: 'Overig' })[detectType(b)] },
                  { label: 'Specialisaties', fn: b => allSpecTags(b).slice(0, 4).join(', ') || null },
                  { label: 'Telefoon', fn: b => b.telefoon || b.telefoon_sales || null },
                  { label: 'E-mail', fn: b => b.email || b.email_sales || null },
                  { label: 'Website', fn: b => b.website || b.url || null },
                  { label: 'Rechtsvorm', fn: b => b.rechtsvorm || null },
                  { label: 'KVK', fn: b => b.kvk || null },
                  { label: 'Bron', fn: b => (b._sources?.length ? b._sources : [b.source || 'Onbekend']).join(', ') },
                ];
                return (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-28 border-b border-slate-100"></th>
                        {companies.map((b, i) => (
                          <th key={i} className="text-left py-2 px-3 border-b border-slate-200 min-w-[160px]">
                            <p className="font-black text-slate-900 uppercase text-xs leading-tight">{b.naam}</p>
                            <SourceBadges b={b} size="sm" />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ label, fn }) => {
                        const vals = companies.map(fn);
                        if (vals.every(v => !v)) return null;
                        return (
                          <tr key={label} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 align-top">{label}</td>
                            {companies.map((b, i) => (
                              <td key={i} className="py-2.5 px-3 text-slate-700 align-top">
                                {label === 'Website' && fn(b)
                                  ? <a href={toUrl(fn(b)!)} target="_blank" rel="noreferrer" className="text-[#009FE3] hover:underline truncate block max-w-[180px]">{fn(b)}</a>
                                  : <span className="text-slate-700">{fn(b) || <span className="text-slate-300">—</span>}</span>
                                }
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 flex justify-end">
              <button onClick={() => setShowCompare(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-sm">Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bedrijf toevoegen modal ─────────────────────────────────────────── */}
      {showAddModal && (() => {
        const fieldCls = "w-full border border-slate-200 rounded-sm px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-[#009FE3]";
        const labelCls = "text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block";
        const f = (key: keyof typeof addForm, label: string) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <input className={fieldCls} value={addForm[key]} onChange={e => setAddForm(d => ({ ...d, [key]: e.target.value }))} />
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
            <div className="bg-[#F8FAFC] w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] shadow-2xl flex flex-col rounded-t-xl sm:rounded-none" onClick={e => e.stopPropagation()}>
              <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 bg-white border-b border-slate-200 flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 text-[#009FE3] text-[10px] font-bold uppercase tracking-[0.2em] mb-1"><Plus className="w-3 h-3"/> Bedrijf toevoegen</div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => setAddTab('single')} className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm border transition-all ${addTab === 'single' ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-300 hover:border-[#009FE3]'}`}>Handmatig</button>
                    <button onClick={() => setAddTab('bulk')} className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm border transition-all ${addTab === 'bulk' ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-300 hover:border-[#009FE3]'}`}>Bulk import</button>
                  </div>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-grow overflow-y-auto p-4 sm:p-6">
                {addTab === 'single' ? (
                  <div className="space-y-3">
                    {f('naam', 'Bedrijfsnaam *')}
                    <div className="grid grid-cols-2 gap-3">
                      {f('straat', 'Straat + huisnr')}
                      {f('postcode', 'Postcode')}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {f('stad', 'Stad')}
                      {f('provincie', 'Provincie')}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {f('telefoon', 'Telefoon')}
                      {f('email', 'Email')}
                    </div>
                    {f('website', 'Website')}
                    <div className="grid grid-cols-3 gap-3">
                      {f('spec1', 'Specialisatie 1')}
                      {f('spec2', 'Specialisatie 2')}
                      {f('spec3', 'Specialisatie 3')}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {f('rechtsvorm', 'Rechtsvorm')}
                      {f('kvk', 'KvK-nummer')}
                    </div>
                    <div>
                      <label className={labelCls}>Bron</label>
                      <select
                        className={fieldCls + ' bg-white'}
                        value={addForm.source}
                        onChange={e => setAddForm(d => ({ ...d, source: e.target.value }))}
                      >
                        <option value="">Onbekend</option>
                        <option value="Bouwgarant">Bouwgarant</option>
                        <option value="BNA">BNA</option>
                        <option value="Architectenweb">Architectenweb</option>
                        <option value="Stiho">Stiho</option>
                        <option value="Jongeneel">Jongeneel</option>
                        <option value="BouwPartner">BouwPartner</option>
                        <option value="PontMeyer">PontMeyer</option>
                        <option value="Van Wijnen">Van Wijnen</option>
                        <option value="Plegt-Vos">Plegt-Vos</option>
                        <option value="VolkerWessels">VolkerWessels</option>
                      </select>
                    </div>
                    {addDuplicate && (
                      <div className="bg-amber-50 border border-amber-300 rounded-sm p-3 text-xs text-amber-800">
                        <p className="font-bold mb-1">⚠ Mogelijk al in database</p>
                        <p className="mb-2">Gevonden: <span className="font-semibold">{addDuplicate.naam}</span>{addDuplicate.stad ? ` — ${addDuplicate.stad}` : ''}{addDuplicate.straat ? `, ${addDuplicate.straat}` : ''}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { addCustomEntries([{ ...addForm, source: addForm.source || 'Onbekend' }]); setAddDuplicate(null); setShowAddModal(false); }} className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-sm">Toch toevoegen</button>
                          <button onClick={() => setAddDuplicate(null)} className="flex-1 py-1.5 border border-amber-300 text-amber-700 font-bold rounded-sm hover:bg-amber-100">Annuleren</button>
                        </div>
                      </div>
                    )}
                    {!addDuplicate && (
                      <button
                        disabled={!addForm.naam.trim()}
                        onClick={() => {
                          if (!addForm.naam.trim()) return;
                          const dup = findDuplicate(addForm.naam, addForm.straat, addForm.stad);
                          if (dup) { setAddDuplicate(dup); return; }
                          addCustomEntries([{ ...addForm, source: addForm.source || 'Onbekend' }]);
                          setShowAddModal(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-[#009FE3] hover:bg-[#008ac5] disabled:opacity-40 text-white rounded-sm transition-all mt-2"
                      ><Save className="w-3.5 h-3.5"/>Opslaan</button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">Plak bedrijfsgegevens — één bedrijf per alinea (of één per regel). Het systeem herkent automatisch namen, adressen, telefoonnummers, e-mailadressen en websites.</p>
                    <textarea
                      rows={10}
                      className="w-full border border-slate-200 rounded-sm px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-[#009FE3] font-mono resize-y"
                      placeholder={"Voorbeeld:\n\nBAM Bouw B.V.\nPostbus 12, 3990 AA Houten\n030 123 4567\ninfo@bam.nl\nwww.bam.nl\n\nHeijmans N.V.\nAkkerstraat 10, 5241 PP Rosmalen\n073 543 5000\ninfo@heijmans.nl"}
                      value={bulkText}
                      onChange={e => { setBulkText(e.target.value); setBulkParsed([]); setBulkMsg(''); }}
                    />
                    {bulkParsed.length === 0 ? (
                      <button
                        disabled={!bulkText.trim()}
                        onClick={() => { const p = parseBulkText(bulkText); setBulkParsed(p); setBulkMsg(`${p.length} bedrijf/bedrijven herkend — controleer en klik Importeren.`); }}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-slate-700 hover:bg-slate-900 disabled:opacity-40 text-white rounded-sm transition-all"
                      ><Search className="w-3.5 h-3.5"/>Verwerken</button>
                    ) : (
                      <>
                        <p className="text-xs text-[#009FE3] font-semibold">{bulkMsg}</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-sm p-2">
                          {bulkParsed.map((e, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-slate-400 w-5 flex-shrink-0 font-mono">{i + 1}.</span>
                              <div>
                                <span className="font-semibold text-slate-800">{e.naam || '(geen naam)'}</span>
                                {(e.stad || e.straat) && <span className="text-slate-500 ml-1">— {[e.straat, e.postcode, e.stad].filter(Boolean).join(' ')}</span>}
                                {e.telefoon && <span className="text-slate-400 ml-1">· {e.telefoon}</span>}
                                {e.email && <span className="text-slate-400 ml-1">· {e.email}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setBulkParsed([]); setBulkMsg(''); }} className="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-600 hover:border-slate-500 rounded-sm bg-white">Aanpassen</button>
                          <button onClick={() => { addCustomEntries(bulkParsed); setShowAddModal(false); }} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-[#009FE3] hover:bg-[#008ac5] text-white rounded-sm transition-all"><Save className="w-3.5 h-3.5"/>Importeren ({bulkParsed.length})</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedCompany && (() => {
        const b = selectedCompany;
        const hasContact = b.telefoon || b.telefoon_sales || b.telefoon_admin || b.email || b.email_sales || b.email_overig;
        const hasAddress = b.straat || b.stad;
        const hasSpec = b.spec1 || b.spec2 || b.spec3;
        const hasBedrijf = b.rechtsvorm || b.kvk;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-sm" onClick={() => { setSelectedCompany(null); setEditMode(false); }}>
            <div className="bg-[#F8FAFC] w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] shadow-2xl flex flex-col rounded-t-xl sm:rounded-none" onClick={e => e.stopPropagation()}>
              {/* Drag indicator on mobile */}
              <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
              {/* Header */}
              <div className="flex items-start justify-between p-4 sm:p-6 bg-white border-b border-slate-200 flex-shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[#E85E26] text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
                    <Building className="w-3 h-3" /> Bedrijfsprofiel
                  </div>
                  <h2 className="text-lg sm:text-2xl font-bold text-slate-900 uppercase tracking-tight leading-tight break-words">{b.naam}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <SourceBadges b={b} size="md" />
                    {b.rechtsvorm && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">{b.rechtsvorm}</span>}
                    {b.provincie && <span className="text-[10px] text-slate-400 font-medium">{b.provincie}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => { setEditDraft({ naam: b.naam||'', straat: b.straat||'', postcode: b.postcode||'', stad: b.stad||'', provincie: b.provincie||'', telefoon: b.telefoon||'', telefoon_sales: b.telefoon_sales||'', telefoon_admin: b.telefoon_admin||'', email: b.email||'', email_sales: b.email_sales||'', email_overig: b.email_overig||'', website: b.website||'', spec1: b.spec1||'', spec2: b.spec2||'', spec3: b.spec3||'', rechtsvorm: b.rechtsvorm||'', kvk: b.kvk||'', source: b.source||'Onbekend' }); setEditMode(true); }} title="Bewerken" className="p-2 hover:bg-slate-100 text-slate-400 hover:text-[#009FE3]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => { if (window.confirm(`"${b.naam}"${b.straat ? ` (${b.straat})` : ''} verwijderen?`)) { handleDeleteEntry(b.naam, b.straat); setSelectedCompany(null); setEditMode(false); } }} title="Verwijderen" className="p-2 hover:bg-slate-100 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => { setSelectedCompany(null); setEditMode(false); }} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
                {editMode ? (() => {
                  const field = (key: string, label: string) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                      <span className="text-slate-400 text-xs sm:w-28 sm:flex-shrink-0">{label}</span>
                      <input
                        className="flex-1 border border-slate-200 rounded-sm px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-[#009FE3]"
                        value={editDraft[key] ?? ''}
                        onChange={e => setEditDraft(d => ({ ...d, [key]: e.target.value }))}
                      />
                    </div>
                  );
                  return (
                    <>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Bedrijfsnaam</p>
                        <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                          {field('naam', 'Naam')}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Adres</p>
                        <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                          {field('straat', 'Straat')}
                          {field('postcode', 'Postcode')}
                          {field('stad', 'Stad')}
                          {field('provincie', 'Provincie')}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Contact</p>
                        <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                          {field('telefoon', 'Tel. algemeen')}
                          {field('telefoon_sales', 'Tel. sales')}
                          {field('telefoon_admin', 'Tel. admin')}
                          {field('email', 'Email algemeen')}
                          {field('email_sales', 'Email sales')}
                          {field('email_overig', 'Email overig')}
                          {field('website', 'Website')}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Bedrijfsinfo</p>
                        <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                          {field('rechtsvorm', 'Rechtsvorm')}
                          {field('kvk', 'KvK')}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                            <span className="text-slate-400 text-xs sm:w-28 sm:flex-shrink-0">Bron</span>
                            <select
                              className="flex-1 border border-slate-200 rounded-sm px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-[#009FE3] bg-white"
                              value={editDraft.source ?? 'Onbekend'}
                              onChange={e => setEditDraft(d => ({ ...d, source: e.target.value }))}
                            >
                              <option value="Onbekend">Onbekend</option>
                              <option value="Bouwgarant">Bouwgarant</option>
                              <option value="BNA">BNA</option>
                              <option value="Architectenweb">Architectenweb</option>
                              <option value="Stiho">Stiho</option>
                              <option value="Jongeneel">Jongeneel</option>
                              <option value="BouwPartner">BouwPartner</option>
                              <option value="PontMeyer">PontMeyer</option>
                              <option value="Van Wijnen">Van Wijnen</option>
                        <option value="Plegt-Vos">Plegt-Vos</option>
                        <option value="VolkerWessels">VolkerWessels</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Specialisaties</p>
                        <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                          {field('spec1', 'Spec. 1')}
                          {field('spec2', 'Spec. 2')}
                          {field('spec3', 'Spec. 3')}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleSaveEdit(b.naam, editDraft)} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-[#009FE3] hover:bg-[#008ac5] text-white rounded-sm transition-all"><Save className="w-3.5 h-3.5"/>Opslaan</button>
                        <button onClick={() => setEditMode(false)} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-200 hover:border-slate-400 text-slate-600 rounded-sm bg-white">Annuleren</button>
                      </div>
                    </>
                  );
                })() : (
                  <>
                {/* Adres */}
                {hasAddress && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Adres</p>
                    <div className="bg-white border border-slate-200 p-4 rounded-sm">
                      {b.straat && <p className="text-slate-800 font-medium text-sm">{b.straat}</p>}
                      {(b.postcode || b.stad) && <p className="text-slate-700 text-sm">{[b.postcode, b.stad].filter(Boolean).join('  ')}</p>}
                      {b.provincie && <p className="text-slate-500 text-xs mt-0.5">{b.provincie}</p>}

                      {/* Kaart info - klikbare link naar KAART tab */}
                      {(b.stad) && (
                        <button
                          onClick={() => {
                            setViewMode('map');
                            setSelectedCompany(b);
                          }}
                          className="w-full mt-4 pt-4 border-t border-slate-100 text-center hover:bg-[#009FE3]/5 transition-colors rounded-sm py-2 cursor-pointer"
                        >
                          <p className="text-sm font-medium text-[#009FE3] hover:text-[#0088c8]">📍 Bekijk op de KAART-tab</p>
                          <p className="text-[10px] text-slate-400 mt-1">{b.stad}{b.straat ? `, ${b.straat}` : ''}</p>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Andere vestigingen van hetzelfde bedrijf */}
                {(() => {
                  const vestigingen = getAndereVestigingen(b, activeData);
                  if (vestigingen.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Andere vestigingen ({vestigingen.length})</p>
                      <div className="bg-white border border-slate-200 rounded-sm divide-y divide-slate-100">
                        {vestigingen.map((v: any, vi: number) => (
                          <button
                            key={vi}
                            onClick={() => { setSelectedCompany(v); addToRecentViewed(v.naam); setEditMode(false); }}
                            className="w-full text-left p-3 flex items-start gap-2 hover:bg-slate-50 transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-slate-800 font-medium text-sm truncate">{v.naam}</p>
                              <p className="text-slate-500 text-xs">{[v.straat, [v.postcode, v.stad].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Contactgegevens */}
                {hasContact && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Contact</p>
                    <div className="bg-white border border-slate-200 p-3 sm:p-4 rounded-sm space-y-2">
                      {b.telefoon && <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm"><span className="text-slate-400 text-xs sm:w-24 sm:flex-shrink-0">Algemeen</span><a href={`tel:${b.telefoon}`} className="text-slate-800 font-medium flex items-center gap-1.5 hover:text-[#009FE3]"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{b.telefoon}</a></div>}
                      {b.telefoon_sales && <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm"><span className="text-slate-400 text-xs sm:w-24 sm:flex-shrink-0">Sales</span><a href={`tel:${b.telefoon_sales}`} className="text-slate-800 flex items-center gap-1.5 hover:text-[#009FE3]"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{b.telefoon_sales}</a></div>}
                      {b.telefoon_admin && <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm"><span className="text-slate-400 text-xs sm:w-24 sm:flex-shrink-0">Administratie</span><a href={`tel:${b.telefoon_admin}`} className="text-slate-800 flex items-center gap-1.5 hover:text-[#009FE3]"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{b.telefoon_admin}</a></div>}
                      {b.email && <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm"><span className="text-slate-400 text-xs sm:w-24 sm:flex-shrink-0">Algemeen</span><a href={`mailto:${b.email}`} className="text-[#009FE3] hover:underline flex items-center gap-1.5 break-all"><Mail className="w-3 h-3 flex-shrink-0" />{b.email}</a></div>}
                      {b.email_sales && <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm"><span className="text-slate-400 text-xs sm:w-24 sm:flex-shrink-0">Sales</span><a href={`mailto:${b.email_sales}`} className="text-[#009FE3] hover:underline flex items-center gap-1.5 break-all"><Mail className="w-3 h-3 flex-shrink-0" />{b.email_sales}</a></div>}
                      {b.email_overig && <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm"><span className="text-slate-400 text-xs sm:w-24 sm:flex-shrink-0">Overig</span><a href={`mailto:${b.email_overig}`} className="text-[#009FE3] hover:underline flex items-center gap-1.5 break-all"><Mail className="w-3 h-3 flex-shrink-0" />{b.email_overig}</a></div>}
                    </div>
                  </div>
                )}

                {/* Bedrijfsinfo */}
                {hasBedrijf && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Bedrijfsinfo</p>
                    <div className="bg-white border border-slate-200 p-4 rounded-sm space-y-2">
                      {b.rechtsvorm && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Rechtsvorm</span><span className="text-slate-800 font-medium">{b.rechtsvorm}</span></div>}
                      {b.kvk && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">KvK</span><span className="text-slate-800 font-medium">{b.kvk}</span></div>}
                    </div>
                  </div>
                )}

                {/* Over dit bedrijf (redactionele beschrijving, bv. uit architectenlijsten) */}
                {b.beschrijving && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Over dit bedrijf</p>
                    <div className="bg-white border border-slate-200 p-4 rounded-sm">
                      <p className="text-slate-700 text-sm leading-relaxed">{b.beschrijving}</p>
                    </div>
                  </div>
                )}

                {/* Bekende projecten */}
                {Array.isArray(b.projecten) && b.projecten.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Building className="w-3 h-3"/> Bekende projecten</p>
                    <div className="bg-white border border-slate-200 rounded-sm divide-y divide-slate-100">
                      {b.projecten.map((p: string, i: number) => (
                        <div key={i} className="px-4 py-2.5 text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-[#009FE3] mt-0.5">•</span>
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Specialisaties */}
                {hasSpec && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Specialisaties</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allSpecTags(b).map((s: string, i: number) => (
                        <span key={i} className="text-xs bg-[#E8F4FB] text-[#009FE3] px-2.5 py-1 font-semibold rounded-sm">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ontbrekende data melding */}
                {!hasContact && !hasSpec && !hasBedrijf && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm text-sm text-amber-800">
                    <p className="font-bold mb-1">Beperkte informatie beschikbaar</p>
                    <p className="text-xs">Voor dit bedrijf zijn alleen basisgegevens bekend. Bekijk de bronpagina voor meer details.</p>
                  </div>
                )}

                {/* Acties */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {b.website && <a href={toUrl(b.website)} target="_blank" rel="noreferrer" className="flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-700 rounded-sm transition-all bg-white"><Globe className="w-3.5 h-3.5"/>Website</a>}
                  {hasAddress && <a href={`https://maps.google.com/?q=${encodeURIComponent(((b.straat||'')+' '+(b.stad||'')).trim())}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26] text-slate-700 rounded-sm transition-all bg-white"><MapPin className="w-3.5 h-3.5"/>Route</a>}
                  {b.url && (visibleSources(b).length > 1
                    ? visibleSources(b).map((s: string, si: number) => (
                        <a key={si} href={toUrl(b.url)} target="_blank" rel="noreferrer" className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm text-white transition-all ${srcColor(s).btn} ${srcColor(s).btnHover}`}><ArrowRight className="w-3.5 h-3.5"/>{s}</a>
                      ))
                    : <a href={toUrl(b.url)} target="_blank" rel="noreferrer" className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm text-white transition-all ${srcColor(visibleSources(b)[0]).btn} ${srcColor(visibleSources(b)[0]).btnHover}`}><ArrowRight className="w-3.5 h-3.5"/>Bronpagina</a>
                  )}
                </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Persistent selectie-overzicht — blijft zichtbaar over alle tabs/pagina's heen */}
      {selectedRaws.size > 0 && (
        <SelectionBar
          selected={Array.from(selectedRaws.values())}
          onRemove={(naam: string) => {
            setSelectedIds(prev => { const n = new Set(prev); n.delete(naam); return n; });
            setSelectedRaws(prev => { const n = new Map(prev); n.delete(naam); return n; });
          }}
          onClear={clearSelection}
        />
      )}

      {/* BATCH IMPORT MODAL */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setImportModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-sm shadow-xl animate-fade-in relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-base font-black text-slate-900 uppercase font-condensed tracking-wider">Bedrijven importeren</h2>
              <button onClick={() => setImportModalOpen(false)} className="text-slate-400 hover:text-slate-800"><X className="w-5 h-5"/></button>
            </div>

            <div className="p-6 space-y-4">
              {importStep === 'upload' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">CSV-bestand met kolommen: <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">naam, straat, postcode, stad, telefoon, email, website</code></p>
                  <label className="block p-6 border-2 border-dashed border-slate-300 rounded-sm text-center cursor-pointer hover:border-[#009FE3] hover:bg-[#009FE3]/5 transition-all">
                    <input type="file" accept=".csv" onChange={e => { if (e.target.files?.[0]) handleCSVUpload(e.target.files[0]); }} className="hidden" />
                    <div className="flex items-center justify-center gap-2 text-slate-600">
                      <Upload className="w-5 h-5" />
                      <div>
                        <p className="font-bold text-sm">CSV-bestand selecteren</p>
                        <p className="text-xs text-slate-400">of sleep het hierheen</p>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {importStep === 'preview' && (
                <div className="space-y-3">
                  <div className="flex gap-4 text-xs">
                    <div className="flex-1 bg-blue-50 p-3 rounded-sm border border-blue-200"><span className="font-bold text-blue-900">{importStats.total}</span> <span className="text-blue-700">totaal</span></div>
                    <div className="flex-1 bg-green-50 p-3 rounded-sm border border-green-200"><span className="font-bold text-green-900">{importStats.valid}</span> <span className="text-green-700">geldig</span></div>
                    <div className="flex-1 bg-amber-50 p-3 rounded-sm border border-amber-200"><span className="font-bold text-amber-900">{importStats.duplicates}</span> <span className="text-amber-700">duplicaat</span></div>
                    <div className="flex-1 bg-red-50 p-3 rounded-sm border border-red-200"><span className="font-bold text-red-900">{importStats.errors}</span> <span className="text-red-700">fout</span></div>
                  </div>

                  <div className="border border-slate-200 rounded-sm overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-700">Naam</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-700">Postcode</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-700">Stad</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((item, idx) => (
                          <tr key={idx} className={item.error ? 'bg-red-50' : item.isDuplicate ? 'bg-amber-50' : 'bg-green-50'}>
                            <td className="px-3 py-2 truncate">{item.row.naam}</td>
                            <td className="px-3 py-2 truncate">{item.row.postcode}</td>
                            <td className="px-3 py-2 truncate">{item.row.stad}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {item.error ? <span className="text-red-600 font-bold">⚠ {item.error}</span> : item.isDuplicate ? <span className="text-amber-600 font-bold">↗ Duplicaat</span> : <span className="text-green-600 font-bold">✓ OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => { setImportStep('upload'); setImportPreview([]); }} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-sm font-bold text-xs uppercase hover:border-slate-300 transition-all">Terug</button>
                    <button onClick={() => setImportStep('confirm')} className="flex-1 py-2.5 bg-[#009FE3] text-white rounded-sm font-bold text-xs uppercase hover:bg-[#008ac5] transition-all">Doorgaan</button>
                  </div>
                </div>
              )}

              {importStep === 'confirm' && (
                <div className="space-y-4 text-center">
                  <div className="p-6 bg-[#009FE3]/5 rounded-sm border border-[#009FE3]/30">
                    <p className="text-sm font-bold text-slate-900 mb-2">Klaar om te importeren?</p>
                    <p className="text-xs text-slate-600">{importStats.valid} bedrijven zullen worden toegevoegd. Duplicaten en fouten worden overgeslagen.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setImportStep('preview')} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-sm font-bold text-xs uppercase hover:border-slate-300 transition-all">Terug</button>
                    <button onClick={handleImportConfirm} className="flex-1 py-2.5 bg-green-600 text-white rounded-sm font-bold text-xs uppercase hover:bg-green-700 transition-all">Importeren</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Route Helper - Wizard Mode */}
      {showAIHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-sm shadow-2xl border border-slate-200">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-[#009FE3] to-[#0088c8] flex items-center justify-between rounded-t-sm">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-white" />
                <h2 className="text-lg font-bold text-white">AI Route Maker</h2>
              </div>
              <button onClick={() => { setShowAIHelper(false); setAiStep('type'); setAiSelected({ type: '', city: '', count: 0 }); }} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Step 1: Type */}
              {aiStep === 'type' && (
                <div>
                  <p className="text-sm font-bold text-slate-900 mb-3">Welk type bedrijf zoek je?</p>
                  <div className="space-y-2">
                    {['architecten', 'bouwbedrijven', 'aannemers', 'materialen'].map(t => (
                      <button key={t} onClick={() => { setAiSelected({...aiSelected, type: t}); setAiStep('city'); }} className={`w-full px-4 py-2 rounded-sm font-medium text-sm transition-colors ${aiSelected.type === t ? 'bg-[#009FE3] text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: City */}
              {aiStep === 'city' && (
                <div>
                  <p className="text-sm font-bold text-slate-900 mb-3">In welke stad?</p>
                  <input type="text" placeholder="Amsterdam, Rotterdam..." value={aiSelected.city} onChange={(e) => setAiSelected({...aiSelected, city: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm focus:outline-none focus:border-[#009FE3]" />
                  <button onClick={() => aiSelected.city && setAiStep('count')} className="w-full mt-3 px-4 py-2 bg-[#009FE3] text-white rounded-sm hover:bg-[#0088c8] font-medium text-sm">
                    Volgende
                  </button>
                </div>
              )}

              {/* Step 3: Count */}
              {aiStep === 'count' && (
                <div>
                  <p className="text-sm font-bold text-slate-900 mb-3">Hoeveel bedrijven? (1-20)</p>
                  <input type="number" min="1" max="20" value={aiSelected.count || ''} onChange={(e) => setAiSelected({...aiSelected, count: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm focus:outline-none focus:border-[#009FE3]" />
                  <button onClick={() => aiSelected.count > 0 && executeAIRoute()} className="w-full mt-3 px-4 py-2 bg-[#E85E26] text-white rounded-sm hover:bg-[#d94d15] font-bold text-sm">
                    Route maken
                  </button>
                </div>
              )}

              {/* Step 4: Results */}
              {aiStep === 'results' && (
                <div className="text-center">
                  <Bot className="w-12 h-12 text-[#009FE3] mx-auto mb-2" />
                  <p className="font-bold text-slate-900 mb-1">Route gemaakt!</p>
                  <p className="text-sm text-slate-600 mb-4">{aiSelected.count} {aiSelected.type} in {aiSelected.city}</p>
                  <button onClick={() => { setShowAIHelper(false); setAiStep('type'); setAiSelected({ type: '', city: '', count: 0 }); }} className="w-full px-4 py-2 bg-slate-200 text-slate-800 rounded-sm hover:bg-slate-300 font-medium text-sm">
                    Sluiten
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Persistent bar met alle geselecteerde bedrijven (over pagina's/tabs heen), met per-item deselecteren
const SelectionBar: React.FC<{ selected: any[]; onRemove: (naam: string) => void; onClear: () => void }> = ({ selected, onRemove, onClear }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md">
      {open && (
        <div className="mb-2 bg-white border border-slate-200 rounded-sm shadow-2xl max-h-72 overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 sticky top-0 bg-white">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600">Geselecteerd ({selected.length})</span>
            <button onClick={onClear} className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-700">Wis alles</button>
          </div>
          <div className="divide-y divide-slate-100">
            {selected.map((b: any) => (
              <div key={b.naam} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{b.naam}</p>
                  {b.stad && <p className="text-slate-400 truncate">{b.stad}</p>}
                </div>
                <button onClick={() => onRemove(b.naam)} title="Deselecteren" className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#E85E26] hover:bg-[#d14d1b] text-white rounded-sm shadow-2xl transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          <Check className="w-4 h-4" /> {selected.length} geselecteerd
        </span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
    </div>
  );
};

// Filter Component

const FavButton: React.FC<{ company: any; favorites: any[]; onToggle: (c: any) => void }> = ({ company, favorites, onToggle }) => {
  const b = company._raw || company;
  const isFav = favorites.some(f => f.name === (b.naam || company.name) && f.city === (b.stad || company.city));
  return (
    <button
      onClick={() => onToggle(company)}
      title={isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
      className={`flex-shrink-0 flex items-center justify-center w-9 h-[34px] border rounded-sm transition-all ${isFav ? 'bg-red-50 border-red-400 text-red-500' : 'bg-white border-slate-200 text-slate-300 hover:border-red-400 hover:text-red-400'}`}
    >
      <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
    </button>
  );
};

const ProvinceFilter: React.FC<{ selectedRegions: string[]; onToggle: (item: string) => void; dataset: any[] }> = ({ selectedRegions, onToggle, dataset }) => {
  const [openProvs, setOpenProvs] = React.useState<Set<string>>(new Set());
  const [citySearch, setCitySearch] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(true);

  // Compute province/city groups dynamically from the current dataset
  const groups = React.useMemo(() => buildProvinceGroups(dataset), [dataset]);

  const toggleProv = (p: string) => setOpenProvs(prev => {
    const n = new Set(prev);
    n.has(p) ? n.delete(p) : n.add(p);
    return n;
  });

  const activeCount = selectedRegions.length;

  return (
    <div className="border border-slate-200 bg-white rounded-sm mb-4 shadow-sm">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-white hover:bg-[#009FE3]/5 border-b border-slate-100 text-left">
        <span className="text-xs font-black text-slate-700 uppercase tracking-wider font-condensed flex items-center gap-2">
          Regio & Locatie
          {activeCount > 0 && <span className="bg-[#E85E26] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeCount}</span>}
        </span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="p-3">
          {/* Zoekbalk */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" placeholder="Zoek stad..." value={citySearch} onChange={e => setCitySearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 text-xs focus:border-[#009FE3] focus:outline-none rounded-sm" />
          </div>

          {groups.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">Geen locaties beschikbaar</p>
          )}

          <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
            {groups.map(({ provincie, count, steden }) => {
              const filteredSteden = citySearch
                ? steden.filter(s => s.naam.toLowerCase().includes(citySearch.toLowerCase()))
                : steden;
              if (citySearch && filteredSteden.length === 0) return null;

              const isPOpen = openProvs.has(provincie) || !!citySearch;
              const provSelected = selectedRegions.includes(provincie);

              return (
                <div key={provincie}>
                  {/* Provincie rij */}
                  <div className="flex items-center gap-1 group">
                    <div className={`w-4 h-4 border flex items-center justify-center rounded-sm flex-shrink-0 cursor-pointer ${provSelected ? 'bg-[#009FE3] border-[#009FE3]' : 'bg-white border-slate-300'}`}
                      onClick={() => onToggle(provincie)}>
                      {provSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <button onClick={() => toggleProv(provincie)}
                      className="flex-1 flex items-center justify-between py-1.5 px-1 text-left hover:bg-[#009FE3]/5 rounded-sm">
                      <span className={`text-xs font-bold uppercase tracking-wide ${provSelected ? 'text-[#009FE3]' : 'text-slate-700'}`}>{provincie}</span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span className="font-medium">{count}</span>
                        {isPOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </span>
                    </button>
                  </div>

                  {/* Steden */}
                  {isPOpen && (
                    <div className="ml-5 mb-1 space-y-0.5">
                      {filteredSteden.map(({ naam, count: c }) => (
                        <label key={naam} onClick={() => onToggle(naam)} className="flex items-center gap-2 cursor-pointer py-0.5 px-1 hover:bg-[#009FE3]/5 rounded-sm">
                          <div className={`w-3.5 h-3.5 border flex items-center justify-center rounded-sm flex-shrink-0 ${selectedRegions.includes(naam) ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-200'}`}>
                            {selectedRegions.includes(naam) && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className={`text-xs flex-1 ${selectedRegions.includes(naam) ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{naam}</span>
                          <span className="text-[10px] text-slate-300 font-medium">{c}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {activeCount > 0 && (
            <button onClick={() => selectedRegions.forEach(r => onToggle(r))}
              className="mt-3 w-full text-[10px] text-slate-400 hover:text-[#E85E26] font-bold uppercase tracking-wider text-center py-1 border-t border-slate-100">
              Wis filters ({activeCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const CollapsibleFilterGroup: React.FC<any> = ({ title, items, selectedItems, onToggleItem, searchable, dataset, countFn }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const filteredItems = items.filter((item: string) => item.toLowerCase().includes(searchTerm.toLowerCase()));
    const activeCount = selectedItems.length;
    return (
        <div className="border border-slate-200 bg-white rounded-sm mb-4 last:mb-0 shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-white hover:bg-[#009FE3]/5 border-b border-slate-100 text-left">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider font-condensed flex items-center gap-2">
                    {title}
                    {activeCount > 0 && <span className="bg-[#E85E26] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeCount}</span>}
                </span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {isOpen && (
                <div className="p-4">
                    {searchable && (
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input type="text" placeholder="Zoek..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 text-xs focus:border-[#009FE3] focus:outline-none rounded-sm" />
                        </div>
                    )}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                        {filteredItems.map((item: string) => {
                            const count = (dataset && countFn) ? dataset.filter((b: any) => countFn(item, b)).length : null;
                            const isSelected = selectedItems.includes(item);
                            return (
                                <label key={item} className="flex items-center gap-3 cursor-pointer group hover:opacity-80">
                                    <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center rounded-sm ${isSelected ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-300'}`}>{isSelected && <Check className="w-3 h-3 text-white" />}</div>
                                    <span className={`text-sm flex-1 ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>{item}</span>
                                    {count !== null && <span className="text-[10px] text-slate-300 font-medium ml-auto">{count.toLocaleString('nl-NL')}</span>}
                                    <input type="checkbox" className="hidden" checked={isSelected} onChange={() => onToggleItem(item)} />
                                </label>
                            );
                        })}
                    </div>
                    {activeCount > 0 && (
                        <button onClick={() => selectedItems.forEach((i: string) => onToggleItem(i))}
                            className="mt-3 w-full text-[10px] text-slate-400 hover:text-[#E85E26] font-bold uppercase tracking-wider text-center py-1 border-t border-slate-100">
                            Wis ({activeCount})
                        </button>
                    )}
                </div>
            )}

        </div>
    );
};

export default App;

// ADVANCED SEARCH PARSER
const advancedQueryKey = (b: any) => `${b.naam || ''}||${b.straat || ''}||${b.stad || ''}`;

const parseAdvancedQuery = (query: string, bedrijven: any[]) => {
  if (!query.trim()) return bedrijven;

  const tokens = query.toLowerCase().match(/(".*?"|[^\s]+)/g) || [];
  let results: any[] = [];
  let currentOp: 'AND' | 'OR' | 'NOT' = 'AND';
  let firstTerm = true;

  const OP_TOKENS = new Set(['and', 'or', 'not', '-']);
  // Tel echte zoektermen (niet AND/OR/NOT) — hiermee weten we of de gebruiker
  // eigenlijk niks concreets typte behalve operatoren.
  const contentTokenCount = tokens.filter(t => {
    const term = t.startsWith('"') ? t.slice(1, -1) : t;
    return !OP_TOKENS.has(term) && term.length > 0;
  }).length;
  if (contentTokenCount === 0) return bedrijven;

  tokens.forEach((token) => {
    const isPhrase = token.startsWith('"');
    const searchTerm = isPhrase ? token.slice(1, -1) : token;

    if (!isPhrase && (searchTerm === 'not' || searchTerm === '-')) { currentOp = 'NOT'; return; }
    if (!isPhrase && searchTerm === 'or')  { currentOp = 'OR';  return; }
    if (!isPhrase && searchTerm === 'and') { currentOp = 'AND'; return; }
    if (!searchTerm) return;

    const matches = bedrijven.filter(b => {
      const searchStr = [b.naam, b.stad, b.straat, b.postcode, b.email, b.telefoon, b.spec1, b.spec2, b.spec3, b.website, b.source].join(' ').toLowerCase();
      return searchStr.includes(searchTerm);
    });
    const matchKeys = new Set(matches.map(advancedQueryKey));

    if (firstTerm) {
      // Eerste term: als er een leidende NOT stond ("NOT BV") starten we vanuit
      // de volledige set en trekken we de match eraf; anders is de match zelf de startset.
      results = currentOp === 'NOT'
        ? bedrijven.filter(b => !matchKeys.has(advancedQueryKey(b)))
        : matches;
      firstTerm = false;
    } else if (currentOp === 'AND') {
      results = results.filter(b => matchKeys.has(advancedQueryKey(b)));
    } else if (currentOp === 'OR') {
      const resultKeys = new Set(results.map(advancedQueryKey));
      results = [...results, ...matches.filter(m => !resultKeys.has(advancedQueryKey(m)))];
    } else if (currentOp === 'NOT') {
      results = results.filter(b => !matchKeys.has(advancedQueryKey(b)));
    }
    currentOp = 'AND';
  });

  return results;
};
