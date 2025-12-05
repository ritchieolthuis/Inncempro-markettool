
import { GoogleGenAI } from "@google/genai";
import { DiscoveryResult, EnrichedCompanyData } from "../types";
import { PlaceResult } from "./googleMapsService";

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is not defined in the environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Helper for delay - REDUCED TO MINIMUM
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(modelCall: () => Promise<any>, retries = 1): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            return await modelCall();
        } catch (error: any) {
            // If quota exceeded, stop immediately (don't retry to avoid ban)
            if (error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('Quota')))) {
                 throw error; 
            }
            console.warn(`API Attempt ${i+1} failed. Retrying...`);
            await delay(1000); 
        }
    }
    return null;
}

/**
 * FASE 1: ONTDEKKING (DISCOVERY)
 * Doel: Vind de grootste en best beoordeelde bedrijven.
 */
export const performDiscoverySearch = async (
    types: string[], 
    regions: string[], 
    specs: string[],
    otherFilters: string[]
): Promise<DiscoveryResult> => {
    try {
        const locationContext = regions.includes("Heel Nederland") ? "Nederland" : `${regions.join(' ')}, Nederland`;
        
        // QUERY OPTIMALISATIE VOOR RANKING
        const searchQuery = `Lijst van ${types.join(' en ')} in ${locationContext} ${specs.length > 0 ? `specialisatie ${specs.join(', ')}` : ''} ${otherFilters.join(' ')}`;
        
        // ZEER KORTE PROMPT VOOR SNELHEID
        const prompt = `
        ZOEKOPDRACHT: "${searchQuery}"
        
        ACTIE:
        1. Zoek naar de top 50 meest relevante bedrijven via Google Search.
        2. Sorteer op: 1) Bekendheid/Grootte, 2) Google Reviews.
        3. Geef een JSON lijst terug.
        
        OUTPUT (JSON ONLY):
        {
            "totalEstimatedMatches": 50,
            "companies": [
                { "name": "Naam", "city": "Stad" }
            ]
        }
        `;

        const response = await generateWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash', // Flash model is fastest
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        }));

        if (response && response.text) {
             let cleanText = response.text;
             // Robust cleanup
             cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
             const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
             if (jsonMatch) cleanText = jsonMatch[0];

             try {
                 const data = JSON.parse(cleanText) as DiscoveryResult;
                 data.companies = data.companies.map(c => ({
                     ...c,
                     id: `${c.name}-${c.city}`.replace(/\s+/g, '-').toLowerCase()
                 }));
                 return data;
             } catch (e) {
                 console.error("JSON Parsing failed in Discovery", e);
             }
        }
        return { totalEstimatedMatches: 0, companies: [] };
    } catch (error) {
        console.error("Discovery Search Failed:", error);
        throw error; 
    }
};

/**
 * FASE 2: SNELLE VERRIJKING (FAST ENRICHMENT) - TURBO MODE
 * Doel: Haal ALLEEN harde data op (Adres, Rating, Site).
 * GEEN tekstgeneratie, GEEN samenvatting, GEEN marketingpraat.
 */
export const enrichCompanyData = async (companyName: string, city: string): Promise<EnrichedCompanyData> => {
    try {
        // ULTRA-KORTE PROMPT
        const prompt = `
            DATA EXTRACTIE VOOR: "${companyName}" in "${city}".
            
            ZOEK: Google Knowledge Panel info.
            
            OUTPUT (MARKDOWN):
            ### ${companyName}
            LINKS: [Website](ZOEK) | [Route](ZOEK) | [Bel](ZOEK) | [Email](NA) | [Team](NA) | [LinkedIn](NA) | [Reviews](https://www.google.com/search?q=${encodeURIComponent(companyName + ' ' + city + ' reviews')}) | [Info Scan](action:deepscan:${companyName})
            * Adres: [Adres uit snippet]
            * Rating: [Score] ([Aantal] reviews) - Bron: Google Maps
            `;

        const response = await generateWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }], // Use search tool to get real address/rating
            }
        }));

        let content = response?.text || '';
        
        // Fallback for Website/Route if AI puts "ZOEK" placeholder or fails
        if (content.includes('](ZOEK)') || content.includes('](NA)')) {
            content = content
                .replace('(ZOEK)', `(https://www.google.com/search?q=${encodeURIComponent(companyName + ' ' + city + ' website')}&btnI=1)`) // I'm Feeling Lucky style
                .replace('(ZOEK)', `(https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(companyName + ' ' + city)})`);
        }

        return {
            markdownContent: content,
            groundingChunks: response?.candidates?.[0]?.groundingMetadata?.groundingChunks || []
        };
    } catch (error) {
        return { markdownContent: '', groundingChunks: [] };
    }
};

/**
 * FASE 3: INFO SCAN (DEEP DIVE)
 * Hier mag het iets langer duren voor kwaliteit.
 */
export const generateDeepScan = async (companyName: string, city: string): Promise<PlaceResult> => {
  try {
      const prompt = `
          DATA RAPPORT: "${companyName}" (${city}).
          
          ZOEKSTAPPEN:
          1. "${companyName} ${city} reviews google" -> Rating.
          2. "site:linkedin.com ${companyName}" -> LinkedIn Page.
          3. "${companyName} team contact" -> Email & Sleutelfiguren.
          4. "${companyName} projecten" -> Recent werk.

          OUTPUT JSON:
          {
            "name": "${companyName}",
            "formatted_address": "...",
            "formatted_phone_number": "...",
            "website": "...",
            "rating": 0.0, 
            "user_ratings_total": 0,
            "review_source": "Google Maps/Trustoo",
            "reviews": [], 
            "team_members": [
                { "name": "Naam", "role": "Rol", "email": "...", "phone": "..." }
            ],
            "recent_projects": [
                { "name": "Project", "description": "Info", "year": "202X" }
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
              // Fallback
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
