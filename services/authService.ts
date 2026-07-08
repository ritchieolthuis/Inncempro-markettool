
import { User, DiscoveredCompany, CompanyList } from "../types";

const USERS_KEY = "inncempro_users_db";
const CURRENT_USER_KEY = "inncempro_current_session";
const FAVS_PREFIX = "inncempro_favs_";
const LISTS_PREFIX = "inncempro_lists_";

// PERMANENTE DATABASE GEBRUIKERS (Hardcoded)
const PERMANENT_USERS: User[] = [
    {
        id: "perm_db_01",
        username: "Inncempro",
        email: "info@inncempro.nl",
        password: "inncempro", // Eenvoudig wachtwoord voor gebruiksgemak
        avatarUrl: "https://www.inncempro.nl/wp-content/uploads/2018/06/Logo-Inncempro-facebook.png",
        themeColor: "#E85E26",
        createdAt: 1700000000000
    }
];

// Helper to generate ID
const generateId = () => Math.random().toString(36).substr(2, 9);

export const authService = {
    // REGISTER
    register: (username: string, email: string, password: string): User => {
        const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
        
        // Check duplicates including permanent users
        const allUsers = [...PERMANENT_USERS, ...users];
        const exists = allUsers.find(u => 
            u.username.toLowerCase() === username.trim().toLowerCase() || 
            u.email.toLowerCase() === email.trim().toLowerCase()
        );

        if (exists) {
            throw new Error("Gebruikersnaam of e-mailadres bestaat al in de database.");
        }

        const newUser: User = {
            id: generateId(),
            username: username.trim(),
            email: email.trim(),
            password: password, // In production, hash this!
            avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${username}`,
            themeColor: "#009FE3",
            createdAt: Date.now()
        };

        users.push(newUser);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        return newUser;
    },

    // LOGIN
    login: (identifier: string, password: string): User => {
        const localUsers: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
        const allUsers = [...PERMANENT_USERS, ...localUsers];
        
        // Find user by email OR username (case insensitive)
        const user = allUsers.find(u => 
            (u.username.toLowerCase() === identifier.trim().toLowerCase() || 
             u.email.toLowerCase() === identifier.trim().toLowerCase()) &&
            u.password === password
        );

        if (!user) {
            throw new Error("Ongeldige inloggegevens. Probeer gebruiker 'Inncempro' met wachtwoord 'inncempro'.");
        }

        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
    },

    // LOGOUT
    logout: () => {
        localStorage.removeItem(CURRENT_USER_KEY);
    },

    // GET CURRENT SESSION
    getCurrentUser: (): User | null => {
        const stored = localStorage.getItem(CURRENT_USER_KEY);
        return stored ? JSON.parse(stored) : null;
    },

    // UPDATE PROFILE
    updateProfile: (userId: string, updates: Partial<User>): User => {
        // Check if permanent user (read-only for core details usually, but allowed here for session)
        const isPermanent = PERMANENT_USERS.some(u => u.id === userId);
        
        if (isPermanent) {
             const current = authService.getCurrentUser();
             if (!current) throw new Error("Niet ingelogd");
             const updated = { ...current, ...updates };
             localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
             return updated;
        }

        const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
        const index = users.findIndex(u => u.id === userId);
        
        if (index === -1) throw new Error("Gebruiker niet gevonden.");

        const updatedUser = { ...users[index], ...updates };
        users[index] = updatedUser;
        
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        
        // Update session if it's the current user
        const current = authService.getCurrentUser();
        if (current && current.id === userId) {
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
        }

        return updatedUser;
    },

    // FAVORITES (Linked to User ID)
    getFavorites: (userId: string): DiscoveredCompany[] => {
        const key = `${FAVS_PREFIX}${userId}`;
        return JSON.parse(localStorage.getItem(key) || "[]");
    },

    toggleFavorite: (userId: string, company: DiscoveredCompany): DiscoveredCompany[] => {
        const key = `${FAVS_PREFIX}${userId}`;
        const favs = authService.getFavorites(userId);
        const isSame = (c: DiscoveredCompany) =>
            c.name === company.name && c.city === company.city;
        const exists = favs.find(isSame);

        let newFavs;
        if (exists) {
            newFavs = favs.filter(c => !isSame(c));
        } else {
            newFavs = [...favs, company];
        }

        localStorage.setItem(key, JSON.stringify(newFavs));
        return newFavs;
    },

    // LISTS (meerdere naam-lijsten met bedrijven, gekoppeld aan User ID)
    getLists: (userId: string): CompanyList[] => {
        const key = `${LISTS_PREFIX}${userId}`;
        return JSON.parse(localStorage.getItem(key) || "[]");
    },

    saveLists: (userId: string, lists: CompanyList[]) => {
        localStorage.setItem(`${LISTS_PREFIX}${userId}`, JSON.stringify(lists));
    },

    createList: (userId: string, name: string): CompanyList[] => {
        const lists = authService.getLists(userId);
        const newList: CompanyList = { id: generateId(), name: name.trim(), createdAt: Date.now(), companies: [] };
        const next = [...lists, newList];
        authService.saveLists(userId, next);
        return next;
    },

    renameList: (userId: string, listId: string, name: string): CompanyList[] => {
        const next = authService.getLists(userId).map(l => l.id === listId ? { ...l, name: name.trim() } : l);
        authService.saveLists(userId, next);
        return next;
    },

    deleteList: (userId: string, listId: string): CompanyList[] => {
        const next = authService.getLists(userId).filter(l => l.id !== listId);
        authService.saveLists(userId, next);
        return next;
    },

    addToList: (userId: string, listId: string, company: DiscoveredCompany): CompanyList[] => {
        const isSame = (c: DiscoveredCompany) => c.name === company.name && c.city === company.city;
        const next = authService.getLists(userId).map(l => {
            if (l.id !== listId || l.companies.some(isSame)) return l;
            return { ...l, companies: [...l.companies, company] };
        });
        authService.saveLists(userId, next);
        return next;
    },

    removeFromList: (userId: string, listId: string, company: DiscoveredCompany): CompanyList[] => {
        const isSame = (c: DiscoveredCompany) => c.name === company.name && c.city === company.city;
        const next = authService.getLists(userId).map(l => l.id === listId ? { ...l, companies: l.companies.filter(c => !isSame(c)) } : l);
        authService.saveLists(userId, next);
        return next;
    }
};
