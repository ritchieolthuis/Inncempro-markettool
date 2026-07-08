import Groq from "groq-sdk";
import { DiscoveryResult, EnrichedCompanyData } from "../types";
import { PlaceResult } from "./googleMapsService";

const apiKey = import.meta.env.VITE_GROQ_API_KEY;

let _groq: Groq | null = null;
const getGroq = (): Groq => {
  if (!_groq) {
    if (!apiKey) console.warn("VITE_GROQ_API_KEY is not set — AI search unavailable.");
    _groq = new Groq({ apiKey: apiKey || 'no-key', dangerouslyAllowBrowser: true });
  }
  return _groq;
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ROBUUSTE RETRY LOGICA (Exponential Backoff)
// Voorkomt dat het systeem crasht bij 429 errors, maar wacht rustig af.
async function generateWithRetry(modelCall: () => Promise<any>, retries = 5): Promise<any> {
    for (let i = 0; i <= retries; i++) {
        try {
            return await modelCall();
        } catch (error: any) {
            const errString = JSON.stringify(error);
            const isRateLimit = error.status === 429 || error.code === 429 || errString.includes('429') || errString.includes('Quota') || errString.includes('RESOURCE_EXHAUSTED');

            if (isRateLimit) {
                 // Wacht exponentieel langer: 2s, 4s, 8s, 16s...
                 const waitTime = Math.pow(2, i + 1) * 1000;
                 console.warn(`API Limiet bereikt (poging ${i+1}/${retries}). Wacht ${waitTime/1000}s en probeer opnieuw...`);
                 await delay(waitTime);
                 continue; // Probeer opnieuw
            }

            // Bij andere errors (of als retries op zijn) stoppen we wel, maar returnen null zodat de app niet crasht
            if (i === retries) {
                console.error("Max retries bereikt voor API call.");
                return null;
            }
            throw error;
        }
    }
    return null;
}

/**
 * FASE 1: ONTDEKKING (DISCOVERY)
 */
export const performDiscoverySearch = async (
    types: string[],
    regions: string[],
    specs: string[],
    otherFilters: string[]
): Promise<DiscoveryResult> => {
    try {
        const locationStr = regions.includes("Heel Nederland") ? "Nederland" : regions.join(" en ");
        const query = `Zoek naar best beoordeelde ${types.join(' of ')} in ${locationStr}. Focus op Google Reviews > 3.5.`;

        const prompt = `
        ZOEKOPDRACHT: ${query}
        Extra filters: ${specs.join(', ')} ${otherFilters.join(' ')}

        DOEL: Genereer 10-15 relevante bedrijven.

        JSON ONLY:
        {
            "companies": [
                { "name": "Exacte Naam", "city": "Stad" }
            ]
        }
        `;

        const response = await generateWithRetry(() => getGroq().chat.completions.create({
            model: 'mixtral-8x7b-32768',
            messages: [{ role: 'user', content: prompt }],
        }));

        if (response && response.choices?.[0]?.message?.content) {
             let cleanText = response.choices[0].message.content;
             cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
             const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
             if (jsonMatch) cleanText = jsonMatch[0];

             try {
                 const data = JSON.parse(cleanText) as DiscoveryResult;
                 const timestamp = new Date().toISOString();

                 let filteredCompanies = data.companies || [];
                 filteredCompanies = filteredCompanies.map(c => ({
                     ...c,
                     id: `${c.name}-${c.city}`.replace(/\s+/g, '-').toLowerCase(),
                     discoveredAt: timestamp
                 }));

                 return {
                     totalEstimatedMatches: filteredCompanies.length,
                     companies: filteredCompanies
                 };
             } catch (e) {
                 console.error("JSON Parsing failed in Discovery", e);
             }
        }
        return { totalEstimatedMatches: 0, companies: [] };
    } catch (error: any) {
        console.error("Discovery Search Failed:", error);
        throw error;
    }
};

/**
 * FASE 2: BATCH VERRIJKING
 */
export const enrichBatchCompanies = async (companies: {name: string, city: string, id: string}[]): Promise<Record<string, EnrichedCompanyData>> => {
    try {
        if (companies.length === 0) return {};

        const listStr = companies.map((c, i) => `${i+1}. ${c.name} in ${c.city}`).join('\n');

        const prompt = `
            VERRIJK DATA SNEL VOOR:
            ${listStr}

            INSTRUCTIE:
            1. Zoek exacte Google Maps naam en ADRES (Straat + Huisnummer is verplicht!).
            2. Als Maps adres mist -> Check website contact pagina.

            RETURN JSON LIST ONLY:
            [
                {
                    "markdownContent": "### [Exacte Naam]\nLINKS: [Website](URL) | [Route](https://maps.google.com/?q=[Naam]+[Stad]) | [Tel](tel:...) | [Info Scan](action:deepscan:...)\n* Adres: [STRAAT + NR + STAD]\n* Rating: [Score] ([Aantal]) - Bron: Google Maps"
                }
            ]
        `;

        const response = await generateWithRetry(() => getGroq().chat.completions.create({
            model: 'mixtral-8x7b-32768',
            messages: [{ role: 'user', content: prompt }],
        }));

        const results: Record<string, EnrichedCompanyData> = {};

        if (!response) return {}; // Fail silently if max retries reached

        let cleanText = response.choices?.[0]?.message?.content || '';
        cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleanText.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
            try {
                const parsedList = JSON.parse(jsonMatch[0]);
                companies.forEach((company, index) => {
                    if (parsedList[index] && parsedList[index].markdownContent) {
                        let content = parsedList[index].markdownContent;

                        if (!content.includes('http') || content.includes('ZOEK')) {
                             const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(company.name + ' ' + company.city)}`;
                             content = content.replace(/LINKS:.*?(\n|$)/, `LINKS: [Website](${searchUrl}) | [Route](https://maps.google.com/?q=${encodeURIComponent(company.name + ' ' + company.city)}) | [Info Scan](action:deepscan:${company.name})\n`);
                        }

                        content = content.replace('action:deepscan:...', `action:deepscan:${company.name}`);

                        results[company.id] = {
                            markdownContent: content,
                            groundingChunks: []
                        };
                    }
                });
            } catch (e) {
                console.error("Batch parsing failed", e);
            }
        }
        return results;

    } catch (error) {
        console.error("Batch Enrichment Failed", error);
        throw error;
    }
};

// Legacy single enrich (kept for fallback)
export const enrichCompanyData = async (companyName: string, city: string): Promise<EnrichedCompanyData> => {
    return (await enrichBatchCompanies([{name: companyName, city, id: 'single'}]))['single'] || { markdownContent: '', groundingChunks: [] };
};

/**
 * FASE 3: INFO SCAN (DEEP DIVE)
 */
export const generateDeepScan = async (companyName: string, city: string): Promise<PlaceResult> => {
  try {
      const prompt = `
          RAPPORT: "${companyName}" (${city}).

          ZOEK:
          1. Reviews (Score + Aantal)
          2. LinkedIn (Pagina)
          3. Contact (Email, Tel, Team)
          4. Projecten (Recent)
          5. Vestigingen

          JSON ONLY:
          {
            "name": "${companyName}",
            "formatted_address": "...",
            "formatted_phone_number": "...",
            "website": "...",
            "rating": 0.0,
            "user_ratings_total": 0,
            "review_source": "Google Maps",
            "reviews": [],
            "team_members": [
                { "name": "Naam", "role": "Functie", "email": "...", "phone": "..." }
            ],
            "recent_projects": [
                { "name": "Project", "description": "Info", "year": "202X" }
            ],
            "branches": [
                { "address": "...", "city": "...", "isHeadOffice": true, "country": "Nederland" }
            ],
            "url": "https://www.google.com/search?q=${encodeURIComponent(companyName + ' ' + city + ' reviews')}"
          }
          `;

      const response = await generateWithRetry(() => getGroq().chat.completions.create({
          model: 'mixtral-8x7b-32768',
          messages: [{ role: 'user', content: prompt }],
      }));

      if (response && response.choices?.[0]?.message?.content) {
          let jsonString = response.choices[0].message.content;
          jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
          const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
          if (jsonMatch) jsonString = jsonMatch[0];

          try {
              const data = JSON.parse(jsonString) as PlaceResult;
              if (!data.url) data.url = `https://www.google.com/search?q=${encodeURIComponent(companyName + ' ' + city + ' reviews')}`;
              return data;
          } catch (e) {
              return {
                  name: companyName,
                  formatted_address: "Adres niet gevonden",
                  rating: 0,
                  user_ratings_total: 0,
                  review_source: "Error",
                  url: `https://www.google.com/search?q=${encodeURIComponent(companyName + ' ' + city + ' reviews')}`
              };
          }
      }
      throw new Error("Geen data");
  } catch (error) {
      throw error;
  }
};
