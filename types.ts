
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface GroundingMetadata {
  groundingChunks: GroundingChunk[];
  groundingSupports: any[];
  searchEntryPoint?: any;
}

export interface SearchResult {
  text: string;
  groundingMetadata?: GroundingMetadata;
}

export interface SearchState {
  isLoading: boolean;
  data: SearchResult | null;
  error: string | null;
}

// NEW: Structured types for fast discovery
export interface DiscoveredCompany {
    id: string; // unique ID based on name+city
    name: string;
    city: string;
    discoveredAt: string; // ISO Date string for reference
    _distanceKm?: number;
}

export interface DiscoveryResult {
    totalEstimatedMatches: number;
    companies: DiscoveredCompany[];
}

export interface EnrichedCompanyData {
    markdownContent: string;
    groundingChunks: GroundingChunk[];
}

// Branch Info for Deep Scan
export interface BranchInfo {
    address: string;
    city: string;
    isHeadOffice: boolean;
    country: string;
}

// AUTH TYPES
export interface User {
    id: string;
    username: string;
    email: string;
    password?: string; // In real app, never store plain text. Mocking for localstorage.
    avatarUrl?: string;
    themeColor?: string; // Hex code
    createdAt: number;
}