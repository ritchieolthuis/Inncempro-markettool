// Groq (console.groq.com) — gratis, geen creditcard, ruime rate-limits, OpenAI-compatibele
// API. Gekozen i.p.v. Gemini omdat de gratis Gemini-laag te snel een limiet raakte, en
// i.p.v. een lokale Ollama-server omdat deze app door meerdere collega's op verschillende
// machines gebruikt wordt — een cloud-key werkt voor iedereen, "localhost" niet.
const apiKey = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export function hasApiKey(): boolean {
  return !!apiKey;
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'zoek_bedrijven',
      description: 'Zoek bedrijven in de Inncempro-database op naam, stad, provincie, type of bron. Gebruik dit voor elke zoekvraag ("welke architecten zitten er in Rotterdam", "zoek bouwbedrijven in Overijssel", etc). Resultaten worden willekeurig gekozen uit alle matches, dus een herhaalde oproep met dezelfde filters kan andere bedrijven opleveren.',
      parameters: {
        type: 'object',
        properties: {
          zoekterm: { type: 'string', description: 'Vrije zoektekst (bedrijfsnaam, straat, e-mail, etc.)' },
          stad: { type: 'string' },
          provincie: { type: 'string' },
          type: { type: 'string', enum: ['architecten', 'bouwbedrijven', 'aannemers', 'materialen'] },
          bron: { type: 'string', description: 'Bv. Bouwgarant, Architectenweb, Stiho, Jongeneel, PontMeyer, Van Wijnen' },
          max: { type: 'number', description: 'Max aantal resultaten, standaard 10' },
          exclude_namen: { type: 'array', items: { type: 'string' }, description: 'Namen die NIET in het resultaat mogen — gebruik dit als de gebruiker een eerder getoond bedrijf wil vervangen of "een andere" wil i.p.v. een specifiek bedrijf.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bedrijf_details',
      description: 'Haal volledige details van één specifiek bedrijf op, inclusief alle andere vestigingen/locaties van dat bedrijf. Gebruik dit als de gebruiker vraagt naar contactgegevens of "welke vestigingen heeft X".',
      parameters: {
        type: 'object',
        properties: { naam: { type: 'string', description: 'De (deel van de) bedrijfsnaam' } },
        required: ['naam'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vergelijk_bedrijven',
      description: 'Vergelijk 2 tot 4 bedrijven naast elkaar op contactgegevens, adres en specialisaties.',
      parameters: {
        type: 'object',
        properties: { namen: { type: 'array', items: { type: 'string' }, description: '2 tot 4 bedrijfsnamen' } },
        required: ['namen'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bedrijven_lijst',
      description: 'Haal een specifieke lijst bedrijven op bij exacte naam (geen zoekfilter). Gebruik dit NA het vervangen van een bedrijf in een al getoonde lijst of route: roep dit aan met ALLE namen van de bijgewerkte lijst (de oude namen min de vervangene, plus de nieuwe vervanger), zodat de volledige lijst opnieuw verschijnt met "Route op kaart"/"Google Maps"-knoppen — zo werkt de gebruiker zijn bestaande route bij i.p.v. een nieuwe te beginnen.',
      parameters: {
        type: 'object',
        properties: { namen: { type: 'array', items: { type: 'string' }, description: 'Alle bedrijfsnamen die in de bijgewerkte lijst moeten staan, in gewenste volgorde' } },
        required: ['namen'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_route',
      description: 'Plan een geoptimaliseerde bezoekroute (nearest-neighbour volgorde vanaf een startpunt) langs bedrijven in een stad of provincie. Gebruik dit voor elke route-vraag — geeft een ECHTE volgorde met afstanden terug, geen willekeurige lijst.',
      parameters: {
        type: 'object',
        properties: {
          locatie: { type: 'string', description: 'Stad of regio om de route in te plannen' },
          type: { type: 'string', enum: ['architecten', 'bouwbedrijven', 'aannemers', 'materialen'] },
          max_stops: { type: 'number', description: 'Maximaal aantal stops, standaard 8' },
          start_adres: { type: 'string', description: 'Optioneel startpunt als dit afwijkt van locatie' },
        },
        required: ['locatie'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'zet_status',
      description: 'Zet de contactstatus van een bedrijf (bezocht, gebeld, geen interesse, warme lead).',
      parameters: {
        type: 'object',
        properties: {
          naam: { type: 'string' },
          status: { type: 'string', enum: ['bezocht', 'gebeld', 'geen_interesse', 'warme_lead'] },
        },
        required: ['naam', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'voeg_notitie_toe',
      description: 'Voeg een notitie toe aan een bedrijf.',
      parameters: {
        type: 'object',
        properties: { naam: { type: 'string' }, notitie: { type: 'string' } },
        required: ['naam', 'notitie'],
      },
    },
  },
];

const SYSTEM_INSTRUCTION = `Je bent de Inncempro AI-assistent, ingebouwd in een market intelligence tool voor de bouwsector.
Je hebt via tools toegang tot de volledige lokale database van 3.972+ bedrijven (architecten, bouwbedrijven, aannemers, bouwmaterialen).
Gebruik ALTIJD de beschikbare tools om vragen te beantwoorden — verzin nooit zelf bedrijfsgegevens.
Antwoord kort, zakelijk en in het Nederlands zonder markdown-opmaak (geen ** of #, gewoon platte tekst met genummerde regels waar nodig).
Bij een route: noem de volgorde en totale afstand.
Als een tool aangeeft dat iets niet gevonden is, zeg dat eerlijk in plaats van iets te verzinnen.

VERVANGEN VAN EEN RESULTAAT ("ik wil een andere voor X", "vervang X", "niet deze, een andere" — ook
binnen een route die net op de kaart staat): dit betekent NOOIT dat je moet zoeken naar bedrijven die
niet "X" heten of niet op X's adres zitten — dat levert altijd 0 resultaten op. Het betekent: de
gebruiker wil in de al getoonde lijst/route het bedrijf X inruilen voor een ANDER, nog niet genoemd
bedrijf uit dezelfde eerdere zoekopdracht (zelfde stad/type/filters). Doe dit in TWEE stappen:
1. Roep zoek_bedrijven aan met dezelfde filters als de vorige keer, zet ALLE namen die al in de vorige
   lijst stonden (inclusief X) in exclude_namen, en max op 1 (of het aantal dat vervangen moet worden) —
   dit levert de vervanger op.
2. Roep DAARNA bedrijven_lijst aan met de VOLLEDIGE bijgewerkte naamlijst (de oude namen min X, plus de
   nieuwe vervanger, in dezelfde volgorde). Dit toont de complete lijst opnieuw als kaart met een werkende
   "Route op kaart"/"Google Maps"-knop — zo kan de gebruiker met één klik de HELE (route)selectie bijwerken
   i.p.v. dat er een aparte nieuwe route met alleen de vervanger ontstaat.
Sla stap 2 nooit over als de gebruiker meer dan één bedrijf in de lijst/route had — zonder bedrijven_lijst
verliest de gebruiker de rest van zijn route zodra hij op de knop klikt.
Benoem in je antwoord expliciet welk bedrijf is vervangen door welk nieuw bedrijf.`;

export interface ToolExecutor {
  (name: string, args: Record<string, unknown>): unknown;
}

// Houdt de gespreksgeschiedenis bij in het OpenAI-berichtenformaat dat Groq verwacht.
export class Chat {
  messages: any[] = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
}

export function createAgentChat(): Chat {
  return new Chat();
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGroqOnce(messages: any[]): Promise<any> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
    }),
  });
  if (!res.ok) {
    let errMsg = `Groq API fout (${res.status})`;
    let errCode = '';
    try {
      const errJson = await res.json();
      errMsg = errJson?.error?.message || errMsg;
      errCode = errJson?.error?.code || '';
    } catch { /* response body was not JSON */ }
    const err = new Error(errMsg) as Error & { code?: string };
    err.code = errCode;
    throw err;
  }
  return res.json();
}

// Bij ingewikkelde tool-argumenten (bv. een array als exclude_namen) genereert het model
// af en toe een net niet-valide function-call ("tool_use_failed" / "Failed to call a
// function") — een bekende, meestal eenmalige hik van Groq's function calling. Zonder
// retry ziet de gebruiker dan een technische foutmelding terwijl een nieuwe poging het
// vrijwel altijd wel goed doet.
async function callGroq(messages: any[]): Promise<any> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await callGroqOnce(messages);
    } catch (e: any) {
      const isToolCallGlitch = e?.code === 'tool_use_failed' || /failed to call a function/i.test(e?.message || '');
      if (!isToolCallGlitch || attempt === 2) throw e;
      await delay(400 * (attempt + 1));
    }
  }
}

export interface AgentTurnResult {
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
}

// Voert een volledige beurt uit: stuurt het bericht, handelt eventuele tool calls lokaal
// af via `executeTool`, en stuurt de resultaten terug tot het model met platte tekst
// antwoordt (met een limiet zodat een gekke lus niet oneindig doorgaat).
export async function runAgentTurn(chat: Chat, message: string, executeTool: ToolExecutor): Promise<AgentTurnResult> {
  chat.messages.push({ role: 'user', content: message });
  const toolCalls: AgentTurnResult['toolCalls'] = [];

  let iterations = 0;
  while (iterations < 6) {
    iterations++;
    const data = await callGroq(chat.messages);
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Geen antwoord ontvangen van Groq');

    chat.messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name || '';
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* malformed args from model */ }
        let result: unknown;
        try {
          result = executeTool(name, args);
        } catch (e: any) {
          result = { error: e?.message || 'Onbekende fout bij uitvoeren van tool' };
        }
        toolCalls.push({ name, args, result });
        chat.messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue; // laat het model reageren op de tool-resultaten
    }

    return { text: msg.content || '', toolCalls };
  }

  return { text: 'Kon geen antwoord genereren (te veel tool-aanroepen achter elkaar).', toolCalls };
}
