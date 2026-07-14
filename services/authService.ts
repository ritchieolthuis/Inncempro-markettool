
import { supabase } from './supabaseClient';
import { User, DiscoveredCompany, CompanyList } from "../types";

// Kleine offline-cache: bewaart de laatst opgehaalde profiel/favorieten/lijsten-data lokaal,
// zodat een pagina-load zonder netwerk niet met een lege/kapotte staat eindigt maar gewoon de
// laatst bekende stand toont. Wordt overschreven zodra een echte netwerk-fetch weer lukt.
function cacheGet<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function cacheSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage vol/geblokkeerd, negeren */ }
}

// Zet een Supabase Auth-user + profielrij om naar het bestaande User-type, zodat de rest van
// de app (App.tsx) met hetzelfde object blijft werken als voorheen. Bij een mislukte
// (offline) profiel-fetch valt dit terug op de laatst gecachete profielgegevens voor dit
// account, zodat inloggen-op-bestaande-sessie ook zonder netwerk gewoon username/avatar/rol
// toont in plaats van "Gebruiker" met lege velden.
async function toAppUser(authUser: { id: string; email?: string; created_at: string }): Promise<User> {
  const cacheKey = `inncempro_profile_cache_${authUser.id}`;
  let profile: any = null;
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (error) throw error;
    profile = data;
    if (profile) cacheSet(cacheKey, profile);
  } catch {
    profile = cacheGet(cacheKey, null);
  }
  return {
    id: authUser.id,
    username: profile?.username || authUser.email?.split('@')[0] || 'Gebruiker',
    email: authUser.email || '',
    avatarUrl: profile?.avatar_url || undefined,
    role: profile?.role || undefined,
    themeColor: profile?.theme_color || '#009FE3',
    createdAt: new Date(authUser.created_at).getTime(),
  };
}

const isEmail = (s: string) => s.includes('@');

export const authService = {
    // REGISTER
    register: async (username: string, email: string, password: string): Promise<User> => {
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { username: username.trim() } },
        });
        if (error) {
            if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
                throw new Error('Gebruikersnaam of e-mailadres bestaat al.');
            }
            throw new Error(error.message);
        }
        if (!data.user) throw new Error('Registratie mislukt.');
        return toAppUser(data.user as any);
    },

    // LOGIN — op gebruikersnaam OF e-mail, net als voorheen. Supabase Auth logt alleen op
    // e-mail in, dus bij een gebruikersnaam wordt eerst het bijbehorende e-mailadres opgezocht
    // via de get_email_by_username-functie in de database.
    login: async (identifier: string, password: string): Promise<User> => {
        const trimmed = identifier.trim();
        let email = trimmed;
        if (!isEmail(trimmed)) {
            const { data: foundEmail } = await supabase.rpc('get_email_by_username', { lookup_username: trimmed });
            if (!foundEmail) throw new Error("Ongeldige inloggegevens. Probeer gebruiker 'Inncempro' met wachtwoord 'inncempro'.");
            email = foundEmail;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) throw new Error("Ongeldige inloggegevens. Probeer gebruiker 'Inncempro' met wachtwoord 'inncempro'.");
        return toAppUser(data.user as any);
    },

    // LOGOUT
    logout: async (): Promise<void> => {
        await supabase.auth.signOut();
    },

    // GET CURRENT SESSION — leest de al aanwezige Supabase-sessie (persistSession: true),
    // zodat een eerder ingelogde gebruiker automatisch ingelogd blijft na een reload/herbezoek,
    // ook op een ander apparaat zodra daar met hetzelfde account wordt ingelogd.
    getCurrentUser: async (): Promise<User | null> => {
        const { data } = await supabase.auth.getSession();
        const authUser = data.session?.user;
        if (!authUser) return null;
        return toAppUser(authUser as any);
    },

    // UPDATE PROFILE
    updateProfile: async (userId: string, updates: Partial<User>): Promise<User> => {
        const profileUpdates: Record<string, any> = {};
        if (updates.username !== undefined) profileUpdates.username = updates.username;
        if (updates.avatarUrl !== undefined) profileUpdates.avatar_url = updates.avatarUrl;
        if (updates.themeColor !== undefined) profileUpdates.theme_color = updates.themeColor;
        if (Object.keys(profileUpdates).length > 0) {
            const { error } = await supabase.from('profiles').update(profileUpdates).eq('id', userId);
            if (error) throw new Error(error.message);
        }
        // E-mailadres wijzigen loopt via Supabase Auth zelf (niet de profiles-tabel) — dit
        // stuurt normaliter een bevestigingsmail naar het nieuwe adres.
        if (updates.email !== undefined) {
            const { error } = await supabase.auth.updateUser({ email: updates.email });
            if (error) throw new Error(error.message);
        }
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new Error('Niet ingelogd');
        return toAppUser(data.user as any);
    },

    // WACHTWOORD WIJZIGEN — geldt voor de ingelogde gebruiker zelf, blijft daarna net als
    // voorheen gewoon gelden (Supabase Auth bewaart dit permanent, niet in localStorage).
    changePassword: async (newPassword: string): Promise<void> => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw new Error(error.message);
    },

    // FAVORITES (per account, in Supabase)
    getFavorites: async (userId: string): Promise<DiscoveredCompany[]> => {
        const cacheKey = `inncempro_favorites_cache_${userId}`;
        const { data, error } = await supabase.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error || !data) return cacheGet(cacheKey, []);
        const mapped = data.map((f: any) => ({
            id: `${f.name}|${f.city}`,
            name: f.name,
            city: f.city,
            discoveredAt: f.discovered_at,
            ...(f.raw ? { _raw: f.raw } : {}),
        })) as any;
        cacheSet(cacheKey, mapped);
        return mapped;
    },

    toggleFavorite: async (userId: string, company: DiscoveredCompany): Promise<DiscoveredCompany[]> => {
        const name = company.name;
        const city = company.city || '';
        const { data: existing } = await supabase.from('favorites').select('id').eq('user_id', userId).eq('name', name).eq('city', city).maybeSingle();
        if (existing) {
            await supabase.from('favorites').delete().eq('id', existing.id);
        } else {
            await supabase.from('favorites').insert({
                user_id: userId, name, city,
                discovered_at: company.discoveredAt || new Date().toISOString(),
                raw: (company as any)._raw || null,
            });
        }
        return authService.getFavorites(userId);
    },

    // LISTS (meerdere naam-lijsten met bedrijven, gekoppeld aan User ID)
    getLists: async (userId: string): Promise<CompanyList[]> => {
        const cacheKey = `inncempro_lists_cache_${userId}`;
        const { data: lists, error } = await supabase.from('lists').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error || !lists) return cacheGet(cacheKey, []);
        const { data: companies } = await supabase.from('list_companies').select('*').in('list_id', lists.map((l: any) => l.id));
        const mapped = lists.map((l: any) => ({
            id: l.id,
            name: l.name,
            createdAt: new Date(l.created_at).getTime(),
            companies: (companies || [])
                .filter((c: any) => c.list_id === l.id)
                .map((c: any) => ({ id: `${c.name}|${c.city}`, name: c.name, city: c.city, discoveredAt: c.created_at, ...(c.raw ? { _raw: c.raw } : {}) })),
        })) as any;
        cacheSet(cacheKey, mapped);
        return mapped;
    },

    saveLists: async (_userId: string, _lists: CompanyList[]) => {
        // Niet meer nodig als losse call — elke create/rename/delete/add/remove hieronder
        // schrijft direct naar Supabase. Blijft als no-op staan zodat App.tsx niet per se elke
        // aanroep hoeft te verwijderen.
    },

    createList: async (userId: string, name: string): Promise<CompanyList[]> => {
        await supabase.from('lists').insert({ user_id: userId, name: name.trim() });
        return authService.getLists(userId);
    },

    renameList: async (userId: string, listId: string, name: string): Promise<CompanyList[]> => {
        await supabase.from('lists').update({ name: name.trim() }).eq('id', listId).eq('user_id', userId);
        return authService.getLists(userId);
    },

    deleteList: async (userId: string, listId: string): Promise<CompanyList[]> => {
        await supabase.from('lists').delete().eq('id', listId).eq('user_id', userId);
        return authService.getLists(userId);
    },

    addToList: async (userId: string, listId: string, company: DiscoveredCompany): Promise<CompanyList[]> => {
        await supabase.from('list_companies').insert({
            list_id: listId, name: company.name, city: company.city || '', raw: (company as any)._raw || null,
        });
        return authService.getLists(userId);
    },

    removeFromList: async (userId: string, listId: string, company: DiscoveredCompany): Promise<CompanyList[]> => {
        await supabase.from('list_companies').delete().eq('list_id', listId).eq('name', company.name).eq('city', company.city || '');
        return authService.getLists(userId);
    },

    // CRM-status/notitie per bedrijf, per account. bedrijfKey komt overeen met de bestaande
    // crmKey()-functie in App.tsx (naam|straat|stad, lowercase), zodat het opzoekgedrag exact
    // hetzelfde blijft als in de localStorage-versie.
    getCrmData: async (userId: string): Promise<Record<string, { statuses?: string[]; note?: string; updatedAt: number }>> => {
        const cacheKey = `inncempro_crm_cache_${userId}`;
        const { data, error } = await supabase.from('crm_data').select('*').eq('user_id', userId);
        if (error || !data) return cacheGet(cacheKey, {});
        const result: Record<string, any> = {};
        data.forEach((row: any) => {
            result[row.bedrijf_key] = { statuses: row.statuses || [], note: row.note || '', updatedAt: new Date(row.updated_at).getTime() };
        });
        cacheSet(cacheKey, result);
        return result;
    },

    upsertCrmData: async (userId: string, bedrijfKey: string, patch: { statuses?: string[]; note?: string }): Promise<void> => {
        await supabase.from('crm_data').upsert({
            user_id: userId,
            bedrijf_key: bedrijfKey,
            ...(patch.statuses !== undefined ? { statuses: patch.statuses } : {}),
            ...(patch.note !== undefined ? { note: patch.note } : {}),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,bedrijf_key' });
    },

    // Bezoekhistorie per account.
    getVisits: async (userId: string): Promise<any[]> => {
        const cacheKey = `inncempro_visits_cache_${userId}`;
        const { data, error } = await supabase.from('visits').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error || !data) return cacheGet(cacheKey, []);
        const mapped = data.map((v: any) => ({
            id: v.id, bedrijf_id: v.bedrijf_id, naam: v.naam, stad: v.stad || '', straat: v.straat || '',
            postcode: v.postcode || '', telefoon: v.telefoon || '', email: v.email || '',
            contactpersoon: v.contactpersoon || '', notitie: v.notitie || '', status: v.status,
            datum: v.datum, matched: v.matched, created_at: v.created_at,
        }));
        cacheSet(cacheKey, mapped);
        return mapped;
    },

    addVisit: async (userId: string, visit: Record<string, any>): Promise<void> => {
        const { id, created_at, ...rest } = visit;
        await supabase.from('visits').insert({ user_id: userId, ...rest });
    },

    addVisits: async (userId: string, visits: Record<string, any>[]): Promise<void> => {
        if (visits.length === 0) return;
        await supabase.from('visits').insert(visits.map(({ id, created_at, ...rest }) => ({ user_id: userId, ...rest })));
    },

    deleteVisit: async (userId: string, visitId: string): Promise<void> => {
        await supabase.from('visits').delete().eq('id', visitId).eq('user_id', userId);
    },
};
