
import { GoogleGenAI } from "@google/genai";
import { DiscoveryResult, EnrichedCompanyData } from "../types";
import { PlaceResult } from "./googleMapsService";

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is not defined in the environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Helper for delay - REDUCED for speed
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(modelCall: () => Promise<any>, retries = 0): Promise<any> {
    for (let i = 0; i <= retries; i++) {
        try {
            return await modelCall();
        } catch (error: any) {
            const errString = JSON.stringify(error);
            // If quota exceeded, stop immediately (don't retry to avoid ban)
            if (error.status === 429 || errString.includes('429') || errString.includes('Quota') || errString.includes('RESOURCE_EXHAUSTED')) {
                 throw error; 
            }
            if (i === retries) return null;
            await delay(1000); 
        }
    }
    return null;
}

/**
 * FASE 1: ONTDEKKING (DISCOVERY)
 * Versimpeld voor betrouwbaarheid en snelheid.
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
        
        // Simplified prompt for speed
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

        const response = await generateWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        }));

        if (response && response.text) {
             let cleanText = response.text;
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
 * FASE 2: BATCH VERRIJKING (SPEED & QUALITY FOCUS)
 * Focus: Google Maps Data EERST.
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

        const response = await generateWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        }));

        const results: Record<string, EnrichedCompanyData> = {};
        let cleanText = response?.text || '';
        cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                const parsedList = JSON.parse(jsonMatch[0]);
                companies.forEach((company, index) => {
                    if (parsedList[index] && parsedList[index].markdownContent) {
                        let content = parsedList[index].markdownContent;
                        
                        // Fallback logic ensured
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

      const response = await generateWithRetry(() => ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
              tools: [{ googleSearch: {} }],
          }
      }));

      if (response && response.text) {
          let jsonString = response.text;
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
