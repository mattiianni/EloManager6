
import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: React.ReactNode;
    bodyClassName?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, bodyClassName = '' }) => {
    return (
        <div className={`hig-list-section ${className}`} style={{ marginBottom: 'clamp(16px, 2vw, 24px)' }}>
            {title && (
                typeof title === 'string' ? (
                    <div
                        className="font-semibold text-[11px] sm:text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 py-1.5 flex items-center gap-2"
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
                    className={`rounded-[22px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-none overflow-hidden transition-all duration-200 ${bodyClassName}`}
                >
                    <div className="p-3.5 md:p-6 lg:p-7">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Card;
