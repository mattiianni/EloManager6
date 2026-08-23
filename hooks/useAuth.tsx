
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    workspace: { id: string; name: string } | null;
    isAdmin: boolean;
    token: string | null;
    login: (code: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'padel_elo_token';
const WORKSPACE_KEY = 'padel_elo_workspace';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [token, setToken] = useState<string | null>(null);

    // Check for existing token on mount
    useEffect(() => {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (savedToken) {
            verifyToken(savedToken);
        } else {
            setIsLoading(false);
        }
    }, []);

    const verifyToken = async (tokenToVerify: string) => {
        try {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tokenToVerify}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setToken(tokenToVerify);
                setWorkspace(data.workspace);
                setIsAdmin(data.isAdmin);
                setIsAuthenticated(true);
            } else {
                // Token expired or invalid
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(WORKSPACE_KEY);
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(WORKSPACE_KEY);
        } finally {
            setIsLoading(false);
        }
    };

    const login = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem(TOKEN_KEY, data.token);
                localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data.workspace));
                setToken(data.token);
                setWorkspace(data.workspace);
                setIsAdmin(data.isAdmin);
                setIsAuthenticated(true);
                return { success: true };
            } else {
                return { success: false, error: data.message || 'Codice non valido' };
            }
        } catch (error) {
            return { success: false, error: 'Errore di connessione al server' };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(WORKSPACE_KEY);
        setToken(null);
        setWorkspace(null);
        setIsAdmin(false);
        setIsAuthenticated(false);
    }, []);

    // Listen for auth expiration events from API calls
    useEffect(() => {
        const handleExpired = () => logout();
        window.addEventListener('auth:expired', handleExpired);
        return () => window.removeEventListener('auth:expired', handleExpired);
    }, [logout]);

    // Listen for cross-tab storage changes (logout or login in another tab)
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === TOKEN_KEY) {
                if (!e.newValue) {
                    logout();
                } else if (e.newValue !== token) {
                    verifyToken(e.newValue);
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [logout, token]);

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            isLoading,
            workspace,
            isAdmin,
            token,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthState => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// Helper to get current token for API calls
export function getAuthToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}
