
import React from 'react';
import { SFIcon } from '../ui/SFIcon.tsx';
import { useAuth } from '../../hooks/useAuth.tsx';

type Page = 'Dashboard' | 'Ranking' | 'Players' | 'Matches' | 'Draw' | 'Tournaments' | 'Statistiche' | 'Admin' | 'TeamMatchday';

interface SidebarProps {
    activePage: Page;
    setActivePage: (page: Page) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
    icon: string;
    label: string;
    isActive: boolean;
    onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => {
    const itemClassName = isActive
        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25 font-bold'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 font-medium';

    return (
        <li>
            <a
                href="#"
                onClick={(e) => {
                    e.preventDefault();
                    onClick();
                }}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-200 ${itemClassName}`}
            >
                <div className="flex w-6 items-center justify-center">
                    <SFIcon 
                        name={isActive ? `${icon}.fill` : icon} 
                        size={20} 
                        color={isActive ? '#FFFFFF' : 'var(--ios-systemBlue)'} 
                    />
                </div>
                <span className="text-[15px]">{label}</span>
            </a>
        </li>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage, isOpen, setIsOpen }) => {
    const { isAdmin } = useAuth();

    const navItems: { id: Page; label: string; icon: string }[] = [
        { id: 'Dashboard', label: 'Home', icon: 'home' },
        { id: 'Tournaments', label: 'Tornei', icon: 'emoji_events' },
        { id: 'Ranking', label: 'Classifiche', icon: 'leaderboard' },
        { id: 'Players', label: 'Giocatori', icon: 'groups' },
        { id: 'Matches', label: 'Risultati', icon: 'sports_score' },
        { id: 'Draw', label: 'Sorteggi', icon: 'shuffle' },
        { id: 'Statistiche', label: 'Statistiche', icon: 'query_stats' },
        ...(isAdmin ? [{ id: 'Admin' as Page, label: 'Admin', icon: 'admin_panel_settings' }] : []),
    ];

    const handleNavigation = (page: Page) => {
        setActivePage(page);
        if (window.innerWidth < 768) {
            setIsOpen(false);
        }
    };

    return (
        <>
            {/* Overlay for mobile */}
            <div
                className={`fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-md md:hidden transition-opacity duration-300 ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={() => setIsOpen(false)}
            ></div>

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 z-40 flex h-full w-[min(82vw,300px)] flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl text-slate-900 dark:text-white border-r border-slate-200/60 dark:border-white/10 shadow-2xl transform transition-transform duration-300 md:relative md:w-[260px] md:translate-x-0 ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="flex items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:p-5 md:pt-6">
                    <div>
                        <h2 className="sf-title2 font-bold text-[var(--ios-label)]">Menu</h2>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="md:hidden rounded-lg p-2 text-[var(--ios-systemBlue)]">
                        <SFIcon name="xmark" size={20} />
                    </button>
                </div>
                <nav className="flex-1 p-4">
                    <ul className="space-y-2">
                        {navItems.map((item) => (
                            <NavItem
                                key={item.id}
                                icon={item.icon}
                                label={item.label}
                                isActive={activePage === item.id}
                                onClick={() => handleNavigation(item.id)}
                            />
                        ))}
                    </ul>
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;
