
import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, X, BarChart3, Building, Filter, Check, ChevronRight, ChevronDown, ChevronLeft, AlertTriangle, User as UserIcon, Heart, LayoutGrid, LogIn, Mail, Lock, Plus, Save, Download, MapPin, Database, Globe, Phone } from 'lucide-react';
import bouwgarantData from './bouwgarant_data.json';
import cityCoords from './city_coords.json';
import Header from './components/Header';
import MapView from './components/MapView';
import RouteMapPanel from './components/RouteMapPanel';
import { authService } from './services/authService';
import { SearchState, DiscoveredCompany, User } from './types';

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

const RESULTS_PER_PAGE = 10;

const DEFAULT_ORIGIN = "Lansinkesweg 4, 7553 AE Hengelo";

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

const RADIUS_OPTIONS = [10, 20, 30, 50, 100] as const;

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

const SOURCE_COLORS: Record<string, { bg: string; text: string; btn: string; btnHover: string }> = {
  'Bouwgarant':    { bg: 'bg-[#009FE3]/10', text: 'text-[#009FE3]', btn: 'bg-[#009FE3]', btnHover: 'hover:bg-[#008ac5]' },
  'Architectenweb':{ bg: 'bg-[#E85E26]/10', text: 'text-[#E85E26]', btn: 'bg-[#E85E26]', btnHover: 'hover:bg-[#d14d1b]' },
  'Stiho':         { bg: 'bg-orange-100',   text: 'text-orange-700', btn: 'bg-orange-600', btnHover: 'hover:bg-orange-700' },
  'Jongeneel':     { bg: 'bg-green-100',    text: 'text-green-700',  btn: 'bg-green-600',  btnHover: 'hover:bg-green-700' },
  'BouwPartner':   { bg: 'bg-yellow-100',   text: 'text-yellow-700', btn: 'bg-yellow-600', btnHover: 'hover:bg-yellow-700' },
  'PontMeyer':     { bg: 'bg-red-100',      text: 'text-red-700',    btn: 'bg-red-600',    btnHover: 'hover:bg-red-700' },
  'Onbekend':      { bg: 'bg-slate-100',    text: 'text-slate-500',  btn: 'bg-slate-500',  btnHover: 'hover:bg-slate-600' },
};
const srcColor = (source: string) => SOURCE_COLORS[source] || SOURCE_COLORS['Onbekend'];

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
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // APP STATE
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'search' | 'favorites' | 'database' | 'map'>('search');
  const [dbSearch, setDbSearch] = useState('');
  const [dbProvincie, setDbProvincie] = useState('');
  const [dbSource, setDbSource] = useState('');
  const [dbPage, setDbPage] = useState(1);
  const DB_PAGE_SIZE = 50;
  const [favorites, setFavorites] = useState<DiscoveredCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'relevant' | 'az'>('relevant');
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [splitRatio,   setSplitRatio]   = useState(58); // left panel %
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

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

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  
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
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedWerksoort, setSelectedWerksoort] = useState<string[]>([]);
  const [selectedContact, setSelectedContact] = useState<string[]>([]);

  const [foundCompanies, setFoundCompanies] = useState<DiscoveredCompany[]>([]);
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

  // Expandeer zoekopdracht: geeft array van te matchen termen terug
  const expandQuery = (q: string): string[] => {
    const lower = q.toLowerCase().trim();
    if (NAAM_ALIASSEN[lower]) return NAAM_ALIASSEN[lower];
    return [lower];
  };

  // SEARCH EXECUTION — zoekt lokaal in bouwgarant_data.json
  const executeSearch = (overrideCity?: string, overrideSort?: 'relevant' | 'az', overrideQuery?: string, overrideRadiusCenter?: { lat: number; lng: number } | null, overrideRadiusKm?: number | null, overrideRegions?: string[]) => {
      // Geen actieve zoekopdracht = leeg laten (Live Zoeken begint blanco)
      const effectiveQuery = (overrideQuery ?? city).trim();
      const effectiveRegions = overrideRegions !== undefined ? overrideRegions : selectedRegions;
      const effectiveRadius = overrideRadiusKm !== undefined ? overrideRadiusKm : radiusKm;
      const hasInput = effectiveQuery || effectiveRegions.length > 0 || selectedTypes.length > 0 || selectedWerksoort.length > 0 || selectedContact.length > 0 || effectiveRadius;
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

      const PROVINCES = ['Drenthe','Flevoland','Friesland','Gelderland','Groningen','Limburg','Noord-Brabant','Noord-Holland','Overijssel','Utrecht','Zeeland','Zuid-Holland'];

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

      const TYPE_PRIORITY: Record<string, number> = { architect: 0, bouwbedrijf: 1, aannemer: 2, overig: 3 };

      const results = (bouwgarantData as any[]).filter(b => {
          // Filter out entries without a name
          if (!(b.naam || '').trim()) return false;

          const dbStad = normalizeStad(b.stad || '');

          // Regio filter
          if (regions.length > 0 && !regions.includes('Heel Nederland')) {
              const matchRegion = regions.some(r => {
                  if (PROVINCES.includes(r)) return b.provincie === r;
                  return dbStad === normalizeStad(r);
              });
              if (!matchRegion) return false;
          }

          // Disciplines filter
          if (selectedTypes.length > 0) {
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
                  if (sel === 'Renovatie') return specs.includes('renovatie') || specs.includes('verbouw');
                  if (sel === 'Verduurzaming') return specs.includes('duurzaam') || specs.includes('verdurzam') || specs.includes('energie');
                  if (sel === 'Restauratie') return specs.includes('restauratie');
                  if (sel === 'Allround') return specs.includes('allround');
                  return false;
              });
              if (!match) return false;
          }

          // Contact filter
          if (selectedContact.length > 0) {
              const hasTel = !!(b.telefoon || b.telefoon_sales || b.telefoon_admin);
              const hasEmail = !!(b.email || b.email_sales || b.email_overig);
              const match = selectedContact.some(sel => {
                  if (sel === 'Heeft telefoon') return hasTel;
                  if (sel === 'Heeft email') return hasEmail;
                  return false;
              });
              if (!match) return false;
          }

          // Slim zoeken: naam-prefix heeft prioriteit, locatie als fallback
          // Bij actieve straal is de zoektekst het middelpunt van de cirkel — geen tekstfilter.
          if (q && !activeRadiusKm) {
              const naam = (b.naam || '').toLowerCase();
              const terms = expandQuery(q);
              const matchNaam = terms.some(t => naam.startsWith(t));
              const locHaystack = [dbStad, (b.straat || ''), (b.postcode || '')].join(' ').toLowerCase();
              const matchLoc = locHaystack.includes(q);
              if (!matchNaam && !matchLoc) return false;
          }

          return true;
      });

      // Hoe goed matcht de zoekopdracht op de bedrijfsnaam?
      const queryMatchScore = (b: any): number => {
        if (!q) return 0;
        const naam = (b.naam || '').toLowerCase();
        const terms = expandQuery(q);
        let best = 0;
        for (const t of terms) {
          if (naam === t)             best = Math.max(best, 2000); // exacte match
          else if (naam.startsWith(t)) best = Math.max(best, 1500); // naam begint met query
          else if (naam.includes(' ' + t) || naam.includes('-' + t)) best = Math.max(best, 800); // query is begin van een woord
          else if (naam.includes(t))  best = Math.max(best, 300);  // ergens in de naam
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

      // Radius filter
      let radiusCenter: { lat: number; lng: number } | null = overrideRadiusCenter !== undefined ? overrideRadiusCenter : null;
      const distanceMap = new Map<any, number>();

      if (activeRadiusKm && !radiusCenter) {
        const centerCity = (overrideCity ?? city).trim();
        radiusCenter = getCityCoords(centerCity);
        if (!radiusCenter && centerCity) {
          setSearchState({ isLoading: false, data: null, error: `Locatie "${centerCity}" niet gevonden. Probeer een grotere stad in de buurt (bijv. Zwolle, Amsterdam, Utrecht).` });
          return;
        }
      }

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

      const companies = results.map((b: any, i: number) => ({
          id: `local-${i}`,
          name: b.naam,
          city: b.stad || '',
          discoveredAt: new Date().toISOString(),
          _raw: b,
          _distanceKm: distanceMap.has(b) ? distanceMap.get(b) : undefined,
      }));

      setFoundCompanies(companies as any);
      setTotalMatches(companies.length);
      setSearchState({ isLoading: false, data: { text: 'Done' }, error: null });
      if (q) addToHistory(q);
  };

  // Live zoeken: debounce 350ms op city-wijziging
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { executeSearch(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [city]);

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
  const handleCreateSmartRoute = (useSelected = false) => {
    const allItems = viewMode === 'favorites' ? favorites : foundCompanies;

    // Gebruik geselecteerde items als die er zijn, anders alle resultaten
    let pool: any[] = allItems;
    if (useSelected && selectedIds.size > 0) {
      pool = allItems.filter(c => selectedIds.has(c.id));
    }
    if (!pool.length) return;

    const sortedList = [...pool].sort((a: any, b: any) => getGeoScore(a.city) - getGeoScore(b.city));
    const selection = sortedList.slice(0, 9); // Google Maps max 9 waypoints

    const startPoint = DEFAULT_ORIGIN;
    const endPoint = DEFAULT_ORIGIN;

    const waypoints = selection.map((c: any) => {
      const raw = (c as any)._raw;
      if (raw?.straat && raw?.stad) return encodeURIComponent(`${raw.straat}, ${raw.stad}`);
      return encodeURIComponent(`${c.name} ${c.city}`);
    }).join('|');

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startPoint)}&destination=${encodeURIComponent(endPoint)}&waypoints=${waypoints}&travelmode=driving`;
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

  // Dataset fed into ProvinceFilter — changes with active tab so counts reflect current view
  const sidebarDataset = React.useMemo(() => {
    if (viewMode === 'favorites') return favorites.map(f => (f as any)._raw || { stad: f.city, provincie: '' });
    if (viewMode === 'search') return foundCompanies.map(c => (c as any)._raw || c);
    return bouwgarantData as any[];
  }, [viewMode, favorites, foundCompanies]);

  const filteredFavorites = sidebarRegionsActive.length === 0 ? favorites : favorites.filter(fav => {
    const raw = (fav as any)._raw;
    const prov = raw?.provincie || '';
    const stad = normalizeStad(raw?.stad || fav.city || '');
    return sidebarRegionsActive.some(r => prov === r || stad === normalizeStad(r));
  });
  const itemsToShow = viewMode === 'favorites' ? filteredFavorites : foundCompanies;
  const totalPages = Math.ceil(itemsToShow.length / RESULTS_PER_PAGE);
  const currentItems = itemsToShow.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);

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
                                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium" required={authMode === 'register'} placeholder="Uw Naam"/>
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
                                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium"
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
                                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium"
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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-800">
      <Header user={currentUser} onHomeClick={resetToHome} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} />

      {/* SETTINGS MODAL */}
      {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white w-full max-w-md p-6 rounded-sm shadow-xl animate-fade-in relative">
                  <button onClick={() => setShowSettings(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-800"><X className="w-5 h-5"/></button>
                  <h2 className="text-xl font-bold text-slate-900 uppercase font-condensed mb-6">Profiel Instellingen</h2>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Weergavenaam</label>
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-2 border border-slate-200 rounded-sm" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Email</label>
                          <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full p-2 border border-slate-200 rounded-sm" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Avatar URL</label>
                          <input type="text" value={editAvatar} onChange={e => setEditAvatar(e.target.value)} className="w-full p-2 border border-slate-200 rounded-sm" placeholder="https://..." />
                          <p className="text-[10px] text-slate-400 mt-1">Plak een afbeeldingslink.</p>
                      </div>
                      <button type="submit" className="w-full py-3 bg-[#009FE3] text-white font-bold uppercase rounded-sm flex items-center justify-center gap-2 hover:bg-[#008ac5]">
                          <Save className="w-4 h-4" /> Opslaan
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex flex-col md:flex-row max-w-[1400px] mx-auto w-full flex-grow">
          {viewMode !== 'map' && viewMode !== 'search' && (
          <aside className={`bg-white border-r border-slate-200 flex-shrink-0 hidden md:flex flex-col h-[calc(100vh-112px)] sticky top-28 transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-80'}`}>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  {!sidebarCollapsed && <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest font-condensed flex items-center gap-2"><Filter className="w-4 h-4 text-[#009FE3]" /> Filters</h2>}
                  <button onClick={() => setSidebarCollapsed(v => !v)} className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title={sidebarCollapsed ? 'Filters tonen' : 'Filters verbergen'}>
                      {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </button>
              </div>
              {!sidebarCollapsed && (<>
              <div className="flex-grow overflow-y-auto p-6 space-y-2 scrollbar-thin">
                   <ProvinceFilter selectedRegions={selectedRegions} onToggle={(item: string) => toggleFilter(setSelectedRegions, item)} dataset={sidebarDataset} />
                   <CollapsibleFilterGroup title="Discipline" items={['Architecten', 'Bouwbedrijven', 'Aannemers', 'Bouwmaterialen']} selectedItems={selectedTypes} onToggleItem={(item) => toggleFilter(setSelectedTypes, item)} />
                   <CollapsibleFilterGroup title="Werksoort" items={['Nieuwbouw', 'Renovatie', 'Verduurzaming', 'Restauratie', 'Allround']} selectedItems={selectedWerksoort} onToggleItem={(item) => toggleFilter(setSelectedWerksoort, item)} />
                   <CollapsibleFilterGroup title="Contactgegevens" items={['Heeft telefoon', 'Heeft email']} selectedItems={selectedContact} onToggleItem={(item) => toggleFilter(setSelectedContact, item)} />
              </div>
              <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-2">
                  <button
                      onClick={() => {
                        if (viewMode === 'favorites') setCurrentPage(1);
                        else if (viewMode === 'database') setDbPage(1);
                        else handleManualSearch();
                      }}
                      disabled={searchState.isLoading}
                      className="w-full py-3.5 bg-[#009FE3] hover:bg-[#008ac5] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-[0.1em] transition-colors shadow-sm flex items-center justify-center gap-2">
                      {viewMode === 'favorites' ? 'Filters Toepassen' : viewMode === 'database' ? 'Filters Toepassen' : 'Update Resultaten'}
                  </button>
                  {(selectedRegions.length > 0 || selectedTypes.length > 0 || selectedWerksoort.length > 0 || selectedContact.length > 0) && (
                      <button
                          onClick={() => {
                              setSelectedRegions([]);
                              setSelectedTypes([]);
                              setSelectedWerksoort([]);
                              setSelectedContact([]);
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
              </>)}
          </aside>
          )}

          <main className="flex-grow p-6 lg:p-10 min-w-0 flex flex-col">
             <div className="max-w-4xl mx-auto w-full mb-6 flex gap-4">
                 <button onClick={() => setViewMode('search')} className={`flex-1 py-3 border-b-2 font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 ${viewMode === 'search' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                     <LayoutGrid className="w-4 h-4" /> Live Zoeken
                 </button>
                 <button onClick={() => { setViewMode('favorites'); setCurrentPage(1); setShowRouteMap(false); }} className={`flex-1 py-3 border-b-2 font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 ${viewMode === 'favorites' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                     <Heart className={`w-4 h-4 ${viewMode === 'favorites' ? 'fill-current' : ''}`} /> Mijn Favorieten ({favorites.length})
                 </button>
                 <button onClick={() => { setViewMode('database'); setDbPage(1); }} className={`flex-1 py-3 border-b-2 font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 ${viewMode === 'database' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                     <Database className="w-4 h-4" /> Bedrijvendatabase (3994)
                 </button>
                 <button onClick={() => setViewMode('map')} className={`flex-1 py-3 border-b-2 font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 ${viewMode === 'map' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                     <MapPin className="w-4 h-4" /> Kaart
                 </button>
             </div>

             {/* DETAIL MODAL */}
             {selectedCompany && (
               <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCompany(null)}>
                 <div className="bg-white max-w-lg w-full max-h-[85vh] overflow-y-auto rounded-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                   <div className="flex items-start justify-between p-5 border-b border-slate-200">
                     <div>
                       <h2 className="font-bold text-slate-900 text-base uppercase tracking-wide leading-tight">{selectedCompany.naam}</h2>
                       <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded ${`${srcColor(selectedCompany.source).btn} text-white`}`}>{selectedCompany.source}</span>
                     </div>
                     <button onClick={() => setSelectedCompany(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none ml-4">×</button>
                   </div>
                   <div className="p-5 space-y-4 text-sm">
                     {(selectedCompany.straat || selectedCompany.postcode || selectedCompany.stad) && (
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Adres</p>
                         <p className="text-slate-700">{[selectedCompany.straat, [selectedCompany.postcode, selectedCompany.stad].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
                         {selectedCompany.provincie && <p className="text-slate-500 text-xs">{selectedCompany.provincie}</p>}
                       </div>
                     )}
                     {selectedCompany.rechtsvorm && (
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Rechtsvorm</p>
                         <p className="text-slate-700">{selectedCompany.rechtsvorm}</p>
                       </div>
                     )}
                     {selectedCompany.kvk && (
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">KvK</p>
                         <p className="text-slate-700">{selectedCompany.kvk}</p>
                       </div>
                     )}
                     {(selectedCompany.telefoon || selectedCompany.telefoon_sales || selectedCompany.telefoon_admin) && (
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Telefoon</p>
                         {selectedCompany.telefoon && <p className="text-slate-700 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{selectedCompany.telefoon} <span className="text-slate-400 text-xs">(algemeen)</span></p>}
                         {selectedCompany.telefoon_sales && <p className="text-slate-700 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{selectedCompany.telefoon_sales} <span className="text-slate-400 text-xs">(sales)</span></p>}
                         {selectedCompany.telefoon_admin && <p className="text-slate-700 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{selectedCompany.telefoon_admin} <span className="text-slate-400 text-xs">(administratie)</span></p>}
                       </div>
                     )}
                     {(selectedCompany.email || selectedCompany.email_sales || selectedCompany.email_overig) && (
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Email</p>
                         {selectedCompany.email && <p className="text-slate-700 flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400 flex-shrink-0" /><a href={`mailto:${selectedCompany.email}`} className="text-[#009FE3] hover:underline">{selectedCompany.email}</a> <span className="text-slate-400 text-xs">(algemeen)</span></p>}
                         {selectedCompany.email_sales && <p className="text-slate-700 flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400 flex-shrink-0" /><a href={`mailto:${selectedCompany.email_sales}`} className="text-[#009FE3] hover:underline">{selectedCompany.email_sales}</a> <span className="text-slate-400 text-xs">(sales)</span></p>}
                         {selectedCompany.email_overig && <p className="text-slate-700 flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400 flex-shrink-0" /><a href={`mailto:${selectedCompany.email_overig}`} className="text-[#009FE3] hover:underline">{selectedCompany.email_overig}</a> <span className="text-slate-400 text-xs">(overig)</span></p>}
                       </div>
                     )}
                     {(selectedCompany.spec1 || selectedCompany.spec2 || selectedCompany.spec3) && (
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Specialisaties</p>
                         <div className="flex flex-wrap gap-1.5">
                           {[selectedCompany.spec1, selectedCompany.spec2, selectedCompany.spec3].filter(Boolean).map((s: string, si: number) => (
                             <span key={si} className="text-[10px] bg-[#E8F4FB] text-[#009FE3] px-2 py-0.5 font-semibold">{s}</span>
                           ))}
                         </div>
                       </div>
                     )}
                     <div className="flex gap-2 pt-3 border-t border-slate-100">
                       {selectedCompany.website && <a href={selectedCompany.website} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-700 rounded-sm transition-all"><Globe className="w-3 h-3"/>Website</a>}
                       {(selectedCompany.straat || selectedCompany.stad) && <a href={`https://maps.google.com/?q=${encodeURIComponent((selectedCompany.straat+' '+selectedCompany.stad).trim())}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26] text-slate-700 rounded-sm transition-all"><MapPin className="w-3 h-3"/>Route</a>}
                       {selectedCompany.url && <a href={selectedCompany.url} target="_blank" rel="noreferrer" className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-sm text-white transition-all ${`${srcColor(selectedCompany.source).btn} ${srcColor(selectedCompany.source).btnHover}`}`}><ArrowRight className="w-3 h-3"/>{selectedCompany.source}</a>}
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {viewMode === 'database' && (() => {
               const provincies = Array.from(new Set((bouwgarantData as any[]).map(b => b.provincie).filter(Boolean))).sort();
               const sidebarRegions = selectedRegions.filter(r => r !== 'Heel Nederland');
               const filtered = (bouwgarantData as any[]).filter(b => {
                 if (!(b.naam || '').trim()) return false;
                 const q = dbSearch.toLowerCase().trim();
                 const dbStadN = normalizeStad(b.stad || '');
                 const matchSearch = !q || [b.naam, dbStadN, b.straat, b.postcode, b.email, b.telefoon, b.spec1, b.spec2, b.spec3, b.website].join(' ').toLowerCase().includes(q) || dbStadN.includes(normalizeStad(q));
                 const matchProv = !dbProvincie || b.provincie === dbProvincie;
                 const matchSource = !dbSource || b.source === dbSource;
                 const matchSidebar = sidebarRegions.length === 0 || sidebarRegions.some(r => b.provincie === r || normalizeStad(b.stad) === normalizeStad(r));
                 return matchSearch && matchProv && matchSource && matchSidebar;
               });
               const totalPages = Math.ceil(filtered.length / DB_PAGE_SIZE);
               const paged = filtered.slice((dbPage - 1) * DB_PAGE_SIZE, dbPage * DB_PAGE_SIZE);
               const btnBase = "flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border transition-all flex-1 whitespace-nowrap rounded-sm";
               return (
                 <div className="max-w-4xl mx-auto w-full">
                   <div className="flex gap-3 mb-3 flex-wrap">
                     <div className="relative flex-grow min-w-48">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                       <input type="text" value={dbSearch} onChange={e => { setDbSearch(e.target.value); setDbPage(1); }} placeholder="Zoek op naam, stad, email..." className="w-full pl-9 pr-4 py-2.5 border border-slate-200 text-sm focus:outline-none focus:border-[#009FE3]" />
                     </div>
                     <select value={dbProvincie} onChange={e => { setDbProvincie(e.target.value); setDbPage(1); }} className="border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#009FE3] bg-white">
                       <option value="">Alle provincies</option>
                       {provincies.map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                     <select value={dbSource} onChange={e => { setDbSource(e.target.value); setDbPage(1); }} className="border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#009FE3] bg-white">
                       <option value="">Alle bronnen</option>
                       <option value="Bouwgarant">Bouwgarant</option>
                       <option value="Architectenweb">Architectenweb</option>
                       <option value="Stiho">Stiho</option>
                       <option value="Jongeneel">Jongeneel</option>
                       <option value="BouwPartner">BouwPartner</option>
                       <option value="PontMeyer">PontMeyer</option>
                       <option value="Onbekend">Onbekend</option>
                     </select>
                   </div>
                   <div className="text-xs text-slate-500 mb-4 font-semibold uppercase tracking-wider">
                     ~{filtered.length} gevonden
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {paged.map((b: any, i: number) => (
                       <div key={i} className="bg-white border border-slate-200 p-5 flex flex-col gap-3 hover:border-[#009FE3] transition-colors cursor-pointer" onClick={() => setSelectedCompany(b)}>
                         <div className="flex items-start justify-between gap-2">
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 flex-wrap">
                               <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide leading-tight">{b.naam}</h3>
                               <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${`${srcColor(b.source).bg} ${srcColor(b.source).text}`}`}>{b.source}</span>
                             </div>
                             {(b.straat || b.postcode || b.stad) && (
                               <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                                 <MapPin className="w-3 h-3 flex-shrink-0" />
                                 {[b.straat, [b.postcode, b.stad].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                                 {b.provincie && <span className="text-slate-400 ml-1">· {b.provincie}</span>}
                               </p>
                             )}
                           </div>
                           {b.rechtsvorm && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium whitespace-nowrap flex-shrink-0">{b.rechtsvorm}</span>}
                         </div>
                         {(b.spec1 || b.spec2 || b.spec3) && (
                           <div className="flex flex-wrap gap-1.5">
                             {[b.spec1, b.spec2, b.spec3].filter(Boolean).map((s: string, si: number) => (
                               <span key={si} className="text-[10px] bg-[#E8F4FB] text-[#009FE3] px-2 py-0.5 font-semibold">{s}</span>
                             ))}
                           </div>
                         )}
                         {(b.telefoon || b.email) && (
                           <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                             {b.telefoon && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" />{b.telefoon}</span>}
                             {b.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email}</span>}
                           </div>
                         )}
                         <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                           {b.website && <a href={b.website} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3]`}><Globe className="w-3 h-3"/>Site</a>}
                           {(b.straat || b.stad) && <a href={`https://maps.google.com/?q=${encodeURIComponent(((b.straat||'')+' '+(b.stad||'')).trim())}`} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]`}><MapPin className="w-3 h-3"/>Route</a>}
                           {b.url && <a href={b.url} target="_blank" rel="noreferrer" className={`${btnBase} text-white border-transparent ${`${srcColor(b.source).btn} ${srcColor(b.source).btnHover}`}`}><ArrowRight className="w-3 h-3"/>{b.source || 'Bronpagina'}</a>}
                           <button onClick={() => { setSelectedRegions([]); setSelectedTypes([]); setSelectedWerksoort([]); setSelectedContact([]); setCity(b.naam); executeSearch(undefined, undefined, b.naam); }} className={`${btnBase} bg-[#E85E26]/5 text-[#E85E26] border-[#E85E26]/30 hover:border-[#E85E26] hover:bg-[#E85E26]/10`}><Search className="w-3 h-3"/>Zoeken</button>
                           <FavButton company={{id:`db-${i}`, name: b.naam, city: b.stad, _raw: b}} favorites={favorites} onToggle={toggleFavorite} />
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
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
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
                 {/* Straal filter */}
                 <div className="flex items-center gap-2 mt-2 flex-wrap">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Straal:</span>
                   {RADIUS_OPTIONS.map(km => (
                     <button
                       key={km}
                       onClick={() => { setRadiusKm(prev => prev === km ? null : km); }}
                       className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all rounded-sm ${radiusKm === km ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3]'}`}
                     >
                       {km} km
                     </button>
                   ))}
                   {radiusKm && (
                     <span className="text-[10px] text-slate-500 ml-1">
                       Zoek bedrijven binnen <strong>{radiusKm} km</strong> van de ingevoerde locatie
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
                       <button key={i} onMouseDown={() => { setCity(h); setShowHistory(false); setTimeout(() => executeSearch(), 0); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-0">
                         <Search className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
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
                    <p className="text-slate-300 text-xs mt-1">Alle 3.994 bedrijven staan in de <button onClick={() => { setViewMode('database'); setDbPage(1); }} className="underline hover:text-[#009FE3]">Bedrijvendatabase</button>.</p>
                </div>
            )}

            {viewMode === 'map' && (
                <MapView
                  allData={bouwgarantData as any[]}
                  favorites={favorites}
                  onNavigate={(target, naam) => {
                    if (target === 'database') {
                      setDbSearch(naam);
                      setDbProvincie('');
                      setDbSource('');
                      setDbPage(1);
                      setViewMode('database');
                    } else {
                      setCity(naam);
                      executeSearch(undefined, undefined, naam);
                    }
                  }}
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
                  className={`animate-fade-in w-full ${showRouteMap && viewMode === 'search' ? 'flex h-[calc(100vh-200px)] min-h-[600px]' : 'space-y-6 max-w-6xl mx-auto'}`}>
                {/* Left: results list */}
                <div
                  className={showRouteMap && viewMode === 'search' ? 'overflow-y-auto space-y-6 flex-shrink-0' : 'space-y-6'}
                  style={showRouteMap && viewMode === 'search' ? { width: `${splitRatio}%` } : undefined}>
                    <div className="flex flex-col md:flex-row items-center justify-between border-b-2 border-slate-200 pb-4 gap-4">
                        <div>
                             <div className="flex items-center gap-3">
                               <h2 className="text-2xl font-bold text-slate-900 font-condensed uppercase tracking-tight">{viewMode === 'favorites' ? 'Mijn Favorieten' : 'Zoekresultaten'}</h2>
                               {viewMode === 'search' && <div className="flex border border-slate-200 rounded-sm overflow-hidden text-[10px] font-bold uppercase tracking-wider">
                                 <button onClick={() => { setSortMode('relevant'); executeSearch(undefined, 'relevant'); }} className={`px-3 py-1.5 transition-colors ${sortMode === 'relevant' ? 'bg-[#009FE3] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Relevant</button>
                                 <button onClick={() => { setSortMode('az'); executeSearch(undefined, 'az'); }} className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${sortMode === 'az' ? 'bg-[#009FE3] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>A–Z</button>
                               </div>}
                             </div>
                             <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wide">{viewMode === 'favorites' ? `${favorites.length} opgeslagen` : `~${totalMatches} gevonden`}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {viewMode === 'search' && selectedIds.size > 0 && (() => {
                              // Pak het eerste geselecteerde bedrijf als referentiepunt
                              const firstSelected = foundCompanies.find(c => selectedIds.has(c.id));
                              const refRaw = firstSelected ? (firstSelected as any)._raw : null;
                              const refStad = refRaw?.stad || (firstSelected as any)?.city || '';
                              const refCoords = refStad ? getCityCoords(refStad) : null;
                              return (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-[#E85E26] bg-[#E85E26]/10 px-2 py-1 rounded-sm">{selectedIds.size} geselecteerd</span>
                                  {refCoords && (
                                    <button
                                      onClick={() => {
                                        const km = radiusKm ?? 20;
                                        setRadiusKm(km);
                                        setCity(refStad);
                                        setSelectedRegions([]);
                                        clearSelection();
                                        executeSearch(undefined, undefined, '', refCoords, km, []);
                                      }}
                                      className="px-4 py-2 bg-[#009FE3] hover:bg-[#008ac5] text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center gap-2 transition-colors"
                                    >
                                      <Search className="w-4 h-4" /> Zoek bedrijven in de buurt
                                    </button>
                                  )}
                                  <button onClick={() => handleCreateSmartRoute(true)} className="px-4 py-2 bg-[#E85E26] text-white text-xs font-bold uppercase tracking-wider rounded-sm flex items-center gap-2 transition-colors hover:bg-[#d14d1b]">
                                      <MapPin className="w-4 h-4" /> Selectie → Maps
                                  </button>
                                  <button onClick={clearSelection} className="px-3 py-2 bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-slate-200 transition-colors">✕</button>
                                </div>
                              );
                            })()}
                            {viewMode === 'search' && <button
                                onClick={() => setShowRouteMap(v => !v)}
                                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm flex items-center gap-2 transition-colors border ${showRouteMap ? 'bg-[#009FE3] text-white border-[#009FE3]' : 'bg-white text-[#009FE3] border-[#009FE3] hover:bg-[#f0f9ff]'}`}
                            >
                                <MapPin className="w-4 h-4" /> {showRouteMap ? 'Kaart sluiten' : 'Route Kaart'}
                            </button>}
                            <button
                                onClick={downloadExport}
                                className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold uppercase tracking-wider rounded-sm flex items-center gap-2 transition-colors"
                            >
                                <Download className="w-4 h-4" /> Download Lijst
                            </button>
                        </div>
                    </div>

                    <div className={`grid gap-4 ${showRouteMap ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
                        {currentItems.map((company: any) => {
                            const b = (company as any)._raw || company;
                            const distKm: number | undefined = company._distanceKm;
                            const btnBase = "flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border transition-all flex-1 whitespace-nowrap rounded-sm";
                            return (
                              <div key={company.id} className={`bg-white border p-5 flex flex-col gap-3 transition-colors cursor-pointer ${selectedIds.has(company.id) ? 'border-[#E85E26] ring-1 ring-[#E85E26]/30' : 'border-slate-200 hover:border-[#009FE3]'}`} onClick={() => setSelectedCompany(b)}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {/* Selectie checkbox */}
                                      <div onClick={e => toggleSelect(company.id, e)} className={`flex-shrink-0 w-4 h-4 border-2 rounded-sm flex items-center justify-center transition-colors ${selectedIds.has(company.id) ? 'bg-[#E85E26] border-[#E85E26]' : 'border-slate-300 hover:border-[#E85E26]'}`}>
                                        {selectedIds.has(company.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                      </div>
                                      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide leading-tight">{b.naam || company.name}</h3>
                                      {b.source && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${`${srcColor(b.source).bg} ${srcColor(b.source).text}`}`}>{b.source}</span>}
                                      {distKm !== undefined && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#009FE3]/10 text-[#009FE3] flex-shrink-0">{distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`}</span>}
                                    </div>
                                    {(b.straat || b.postcode || b.stad || company.city) && (
                                      <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 flex-shrink-0" />
                                        {[b.straat, [b.postcode, b.stad || company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                                        {b.provincie && <span className="text-slate-400 ml-1">· {b.provincie}</span>}
                                      </p>
                                    )}
                                  </div>
                                  {b.rechtsvorm && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium whitespace-nowrap flex-shrink-0">{b.rechtsvorm}</span>}
                                </div>
                                {(b.spec1 || b.spec2 || b.spec3) && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {[b.spec1, b.spec2, b.spec3].filter(Boolean).map((s: string, si: number) => (
                                      <span key={si} className="text-[10px] bg-[#E8F4FB] text-[#009FE3] px-2 py-0.5 font-semibold">{s}</span>
                                    ))}
                                  </div>
                                )}
                                {(b.telefoon || b.email) && (
                                  <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                                    {b.telefoon && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" />{b.telefoon}</span>}
                                    {b.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email}</span>}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                                  {b.website && <a href={b.website} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3]`}><Globe className="w-3 h-3"/>Site</a>}
                                  {(b.straat || b.stad) && <a href={`https://maps.google.com/?q=${encodeURIComponent(((b.straat||'')+' '+(b.stad||'')).trim())}`} target="_blank" rel="noreferrer" className={`${btnBase} bg-white text-slate-700 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]`}><MapPin className="w-3 h-3"/>Route</a>}
                                  {b.url && <a href={b.url} target="_blank" rel="noreferrer" className={`${btnBase} text-white border-transparent ${`${srcColor(b.source).btn} ${srcColor(b.source).btnHover}`}`}><ArrowRight className="w-3 h-3"/>{b.source || 'Info'}</a>}
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
                {/* Drag handle */}
                {showRouteMap && viewMode === 'search' && (
                  <div
                    onMouseDown={startDrag}
                    className="w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200 hover:bg-[#009FE3] transition-colors relative group"
                    title="Sleep om te resizen">
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-400 group-hover:bg-[#009FE3] transition-colors" />
                  </div>
                )}
                {/* Right: RouteMapPanel */}
                {showRouteMap && viewMode === 'search' && (
                  <div className="flex-1 min-w-0 h-full overflow-hidden border-l-0">
                    <RouteMapPanel
                      companies={itemsToShow.filter(c => selectedIds.has(c.id))}
                      onClose={() => setShowRouteMap(false)}
                    />
                  </div>
                )}
                </div>
            )}
          </main>
      </div>

      {selectedCompany && (() => {
        const b = selectedCompany;
        const hasContact = b.telefoon || b.telefoon_sales || b.telefoon_admin || b.email || b.email_sales || b.email_overig;
        const hasAddress = b.straat || b.stad;
        const hasSpec = b.spec1 || b.spec2 || b.spec3;
        const hasBedrijf = b.rechtsvorm || b.kvk;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={() => setSelectedCompany(null)}>
            <div className="bg-[#F8FAFC] w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between p-6 bg-white border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 text-[#E85E26] text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
                    <Building className="w-3 h-3" /> Bedrijfsprofiel
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-tight">{b.naam}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${`${srcColor(b.source).bg} ${srcColor(b.source).text}`}`}>{b.source || 'Onbekend'}</span>
                    {b.rechtsvorm && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">{b.rechtsvorm}</span>}
                    {b.provincie && <span className="text-[10px] text-slate-400 font-medium">{b.provincie}</span>}
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-900 ml-4"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-5">

                {/* Adres */}
                {hasAddress && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Adres</p>
                    <div className="bg-white border border-slate-200 p-4 rounded-sm">
                      {b.straat && <p className="text-slate-800 font-medium text-sm">{b.straat}</p>}
                      {(b.postcode || b.stad) && <p className="text-slate-700 text-sm">{[b.postcode, b.stad].filter(Boolean).join('  ')}</p>}
                      {b.provincie && <p className="text-slate-500 text-xs mt-0.5">{b.provincie}</p>}
                    </div>
                  </div>
                )}

                {/* Contactgegevens */}
                {hasContact && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Contact</p>
                    <div className="bg-white border border-slate-200 p-4 rounded-sm space-y-2">
                      {b.telefoon && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Algemeen</span><span className="text-slate-800 font-medium flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{b.telefoon}</span></div>}
                      {b.telefoon_sales && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Sales</span><span className="text-slate-800 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{b.telefoon_sales}</span></div>}
                      {b.telefoon_admin && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Administratie</span><span className="text-slate-800 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />{b.telefoon_admin}</span></div>}
                      {b.email && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Algemeen</span><a href={`mailto:${b.email}`} className="text-[#009FE3] hover:underline flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email}</a></div>}
                      {b.email_sales && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Sales</span><a href={`mailto:${b.email_sales}`} className="text-[#009FE3] hover:underline flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email_sales}</a></div>}
                      {b.email_overig && <div className="flex items-center gap-3 text-sm"><span className="text-slate-400 text-xs w-24 flex-shrink-0">Overig</span><a href={`mailto:${b.email_overig}`} className="text-[#009FE3] hover:underline flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" />{b.email_overig}</a></div>}
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

                {/* Specialisaties */}
                {hasSpec && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Specialisaties</p>
                    <div className="flex flex-wrap gap-2">
                      {[b.spec1, b.spec2, b.spec3].filter(Boolean).map((s: string, i: number) => (
                        <span key={i} className="text-xs bg-[#E8F4FB] text-[#009FE3] px-3 py-1 font-semibold rounded-sm">{s}</span>
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
                <div className="flex gap-2 pt-2">
                  {b.website && <a href={b.website} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3] text-slate-700 rounded-sm transition-all bg-white"><Globe className="w-3.5 h-3.5"/>Website</a>}
                  {hasAddress && <a href={`https://maps.google.com/?q=${encodeURIComponent(((b.straat||'')+' '+(b.stad||'')).trim())}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26] text-slate-700 rounded-sm transition-all bg-white"><MapPin className="w-3.5 h-3.5"/>Route</a>}
                  {b.url && <a href={b.url} target="_blank" rel="noreferrer" className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm text-white transition-all ${`${srcColor(b.source).btn} ${srcColor(b.source).btnHover}`}`}><ArrowRight className="w-3.5 h-3.5"/>Bronpagina</a>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border-b border-slate-100 text-left">
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
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 text-xs focus:border-[#009FE3] focus:outline-none rounded-sm" />
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
                      className="flex-1 flex items-center justify-between py-1.5 px-1 text-left hover:bg-slate-50 rounded-sm">
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
                        <label key={naam} onClick={() => onToggle(naam)} className="flex items-center gap-2 cursor-pointer py-0.5 px-1 hover:bg-slate-50 rounded-sm">
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

const CollapsibleFilterGroup: React.FC<any> = ({ title, items, selectedItems, onToggleItem, searchable }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const filteredItems = items.filter((item: string) => item.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
        <div className="border border-slate-200 bg-white rounded-sm mb-4 last:mb-0 shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border-b border-slate-100 text-left">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider font-condensed">{title}</span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {isOpen && (
                <div className="p-4">
                    {searchable && (
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input type="text" placeholder="Zoek..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 text-xs focus:border-[#009FE3] focus:outline-none rounded-sm" />
                        </div>
                    )}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                        {filteredItems.map((item: string) => (
                            <label key={item} className="flex items-center gap-3 cursor-pointer group hover:opacity-80">
                                <div className={`w-4 h-4 border flex items-center justify-center ${selectedItems.includes(item) ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-300'}`}>{selectedItems.includes(item) && <Check className="w-3 h-3 text-white" />}</div>
                                <span className={`text-sm ${selectedItems.includes(item) ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>{item}</span>
                                <input type="checkbox" className="hidden" checked={selectedItems.includes(item)} onChange={() => onToggleItem(item)} />
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
