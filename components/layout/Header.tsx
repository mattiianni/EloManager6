import React from 'react';
import ThemeToggle from '../ui/ThemeToggle.tsx';
import { useAuth } from '../../hooks/useAuth.tsx';
import { APP_MONTH, APP_VERSION } from '../../constants.ts';

interface HeaderProps {
    toggleSidebar: () => void;
    isSidebarOpen: boolean;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, isSidebarOpen, theme, toggleTheme }) => {
    const { logout, workspace } = useAuth();

    return (
         <header 
             className="sticky top-0 z-20 flex items-center justify-between px-4 bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-white/10 transition-all"
             style={{
                 height: 'calc(70px + env(safe-area-inset-top, 0px))',
                 paddingTop: 'env(safe-area-inset-top, 0px)',
             }}
         >
              {/* Left Action & Mobile Title */}
              <div className="flex flex-[2] md:flex-1 items-center justify-start overflow-hidden gap-1.5 md:gap-0">
                  <button
                      onClick={toggleSidebar}
                      className="hig-focus-ring flex items-center justify-center text-sky-500 dark:text-sky-400 md:hidden w-[44px] h-[44px] -ml-2 shrink-0 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                      aria-label={isSidebarOpen ? 'Chiudi menu' : 'Apri menu'}
                      aria-expanded={isSidebarOpen}
                      aria-controls="app-sidebar"
                  >
                      <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'wght' 400" }}>menu</span>
                  </button>
                  
                  {/* Mobile Title (Hidden on Desktop) */}
                  <div className="flex flex-col items-start overflow-hidden md:hidden min-w-0">
                      <img 
                          src="/elomanager_w.png" 
                          alt="Padel Elo Manager" 
                          className="h-[32px] w-auto object-contain block dark:hidden" 
                      />
                      <img 
                          src="/elomanager.png" 
                          alt="Padel Elo Manager" 
                          className="h-[32px] w-auto object-contain hidden dark:block" 
                      />
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate w-full mt-0.5 text-left flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold border border-sky-500/20">v{APP_VERSION}</span>
                          <span>{APP_MONTH}</span>
                          {workspace ? <span className="truncate">• {workspace.name}</span> : null}
                      </div>
                  </div>
              </div>

              {/* Center Title & Subtitle (Hidden on Mobile, Visible on Desktop) */}
              <div className="hidden md:flex flex-[2] flex-col items-center justify-center text-center overflow-hidden px-2">
                  <img 
                      src="/elomanager_w.png" 
                      alt="Padel Elo Manager" 
                      className="h-9 w-auto object-contain block dark:hidden" 
                  />
                  <img 
                      src="/elomanager.png" 
                      alt="Padel Elo Manager" 
                      className="h-9 w-auto object-contain hidden dark:block" 
                  />
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate w-full mt-0.5 text-center flex items-center justify-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold border border-sky-500/20 text-[10px]">v{APP_VERSION}</span>
                      <span>{APP_MONTH}</span>
                      {workspace ? <span className="font-semibold text-slate-700 dark:text-slate-300">• {workspace.name}</span> : null}
                  </div>
              </div>

              {/* Right Actions */}
              <div className="flex flex-1 justify-end items-center flex-row gap-1 md:gap-3 -mr-1 shrink-0">
                  <div className="flex items-center justify-center min-w-[44px] min-h-[44px] scale-90 md:scale-100">
                      <ThemeToggle theme={theme} onToggle={toggleTheme} />
                  </div>
                  <button
                      onClick={() => {
                          if (window.confirm('Sei sicuro di voler uscire?')) {
                              logout();
                          }
                      }}
                      className="hig-focus-ring flex min-h-[44px] min-w-[44px] items-center justify-center text-rose-500 hover:text-rose-600 rounded-xl hover:bg-rose-500/10 transition-colors"
                      title="Esci"
                      aria-label="Esci"
                  >
                      <span className="material-symbols-outlined text-[22px]">logout</span>
                  </button>
              </div>
        </header>
    );
};

export default Header;
