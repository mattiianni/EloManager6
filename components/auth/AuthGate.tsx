
import React from 'react';
import { useAuth } from '../../hooks/useAuth.tsx';
import SplashScreen from './SplashScreen.tsx';
import App from '../../App.tsx';

const AuthGate: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();

    // Show loading screen while verifying token
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                        <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                    <p className="text-white/70 text-sm">Verifica accesso...</p>
                </div>
            </div>
        );
    }

    // Show splash screen if not authenticated
    if (!isAuthenticated) {
        return <SplashScreen />;
    }

    // Show main app if authenticated
    return <App />;
};

export default AuthGate;
