import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY as string;

// De publishable key is bewust veilig om in de client te bakken (net als de Google Maps-key
// elders in dit project) — toegang tot data wordt afgedwongen door Row Level Security in de
// database, niet door deze key geheim te houden.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
