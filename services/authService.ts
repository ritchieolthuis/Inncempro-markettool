
import { User, DiscoveredCompany } from "../types";

const USERS_KEY = "inncempro_users_db";
const CURRENT_USER_KEY = "inncempro_current_session";
const FAVS_PREFIX = "inncempro_favs_";

// Helper to generate ID
const generateId = () => Math.random().toString(36).substr(2, 9);

export const authService = {
    // REGISTER
    register: (username: string, email: string, password: string): User => {
        const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
        
        // Check duplicates (case insensitive)
        const exists = users.find(u => 
            u.username.toLowerCase() === username.trim().toLowerCase() || 
            u.email.toLowerCase() === email.trim().toLowerCase()
        );

        if (exists) {
            throw new Error("Gebruikersnaam of e-mailadres bestaat al.");
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
        const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
        
        // Find user by email OR username (case insensitive)
        const user = users.find(u => 
            (u.username.toLowerCase() === identifier.trim().toLowerCase() || 
             u.email.toLowerCase() === identifier.trim().toLowerCase()) &&
            u.password === password
        );

        if (!user) {
            throw new Error("Ongeldige inloggegevens.");
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

    // FAVORITES (Linked to User ID, not name, so it persists correctly)
    getFavorites: (userId: string): DiscoveredCompany[] => {
        const key = `${FAVS_PREFIX}${userId}`;
        return JSON.parse(localStorage.getItem(key) || "[]");
    },

    toggleFavorite: (userId: string, company: DiscoveredCompany): DiscoveredCompany[] => {
        const key = `${FAVS_PREFIX}${userId}`;
        const favs = authService.getFavorites(userId);
        const exists = favs.find(c => c.id === company.id);

        let newFavs;
        if (exists) {
            newFavs = favs.filter(c => c.id !== company.id);
        } else {
            newFavs = [...favs, company];
        }

        localStorage.setItem(key, JSON.stringify(newFavs));
        return newFavs;
    }
};
