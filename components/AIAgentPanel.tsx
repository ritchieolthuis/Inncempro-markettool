import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, Building2, MapPin, ArrowRightCircle, AlertTriangle, Navigation, Columns, Search, PenLine, Route, RotateCcw } from 'lucide-react';
import { createAgentChat, runAgentTurn, hasApiKey, Chat } from '../services/aiAgentService';
import { zoekBedrijven, bedrijfDetails, vergelijkBedrijven, planRoute, bedrijvenLijst } from '../services/aiAgentTools';

// De 3 Inncempro merkkleuren (logo: blauw, groen, oranje) samen in één gradient — dit is
// de agent-"identiteit": overal waar de orb of een gradient-knop verschijnt, komen alle
// 3 kleuren terug i.p.v. alleen het blauw/oranje duo.
const BRAND_GRADIENT = 'linear-gradient(135deg, #009FE3, #16a34a, #E85E26)';
const BRAND_CONIC = 'conic-gradient(from 0deg, #009FE3, #16a34a, #E85E26, #009FE3)';

// Glazen "bubble" gemaakt van meerdere zachte kleurvlekken (blauw/groen/oranje) die in een
// witte bol overvloeien, met een highlight linksboven — zelfde iriserende bubble-esthetiek
// als het referentiebeeld, maar opgebouwd uit de eigen merkkleuren i.p.v. willekeurig paars/roze.
const BUBBLE_BACKGROUND = [
  'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.95), rgba(255,255,255,0) 34%)',
  'radial-gradient(circle at 74% 70%, rgba(0,159,227,0.5), rgba(0,159,227,0) 58%)',
  'radial-gradient(circle at 20% 72%, rgba(22,163,74,0.42), rgba(22,163,74,0) 55%)',
  'radial-gradient(circle at 78% 22%, rgba(232,94,38,0.45), rgba(232,94,38,0) 55%)',
  'radial-gradient(circle at 50% 55%, #ffffff, #eaf6fd 78%)',
].join(', ');

// De "levende" orb is het visuele anker van het agent-gevoel: een zachte, glazen bubble met
// de 3 merkkleuren erin verweven (i.p.v. een dun draaiend ringetje) — overal herbruikt zodat
// de launcher, header-avatar en denk-indicator dezelfde identiteit delen i.p.v. losse iconen.
export const AgentOrb: React.FC<{ size?: number; spin?: 'slow' | 'fast'; icon?: React.ReactNode }> = ({ size = 40, spin = 'slow', icon }) => (
  <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
    {/* Zachte kleurgloed rondom de bubble */}
    <div className="absolute -inset-1 rounded-full blur-md opacity-50" style={{ background: BRAND_CONIC }} />
    {/* De bubble zelf: glazen bol met de merkkleuren erin, langzaam ronddraaiend voor een "levend" gevoel */}
    <div
      className={`absolute inset-0 rounded-full ${spin === 'fast' ? 'animate-ring-rotate-fast' : 'animate-ring-rotate'}`}
      style={{
        background: BUBBLE_BACKGROUND,
        border: '1px solid rgba(255,255,255,0.7)',
        boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.9), 0 2px 8px rgba(15,23,42,0.15)',
      }}
    />
    <div className="absolute inset-0 flex items-center justify-center">
      {icon ?? <Sparkles className="w-[38%] h-[38%] text-[#009FE3] drop-shadow-sm" />}
    </div>
  </div>
);

// Bouwt een Google Maps multi-stop rijroute (max 10 stops — praktische grens van de URL).
// ?api=1-formaat i.p.v. de oude pad-stijl "/dir/A/B/C": die laat Google elk segment apart als
// losse zoekopdracht interpreteren, wat een naam+adres-tussenstop kan laten mislukken.
function googleMapsRouteUrl(bedrijven: any[]): string {
  const enc = (b: any) => encodeURIComponent([b.naam, b.straat, b.postcode, b.stad].filter(Boolean).join(', '));
  const limited = bedrijven.slice(0, 10);
  const last = limited[limited.length - 1];
  const waypoints = limited.slice(0, -1).map(enc).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&destination=${enc(last)}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}

// Actie-rij onder een lijst/route-resultaat: zet de gevonden bedrijven direct op de
// interne routekaart, of open ze als rijroute in Google Maps. Alleen zinvol vanaf 2 stops.
const RouteActions: React.FC<{ bedrijven: any[]; onCreateRoute: (b: any[]) => void }> = ({ bedrijven, onCreateRoute }) => {
  const valid = bedrijven.filter((b) => b?.naam && (b.straat || b.stad));
  if (valid.length < 2) return null;
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <button
        onClick={() => onCreateRoute(valid)}
        className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold text-white hover:opacity-90 transition-opacity"
        style={{ background: '#009FE3' }}
      >
        <Route className="w-3.5 h-3.5" /> Route op kaart
      </button>
      <a
        href={googleMapsRouteUrl(valid)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold text-white hover:opacity-90 transition-opacity"
        style={{ background: '#16a34a' }}
      >
        <Navigation className="w-3.5 h-3.5" /> Google Maps
      </a>
    </div>
  );
};

const STATUS_IDLE = 'Klaar om te helpen';
const STATUS_MESSAGES = ['Doorzoekt database...', 'Analyseert gegevens...', 'Stelt antwoord samen...'];

export const SUGGESTIONS = [
  { icon: Search, text: 'Welke architecten zitten er in Rotterdam?' },
  { icon: Columns, text: 'Vergelijk Ter Steege Groep met Van Wijnen' },
  { icon: Navigation, text: 'Plan een route langs 6 bouwbedrijven in Utrecht' },
];

const CAPABILITIES = [
  { icon: Search, label: 'Zoeken' },
  { icon: Columns, label: 'Vergelijken' },
  { icon: Navigation, label: 'Routes' },
  { icon: PenLine, label: 'Notities' },
];

// De Gemini SDK gooit soms een error waarvan `.message` zelf een JSON-blob is
// (bv. `{"error":{"message":"API key not valid...","status":"INVALID_ARGUMENT"}}`) —
// pak daar het leesbare bericht uit i.p.v. de ruwe JSON te tonen.
function extractErrorMessage(e: any): string {
  const raw = e?.message || String(e);
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || raw;
  } catch {
    return raw;
  }
}

// Het model antwoordt met lichte markdown (**vet**, genummerde lijsten) — hier eigen,
// simpele rendering van naar JSX i.p.v. de sterretjes letterlijk te tonen. Geen zware
// markdown-library nodig voor dit beperkte gebruik.
function renderBoldSegments(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0 || l === '');
  return (
    <div className="text-sm space-y-1">
      {lines.map((line, i) => {
        const numberedMatch = line.match(/^\s*(\d+)\.\s*(.*)$/);
        if (numberedMatch) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 flex-shrink-0">{numberedMatch[1]}.</span>
              <span>{renderBoldSegments(numberedMatch[2], `l${i}`)}</span>
            </div>
          );
        }
        const bulletMatch = line.match(/^\s*[-•]\s*(.*)$/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 flex-shrink-0">•</span>
              <span>{renderBoldSegments(bulletMatch[1], `l${i}`)}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderBoldSegments(line, `l${i}`)}</p>;
      })}
    </div>
  );
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: any }>;
}

interface AIAgentPanelProps {
  activeData: any[];
  onOpenInDatabase: (naam: string) => void;
  onShowOnMap: (bedrijf: { naam: string; straat: string; stad: string; provincie: string }) => void;
  onSetStatus: (naam: string, status: string) => void;
  onAddNote: (naam: string, notitie: string) => void;
  onCreateRoute: (bedrijven: any[]) => void;
  // Laat de hoofdpagina (bv. een suggestie-knop op de Live Zoeken-pagina) het paneel
  // van buitenaf openen én meteen een vraag laten versturen, zonder dat de agent zijn
  // eigen open/dicht-state naar buiten hoeft te exposen.
  openRequest?: { text: string; ts: number } | null;
  onOpenRequestHandled?: () => void;
}

const AIAgentPanel: React.FC<AIAgentPanelProps> = ({ activeData, onOpenInDatabase, onShowOnMap, onSetStatus, onAddNote, onCreateRoute, openRequest, onOpenRequestHandled }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const chatRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  // Laat de statusregel meedraaien terwijl de agent bezig is, zodat het voelt alsof er
  // iets gebeurt ("doorzoekt...", "analyseert...") i.p.v. een stille laad-indicator.
  useEffect(() => {
    if (!thinking) { setStatusIdx(0); return; }
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 1400);
    return () => clearInterval(id);
  }, [thinking]);

  const statusText = thinking ? STATUS_MESSAGES[statusIdx] : STATUS_IDLE;

  const startNewChat = () => {
    setMessages([]);
    setInput('');
    setThinking(false);
    chatRef.current = null;
  };

  const executeTool = (name: string, args: any) => {
    switch (name) {
      case 'zoek_bedrijven': return zoekBedrijven(activeData, args);
      case 'bedrijven_lijst': return bedrijvenLijst(activeData, args);
      case 'bedrijf_details': return bedrijfDetails(activeData, args);
      case 'vergelijk_bedrijven': return vergelijkBedrijven(activeData, args);
      case 'plan_route': return planRoute(activeData, args);
      case 'zet_status': onSetStatus(args.naam, args.status); return { gelukt: true };
      case 'voeg_notitie_toe': onAddNote(args.naam, args.notitie); return { gelukt: true };
      default: return { error: `Onbekende tool: ${name}` };
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: trimmed }]);
    setThinking(true);
    try {
      if (!chatRef.current) chatRef.current = createAgentChat();
      const result = await runAgentTurn(chatRef.current, trimmed, executeTool);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: result.text, toolCalls: result.toolCalls }]);
    } catch (e: any) {
      const friendly = extractErrorMessage(e);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: `Er ging iets mis: ${friendly}` }]);
    } finally {
      setThinking(false);
    }
  };

  const send = () => sendMessage(input);

  // Externe trigger (bv. een suggestie-knop op de Live Zoeken-pagina): opent het paneel
  // en stuurt de meegegeven vraag direct, alsof de gebruiker 'm zelf had getypt.
  useEffect(() => {
    if (!openRequest) return;
    setOpen(true);
    sendMessage(openRequest.text);
    onOpenRequestHandled?.();
    // sendMessage bewust buiten de dependency-array gehouden: die wordt elke render
    // opnieuw aangemaakt, en we willen alleen reageren op een echt nieuwe openRequest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full shadow-lg hover:shadow-2xl flex items-center justify-center transition-all hover:scale-105 animate-fade-in"
          title="Inncempro Agent"
        >
          <span
            className="absolute inset-0 rounded-full animate-orb-glow blur-md"
            style={{ background: BRAND_GRADIENT }}
          />
          <AgentOrb size={64} icon={<Sparkles className="w-[42%] h-[42%] text-[#009FE3]" />} />
        </button>
      )}

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-gradient-to-b from-white to-slate-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
      >
        {/* Header: agent identiteit i.p.v. platte "chat header" balk */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AgentOrb size={40} spin={thinking ? 'fast' : 'slow'} />
              <div>
                <p className="text-sm font-bold leading-none text-slate-900 font-condensed uppercase tracking-wide">Inncempro Agent</p>
                <p key={statusText} className="text-[11px] text-slate-500 mt-1 animate-status-fade flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${thinking ? 'bg-[#E85E26] animate-pulse' : 'bg-emerald-500'}`} />
                  {statusText}
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>

          {messages.length === 0 ? (
            <div className="flex items-center gap-1.5 mt-3.5 flex-wrap">
              {CAPABILITIES.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-medium text-slate-500">
                  <c.icon className="w-3 h-3 text-[#009FE3]" /> {c.label}
                </span>
              ))}
            </div>
          ) : (
            <button onClick={startNewChat} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-[#009FE3] transition-colors">
              <RotateCcw className="w-3 h-3" /> Nieuwe chat starten
            </button>
          )}
        </div>

        {!hasApiKey() && (
          <div className="m-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Geen GROQ_API_KEY ingesteld. Voeg deze toe aan <code className="font-mono">.env</code> om de assistent te gebruiken.</p>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 relative w-16 h-16">
                <span className="absolute inset-0 rounded-full animate-orb-glow blur-lg opacity-50" style={{ background: BRAND_GRADIENT }} />
                <AgentOrb size={64} />
              </div>
              <p className="text-sm font-bold text-slate-700 font-condensed uppercase tracking-wide">Waar kan ik je mee helpen?</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto">Doorzoekt live 3.972 bedrijven, vergelijkt ze en plant bezoekroutes.</p>
              <div className="mt-5 flex flex-col gap-1.5 items-stretch text-left">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s.text)}
                    className="group flex items-center gap-2.5 w-full px-3.5 py-2.5 text-xs text-slate-600 bg-white hover:bg-white border border-slate-200 hover:border-[#009FE3]/40 rounded-xl shadow-sm hover:shadow transition-all"
                  >
                    <s.icon className="w-3.5 h-3.5 text-[#009FE3] flex-shrink-0" />
                    <span className="group-hover:text-slate-800">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end animate-fade-in">
                <span className="max-w-[85%] px-3.5 py-1.5 rounded-full bg-slate-800 text-white text-xs font-medium">{m.text}</span>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start animate-fade-in">
                <div className="max-w-[92%] w-full flex gap-2">
                  <AgentOrb size={24} />
                  <div
                    className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl rounded-tl-sm px-3.5 py-2.5 shadow-sm"
                    style={{ borderLeft: '3px solid #009FE3' }}
                  >
                    {m.text && <FormattedMessage text={m.text} />}
                    {m.toolCalls?.map((tc, i) => <ToolResultCard key={i} name={tc.name} result={tc.result} onOpenInDatabase={onOpenInDatabase} onShowOnMap={onShowOnMap} onCreateRoute={onCreateRoute} />)}
                  </div>
                </div>
              </div>
            )
          ))}

          {thinking && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex gap-2 items-center">
                <AgentOrb size={24} spin="fast" />
                <span key={statusText} className="text-xs text-slate-400 italic animate-status-fade">{statusText}</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 focus-within:border-[#009FE3] rounded-full pl-4 pr-1.5 py-1.5 shadow-sm transition-colors">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Stel een vraag aan je agent..."
              className="flex-1 min-w-0 py-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400"
            />
            <button
              onClick={send}
              disabled={thinking || !input.trim()}
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-white disabled:opacity-40 transition-all disabled:grayscale"
              style={{ background: BRAND_GRADIENT }}
            >
              {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const ToolResultCard: React.FC<{
  name: string;
  result: any;
  onOpenInDatabase: (naam: string) => void;
  onShowOnMap: (b: any) => void;
  onCreateRoute: (b: any[]) => void;
}> = ({ name, result, onOpenInDatabase, onShowOnMap, onCreateRoute }) => {
  if (!result || result.error) return null;

  if ((name === 'zoek_bedrijven' || name === 'bedrijven_lijst') && Array.isArray(result.bedrijven)) {
    return (
      <div className="mt-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {name === 'bedrijven_lijst'
            ? `Bijgewerkte lijst · ${result.getoond} bedrijven`
            : `${result.totaal_gevonden} gevonden${result.getoond < result.totaal_gevonden ? `, ${result.getoond} getoond` : ''}`}
        </p>
        {result.bedrijven.map((b: any, i: number) => (
          <BedrijfMiniCard key={i} b={b} onOpenInDatabase={onOpenInDatabase} onShowOnMap={onShowOnMap} />
        ))}
        <RouteActions bedrijven={result.bedrijven} onCreateRoute={onCreateRoute} />
      </div>
    );
  }

  if (name === 'bedrijf_details' && result.gevonden) {
    return (
      <div className="mt-2.5">
        <BedrijfMiniCard b={result.bedrijf} onOpenInDatabase={onOpenInDatabase} onShowOnMap={onShowOnMap} />
        {result.vestigingen?.length > 0 && (
          <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{result.aantal_vestigingen} andere vestiging(en)</p>
            {result.vestigingen.map((v: any, i: number) => <BedrijfMiniCard key={i} b={v} onOpenInDatabase={onOpenInDatabase} onShowOnMap={onShowOnMap} compact />)}
          </div>
        )}
      </div>
    );
  }

  if (name === 'vergelijk_bedrijven' && Array.isArray(result.bedrijven)) {
    return (
      <div className="mt-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Columns className="w-3 h-3" /> Vergelijking</p>
        {result.bedrijven.map((b: any, i: number) => <BedrijfMiniCard key={i} b={b} onOpenInDatabase={onOpenInDatabase} onShowOnMap={onShowOnMap} />)}
      </div>
    );
  }

  if (name === 'plan_route') {
    if (!result.gelukt) return <p className="mt-2 text-xs text-slate-400 italic">{result.reden}</p>;
    return (
      <div className="mt-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Navigation className="w-3 h-3" /> Route · {result.totale_afstand_km} km totaal</p>
        {result.volgorde.map((s: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 h-5 flex-shrink-0 rounded-full bg-[#E85E26] text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <BedrijfMiniCard b={s} onOpenInDatabase={onOpenInDatabase} onShowOnMap={onShowOnMap} compact extra={`+${s.afstand_vorige_km} km`} />
            </div>
          </div>
        ))}
        <RouteActions bedrijven={result.volgorde} onCreateRoute={onCreateRoute} />
      </div>
    );
  }

  return null;
};

const BedrijfMiniCard: React.FC<{ b: any; onOpenInDatabase: (naam: string) => void; onShowOnMap: (b: any) => void; compact?: boolean; extra?: string }> = ({ b, onOpenInDatabase, onShowOnMap, compact, extra }) => {
  if (!b || b.gevonden === false) return <p className="text-xs text-slate-400 italic">"{b?.naam}" niet gevonden</p>;
  return (
    <div className={`bg-slate-50/70 border border-slate-200 rounded-lg ${compact ? 'p-2' : 'p-2.5'} flex items-start justify-between gap-2`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
          <Building2 className="w-3 h-3 text-slate-300 flex-shrink-0" /> {b.naam}
          {extra && <span className="text-[10px] font-normal text-slate-400">({extra})</span>}
        </p>
        <p className="text-[11px] text-slate-500 truncate">{[b.straat, b.stad].filter(Boolean).join(', ')}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onShowOnMap(b)} title="Toon op kaart" className="p-1.5 text-slate-400 hover:text-[#009FE3] hover:bg-slate-50 rounded"><MapPin className="w-3.5 h-3.5" /></button>
        <button onClick={() => onOpenInDatabase(b.naam)} title="Open in database" className="p-1.5 text-slate-400 hover:text-[#009FE3] hover:bg-slate-50 rounded"><ArrowRightCircle className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
};

export default AIAgentPanel;
