
// DEPRECATED: This service is unreliable without a properly configured Google Cloud Billing Account and Maps JS API enabled key.
// We are switching to Gemini 'Info Scan' which uses the Search Tool to gather the same data more reliably for this use case.

import { BranchInfo } from "../types";

const GOOGLE_MAPS_API_KEY = process.env.API_KEY || ''; 

export interface PlaceResult {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  review_source?: string;
  reviews?: Array<{
    author_name: string;
    rating: number;
    relative_time_description: string;
    text: string;
    profile_photo_url?: string;
  }>;
  photos?: Array<{
    getUrl: (opts: { maxWidth: number; maxHeight?: number }) => string;
  }>;
  url?: string;
  
  // New rich data fields
  team_members?: Array<{
    name: string;
    role: string;
    email?: string;
    phone?: string;
  }>;
  recent_projects?: Array<{
    name: string;
    description: string;
    year?: string;
  }>;
  branches?: BranchInfo[];
}

// Stub function to maintain type safety but warn if called
export const getPlaceDetails = async (companyName: string, city: string): Promise<PlaceResult> => {
    console.warn("getPlaceDetails is deprecated. Use generateDeepScan instead.");
    throw new Error("Google Maps API Service is deprecated.");
};
