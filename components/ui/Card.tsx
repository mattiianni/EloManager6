
import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: React.ReactNode;
    bodyClassName?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, bodyClassName = '' }) => {
    return (
        <div className={`hig-list-section ${className}`} style={{ marginBottom: '20px' }}>
            {title && (
                typeof title === 'string' ? (
                    <div
                        className="font-semibold text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 py-1.5 flex items-center gap-2"
                    >
                        {title}
                    </div>
                ) : (
                    <div className="px-1 py-2">
                        {title}
                    </div>
                )
            )}
            
            {children && (
                <div
                    className={`rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/75 backdrop-blur-xl shadow-sm dark:shadow-slate-950/40 overflow-hidden transition-all duration-200 ${bodyClassName}`}
                >
                    <div className="p-3.5 md:p-5">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Card;
